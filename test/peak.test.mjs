import test from 'node:test'
import assert from 'node:assert/strict'
import { isPeakAt, peakPhase } from '../lib/peak.js'

const at = (iso) => Date.parse(iso)

test('weekday 10:00 is peak, next switch 12:00', () => {
  const phase = peakPhase(at('2026-11-27T10:00:00+08:00'))
  assert.equal(phase.peak, true)
  assert.equal(phase.multiplier, 1)
  assert.equal(phase.nextLabel, '12:00')
  assert.equal(phase.nextInPeak, false)
  assert.ok(Math.abs(phase.progress - 1 / 3) < 0.01)
})

test('weekday 12:40 is off-peak, next switch 14:00, half price', () => {
  const phase = peakPhase(at('2026-11-27T12:40:00+08:00'))
  assert.equal(phase.peak, false)
  assert.equal(phase.multiplier, 0.5)
  assert.equal(phase.nextLabel, '14:00')
  assert.equal(phase.nextInPeak, true)
  assert.ok(Math.abs(phase.progress - 1 / 3) < 0.01)
})

test('weekend is off-peak all day, next Monday 09:00', () => {
  const phase = peakPhase(at('2026-11-28T10:00:00+08:00'))
  assert.equal(phase.peak, false)
  assert.equal(phase.nextLabel, '周一 09:00')
  assert.equal(phase.nextInPeak, true)
})

test('Friday after 18:00 stays off-peak until Monday', () => {
  const phase = peakPhase(at('2026-11-27T18:30:00+08:00'))
  assert.equal(phase.peak, false)
  assert.equal(phase.nextLabel, '周一 09:00')
})

test('holiday weekday is off-peak', () => {
  assert.equal(isPeakAt(at('2026-11-27T10:00:00+08:00'), ['2026-11-27']), false)
  const phase = peakPhase(at('2026-11-27T10:00:00+08:00'), { holidays: ['2026-11-27'] })
  assert.equal(phase.peak, false)
  assert.equal(phase.multiplier, 0.5)
})

test('peak multiplier is configurable', () => {
  const phase = peakPhase(at('2026-11-27T10:00:00+08:00'), { multiplier: { peak: 2, offPeak: 1 } })
  assert.equal(phase.multiplier, 2)
})
