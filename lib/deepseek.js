/** DeepSeek 官方余额与本地账本参考用量（只读）。 */
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const BALANCE_URL = 'https://api.deepseek.com/user/balance'
const KEY_REFS = ['DEEPSEEK_API_KEY']

export function normalizeKey(value) {
  if (typeof value !== 'string') return null
  const key = value.trim().replace(/^Bearer[ \t]+/i, '').trim()
  return key && key.length >= 8 && key.length <= 300 ? key : null
}

export async function resolveKey(ctx, config = {}, env = process.env) {
  const explicit = normalizeKey(config.apiKey)
  if (explicit) return { key: explicit, source: 'config' }
  const credentials = ctx?.get?.('credentials')
  for (const ref of KEY_REFS) {
    try {
      const hit = await credentials?.resolve?.(ref)
      const key = normalizeKey(hit?.value)
      if (key) return { key, source: `credential:${ref}` }
    } catch { /* 继续 */ }
  }
  for (const ref of KEY_REFS) {
    const key = normalizeKey(env[ref])
    if (key) return { key, source: `env:${ref}` }
  }
  return { key: null, source: 'none' }
}

export async function fetchBalance(key) {
  const response = await fetch(BALANCE_URL, {
    headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  })
  const text = await response.text()
  let data = null
  try { data = JSON.parse(text) } catch { /* 保留文本 */ }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${data?.error?.message ?? text.slice(0, 160)}`)
  }
  const infos = Array.isArray(data?.balance_infos) ? data.balance_infos : []
  const info = infos.find((item) => item?.currency === 'CNY') ?? infos[0] ?? null
  if (!info) throw new Error('余额响应缺少 balance_infos')
  return {
    available: data?.is_available !== false,
    currency: typeof info.currency === 'string' ? info.currency : 'CNY',
    total: Number(info.total_balance),
    granted: Number(info.granted_balance),
    toppedUp: Number(info.topped_up_balance),
  }
}

function dayKey(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * 从 cost-meter 账本读 DeepSeek 官方渠道的今日/本月花费。
 * 只读，不依赖 cost-meter 的运行时；账本缺失或结构变化时返回 null。
 */
export async function readLocalSpend(env = process.env) {
  const home = env.DSH_HOME || join(homedir(), '.dsh')
  const file = join(home, 'storages', 'cost-meter', 'ledger.json')
  let ledger
  try {
    ledger = JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
  const days = ledger?.days
  if (!days || typeof days !== 'object') return null
  const today = dayKey()
  const month = today.slice(0, 7)
  let todayCost = 0
  let todayCalls = 0
  let monthCost = 0
  let monthCalls = 0
  let found = false
  for (const [key, day] of Object.entries(days)) {
    if (!key.startsWith(month) || !day || typeof day !== 'object') continue
    for (const [providerModel, value] of Object.entries(day.byProviderModel ?? {})) {
      if (!/^deepseek(?:-|:)/.test(providerModel) || !value || typeof value !== 'object') continue
      const cost = Number(value.cost)
      const calls = Number(value.calls)
      if (!Number.isFinite(cost)) continue
      found = true
      monthCost += cost
      monthCalls += Number.isFinite(calls) ? calls : 0
      if (key === today) {
        todayCost += cost
        todayCalls += Number.isFinite(calls) ? calls : 0
      }
    }
  }
  if (!found) return null
  const now = new Date()
  const daysElapsed = now.getDate()
  return {
    ledgerAt: Number(ledger?.days?.[today]?.date ? Date.now() : 0) || null,
    todayCost,
    todayCalls,
    monthCost,
    monthCalls,
    dailyAverage: daysElapsed > 0 ? monthCost / daysElapsed : null,
  }
}
