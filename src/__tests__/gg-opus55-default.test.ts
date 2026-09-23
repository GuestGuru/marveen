import { describe, it, expect } from 'vitest'
import { getSettingDefinition, validateSettingValue } from '../config-registry.js'

// GG fork: the install default is Opus 5.5 (2026-09-23). If the valueSet drops
// it, the dashboard settings editor rejects the value this install runs on.
describe('GG fork: Opus 5.5 as DEFAULT_AGENT_MODEL', () => {
  const def = getSettingDefinition('DEFAULT_AGENT_MODEL')!

  it.each(['claude-opus-5-5', 'claude-opus-5-5[1m]'])('accepts %s', (id) => {
    expect(validateSettingValue(def, id)).toEqual({ ok: true, value: id })
  })

  it('still rejects an unknown id (control)', () => {
    expect(validateSettingValue(def, 'claude-opus-9').ok).toBe(false)
  })
})
