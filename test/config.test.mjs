import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConfig } from '../host.js'

test('defaults to forest theme and CNY', () => {
  const config = normalizeConfig({})
  assert.equal(config.display.theme, 'forest')
  assert.equal(config.display.currency, 'CNY')
  assert.equal(config.display.exchangeRate, 6.66)
})

test('accepts all four themes and USD', () => {
  for (const theme of ['navy', 'graphite', 'forest', 'ivory']) {
    assert.equal(normalizeConfig({ display: { theme } }).display.theme, theme)
  }
  const usd = normalizeConfig({ display: { currency: 'USD', exchangeRate: 7.2 } })
  assert.equal(usd.display.currency, 'USD')
  assert.equal(usd.display.exchangeRate, 7.2)
})

test('invalid theme falls back to forest and rate is clamped', () => {
  const config = normalizeConfig({ display: { theme: 'neon', exchangeRate: 99 } })
  assert.equal(config.display.theme, 'forest')
  assert.equal(config.display.exchangeRate, 20)
})
