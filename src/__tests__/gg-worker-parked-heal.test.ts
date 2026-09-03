import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decideWorkerParkedHeal } from '../gg/worker-parked-heal.js'
import { classifyWorkerPane, shouldSelfHeal } from '../web/agent-worker.js'

// GG fork (WORKERPARK903). Measured 2026-09-03: the background worker kept
// logging `worker never became ready` and alerting the owner, while the
// captured pane showed the request prompt sitting UNSENT in the input box.
// The Escape self-heal that exists for exactly this kind of trouble had never
// run once -- `pane parked on unexpected chrome` appears ZERO times in the
// dashboard log -- because a parked box reads 'typing', which the worker
// classifier folds into 'idle', and shouldSelfHeal('idle') is false.
//
// The first describe pins the CONTRADICTION itself, so nobody "fixes" it by
// making the classifier lie; the second pins the decision that closes it.

const PARKED_PANE = [
  '────────────────────────────────────────────────────────────────────────────────',
  '❯ (delivery mechanism, not part of the task): 1. Write your COMPLETE response',
  '  -- and nothing else, no commentary, to this exact file using the Write tool:',
  '  /home/gg/.marveen-worker/scratch/mtj5i5km-1.out',
  '────────────────────────────────────────────────────────────────────────────────',
  '  ⏵⏵ bypass permissions on (shift+tab to cycle)',
].join('\n')

describe('the measured gap: an idle-looking pane the Escape self-heal refuses', () => {
  it('a pane with unsent parked text classifies as idle, so shouldSelfHeal declines it', () => {
    const cls = classifyWorkerPane(PARKED_PANE)
    expect(cls).toBe('idle')
    expect(shouldSelfHeal(cls)).toBe(false)
  })

  it('the readiness poll now has a branch for exactly that state', () => {
    // Source-level pin: the wiring is what was missing, not the cleaner. A
    // future refactor that drops the call must fail here, not in production at
    // 23:00 with an owner alert.
    const src = readFileSync(join(__dirname, '..', 'web', 'agent-worker.ts'), 'utf-8')
    expect(src).toContain('decideWorkerParkedHeal')
    expect(src).toContain('clearStaleParkedInput')
  })
})

describe('decideWorkerParkedHeal', () => {
  const base = { ready: false, paneClass: 'idle' as const, elapsedMs: 30_000, graceMs: 20_000, alreadyTried: false }

  it('clears when the pane looks idle but readiness says no, past the grace window', () => {
    expect(decideWorkerParkedHeal(base)).toBe('clear-parked')
  })

  it('never acts on a ready worker', () => {
    expect(decideWorkerParkedHeal({ ...base, ready: true })).toBe('skip')
  })

  it('never interrupts boot chrome inside the grace window', () => {
    expect(decideWorkerParkedHeal({ ...base, elapsedMs: 5_000 })).toBe('skip')
    // Boundary: at exactly the grace mark the window has not elapsed yet.
    expect(decideWorkerParkedHeal({ ...base, elapsedMs: 20_000 })).toBe('skip')
    expect(decideWorkerParkedHeal({ ...base, elapsedMs: 20_001 })).toBe('clear-parked')
  })

  it('is one bounded attempt per poll -- a box that survives it must reach restart + alert', () => {
    expect(decideWorkerParkedHeal({ ...base, alreadyTried: true })).toBe('skip')
  })

  it('leaves every other pane class to its own owner', () => {
    // 'busy' is the dangerous one: clearing there would truncate live work.
    for (const paneClass of ['busy', 'modal', 'unknown', 'auth', 'empty'] as const) {
      expect(decideWorkerParkedHeal({ ...base, paneClass })).toBe('skip')
    }
  })
})
