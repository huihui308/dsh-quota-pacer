/** 只读 cost-meter 账本，按来源前缀汇总今日/自然月花费。 */
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

function dayKey(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export async function readLedgerSpend(match, env = process.env) {
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
  const result = {
    todayCost: 0,
    todayCalls: 0,
    todayInput: 0,
    todayOutput: 0,
    todayCacheRead: 0,
    monthCost: 0,
    monthCalls: 0,
    found: false,
  }
  for (const [key, day] of Object.entries(days)) {
    if (!key.startsWith(month) || !day || typeof day !== 'object') continue
    for (const [providerModel, value] of Object.entries(day.byProviderModel ?? {})) {
      if (!match.test(providerModel) || !value || typeof value !== 'object') continue
      const cost = Number(value.cost)
      if (!Number.isFinite(cost)) continue
      result.found = true
      result.monthCost += cost
      result.monthCalls += Number(value.calls) || 0
      if (key === today) {
        result.todayCost += cost
        result.todayCalls += Number(value.calls) || 0
        result.todayInput += Number(value.input) || 0
        result.todayOutput += Number(value.output) || 0
        result.todayCacheRead += Number(value.cacheRead) || 0
      }
    }
  }
  return result.found ? result : null
}
