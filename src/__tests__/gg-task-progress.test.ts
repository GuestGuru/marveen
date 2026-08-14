// GG fork: the post-fire watchdog's stall rule.
//
// The behaviour under test is the one that produced nine false "possible hang"
// alerts up to 2026-08-14: a task that works for longer than its budget is not
// a hang. What makes it a hang is that the pane stops moving.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { paneProgressSignature, trackPaneProgress } from '../gg/task-progress.js'
import { decideTaskTimeout } from '../web/schedule-runner.js'

const MIN = 60_000
const GRACE = 30_000
const TIMEOUT = 5 * MIN
const MAX_TRACK = 6 * 60 * MIN
const OPTS = { graceMs: GRACE, timeoutMs: TIMEOUT, maxTrackMs: MAX_TRACK }

// A pane shaped like the real TUI mid-tool-call.
function busyPane(seconds: number, tail = ''): string {
  return `some transcript\n✻ Worked for ${seconds}s (esc to interrupt)\n${tail}`
}

describe('paneProgressSignature', () => {
  it('prefers the TUI tool-call footer and moves with the counter', () => {
    const a = paneProgressSignature(busyPane(12))
    const b = paneProgressSignature(busyPane(13))
    expect(a).toBe('tc:worked:12')
    expect(b).toBe('tc:worked:13')
    expect(a).not.toBe(b)
  })

  it('treats a verb change as progress (the tool-call moved phase)', () => {
    expect(paneProgressSignature('✻ Brewed for 9s')).not.toBe(paneProgressSignature('✻ Worked for 9s'))
  })

  it('falls back to hashing the pane when no footer is rendered', () => {
    const a = paneProgressSignature('streaming text, no footer yet')
    const b = paneProgressSignature('streaming text, no footer yet!')
    expect(a).toMatch(/^h:/)
    expect(a).not.toBe(b)
  })

  it('is stable for byte-identical panes -- the wedge signal', () => {
    expect(paneProgressSignature(busyPane(31))).toBe(paneProgressSignature(busyPane(31)))
  })

  it('returns null for a failed capture and for an empty pane', () => {
    expect(paneProgressSignature(null)).toBeNull()
    expect(paneProgressSignature('   \n  ')).toBeNull()
  })
})

describe('trackPaneProgress', () => {
  const seed = { progressSig: null, lastProgressAt: 0 }

  it('seeds on the first observation', () => {
    const s = trackPaneProgress(seed, busyPane(3), 1000)
    expect(s.progressSig).toBe('tc:worked:3')
    expect(s.lastProgressAt).toBe(1000)
  })

  it('restarts the clock when the pane moves', () => {
    const a = trackPaneProgress(seed, busyPane(3), 1000)
    const b = trackPaneProgress(a, busyPane(4), 9000)
    expect(b.lastProgressAt).toBe(9000)
  })

  it('holds the clock when the pane is frozen', () => {
    const a = trackPaneProgress(seed, busyPane(31), 1000)
    const b = trackPaneProgress(a, busyPane(31), 9000)
    expect(b.lastProgressAt).toBe(1000)
  })

  it('a failed capture is no signal: it neither manufactures nor clears a stall', () => {
    const a = trackPaneProgress(seed, busyPane(31), 1000)
    const b = trackPaneProgress(a, null, 9000)
    expect(b).toEqual(a)
  })
})

describe('decideTaskTimeout: the stall rule', () => {
  const entry = { injectedAt: 0, alerted: false }

  it('REGRESSION 2026-08-14: a long but visibly working task is not a hang', () => {
    // The 07:45 memoria-heartbeat: twelve minutes of real work on a 5-minute
    // budget. Under the old duration-only rule this alerted at 07:50.
    const now = 12 * MIN
    const stalledSince = now - 2000 // pane moved two seconds ago
    expect(decideTaskTimeout({ ...entry, stalledSince }, 'busy', now, OPTS)).toBe('hold')
  })

  it('still alerts on a genuinely frozen pane', () => {
    const now = 12 * MIN
    const stalledSince = now - TIMEOUT
    expect(decideTaskTimeout({ ...entry, stalledSince }, 'busy', now, OPTS)).toBe('alert')
  })

  it('without stalledSince it is the original duration-only rule (upstream callers unaffected)', () => {
    expect(decideTaskTimeout(entry, 'busy', 6 * MIN, OPTS)).toBe('alert')
    expect(decideTaskTimeout(entry, 'busy', 4 * MIN, OPTS)).toBe('hold')
  })

  it('progress does not defeat eviction or the idle clear', () => {
    const fresh = { ...entry, stalledSince: MAX_TRACK }
    expect(decideTaskTimeout(fresh, 'busy', MAX_TRACK, OPTS)).toBe('clear')
    expect(decideTaskTimeout({ ...entry, stalledSince: 0 }, 'idle', 9 * MIN, OPTS)).toBe('clear')
  })

  it('the grace window still runs off injection, not off progress', () => {
    // A brand-new entry whose pane has never moved must not alert inside grace.
    expect(decideTaskTimeout({ ...entry, stalledSince: 0 }, 'busy', GRACE - 1, OPTS)).toBe('hold')
  })

  it('alerts at most once', () => {
    const stalled = { injectedAt: 0, alerted: true, stalledSince: 0 }
    expect(decideTaskTimeout(stalled, 'busy', 12 * MIN, OPTS)).toBe('hold')
  })
})

describe('the sweep actually feeds progress into the decision (fix-revert guard)', () => {
  it('schedule-runner tracks the pane and passes stalledSince', () => {
    const src = readFileSync(join(__dirname, '../web/schedule-runner.ts'), 'utf-8')
    expect(src).toMatch(/trackPaneProgress\(entry, pane, now\)/)
    expect(src).toMatch(/stalledSince: entry\.lastProgressAt/)
  })
})
