/**
 * DeepSeek 官方 / OpenCode Go 共用的峰谷时段。
 *
 * 官方规则（北京时间，UTC+8）：
 *  - 周一至周五 09:00–12:00、14:00–18:00 为高峰；
 *  - 其余时段、周末、中国法定节假日为谷时。
 *
 * DeepSeek 官方谷时五折；OpenCode Go 峰时 2 倍（谷时 1 倍）。
 * 节假日由配置的日期列表补充；默认只处理周末。
 */
export const OFFSET_MS = 8 * 3600_000
export const PEAK_WINDOWS = [
  [9 * 60, 12 * 60],
  [14 * 60, 18 * 60],
]

function parts(ms) {
  const local = new Date(ms + OFFSET_MS)
  return {
    day: local.getUTCDay(),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
    dateKey: local.toISOString().slice(0, 10),
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    date: local.getUTCDate(),
  }
}

function weekend(day) {
  return day === 0 || day === 6
}

export function isPeakAt(ms, holidays = []) {
  const p = parts(ms)
  if (weekend(p.day) || holidays.includes(p.dateKey)) return false
  return PEAK_WINDOWS.some(([start, end]) => p.minutes >= start && p.minutes < end)
}

function transitionCandidates(now, holidays) {
  const base = new Date(now + OFFSET_MS)
  const out = []
  for (let offset = -2; offset <= 16; offset++) {
    const day = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + offset))
    const dateKey = day.toISOString().slice(0, 10)
    if (weekend(day.getUTCDay()) || holidays.includes(dateKey)) continue
    for (const [start, end] of PEAK_WINDOWS) {
      for (const minute of [start, end]) {
        out.push(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 0, 0) + minute * 60_000 - OFFSET_MS)
      }
    }
  }
  return [...new Set(out)].sort((a, b) => a - b)
}

function localClock(ms) {
  const p = parts(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return pad(Math.floor(p.minutes / 60)) + ':' + pad(p.minutes % 60)
}

function localDayLabel(ms) {
  const p = parts(ms)
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return names[p.day]
}

/**
 * @param {number} now
 * @param {{holidays?: string[], multiplier?: {peak:number, offPeak:number}}} options
 */
export function peakPhase(now = Date.now(), options = {}) {
  const holidays = Array.isArray(options.holidays) ? options.holidays : []
  const mult = options.multiplier ?? { peak: 1, offPeak: 0.5 }
  const inPeak = isPeakAt(now, holidays)
  const candidates = transitionCandidates(now, holidays)
  const next = candidates.find((time) => time > now) ?? null
  const previous = [...candidates].reverse().find((time) => time <= now) ?? null
  const nextIsPeak = next !== null ? isPeakAt(next, holidays) : !inPeak
  const total = previous !== null && next !== null ? next - previous : 0
  const progress = total > 0 ? Math.min(1, Math.max(0, (now - previous) / total)) : 0
  const sameDay = next !== null && parts(next).dateKey === parts(now).dateKey
  return {
    peak: inPeak,
    label: inPeak ? '高峰' : '空闲',
    multiplier: inPeak ? mult.peak : mult.offPeak,
    nextAt: next,
    nextInPeak: nextIsPeak,
    nextLabel: next === null ? null : (sameDay ? localClock(next) : localDayLabel(next) + ' ' + localClock(next)),
    prevAt: previous,
    progress,
    timezone: 'Asia/Shanghai',
    windows: PEAK_WINDOWS.map(([start, end]) => ({
      start: String(Math.floor(start / 60)).padStart(2, '0') + ':' + String(start % 60).padStart(2, '0'),
      end: String(Math.floor(end / 60)).padStart(2, '0') + ':' + String(end % 60).padStart(2, '0'),
    })),
  }
}
