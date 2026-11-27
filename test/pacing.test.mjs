import test from 'node:test'
import assert from 'node:assert/strict'

import { computeWindow, subtractMonthClamped, windowBounds } from '../lib/pacing.js'
import { normalizeKey, tierFromBillingSource, monthlyLimitOf } from '../lib/opencode.js'

const NOW = Date.parse('2026-11-27T03:00:00Z')

test('month window starts one subscription month before reset', () => {
  const bounds = windowBounds('monthly', '2026-12-25T07:07:30Z')
  assert.equal(new Date(bounds.startAt).toISOString(), '2026-11-25T07:07:30.000Z')
  assert.equal(bounds.durationMs, 30 * 24 * 3600 * 1000)
})

test('short month clamps day 31', () => {
  const start = subtractMonthClamped('2026-03-31T00:00:00Z')
  assert.equal(new Date(start).toISOString(), '2026-02-28T00:00:00.000Z')
})

test('monthly 9% with 6.1% elapsed is over pace', () => {
  const result = computeWindow({ kind: 'monthly', percent: 9, resetsAt: '2026-12-25T07:07:30Z', now: NOW, limit: 200 })
  assert.equal(result.ok, true)
  assert.ok(result.pace > 1.4)
  assert.equal(result.verdict, 'over')
  assert.equal(result.usedAmount, 18)
})

test('weekly 18% with 58.9% elapsed is ahead', () => {
  const result = computeWindow({ kind: 'weekly', percent: 18, resetsAt: '2026-11-30T00:00:00Z', now: NOW })
  assert.equal(result.verdict, 'ahead')
  assert.ok(result.projected < 0.4)
})

test('five hour window marks warming up below 15 minutes', () => {
  const result = computeWindow({ kind: 'fiveHour', percent: 1, resetsAt: '2026-11-27T05:33:25Z', now: Date.parse('2026-11-27T00:35:00Z') })
  assert.equal(result.warmingUp, true)
  assert.equal(result.verdict, 'unknown')
  assert.equal(result.projected, null)
})

test('five hour 40% at half time stays ahead', () => {
  const result = computeWindow({ kind: 'fiveHour', percent: 40, resetsAt: '2026-11-27T05:33:25Z', now: NOW })
  assert.equal(result.verdict, 'ahead')
  assert.ok(result.pace < 1)
})

test('invalid reset reports error', () => {
  const result = computeWindow({ kind: 'weekly', percent: 10, resetsAt: 'not-a-date', now: NOW })
  assert.equal(result.ok, false)
  assert.equal(result.error, 'invalid-reset')
})

test('key normalization strips bearer and rejects junk', () => {
  assert.equal(normalizeKey('Bearer oc_test_12345678'), 'oc_test_12345678')
  assert.equal(normalizeKey('  oc_test_12345678  '), 'oc_test_12345678')
  assert.equal(normalizeKey('bad\nkey'), null)
  assert.equal(normalizeKey(''), null)
})

test('billing source maps to tier', () => {
  assert.equal(tierFromBillingSource('go-plus'), 'go-plus')
  assert.equal(tierFromBillingSource('go'), 'go')
  assert.equal(tierFromBillingSource('nope'), null)
})

test('monthly limit reads model go limits', () => {
  assert.equal(monthlyLimitOf({ go: { monthly_usage: { go: 100, 'go-plus': 200 } } }, 'go-plus'), 200)
  assert.equal(monthlyLimitOf({ go: { monthly_usage: { go: 100 } } }, 'go-plus'), null)
})
