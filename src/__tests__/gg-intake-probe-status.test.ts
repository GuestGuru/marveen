import { describe, it, expect } from 'vitest'
import { isTransientTelegramStatus } from '../gg/intake-probe-status.js'
import { parseIntakeProbe } from '../web/channel-intake-monitor.js'

describe('isTransientTelegramStatus', () => {
  it('treats Telegram server errors and rate limiting as transient', () => {
    for (const s of [429, 500, 502, 503, 504]) expect(isTransientTelegramStatus(s)).toBe(true)
  })
  it('keeps token verdicts and success as non-transient', () => {
    for (const s of [200, 400, 401, 403, 404]) expect(isTransientTelegramStatus(s)).toBe(false)
  })
})

describe('parseIntakeProbe with Telegram-side failures (GG fork)', () => {
  it('reads a 502 Bad Gateway as unreachable, not as a rejected token', () => {
    const r = parseIntakeProbe(502, { ok: false, error_code: 502, description: 'Bad Gateway' })
    expect(r.reachable).toBe(false)
    expect(r.tokenOk).toBe(true)
  })
  it('reads a 429 as unreachable', () => {
    const r = parseIntakeProbe(429, { ok: false, error_code: 429, description: 'Too Many Requests: retry after 5' })
    expect(r.reachable).toBe(false)
    expect(r.tokenOk).toBe(true)
  })
  it('still reports a 401 as token-invalid', () => {
    const r = parseIntakeProbe(401, { ok: false, error_code: 401, description: 'Unauthorized' })
    expect(r.reachable).toBe(true)
    expect(r.tokenOk).toBe(false)
  })
})
