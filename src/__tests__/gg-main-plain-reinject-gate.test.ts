import { describe, it, expect } from 'vitest'
import {
  mainPlainReinjectAllowed,
  MAIN_PLAIN_REINJECT_AFTER_MS,
} from '../gg/main-plain-reinject-gate.js'

const NOW = 1_700_000_000_000

describe('mainPlainReinjectAllowed', () => {
  it('stays SHUT for a fresh spell -- the fast escalation must run first', () => {
    expect(mainPlainReinjectAllowed({ firstSeenAt: NOW, now: NOW })).toBe(false)
    expect(mainPlainReinjectAllowed({ firstSeenAt: NOW - 45_000, now: NOW })).toBe(false)
  })

  it('stays SHUT one millisecond before the threshold', () => {
    const firstSeenAt = NOW - MAIN_PLAIN_REINJECT_AFTER_MS + 1
    expect(mainPlainReinjectAllowed({ firstSeenAt, now: NOW })).toBe(false)
  })

  it('OPENS exactly at the threshold and stays open after it', () => {
    expect(mainPlainReinjectAllowed({ firstSeenAt: NOW - MAIN_PLAIN_REINJECT_AFTER_MS, now: NOW })).toBe(true)
    expect(mainPlainReinjectAllowed({ firstSeenAt: NOW - 4 * 60 * 60 * 1000, now: NOW })).toBe(true)
  })

  it('stays SHUT when there is no spell -- a missing timestamp is not evidence', () => {
    expect(mainPlainReinjectAllowed({ firstSeenAt: null, now: NOW })).toBe(false)
  })

  it('stays SHUT on a backwards clock jump instead of reading it as "stuck forever"', () => {
    expect(mainPlainReinjectAllowed({ firstSeenAt: NOW + 60_000, now: NOW })).toBe(false)
    expect(mainPlainReinjectAllowed({ firstSeenAt: Number.NaN, now: NOW })).toBe(false)
  })

  it('honours an explicit threshold so the production delay is not baked into callers', () => {
    expect(mainPlainReinjectAllowed({ firstSeenAt: NOW - 5_000, now: NOW, thresholdMs: 1_000 })).toBe(true)
    expect(mainPlainReinjectAllowed({ firstSeenAt: NOW - 500, now: NOW, thresholdMs: 1_000 })).toBe(false)
  })

  it('is set to the 30 minutes the owner chose on 2026-08-29', () => {
    expect(MAIN_PLAIN_REINJECT_AFTER_MS).toBe(30 * 60 * 1000)
  })
})
