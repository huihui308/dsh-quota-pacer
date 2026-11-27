/**
 * 额度配速 — 浏览器半片。
 *
 * 主面板：把 5h / 周 / 月额度和时间进度画在同一条线上，给出配速与期末预测。
 * 设置页：选择显示哪些来源、窗口、指标，以及套餐档位与刷新间隔。
 */
window.__ModuleLoader__.load({
  id: 'dsh-quota-pacer',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const API = '/quota-pacer'
    const MAIN_KEY = 'quota-pacer'
    const PANEL_ID = 'quota-pacer'

    const WINDOW_LABEL = { fiveHour: '5 小时', weekly: '本周', monthly: '本月' }
    const WINDOW_ORDER = ['fiveHour', 'weekly', 'monthly']
    const WINDOW_SHORT = { fiveHour: '5h', weekly: '周', monthly: '月' }
    const VERDICT = {
      ahead: { label: '余量充足', tone: 'ok' },
      onTrack: { label: '正常', tone: 'ok' },
      fast: { label: '偏快', tone: 'warn' },
      over: { label: '将超限', tone: 'danger' },
      unknown: { label: '样本不足', tone: 'muted' },
    }
    const STYLE = [
      '.qp-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px}',
      '.qp-head{display:flex;align-items:flex-start;gap:12px;padding:16px 18px 0}',
      '.qp-head-main{flex:1;min-width:0}',
      '.qp-title{font-size:17px;font-weight:650;margin:0;line-height:1.3;display:flex;align-items:center;gap:8px}',
      '.qp-sub{color:var(--dsw-alias-label-tertiary);font-size:11.5px;margin-top:4px}',
      '.qp-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}',
      '.qp-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:7px;padding:5px 10px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.qp-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.qp-btn:disabled{opacity:.45;cursor:not-allowed}',
      '.qp-btn[data-kind="primary"]{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff}',
      '.qp-btn[data-kind="ghost"]{border-color:transparent;background:transparent}',
      '.qp-tabs{display:flex;gap:2px;padding:10px 18px 0;border-bottom:1px solid var(--dsw-alias-border-l1);margin-top:2px}',
      '.qp-tab{border:none;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12.5px;padding:7px 13px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}',
      '.qp-tab:hover{color:var(--dsw-alias-label-primary)}',
      '.qp-tab[data-on="1"]{color:var(--dsw-alias-brand-primary);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.qp-body{flex:1;min-height:0;overflow:auto;padding:14px 18px 28px}',
      '.qp-stack{display:flex;flex-direction:column;gap:12px;max-width:860px}',
      '.qp-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);backdrop-filter:blur(12px);box-shadow:0 1px 2px rgba(0,0,0,.18);padding:13px 15px}',
      '.qp-card-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}',
      '.qp-card-title{font-size:13.5px;font-weight:650}',
      '.qp-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary);flex-shrink:0}',
      '.qp-dot[data-status="error"],.qp-dot[data-status="key-missing"]{background:var(--dsw-alias-state-error-primary)}',
      '.qp-chip{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:2px 8px;font-size:10.5px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-base)}',
      '.qp-chip[data-tone="ok"]{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 40%,transparent)}',
      '.qp-chip[data-tone="warn"]{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-brand-primary));border-color:color-mix(in srgb,var(--dsw-alias-state-warning-primary,var(--dsw-alias-brand-primary)) 40%,transparent)}',
      '.qp-chip[data-tone="danger"]{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,transparent)}',
      '.qp-chip[data-tone="muted"]{opacity:.75}',
      '.qp-muted{color:var(--dsw-alias-label-tertiary);font-size:11px}',
      '.qp-win{padding:10px 0;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.qp-win:first-of-type{border-top:none;padding-top:2px}',
      '.qp-win-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:7px}',
      '.qp-win-name{font-weight:600;font-size:12.5px;min-width:56px}',
      '.qp-win-right{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.qp-bar{position:relative;height:8px;border-radius:5px;background:var(--dsw-alias-bg-layer-2);overflow:visible;margin:7px 0 5px}',
      '.qp-bar-fill{position:absolute;left:0;top:0;bottom:0;border-radius:5px;background:var(--dsw-alias-brand-primary);transition:width .2s ease}',
      '.qp-bar-fill[data-tone="warn"]{background:var(--dsw-alias-state-warning-primary,var(--dsw-alias-brand-primary))}',
      '.qp-bar-fill[data-tone="danger"]{background:var(--dsw-alias-state-error-primary)}',
      '.qp-time{position:absolute;top:-4px;bottom:-4px;width:1px;background:var(--dsw-alias-label-secondary);opacity:.7}',
      '.qp-time::after{content:"";position:absolute;top:-1px;left:-3px;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-secondary)}',
      '.qp-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:10.5px;color:var(--dsw-alias-label-tertiary)}',
      '.qp-legend b{font-weight:600;color:var(--dsw-alias-label-secondary)}',
      '.qp-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:6px 12px;margin-top:7px}',
      '.qp-metric-label{font-size:10px;color:var(--dsw-alias-label-tertiary)}',
      '.qp-metric-value{font-size:12.5px;font-weight:600;margin-top:1px;font-variant-numeric:tabular-nums}',
      '.qp-advice{margin-top:7px;font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.5}',
      '.qp-advice[data-tone="danger"]{color:var(--dsw-alias-state-error-primary)}',
      '.qp-advice[data-tone="warn"]{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-brand-primary))}',
      '.qp-error{margin-top:8px;border-left:3px solid var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent);padding:7px 9px;border-radius:0 6px 6px 0;font-size:11.5px;line-height:1.5}',
      '.qp-today{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:2px 0 8px;padding:7px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-base);font-size:11.5px}',
      '.qp-today b{font-size:13px;font-variant-numeric:tabular-nums}',
      '.qp-balance{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:4px 0 8px}',
      '.qp-balance-main{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1}',
      '.qp-balance-main small{font-size:12px;font-weight:500;color:var(--dsw-alias-label-tertiary);margin-left:4px}',
      '.qp-phase{display:flex;align-items:center;gap:8px;flex-wrap:wrap;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:7px 9px;margin:2px 0 6px;font-size:11.5px;background:var(--dsw-alias-bg-base)}',
      '.qp-phase[data-peak="1"]{border-color:color-mix(in srgb,var(--dsw-alias-state-warning-primary,var(--dsw-alias-brand-primary)) 38%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,var(--dsw-alias-brand-primary)) 8%,transparent)}',
      '.qp-phase[data-peak="0"]{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 32%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 7%,transparent)}',
      '.qp-phase-main{display:flex;align-items:center;gap:6px;min-width:0}',
      '.qp-phase-main b{font-size:12.5px}',
      '.qp-phase-next{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-size:11px;white-space:nowrap}',
      '.qp-phasebar{height:4px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden;margin:0 0 8px}',
      '.qp-phasefill{height:100%;border-radius:999px;background:var(--dsw-alias-state-warning-primary,var(--dsw-alias-brand-primary));transition:width .3s ease}',
      '.qp-phasefill[data-peak="0"]{background:var(--dsw-alias-state-success-primary)}',
      '.qp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:6px}',
      '.qp-box{border:1px solid var(--dsw-alias-border-l1);border-radius:7px;padding:7px 9px;background:var(--dsw-alias-bg-base)}',
      '.qp-box-label{font-size:10px;color:var(--dsw-alias-label-tertiary)}',
      '.qp-box-value{font-size:12.5px;font-weight:600;margin-top:2px;font-variant-numeric:tabular-nums}',
      '.qp-settings{display:flex;flex-direction:column;gap:14px;max-width:760px}',
      '.qp-fieldset{border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-1);padding:11px 13px}',
      '.qp-fieldset h3{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);margin:0 0 8px}',
      '.qp-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:4px 0;font-size:12px}',
      '.qp-row > label{min-width:110px;color:var(--dsw-alias-label-secondary)}',
      '.qp-check{display:inline-flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;padding:2px 8px 2px 0}',
      '.qp-check input{accent-color:var(--dsw-alias-brand-primary)}',
      '.qp-select,.qp-input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:6px;padding:5px 8px;font:inherit;font-size:12px}',
      '.qp-input{width:96px}',
      '.qp-input.wide{width:230px}',
      '.qp-footer{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:2px}',
      '.qp-toast{font-size:11.5px;color:var(--dsw-alias-label-tertiary)}',
      '.qp-toast[data-kind="err"]{color:var(--dsw-alias-state-error-primary)}',
      '.qp-empty{color:var(--dsw-alias-label-tertiary);font-size:12px;padding:18px 0}',
      '.qp-note{font-size:10.5px;color:var(--dsw-alias-label-tertiary);line-height:1.5;margin-top:8px}',
      '.qp-side{--dsw-alias-bg-base:#0e1c18;--dsw-alias-bg-layer-1:#0e1c18;--dsw-alias-bg-layer-2:#1a2d27;--dsw-alias-border-l1:#29443a;--dsw-alias-label-primary:#e8f0e9;--dsw-alias-label-secondary:#c9d8cd;--dsw-alias-label-tertiary:#93a99c;--dsw-alias-brand-primary:#69a98d;--dsw-alias-state-success-primary:#69a98d;--dsw-alias-state-warning-primary:#c9a45c;--dsw-alias-state-error-primary:#c06f6f;--dsw-alias-interactive-bg-hover:#162a23;width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-base);box-shadow:0 8px 22px rgba(0,0,0,.24);padding:6px 8px;margin:2px 0;cursor:pointer;font-size:11px;color:var(--dsw-alias-label-primary)}',
      '.qp-side[data-theme="forest"]{--dsw-alias-bg-base:#0e1c18;--dsw-alias-bg-layer-1:#0e1c18;--dsw-alias-bg-layer-2:#1a2d27;--dsw-alias-border-l1:#29443a;--dsw-alias-label-primary:#e8f0e9;--dsw-alias-label-secondary:#c9d8cd;--dsw-alias-label-tertiary:#93a99c;--dsw-alias-brand-primary:#69a98d;--dsw-alias-state-success-primary:#69a98d;--dsw-alias-state-warning-primary:#c9a45c;--dsw-alias-state-error-primary:#c06f6f;--dsw-alias-interactive-bg-hover:#162a23}',
      '.qp-side[data-theme="navy"]{--dsw-alias-bg-base:#0d1b2e;--dsw-alias-bg-layer-1:#0d1b2e;--dsw-alias-bg-layer-2:#1a2a40;--dsw-alias-border-l1:#22364f;--dsw-alias-label-primary:#e6edf5;--dsw-alias-label-secondary:#c8d6e6;--dsw-alias-label-tertiary:#8fa3ba;--dsw-alias-brand-primary:#5b8db8;--dsw-alias-state-success-primary:#6fae9a;--dsw-alias-state-warning-primary:#d8a45e;--dsw-alias-state-error-primary:#c46b6b;--dsw-alias-interactive-bg-hover:#14263c}',
      '.qp-side[data-theme="graphite"]{--dsw-alias-bg-base:#15181d;--dsw-alias-bg-layer-1:#15181d;--dsw-alias-bg-layer-2:#22272e;--dsw-alias-border-l1:#2d333c;--dsw-alias-label-primary:#e8eaed;--dsw-alias-label-secondary:#c7ccd3;--dsw-alias-label-tertiary:#98a1ac;--dsw-alias-brand-primary:#8093a8;--dsw-alias-state-success-primary:#7aa892;--dsw-alias-state-warning-primary:#c7a36a;--dsw-alias-state-error-primary:#c27b7b;--dsw-alias-interactive-bg-hover:#1c2026}',
      '.qp-side[data-theme="ivory"]{--dsw-alias-bg-base:#f4f1ea;--dsw-alias-bg-layer-1:#f4f1ea;--dsw-alias-bg-layer-2:#d8d2c5;--dsw-alias-border-l1:#cfc7b8;--dsw-alias-label-primary:#1f2937;--dsw-alias-label-secondary:#334155;--dsw-alias-label-tertiary:#6b7280;--dsw-alias-brand-primary:#1f3a5f;--dsw-alias-state-success-primary:#2f7d5c;--dsw-alias-state-warning-primary:#9a6a1f;--dsw-alias-state-error-primary:#a33a3a;--dsw-alias-interactive-bg-hover:#ece7dd}',
      '.qp-side:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.qp-side:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.qp-side-head{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:2px;font-size:10.5px;color:var(--dsw-alias-label-tertiary)}',
      '.qp-side-title{font-weight:650;color:var(--dsw-alias-label-secondary);letter-spacing:.02em}',
      '.qp-side-open{font-size:10px;color:var(--dsw-alias-label-tertiary)}',
      '.qp-side-row{display:flex;align-items:center;gap:5px;flex-wrap:nowrap;padding:2px 0;border-top:1px solid var(--dsw-alias-border-l1);line-height:1.3;min-width:0}',
      '.qp-side-name{width:50px;flex:0 0 auto;color:var(--dsw-alias-label-tertiary);font-size:10.5px}',
      '.qp-side-pill{display:inline-flex;align-items:center;gap:3px;border-radius:999px;padding:1px 6px;font-size:10px;font-weight:600;white-space:nowrap}',
      '.qp-side-pill[data-peak="1"]{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-brand-primary));background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,var(--dsw-alias-brand-primary)) 12%,transparent)}',
      '.qp-side-pill[data-peak="0"]{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent)}',
      '.qp-side-next{margin-left:auto;font-size:10px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;flex:0 0 auto}',
      '.qp-side-go{margin-top:1px}',
      '.qp-side-money{display:flex;align-items:center;gap:14px;padding:2px 0 3px 50px;border-top:1px solid var(--dsw-alias-border-l1);font-size:10px;color:var(--dsw-alias-label-tertiary);min-width:0}',
      '.qp-side-money-item{display:inline-flex;align-items:baseline;gap:3px;min-width:0}',
      '.qp-side-money-label{font-size:9px;color:var(--dsw-alias-label-tertiary)}',
      '.qp-side-money-value{font-size:11px;font-weight:600;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.qp-side-section{display:flex;align-items:center;gap:5px;padding:1px 0 0;font-size:9px;color:var(--dsw-alias-label-tertiary)}',
      '.qp-side-section-name{font-weight:650;color:var(--dsw-alias-label-secondary)}',
      '.qp-side-gophase{display:inline-flex;align-items:center;gap:3px;border-radius:999px;padding:0 5px;font-size:9px;font-weight:600}',
      '.qp-side-gophase[data-peak="1"]{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-brand-primary));background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,var(--dsw-alias-brand-primary)) 12%,transparent)}',
      '.qp-side-gophase[data-peak="0"]{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent)}',
      '.qp-side-win{display:flex;align-items:center;gap:5px;padding:1px 0;font-size:10px;line-height:1.15;min-width:0}',
      '.qp-side-win-label{width:20px;flex:0 0 auto;color:var(--dsw-alias-label-tertiary);font-size:9.5px}',
      '.qp-side-bar{position:relative;flex:1 1 auto;min-width:42px;height:5px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:visible}',
      '.qp-side-fill{height:100%;min-width:3px;border-radius:999px;background:var(--dsw-alias-brand-primary)}',
      '.qp-side-fill[data-tone="warn"]{background:var(--dsw-alias-state-warning-primary,var(--dsw-alias-brand-primary))}',
      '.qp-side-fill[data-tone="danger"]{background:var(--dsw-alias-state-error-primary)}',
      '.qp-side-tick{position:absolute;top:-2px;bottom:-2px;width:1px;background:var(--dsw-alias-label-secondary);opacity:.65}',
      '.qp-side-win-pct{width:27px;flex:0 0 auto;text-align:right;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}',
      '.qp-side-win-pace{width:35px;flex:0 0 auto;text-align:right;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary)}',
      '.qp-side-win-pace[data-tone="warn"]{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-brand-primary))}',
      '.qp-side-win-pace[data-tone="danger"]{color:var(--dsw-alias-state-error-primary)}',
      '.qp-side-win-empty{font-size:10px;color:var(--dsw-alias-label-tertiary)}',
      '.qp-side-error{margin-top:4px;font-size:10px;color:var(--dsw-alias-state-error-primary);line-height:1.4}',
    ].join('')

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value))
    }

    function fmtPct(value, digits = 1) {
      if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
      return Number(value).toFixed(digits) + '%'
    }

    function fmtPace(value) {
      if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
      return Number(value).toFixed(2) + '×'
    }

    function fmtMoney(value, currency = 'USD') {
      if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
      const symbol = currency === 'CNY' ? '¥' : '$'
      const number = Number(value)
      return symbol + (number >= 100 ? number.toFixed(0) : number.toFixed(2))
    }

    function fmtMoneyExact(value, currency = 'USD') {
      const number = Number(value)
      if (!Number.isFinite(number)) return '—'
      return (currency === 'CNY' ? '¥' : '$') + number.toFixed(2)
    }

    function convertMoney(value, from, to, rate) {
      const number = Number(value)
      if (!Number.isFinite(number)) return null
      if (from === to) return number
      if (from === 'USD' && to === 'CNY') return number * rate
      if (from === 'CNY' && to === 'USD') return number / rate
      return number
    }

    function fmtDisplayMoney(value, from, display) {
      const to = display?.currency === 'USD' ? 'USD' : 'CNY'
      const rate = Number(display?.exchangeRate) || 6.66
      return fmtMoneyExact(convertMoney(value, from, to, rate), to)
    }

    function fmtDuration(ms) {
      if (!Number.isFinite(ms) || ms <= 0) return '已到窗口末尾'
      const minutes = Math.round(ms / 60000)
      if (minutes < 60) return minutes + ' 分钟'
      const hours = Math.floor(minutes / 60)
      const restMin = minutes % 60
      if (hours < 48) return hours + ' 小时' + (restMin ? ' ' + restMin + ' 分' : '')
      const days = Math.floor(hours / 24)
      return days + ' 天' + (hours % 24 ? ' ' + (hours % 24) + ' 小时' : '')
    }

    function fmtShortDuration(ms) {
      if (!Number.isFinite(ms) || ms <= 0) return '即将'
      const minutes = Math.round(ms / 60000)
      if (minutes < 60) return minutes + 'm'
      const hours = Math.floor(minutes / 60)
      const rest = minutes % 60
      if (hours < 48) return hours + 'h' + (rest ? ' ' + rest + 'm' : '')
      const days = Math.floor(hours / 24)
      return days + 'd' + (hours % 24 ? ' ' + (hours % 24) + 'h' : '')
    }

    function fmtTokens(value) {
      const n = Number(value)
      if (!Number.isFinite(n) || n <= 0) return '0'
      if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
      if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
      if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
      return String(Math.round(n))
    }

    function fmtClock(value) {
      const date = new Date(value)
      if (!Number.isFinite(date.getTime())) return '—'
      const pad = (n) => String(n).padStart(2, '0')
      return pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
    }

    function fmtTime(value) {
      const date = new Date(value)
      if (!Number.isFinite(date.getTime())) return '—'
      const pad = (n) => String(n).padStart(2, '0')
      return pad(date.getHours()) + ':' + pad(date.getMinutes())
    }

    async function api(path, options = {}) {
      const response = await fetch(API + path, {
        ...options,
        headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers ?? {}) },
      })
      const text = await response.text()
      let data = null
      try { data = text ? JSON.parse(text) : null } catch { data = { error: text } }
      if (!response.ok) throw new Error(data?.error || ('HTTP ' + response.status))
      return data
    }

    function retro(result) {
      if (!result || !result.ok) return '—'
      if (result.warmingUp) return '样本不足'
      if (result.projectedPercent === null) return '—'
      return Math.round(result.projectedPercent) + '%'
    }

    function adviceOf(result) {
      if (!result || !result.ok) return ''
      if (result.warmingUp) return '刚开始统计，样本不足，稍后再看。'
      const p = result.pace
      if (result.verdict === 'over') {
        return '按当前速度会在重置前触顶' + (result.etaMs ? '（约 ' + fmtDuration(result.etaMs) + ' 后）' : '') + '，建议降速：减少长上下文、暂停子代理或换用低成本模型。'
      }
      if (result.verdict === 'fast') return '略快于时间进度，建议把接下来的用量压到剩余额度的一半以下。'
      if (result.verdict === 'onTrack') return '基本贴合时间进度，保持当前节奏。'
      return '余量充足，可以按当前节奏继续。'
    }

    function Icon({ size = 16 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('path', { d: 'M4 18a8 8 0 1 1 16 0', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }),
        h('path', { d: 'M12 18l4.2-5.2', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }),
        h('circle', { cx: 12, cy: 18, r: 1.6, fill: 'currentColor' }),
        h('path', { d: 'M7 9.2h.01M17 9.2h.01M12 6.6h.01', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }))
    }

    function Bar({ result }) {
      if (!result || !result.ok) return null
      const used = clamp(result.percent, 0, 100)
      const time = clamp(result.timePercent, 0, 100)
      const tone = result.verdict === 'over' ? 'danger' : result.verdict === 'fast' ? 'warn' : ''
      return h('div', { className: 'qp-bar', role: 'img', 'aria-label': '已用 ' + fmtPct(result.percent) + '，时间 ' + fmtPct(result.timePercent) },
        h('div', { className: 'qp-bar-fill', 'data-tone': tone, style: { width: used + '%' } }),
        h('div', { className: 'qp-time', style: { left: time + '%' }, title: '时间进度 ' + fmtPct(result.timePercent) }))
    }

    function WindowRow({ kind, result, showAmount = true }) {
      if (!result) return null
      const verdict = VERDICT[result.verdict] ?? VERDICT.unknown
      return h('div', { className: 'qp-win' },
        h('div', { className: 'qp-win-head' },
          h('span', { className: 'qp-win-name' }, WINDOW_LABEL[kind] ?? kind),
          h('span', { className: 'qp-chip', 'data-tone': verdict.tone }, verdict.label),
          h('span', { className: 'qp-win-right' },
            h('span', { className: 'qp-muted' }, '重置 ' + fmtClock(result.resetsAt)))),
        h(Bar, { result }),
        h('div', { className: 'qp-legend' },
          h('span', null, '已用 ', h('b', null, fmtPct(result.percent))),
          h('span', null, '时间 ', h('b', null, fmtPct(result.timePercent))),
          h('span', null, '配速 ', h('b', null, fmtPace(result.pace))),
          h('span', null, '期末 ', h('b', null, retro(result)))),
        h('div', { className: 'qp-metrics' },
          h('div', null, h('div', { className: 'qp-metric-label' }, '剩余额度'), h('div', { className: 'qp-metric-value' }, fmtPct(result.remainingFrac * 100))),
          h('div', null, h('div', { className: 'qp-metric-label' }, '剩余时间'), h('div', { className: 'qp-metric-value' }, fmtDuration(result.remainingMs))),
          h('div', null, h('div', { className: 'qp-metric-label' }, result.budget?.unit === 'hour' ? '每小时可用' : '每天可用'), h('div', { className: 'qp-metric-value' }, result.budget?.value !== null && result.budget?.value !== undefined ? fmtPct(result.budget.value * 100) : '—')),
          showAmount && result.limit !== null ? h('div', null, h('div', { className: 'qp-metric-label' }, '窗口额度'), h('div', { className: 'qp-metric-value' }, fmtMoney(result.limit))) : null),
        showAmount && result.usedAmount !== null ? h('div', { className: 'qp-note' }, '套餐折算：已用 ' + fmtMoney(result.usedAmount) + ' / ' + fmtMoney(result.limit) + '（按官方百分比 × 窗口额度）') : null,
        h('div', { className: 'qp-advice', 'data-tone': verdict.tone }, adviceOf(result)))
    }

    function GoCard({ source, onProbe, busy }) {
      if (!source) return null
      const windows = WINDOW_ORDER.map((kind) => [kind, source.windows?.[kind]]).filter(([, value]) => value)
      const status = source.status
      return h('div', { className: 'qp-card' },
        h('div', { className: 'qp-card-head' },
          h('span', { className: 'qp-dot', 'data-status': status }),
          h('span', { className: 'qp-card-title' }, source.label || 'OpenCode Go'),
          h('span', { className: 'qp-chip' }, source.tierLabel || '档位未知'),
          h('span', { className: 'qp-chip' }, source.primaryModel || '未选模型'),
          source.phase ? h('span', {
            className: 'qp-chip',
            'data-tone': source.phase.peak ? 'warn' : 'ok',
            title: '下次转' + (source.phase.nextInPeak ? '高峰' : '空闲') + ' ' + (source.phase.nextLabel || '—'),
          }, (source.phase.peak ? '☀ 峰 ' : '☾ 谷 ') + source.phase.multiplier + '×') : null,
          h('span', { className: 'qp-win-right', style: { marginLeft: 'auto' } },
            h('button', { className: 'qp-btn', onClick: onProbe, disabled: busy || status !== 'ok' }, busy ? '探测中…' : (source.tier ? '重新探测' : '探测套餐档位')))),
        source.today && status === 'ok'
          ? h('div', { className: 'qp-today' },
            source.showAmount !== false ? h('span', null, '今日套餐折算 ', h('b', null, fmtMoney(source.today.allowanceCost))) : null,
            source.showAmount !== false ? h('span', { className: 'qp-muted' }, '列表价 ' + fmtMoney(source.today.listCost) + ' × ' + Number(source.allowanceFactor ?? 1).toFixed(2)) : null,
            h('span', { className: 'qp-muted' }, source.today.calls + ' 次调用'),
            h('span', { className: 'qp-muted' }, 'token 输入 ' + fmtTokens(source.today.input) + ' · 缓存 ' + fmtTokens(source.today.cacheRead) + ' · 输出 ' + fmtTokens(source.today.output)))
          : null,
        status === 'key-missing' || status === 'error'
          ? h('div', { className: 'qp-error' }, source.error || '查询失败')
          : windows.length === 0
            ? h('div', { className: 'qp-empty' }, '没有启用任何窗口。到「显示设置」里勾选 5 小时 / 周 / 月。')
            : windows.map(([kind, result]) => h(WindowRow, { key: kind, kind, result, showAmount: source.showAmount !== false })),
        h('div', { className: 'qp-note' },
          '来源：' + (source.keySource || '—') + ' · 官方 usage · 刷新于 ' + fmtTime(source.fetchedAt) +
          (source.modelFound === false ? ' · 主模型不在官方目录，金额不可用' : '') +
          (source.tier === null ? ' · 档位未知：先探测档位，金额才可用' : ' · 金额口径：列表价 × 档位倍率 = 套餐折算')))
    }

    function PhaseStatus({ phase }) {
      const [now, setNow] = useState(Date.now())
      useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 30_000)
        return () => clearInterval(id)
      }, [])
      if (!phase) return null
      const peak = phase.peak === true
      const remaining = phase.nextAt ? Math.max(0, phase.nextAt - now) : 0
      const next = phase.nextInPeak ? '高峰' : '谷时'
      return h(React.Fragment, null,
        h('div', { className: 'qp-phase', 'data-peak': peak ? '1' : '0', title: '工作日 09:00–12:00 / 14:00–18:00 为高峰；周末与法定节假日全天为谷。' },
          h('div', { className: 'qp-phase-main' },
            h('span', null, peak ? '☀' : '☾'),
            h('b', null, peak ? '当前高峰' : '当前谷时'),
            h('span', { className: 'qp-muted' }, phase.multiplier + '× 计费')),
          h('span', { className: 'qp-phase-next' },
            '下次转' + next + ' ' + (phase.nextLabel || '—') + ' · ' + fmtDuration(remaining))),
        h('div', { className: 'qp-phasebar' },
          h('div', { className: 'qp-phasefill', 'data-peak': peak ? '1' : '0', style: { width: Math.round((phase.progress ?? 0) * 100) + '%' } })))
    }

    function DeepSeekCard({ source, config }) {
      const display = config?.display ?? {}
      if (!source) return null
      const balance = source.balance
      const spend = source.localSpend
      const runway = spend?.dailyAverage > 0 && balance?.total >= 0 ? balance.total / spend.dailyAverage : null
      return h('div', { className: 'qp-card' },
        h('div', { className: 'qp-card-head' },
          h('span', { className: 'qp-dot', 'data-status': source.status }),
          h('span', { className: 'qp-card-title' }, source.label || 'DeepSeek 官方'),
          h('span', { className: 'qp-chip' }, '按量')),
        h(PhaseStatus, { phase: source.phase }),
        source.status === 'key-missing' || source.status === 'error'
          ? h('div', { className: 'qp-error' }, source.error || '查询失败')
          : balance
            ? h('div', null,
              h('div', { className: 'qp-balance' },
                h('span', { className: 'qp-balance-main' }, fmtDisplayMoney(balance.total, balance.currency, display), h('small', null, display.currency || balance.currency)),
                h('span', { className: 'qp-chip', 'data-tone': balance.available ? 'ok' : 'danger' }, balance.available ? '可用' : '不可用')),
              h('div', { className: 'qp-grid' },
                h('div', { className: 'qp-box' }, h('div', { className: 'qp-box-label' }, '今日花费（本地账本）'), h('div', { className: 'qp-box-value' }, spend ? fmtDisplayMoney(spend.todayCost, 'USD', display) : '—')),
                h('div', { className: 'qp-box' }, h('div', { className: 'qp-box-label' }, '本月花费（本地账本）'), h('div', { className: 'qp-box-value' }, spend ? fmtDisplayMoney(spend.monthCost, 'USD', display) : '—')),
                h('div', { className: 'qp-box' }, h('div', { className: 'qp-box-label' }, '日均'), h('div', { className: 'qp-box-value' }, spend?.dailyAverage ? fmtDisplayMoney(spend.dailyAverage, 'USD', display) : '—')),
                h('div', { className: 'qp-box' }, h('div', { className: 'qp-box-label' }, '按日均可撑'), h('div', { className: 'qp-box-value' }, runway !== null && Number.isFinite(runway) ? Math.floor(runway) + ' 天' : '—'))),
              h('div', { className: 'qp-note' }, '余额来自官方 /user/balance；花费来自 cost-meter 账本，仅作参考。'))
            : h('div', { className: 'qp-empty' }, '暂无余额数据。'))
    }

    function Settings({ state, draft, setDraft, onSave, saving, toast }) {
      if (!state || !draft) return null
      const go = draft.sources.opencodeGo
      const ds = draft.sources.deepseekOfficial
      const patchGo = (patch) => setDraft({ ...draft, sources: { ...draft.sources, opencodeGo: { ...go, ...patch } } })
      const patchGoWindow = (kind, value) => patchGo({ windows: { ...go.windows, [kind]: value } })
      const patchDs = (patch) => setDraft({ ...draft, sources: { ...draft.sources, deepseekOfficial: { ...ds, ...patch } } })
      const models = state.sources?.find((item) => item.id === 'opencode-go')?.models ?? []
      return h('div', { className: 'qp-settings' },
        h('div', { className: 'qp-fieldset' },
          h('h3', null, '显示来源'),
          h('div', { className: 'qp-row' },
            h('label', { className: 'qp-check' }, h('input', { type: 'checkbox', checked: go.enabled, onChange: (e) => patchGo({ enabled: e.target.checked }) }), 'OpenCode Go'),
            h('label', { className: 'qp-check' }, h('input', { type: 'checkbox', checked: ds.enabled, onChange: (e) => patchDs({ enabled: e.target.checked }) }), 'DeepSeek 官方'))),
        h('div', { className: 'qp-fieldset' },
          h('h3', null, 'OpenCode Go'),
          h('div', { className: 'qp-row' },
            h('label', null, '显示窗口'),
            WINDOW_ORDER.map((kind) => h('label', { key: kind, className: 'qp-check' },
              h('input', { type: 'checkbox', checked: go.windows[kind] !== false, onChange: (e) => patchGoWindow(kind, e.target.checked) }), WINDOW_LABEL[kind]))),
          h('div', { className: 'qp-row' },
            h('label', null, '套餐档位'),
            h('select', { className: 'qp-select', value: go.tier, onChange: (e) => patchGo({ tier: e.target.value }) },
              h('option', { value: 'auto' }, '自动（需探测）'),
              h('option', { value: 'go' }, 'Go'),
              h('option', { value: 'go-plus' }, 'Go Plus'),
              h('option', { value: 'go-teams' }, 'Go Teams'))),
          h('div', { className: 'qp-row' },
            h('label', null, '主模型'),
            h('input', { className: 'qp-input wide', list: 'qp-models', value: go.primaryModel, onChange: (e) => patchGo({ primaryModel: e.target.value }) }),
            h('datalist', { id: 'qp-models' }, models.map((id) => h('option', { key: id, value: id })))),
          h('div', { className: 'qp-row' },
            h('label', { className: 'qp-check' }, h('input', { type: 'checkbox', checked: go.showAmount !== false, onChange: (e) => patchGo({ showAmount: e.target.checked }) }), '显示套餐折算金额')),
          h('div', { className: 'qp-note' }, '金额 = 官方百分比 × 该模型在当前档位下的月度额度；5 小时窗口用月度额度的 20%，周窗口用 50%。')),
        h('div', { className: 'qp-fieldset' },
          h('h3', null, 'DeepSeek 官方'),
          h('div', { className: 'qp-row' },
            h('label', { className: 'qp-check' }, h('input', { type: 'checkbox', checked: ds.showLocalSpend !== false, onChange: (e) => patchDs({ showLocalSpend: e.target.checked }) }), '显示本地账本花费与可撑天数')),
          h('div', { className: 'qp-note' }, '本地花费来自 cost-meter 账本，只读；余额来自官方余额接口。')),
        h('div', { className: 'qp-fieldset' },
          h('h3', null, '外观与金额'),
          h('div', { className: 'qp-row' },
            h('label', null, '卡片配色'),
            h('select', { className: 'qp-select', value: draft.display.theme, onChange: (e) => setDraft({ ...draft, display: { ...draft.display, theme: e.target.value } }) },
              h('option', { value: 'navy' }, '深海蓝'),
              h('option', { value: 'graphite' }, '石墨灰'),
              h('option', { value: 'forest' }, '墨绿香槟'),
              h('option', { value: 'ivory' }, '象牙白'))),
          h('div', { className: 'qp-row' },
            h('label', null, '显示货币'),
            h('select', { className: 'qp-select', value: draft.display.currency, onChange: (e) => setDraft({ ...draft, display: { ...draft.display, currency: e.target.value } }) },
              h('option', { value: 'CNY' }, '人民币 CNY'),
              h('option', { value: 'USD' }, '美元 USD')),
            draft.display.currency === 'CNY' ? h('label', null, '汇率') : null,
            draft.display.currency === 'CNY' ? h('input', {
              className: 'qp-input', type: 'number', min: 1, max: 20, step: 0.01, value: draft.display.exchangeRate,
              onChange: (e) => setDraft({ ...draft, display: { ...draft.display, exchangeRate: Number(e.target.value) || 6.66 } }),
            }) : null,
            draft.display.currency === 'CNY' ? h('span', { className: 'qp-muted' }, '1 USD = ' + draft.display.exchangeRate + ' CNY') : null),
          h('div', { className: 'qp-note' }, '配色只影响左侧常驻卡片。币种影响 DeepSeek 余额与本地花费的显示；Go 额度仍按美元。')),
        h('div', { className: 'qp-fieldset' },
          h('h3', null, '刷新与预警'),
          h('div', { className: 'qp-row' },
            h('label', null, '刷新间隔'),
            h('input', { className: 'qp-input', type: 'number', min: 1, max: 60, value: draft.display.refreshMinutes, onChange: (e) => setDraft({ ...draft, display: { ...draft.display, refreshMinutes: Number(e.target.value) || 5 } }) }),
            h('span', { className: 'qp-muted' }, '分钟')),
          h('div', { className: 'qp-row' },
            h('label', null, '偏快阈值'),
            h('input', { className: 'qp-input', type: 'number', step: 0.05, value: draft.thresholds.fast, onChange: (e) => setDraft({ ...draft, thresholds: { ...draft.thresholds, fast: Number(e.target.value) || 1 } }) }),
            h('label', null, '将超限阈值'),
            h('input', { className: 'qp-input', type: 'number', step: 0.05, value: draft.thresholds.critical, onChange: (e) => setDraft({ ...draft, thresholds: { ...draft.thresholds, critical: Number(e.target.value) || 1.15 } }) }))),
        h('div', { className: 'qp-footer' },
          h('button', { className: 'qp-btn', 'data-kind': 'primary', onClick: onSave, disabled: saving }, saving ? '保存中…' : '保存设置'),
          toast ? h('span', { className: 'qp-toast', 'data-kind': toast.kind }, toast.text) : null))
    }

    function SidebarStatus() {
      const [state, setState] = useState(null)
      const [error, setError] = useState('')
      const [now, setNow] = useState(Date.now())

      const load = useCallback(async () => {
        try {
          const next = await api('/state')
          setState(next)
          setError('')
        } catch (e) {
          setError(e.message || String(e))
        }
      }, [])

      useEffect(() => {
        let alive = true
        const run = () => { if (alive) load() }
        const onConfig = () => run()
        run()
        const id = setInterval(run, 60_000)
        const tick = setInterval(() => setNow(Date.now()), 30_000)
        window.addEventListener('quota-pacer:config', onConfig)
        return () => { alive = false; clearInterval(id); clearInterval(tick); window.removeEventListener('quota-pacer:config', onConfig) }
      }, [load])

      const go = state?.sources?.find((item) => item.id === 'opencode-go')
      const ds = state?.sources?.find((item) => item.id === 'deepseek-official')
      const list = go ? WINDOW_ORDER.map((kind) => ({ kind, result: go.windows?.[kind] })).filter((item) => item.result?.ok) : []
      const theme = state?.config?.display?.theme ?? 'forest'
      const display = state?.config?.display ?? {}
      const phase = ds?.phase
      const peak = phase?.peak === true
      const remaining = phase?.nextAt ? Math.max(0, phase.nextAt - now) : 0
      const nextName = phase?.nextInPeak ? '峰' : '谷'

      const openFull = () => {
        const nodes = [...document.querySelectorAll('[role="tab"], button')]
        const target = nodes.find((node) => node.textContent?.trim() === '额度配速')
        target?.click()
      }

      return h(React.Fragment, null,
        h('style', null, STYLE),
        h('div', {
          className: 'qp-side', 'data-theme': theme, role: 'button', tabIndex: 0,
          title: '打开额度配速完整面板',
          onClick: openFull,
          onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openFull() } },
        },
        h('div', { className: 'qp-side-head' },
          h('span', { className: 'qp-side-title' }, '额度配速'),
          h('span', { className: 'qp-side-open' }, '详情 ↗')),
        phase ? h('div', { className: 'qp-side-row' },
          h('span', { className: 'qp-side-name' }, 'DeepSeek'),
          h('span', { className: 'qp-side-pill', 'data-peak': peak ? '1' : '0' },
            (peak ? '☀ 峰 ' : '☾ 谷 ') + phase.multiplier + '×'),
          h('span', { className: 'qp-side-next' },
            (phase.nextLabel || '—') + '转' + nextName + ' · ' + fmtShortDuration(remaining))) : null,
        ds && (ds.balance || ds.localSpend) ? h('div', {
          className: 'qp-side-money',
          title: '余额来自官方 /user/balance；今日花费来自 cost-meter 账本（美元），按设置折算为 ' + (display.currency || 'CNY'),
        },
          h('span', { className: 'qp-side-money-item' },
            h('span', { className: 'qp-side-money-label' }, '余额'),
            h('b', { className: 'qp-side-money-value' }, ds.balance ? fmtDisplayMoney(ds.balance.total, ds.balance.currency, display) : '—')),
          h('span', { className: 'qp-side-money-item' },
            h('span', { className: 'qp-side-money-label' }, '今日'),
            h('b', { className: 'qp-side-money-value' }, ds.localSpend ? fmtDisplayMoney(ds.localSpend.todayCost, 'USD', display) : '—'))) : null,
        go ? h('div', { className: 'qp-side-go' },
          h('div', { className: 'qp-side-section' },
            h('span', { className: 'qp-side-section-name' }, 'Go'),
            go.phase ? h('span', { className: 'qp-side-gophase', 'data-peak': go.phase.peak ? '1' : '0' },
              (go.phase.peak ? '☀ 峰 ' : '☾ 谷 ') + go.phase.multiplier + '×') : null),
          list.length === 0
            ? h('div', { className: 'qp-side-win' }, h('span', { className: 'qp-side-win-label' }, '—'), h('span', { className: 'qp-side-win-empty' }, '暂无窗口'))
            : list.map(({ kind, result }) => {
              const tone = result.verdict === 'over' ? 'danger' : result.verdict === 'fast' ? 'warn' : ''
              const label = WINDOW_LABEL[kind] || kind
              return h('div', {
                className: 'qp-side-win', key: kind,
                title: label + '：已用 ' + fmtPct(result.percent) + ' / 时间 ' + fmtPct(result.timePercent) + ' / 配速 ' + fmtPace(result.pace) + ' / ' + ((VERDICT[result.verdict] ?? VERDICT.unknown).label),
              },
                h('span', { className: 'qp-side-win-label' }, WINDOW_SHORT[kind] || label),
                h('div', { className: 'qp-side-bar' },
                  h('div', { className: 'qp-side-fill', 'data-tone': tone, style: { width: Math.min(100, Math.max(0, result.percent)) + '%' } }),
                  h('div', { className: 'qp-side-tick', style: { left: Math.min(100, Math.max(0, result.timePercent)) + '%' } })),
                h('span', { className: 'qp-side-win-pct' }, Math.round(result.percent) + '%'),
                h('span', { className: 'qp-side-win-pace', 'data-tone': tone }, fmtPace(result.pace)))
            })) : null,
        error ? h('div', { className: 'qp-side-error' }, error) : null))
    }

    function App() {
      const [state, setState] = useState(null)
      const [draft, setDraft] = useState(null)
      const [tab, setTab] = useState('pacing')
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [saving, setSaving] = useState(false)
      const [toast, setToast] = useState(null)
      const [probing, setProbing] = useState(false)

      const load = useCallback(async (force = false) => {
        setBusy(true)
        setError('')
        try {
          const next = force ? await api('/refresh', { method: 'POST' }) : await api('/state')
          setState(next)
          setDraft((current) => current ?? next.config)
        } catch (e) {
          setError(e.message || String(e))
        } finally {
          setBusy(false)
        }
      }, [])

      useEffect(() => { load(false) }, [load])
      useEffect(() => {
        const seconds = Math.max(60, (state?.config?.display?.refreshMinutes ?? 5) * 60)
        const id = setInterval(() => load(false), seconds * 1000)
        return () => clearInterval(id)
      }, [load, state?.config?.display?.refreshMinutes])

      const onSave = async () => {
        if (!draft) return
        setSaving(true)
        setToast(null)
        try {
          const result = await api('/config', { method: 'PUT', body: JSON.stringify(draft) })
          setState(result.state)
          setDraft(result.state.config)
          try { window.dispatchEvent(new Event('quota-pacer:config')) } catch { /* ignore */ }
          setToast({ kind: 'ok', text: '已保存 ' + fmtTime(Date.now()) })
        } catch (e) {
          setToast({ kind: 'err', text: '保存失败：' + (e.message || e) })
        } finally {
          setSaving(false)
        }
      }

      const onProbe = async () => {
        setProbing(true)
        setToast(null)
        try {
          const result = await api('/probe-tier', { method: 'POST' })
          setState(result.state)
          setDraft(result.state.config)
          try { window.dispatchEvent(new Event('quota-pacer:config')) } catch { /* ignore */ }
          setToast({ kind: 'ok', text: '套餐档位：' + (result.probe?.billingSource || '未知') })
        } catch (e) {
          setToast({ kind: 'err', text: '探测失败：' + (e.message || e) })
        } finally {
          setProbing(false)
        }
      }

      if (!state) {
        return h('div', { className: 'qp-root' }, h('style', null, STYLE),
          h('div', { className: 'qp-head' }, h('div', { className: 'qp-head-main' },
            h('h1', { className: 'qp-title' }, '额度配速'),
            h('div', { className: 'qp-sub' }, error ? '读取失败：' + error : '正在读取额度…'))),
          h('div', { className: 'qp-body' }, h('button', { className: 'qp-btn', onClick: () => load(true), disabled: busy }, busy ? '刷新中…' : '重试')))
      }

      const sources = state.sources ?? []
      const go = sources.find((item) => item.id === 'opencode-go')
      const ds = sources.find((item) => item.id === 'deepseek-official')

      return h('div', { className: 'qp-root' },
        h('style', null, STYLE),
        h('div', { className: 'qp-head' },
          h('div', { className: 'qp-head-main' },
            h('h1', { className: 'qp-title' }, h(Icon, { size: 18 }), '额度配速'),
            h('div', { className: 'qp-sub' }, '用量 vs 时间进度 · 生成于 ' + fmtTime(state.generatedAt) + (error ? ' · ' + error : ''))),
          h('div', { className: 'qp-actions' },
            h('button', { className: 'qp-btn', onClick: () => load(true), disabled: busy }, busy ? '刷新中…' : '刷新'))),
        h('div', { className: 'qp-tabs' },
          h('button', { className: 'qp-tab', 'data-on': tab === 'pacing' ? '1' : '0', onClick: () => setTab('pacing') }, '配速'),
          h('button', { className: 'qp-tab', 'data-on': tab === 'settings' ? '1' : '0', onClick: () => setTab('settings') }, '显示设置')),
        h('div', { className: 'qp-body' },
          tab === 'settings'
            ? h(Settings, { state, draft, setDraft, onSave, saving, toast })
            : h('div', { className: 'qp-stack' },
              go ? h(GoCard, { source: go, onProbe, busy: probing }) : null,
              ds ? h(DeepSeekCard, { source: ds, config: state.config }) : null,
              !go && !ds ? h('div', { className: 'qp-empty' }, '所有来源都已关闭。到「显示设置」里打开至少一个。') : null,
              h('div', { className: 'qp-note' }, '配速 = 已用百分比 ÷ 已过时间百分比。期末预测假设当前速度不变；5 小时窗口是官方固定 5 小时块，重置时间以接口为准。'))))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: MAIN_KEY }, App))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: PANEL_ID, order: 9,
          label: () => '额度配速',
        }, () => h(Icon, { size: 16 })))
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action', id: PANEL_ID + '-status', order: 2,
        }, () => h(SidebarStatus)))
      },
    }
  },
})
