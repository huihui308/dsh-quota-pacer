/**
 * 纯计算：把官方额度百分比与时间进度对齐，给出配速、期末预测、触顶时间与结论。
 * 不依赖 DSH，方便单测。
 */

export const HOUR = 3600_000
export const DAY = 24 * HOUR

export const WINDOW_MS = {
  fiveHour: 5 * HOUR,
  weekly: 7 * DAY,
}

/** 最小已过时间比例：低于它只显示「样本不足」，避免刚开窗就把配速算成 10×。 */
export const MIN_ELAPSED_FRAC = {
  fiveHour: 0.05, // 15 分钟
  weekly: 0.035, // 约 5.9 小时
  monthly: 0.017, // 约 12 小时
}

export const DEFAULT_THRESHOLDS = {
  ahead: 0.85,
  fast: 1.0,
  critical: 1.15,
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function finite(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

/** 从重置时刻往前推一个日历月；31 号遇到短月时夹到月末。 */
export function subtractMonthClamped(iso) {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return null
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() - 1
  const target = new Date(Date.UTC(year, month, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  const day = Math.min(date.getUTCDate(), lastDay)
  return Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    day,
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  )
}

/** 每个窗口的总时长与起点。月窗口由本次重置时间往前推一个订阅月。 */
export function windowBounds(kind, resetsAt) {
  const reset = new Date(resetsAt).getTime()
  if (!Number.isFinite(reset)) return null
  if (kind === 'monthly') {
    const start = subtractMonthClamped(reset)
    if (start === null || start >= reset) return null
    return { startAt: start, resetsAt: reset, durationMs: reset - start }
  }
  const durationMs = WINDOW_MS[kind]
  if (!Number.isFinite(durationMs)) return null
  return { startAt: reset - durationMs, resetsAt: reset, durationMs }
}

/**
 * @param {object} input
 * @param {'fiveHour'|'weekly'|'monthly'} input.kind
 * @param {number} input.percent 官方已用百分比 0–100
 * @param {string|number} input.resetsAt ISO 时间
 * @param {number} [input.now]
 * @param {object} [input.thresholds]
 * @param {number} [input.limit] 该窗口对应的额度上限（美元）
 */
export function computeWindow({ kind, percent, resetsAt, now = Date.now(), thresholds = DEFAULT_THRESHOLDS, limit = null }) {
  const usedPercent = clamp(finite(percent) ?? 0, 0, 1000)
  const bounds = windowBounds(kind, resetsAt)
  if (bounds === null) {
    return { kind, ok: false, error: 'invalid-reset', percent: usedPercent }
  }
  const elapsedMs = clamp(now - bounds.startAt, 0, bounds.durationMs)
  const remainingMs = Math.max(bounds.resetsAt - now, 0)
  const elapsedFrac = bounds.durationMs > 0 ? elapsedMs / bounds.durationMs : 0
  const usedFrac = usedPercent / 100
  const minFrac = MIN_ELAPSED_FRAC[kind] ?? 0.02
  const warmingUp = elapsedFrac < minFrac
  const pace = elapsedFrac > 0 ? usedFrac / elapsedFrac : null
  const projected = warmingUp || pace === null ? null : Math.min(pace, 3)
  const remainingFrac = Math.max(1 - usedFrac, 0)

  let verdict = 'unknown'
  if (!warmingUp && pace !== null) {
    if (projected !== null && projected >= 1) verdict = 'over'
    else if (pace > thresholds.critical) verdict = 'over'
    else if (pace > thresholds.fast) verdict = 'fast'
    else if (pace > thresholds.ahead) verdict = 'onTrack'
    else verdict = 'ahead'
  }

  const ratePerMs = elapsedMs > 0 ? usedFrac / elapsedMs : null
  const etaMs = ratePerMs !== null && ratePerMs > 0 && remainingFrac > 0
    ? remainingFrac / ratePerMs
    : null

  const budget = kind === 'fiveHour'
    ? { unit: 'hour', value: remainingMs > 0 ? remainingFrac / (remainingMs / HOUR) : null }
    : { unit: 'day', value: remainingMs > 0 ? remainingFrac / (remainingMs / DAY) : null }

  return {
    kind,
    ok: true,
    percent: usedPercent,
    usedFrac,
    remainingFrac,
    resetsAt: bounds.resetsAt,
    startAt: bounds.startAt,
    durationMs: bounds.durationMs,
    elapsedMs,
    remainingMs,
    elapsedFrac,
    timePercent: elapsedFrac * 100,
    pace,
    projected,
    projectedPercent: projected === null ? null : projected * 100,
    verdict,
    warmingUp,
    etaMs,
    budget,
    limit: finite(limit),
    usedAmount: finite(limit) === null ? null : (finite(limit) * usedFrac),
    remainingAmount: finite(limit) === null ? null : (finite(limit) * remainingFrac),
  }
}

/** 五小时窗口的减速建议：按剩余时间均摊还能用多少。 */
export function paceAdvice(result) {
  if (!result?.ok) return null
  if (result.verdict === 'over') return '按当前速度会在重置前触顶，建议降速：减少长上下文、暂停子代理或换用免费/低成本模型。'
  if (result.verdict === 'fast') return '略快，建议把接下来的用量压到剩余额度的一半以下。'
  if (result.verdict === 'onTrack') return '基本贴合时间进度，保持当前节奏。'
  if (result.verdict === 'ahead') return '余量充足，可以按当前节奏继续。'
  return '刚开始统计，样本不足，稍后再看。'
}
