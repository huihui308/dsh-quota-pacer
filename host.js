/**
 * 额度配速 Host 半片。
 *
 * 数据：
 *  - OpenCode Go：官方 /zen/go/v1/usage 的 5h/周/月百分比与重置时间，
 *    以及 /zen/go/v1/models 的模型月度额度。
 *  - DeepSeek 官方：/user/balance 余额；本地账本仅作参考。
 *
 * 浏览器通过 /quota-pacer/* 读取；鉴权沿用 connection.requestRejection。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { computeWindow, DEFAULT_THRESHOLDS } from './lib/pacing.js'
import * as go from './lib/opencode.js'
import * as deepseek from './lib/deepseek.js'
import { readLedgerSpend } from './lib/ledger.js'

export const name = 'dsh-quota-pacer'
export const inject = ['webServer', 'connection']

const ROUTE = '/quota-pacer'
const MAX_BODY = 256 * 1024
const CACHE_MS = 55_000
const TIERS = new Set(['auto', 'go', 'go-plus', 'go-teams'])
const TIER_LABEL = { go: 'Go', 'go-plus': 'Go Plus', 'go-teams': 'Go Teams', auto: '自动' }

const DEFAULT_CONFIG = {
  version: 1,
  sources: {
    opencodeGo: {
      enabled: true,
      label: 'OpenCode Go',
      tier: 'auto',
      billingSource: '',
      primaryModel: 'deepseek-v4.1-flash',
      windows: { fiveHour: true, weekly: true, monthly: true },
      showAmount: true,
      autoProbe: true,
      allowanceFactor: 1.2,
    },
    deepseekOfficial: {
      enabled: true,
      label: 'DeepSeek 官方',
      showLocalSpend: true,
    },
  },
  display: { refreshMinutes: 5 },
  thresholds: { ...DEFAULT_THRESHOLDS },
}

function dshHome(env = process.env) {
  return env.DSH_HOME || join(homedir(), '.dsh')
}

function configPath() {
  return join(dshHome(), 'quota-pacer', 'config.json')
}

function text(value, limit) {
  return typeof value === 'string' ? value.slice(0, limit) : ''
}

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function numberIn(value, min, max, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

export function normalizeConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const goRaw = source.sources?.opencodeGo && typeof source.sources.opencodeGo === 'object' ? source.sources.opencodeGo : {}
  const dsRaw = source.sources?.deepseekOfficial && typeof source.sources.deepseekOfficial === 'object' ? source.sources.deepseekOfficial : {}
  const windows = goRaw.windows && typeof goRaw.windows === 'object' ? goRaw.windows : {}
  const tier = TIERS.has(goRaw.tier) ? goRaw.tier : 'auto'
  const thresholds = source.thresholds && typeof source.thresholds === 'object' ? source.thresholds : {}
  return {
    version: 1,
    sources: {
      opencodeGo: {
        enabled: bool(goRaw.enabled, true),
        label: text(goRaw.label, 40) || 'OpenCode Go',
        tier,
        billingSource: text(goRaw.billingSource, 40),
        primaryModel: text(goRaw.primaryModel, 120) || 'deepseek-v4.1-flash',
        windows: {
          fiveHour: bool(windows.fiveHour, true),
          weekly: bool(windows.weekly, true),
          monthly: bool(windows.monthly, true),
        },
        showAmount: bool(goRaw.showAmount, true),
        autoProbe: bool(goRaw.autoProbe, true),
        allowanceFactor: numberIn(goRaw.allowanceFactor, 0.5, 3, 1.2),
        apiKey: text(goRaw.apiKey, 300),
      },
      deepseekOfficial: {
        enabled: bool(dsRaw.enabled, true),
        label: text(dsRaw.label, 40) || 'DeepSeek 官方',
        showLocalSpend: bool(dsRaw.showLocalSpend, true),
        apiKey: text(dsRaw.apiKey, 300),
      },
    },
    display: {
      refreshMinutes: numberIn(source.display?.refreshMinutes, 1, 60, 5),
    },
    thresholds: {
      ahead: numberIn(thresholds.ahead, 0.1, 2, DEFAULT_THRESHOLDS.ahead),
      fast: numberIn(thresholds.fast, 0.1, 2, DEFAULT_THRESHOLDS.fast),
      critical: numberIn(thresholds.critical, 0.1, 3, DEFAULT_THRESHOLDS.critical),
    },
  }
}

function publicConfig(config) {
  const clone = JSON.parse(JSON.stringify(config))
  delete clone.sources.opencodeGo.apiKey
  delete clone.sources.deepseekOfficial.apiKey
  return clone
}

async function loadConfig() {
  try {
    return normalizeConfig(JSON.parse(await readFile(configPath(), 'utf8')))
  } catch {
    return normalizeConfig({})
  }
}

let writeQueue = Promise.resolve()

function saveConfig(config) {
  const run = async () => {
    const file = configPath()
    await mkdir(dirname(file), { recursive: true, mode: 0o700 })
    const temp = file + '.tmp'
    await writeFile(temp, JSON.stringify(publicConfig(config), null, 2), { mode: 0o600 })
    await rename(temp, file)
    return config
  }
  writeQueue = writeQueue.then(run, run)
  return writeQueue
}

function tierFor(config) {
  if (config.tier !== 'auto') return config.tier
  return go.tierFromBillingSource(config.billingSource) ?? null
}

function windowLimit(kind, monthlyLimit) {
  if (!Number.isFinite(monthlyLimit)) return null
  if (kind === 'fiveHour') return monthlyLimit * 0.2
  if (kind === 'weekly') return monthlyLimit * 0.5
  return monthlyLimit
}

async function buildGoSource(ctx, config, now) {
  const base = {
    id: 'opencode-go',
    label: config.label,
    kind: 'quota',
    status: 'ok',
    tier: tierFor(config),
    tierLabel: TIER_LABEL[tierFor(config) ?? 'auto'],
    billingSource: config.billingSource || null,
    primaryModel: config.primaryModel,
    windows: {},
    fetchedAt: now,
  }
  const resolved = await go.resolveKey(ctx, config)
  if (!resolved.key) {
    return { ...base, status: 'key-missing', error: '未找到 OpenCode Go Key：可写入 OPENCODE_GO_API_KEY，或在 OpenCode 登录。' }
  }
  base.keySource = resolved.source
  try {
    const [usage, models] = await Promise.all([
      go.fetchUsage(resolved.key),
      go.fetchModels(resolved.key).catch(() => []),
    ])
    const model = go.findModel(models, config.primaryModel)
    const limit = model ? go.monthlyLimitOf(model, base.tier) : null
    base.modelFound = model !== null
    base.monthlyLimit = limit
    base.modelLimits = model?.go?.monthly_usage ?? null
    base.models = models.slice(0, 80).map((item) => item.id)
    const spend = await readLedgerSpend(/^opencode-go:/)
    if (spend) {
      base.today = {
        listCost: spend.todayCost,
        allowanceCost: spend.todayCost * config.allowanceFactor,
        calls: spend.todayCalls,
        input: spend.todayInput,
        output: spend.todayOutput,
        cacheRead: spend.todayCacheRead,
      }
    }
    base.allowanceFactor = config.allowanceFactor
    base.showAmount = config.showAmount
    const map = { fiveHour: 'rolling', weekly: 'weekly', monthly: 'monthly' }
    for (const [kind, key] of Object.entries(map)) {
      if (!config.windows[kind] || !usage[key]) continue
      const result = computeWindow({
        kind,
        percent: usage[key].percent,
        resetsAt: usage[key].resetsAt,
        now,
        thresholds: config.thresholds,
        limit: windowLimit(kind, limit),
      })
      base.windows[kind] = {
        ...result,
        status: usage[key].status,
        windowLimit: windowLimit(kind, limit),
      }
    }
    base.raw = usage
    return base
  } catch (error) {
    return { ...base, status: 'error', error: error instanceof Error ? error.message : String(error) }
  }
}

async function buildDeepSeekSource(ctx, config, now) {
  const base = {
    id: 'deepseek-official',
    label: config.label,
    kind: 'balance',
    status: 'ok',
    fetchedAt: now,
  }
  const resolved = await deepseek.resolveKey(ctx, config)
  if (!resolved.key) {
    return { ...base, status: 'key-missing', error: '未找到 DEEPSEEK_API_KEY。' }
  }
  base.keySource = resolved.source
  try {
    base.balance = await deepseek.fetchBalance(resolved.key)
  } catch (error) {
    return { ...base, status: 'error', error: error instanceof Error ? error.message : String(error) }
  }
  if (config.showLocalSpend) {
    try {
      base.localSpend = await deepseek.readLocalSpend()
    } catch {
      base.localSpend = null
    }
  }
  return base
}

let cache = { at: 0, state: null }
let autoProbeAt = 0
let autoProbeRun = null

/**
 * 首次查询时自动做一次 1-token 探测，拿到 billing_source 与档位。
 * 失败后 10 分钟内不重试；成功则写回配置，之后不再探测。
 */
async function ensureTier(ctx, config) {
  const goConfig = config.sources.opencodeGo
  if (!goConfig.enabled || !goConfig.autoProbe || tierFor(goConfig) !== null) return config
  if (Date.now() - autoProbeAt < 10 * 60_000) return config
  if (autoProbeRun !== null) return autoProbeRun
  autoProbeAt = Date.now()
  autoProbeRun = (async () => {
    try {
      const resolved = await go.resolveKey(ctx, goConfig)
      if (!resolved.key) return config
      const probe = await go.probeBillingSource(resolved.key, goConfig.primaryModel)
      const tier = go.tierFromBillingSource(probe.billingSource)
      if (tier !== null) {
        goConfig.tier = tier
        goConfig.billingSource = probe.billingSource
        if (Number.isFinite(probe.allowance) && Number.isFinite(probe.listCost) && probe.listCost > 0) {
          const factor = probe.allowance / probe.listCost
          if (factor >= 0.5 && factor <= 3) goConfig.allowanceFactor = factor
        }
        await saveConfig(config)
      }
    } catch { /* 探测失败不阻塞额度读取 */ }
    return config
  })().finally(() => { autoProbeRun = null })
  return autoProbeRun
}

export async function buildState(ctx, config, { force = false } = {}) {
  const now = Date.now()
  if (!force && cache.state && now - cache.at < CACHE_MS) return cache.state
  await ensureTier(ctx, config)
  const sources = []
  if (config.sources.opencodeGo.enabled) sources.push(await buildGoSource(ctx, config.sources.opencodeGo, now))
  if (config.sources.deepseekOfficial.enabled) sources.push(await buildDeepSeekSource(ctx, config.sources.deepseekOfficial, now))
  const state = {
    version: 1,
    generatedAt: now,
    sources,
    config: publicConfig(config),
  }
  cache = { at: now, state }
  return state
}

function json(res, status, body, head = false) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  if (head) return res.end()
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw Object.assign(new Error('内容太大'), { status: 413 })
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('请求不是有效 JSON'), { status: 400 })
  }
}

function rejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return 403
  return connection.requestRejection({ headers: req.headers })
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE,
    handler: async (req, res) => {
      try {
        const denied = rejection(ctx, req)
        if (denied) return json(res, denied, { error: 'unauthorized' })
        const path = (req.url ?? '/').split('?')[0]
        const method = (req.method ?? 'GET').toUpperCase()

        if (path === ROUTE + '/health') {
          return json(res, 200, { ok: true, cached: cache.state !== null, at: cache.at })
        }

        if (path === ROUTE + '/config') {
          const config = await loadConfig()
          if (method === 'GET') return json(res, 200, { config: publicConfig(config) })
          if (method === 'PUT') {
            const body = await readJson(req)
            const next = normalizeConfig({
              ...config,
              ...body,
              sources: {
                opencodeGo: { ...config.sources.opencodeGo, ...(body.sources?.opencodeGo ?? {}) },
                deepseekOfficial: { ...config.sources.deepseekOfficial, ...(body.sources?.deepseekOfficial ?? {}) },
              },
              display: { ...config.display, ...(body.display ?? {}) },
              thresholds: { ...config.thresholds, ...(body.thresholds ?? {}) },
            })
            await saveConfig(next)
            cache = { at: 0, state: null }
            return json(res, 200, { config: publicConfig(next), state: await buildState(ctx, next, { force: true }) })
          }
          return json(res, 405, { error: 'method not allowed' })
        }

        if (path === ROUTE + '/refresh' && method === 'POST') {
          const config = await loadConfig()
          cache = { at: 0, state: null }
          return json(res, 200, await buildState(ctx, config, { force: true }))
        }

        if (path === ROUTE + '/probe-tier' && method === 'POST') {
          const config = await loadConfig()
          const goConfig = config.sources.opencodeGo
          const resolved = await go.resolveKey(ctx, goConfig)
          if (!resolved.key) return json(res, 400, { error: '未找到 OpenCode Go Key' })
          try {
            const probe = await go.probeBillingSource(resolved.key, goConfig.primaryModel)
            if (probe.billingSource) {
              goConfig.billingSource = probe.billingSource
              const tier = go.tierFromBillingSource(probe.billingSource)
              if (tier) goConfig.tier = tier
              await saveConfig(config)
              cache = { at: 0, state: null }
            }
            return json(res, 200, { probe, state: await buildState(ctx, config, { force: true }) })
          } catch (error) {
            return json(res, 502, { error: error instanceof Error ? error.message : String(error) })
          }
        }

        if (path === ROUTE + '/state' && method === 'GET') {
          const config = await loadConfig()
          return json(res, 200, await buildState(ctx, config))
        }

        return json(res, 404, { error: 'not found' })
      } catch (error) {
        const status = Number(error?.status) || 500
        return json(res, status, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }))
}
