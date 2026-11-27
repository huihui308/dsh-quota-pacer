/**
 * OpenCode Go 官方接口：额度窗口与模型目录。
 * 只把 Key 发往 opencode.ai；任何错误信息都不包含 Key 本身。
 */
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const USAGE_URL = 'https://opencode.ai/zen/go/v1/usage'
export const MODELS_URL = 'https://opencode.ai/zen/go/v1/models'
export const CHAT_URL = 'https://opencode.ai/zen/go/v1/chat/completions'

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36'
const KEY_REF = 'OPENCODE_GO_API_KEY'
const KEY_REFS = [KEY_REF, 'OPENCODE_API_KEY']

export function normalizeKey(value) {
  if (typeof value !== 'string') return null
  const key = value.trim().replace(/^Bearer[ \t]+/i, '').trim()
  if (!key || key.length < 8 || key.length > 300 || /[\r\n\t]/.test(key)) return null
  return key
}

function authFiles(env = process.env) {
  const home = env.HOME || homedir()
  const dataHome = env.XDG_DATA_HOME && env.XDG_DATA_HOME.startsWith('/')
    ? join(env.XDG_DATA_HOME, 'opencode', 'auth.json')
    : join(home, '.local', 'share', 'opencode', 'auth.json')
  const configHome = env.XDG_CONFIG_HOME
    ? join(env.XDG_CONFIG_HOME, 'opencode', 'auth.json')
    : join(home, '.config', 'opencode', 'auth.json')
  return [dataHome, configHome]
}

async function keyFromAuthFile(file) {
  try {
    const raw = await readFile(file, 'utf8')
    const data = JSON.parse(raw)
    const entry = data?.['opencode-go']
    const key = entry?.key ?? entry?.access ?? entry?.apiKey
    return normalizeKey(key)
  } catch {
    return null
  }
}

/**
 * 解析 Key：显式配置 > DSH 凭据库 > 环境变量 > opencode 登录态。
 * 返回 { key, source }；source 用于 UI 显示来源，不返回值。
 */
export async function resolveKey(ctx, config = {}, env = process.env) {
  const explicit = normalizeKey(config.apiKey)
  if (explicit) return { key: explicit, source: 'config' }

  const credentials = ctx?.get?.('credentials')
  for (const ref of KEY_REFS) {
    try {
      const hit = await credentials?.resolve?.(ref)
      const key = normalizeKey(hit?.value)
      if (key) return { key, source: `credential:${ref}` }
    } catch { /* 单个引用不可用时继续 */ }
  }

  for (const ref of KEY_REFS) {
    const key = normalizeKey(env[ref])
    if (key) return { key, source: `env:${ref}` }
  }

  if (typeof env.OPENCODE_AUTH_CONTENT === 'string') {
    try {
      const data = JSON.parse(env.OPENCODE_AUTH_CONTENT)
      const entry = data?.['opencode-go']
      const key = normalizeKey(entry?.key ?? entry?.access ?? entry?.apiKey)
      if (key) return { key, source: 'env:OPENCODE_AUTH_CONTENT' }
    } catch { /* 忽略损坏的内联登录态 */ }
  }

  for (const file of authFiles(env)) {
    const key = await keyFromAuthFile(file)
    if (key) return { key, source: 'opencode-auth' }
  }
  return { key: null, source: 'none' }
}

async function requestJson(url, key, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${key}`,
      accept: 'application/json',
      'user-agent': UA,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(20_000),
  })
  const text = await response.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* 保留原始文本用于报错 */ }
  if (!response.ok) {
    const detail = json?.error?.message ?? json?.message ?? text.slice(0, 200)
    const error = new Error(`HTTP ${response.status}: ${detail || response.statusText}`)
    error.status = response.status
    throw error
  }
  return json
}

export async function fetchUsage(key) {
  const data = await requestJson(USAGE_URL, key)
  const usage = data?.usage
  if (!usage || typeof usage !== 'object') throw new Error('额度响应缺少 usage')
  const windows = {}
  for (const kind of ['rolling', 'weekly', 'monthly']) {
    const item = usage[kind]
    if (!item || typeof item !== 'object') continue
    const percent = Number(item.percent)
    const resetsAt = typeof item.resetsAt === 'string' ? item.resetsAt : null
    if (!Number.isFinite(percent) || !resetsAt) continue
    windows[kind] = { percent, resetsAt, status: item.status ?? 'ok' }
  }
  if (!Object.keys(windows).length) throw new Error('额度响应没有有效窗口')
  return windows
}

export async function fetchModels(key) {
  const data = await requestJson(MODELS_URL, key)
  const list = Array.isArray(data?.data) ? data.data : []
  return list.filter((item) => item && typeof item.id === 'string')
}

export function findModel(models, id) {
  if (!Array.isArray(models) || !id) return null
  return models.find((item) => item.id === id) ?? null
}

export function monthlyLimitOf(model, tier) {
  const limits = model?.go?.monthly_usage
  if (!limits || typeof limits !== 'object') return null
  const value = Number(limits[tier])
  return Number.isFinite(value) && value > 0 ? value : null
}

/** 探测套餐档位：一次 1-token 请求，读响应里的 opencode.billing_source。 */
export async function probeBillingSource(key, model = 'deepseek-v4.1-flash') {
  const data = await requestJson(CHAT_URL, key, {
    method: 'POST',
    headers: { 'x-opencode-session': `quota-pacer-${Date.now().toString(36)}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
      stream: false,
    }),
  })
  const source = data?.usage?.opencode?.billing_source
  const allowance = Number(data?.usage?.opencode?.allowance)
  const listCost = Number(data?.usage?.opencode?.list_cost)
  return {
    billingSource: typeof source === 'string' ? source : null,
    allowance: Number.isFinite(allowance) ? allowance : null,
    listCost: Number.isFinite(listCost) ? listCost : null,
    tokens: data?.usage?.opencode?.tokens ?? null,
  }
}

export function tierFromBillingSource(source) {
  if (source === 'go-plus') return 'go-plus'
  if (source === 'go-teams') return 'go-teams'
  if (source === 'go') return 'go'
  return null
}
