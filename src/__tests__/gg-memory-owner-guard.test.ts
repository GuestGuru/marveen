import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import {
  initDatabase,
  saveAgentMemory,
  getAgentMemories,
  updateMemory,
  clearMemoryCache,
} from '../db.js'

// GG fork, 2026-09-01. Six agents keep their memories in one database and reach
// it through one shared dashboard token, so the server cannot tell them apart.
// A mistyped id therefore used to land on whoever owned that row -- and because
// the PUT's `agent_id` field REASSIGNS rather than filters, the row also moved
// to the agent who made the typo. The victim then could not find it in their own
// listing at all: not a corrupted memory, a vanished one.
//
// `ownerGuard` is the fix. It is a typo guard, not authorization -- there is no
// caller identity to authorize against.
beforeAll(() => {
  process.env.NODE_ENV = 'test'
  initDatabase(':memory:')
})

beforeEach(() => {
  clearMemoryCache()
})

describe('updateMemory owner guard', () => {
  it('writes when the guard names the real owner', () => {
    const { id } = saveAgentMemory('guard-owner', 'Original', 'warm', 'k')
    expect(updateMemory(id, 'Rewritten', undefined, undefined, undefined, 'guard-owner')).toBe(true)
    expect(getAgentMemories('guard-owner', 50).find(m => m.id === id)?.content).toBe('Rewritten')
  })

  it('refuses the write when the guard names someone else, and leaves the row untouched', () => {
    const { id } = saveAgentMemory('guard-victim', 'Victim content', 'warm', 'k')
    // The typo: another agent aimed at its own id and hit this one instead.
    expect(updateMemory(id, 'Clobbered', undefined, undefined, undefined, 'guard-typist')).toBe(false)
    expect(getAgentMemories('guard-victim', 50).find(m => m.id === id)?.content).toBe('Victim content')
  })

  it('blocks the reassign too, so a mistyped row cannot move to the typist', () => {
    const { id } = saveAgentMemory('guard-victim2', 'Still mine', 'warm', 'k')
    // Same call the dashboard makes on a real edit: agent_id present, meaning
    // "reassign". Without the guard this both overwrites AND steals the row.
    expect(updateMemory(id, 'Clobbered', 'cold', 'guard-typist2', 'k2', 'guard-typist2')).toBe(false)
    expect(getAgentMemories('guard-victim2', 50).find(m => m.id === id)?.content).toBe('Still mine')
    expect(getAgentMemories('guard-typist2', 50).find(m => m.id === id)).toBeUndefined()
  })

  it('keeps the unguarded call working, because reassign is still a real feature', () => {
    const { id } = saveAgentMemory('guard-handover', 'Handover note', 'hot', 'k')
    expect(updateMemory(id, 'Handover note', 'hot', 'guard-receiver')).toBe(true)
    expect(getAgentMemories('guard-receiver', 50).find(m => m.id === id)?.content).toBe('Handover note')
  })
})

// GG fork 2026-09-15. updateMemory used to write `content = ?` unconditionally,
// so the most ordinary edit there is -- moving a closed decision from hot to cold
// -- bound `undefined` to a NOT NULL-ish column and the driver threw. From the
// caller's side that was an HTTP 500 with the row unchanged, and the workaround
// (re-send the entire content just to change one word) is exactly how content
// gets mangled in transit.
describe('updateMemory without content', () => {
  it('moves the tier and leaves the content untouched', () => {
    const { id } = saveAgentMemory('tier-mover', 'Closed decision, full text', 'hot', 'k')
    expect(updateMemory(id, undefined, 'cold', undefined, undefined, 'tier-mover')).toBe(true)
    const row = getAgentMemories('tier-mover', 50).find(m => m.id === id)
    expect(row?.content).toBe('Closed decision, full text')
    expect(row?.category).toBe('cold')
  })

  it('still rewrites the content when one is given', () => {
    const { id } = saveAgentMemory('tier-mover', 'Before', 'hot', 'k')
    expect(updateMemory(id, 'After', 'cold', undefined, undefined, 'tier-mover')).toBe(true)
    const row = getAgentMemories('tier-mover', 50).find(m => m.id === id)
    expect(row?.content).toBe('After')
    expect(row?.category).toBe('cold')
  })

  it('keeps honouring the owner guard on a tier-only edit', () => {
    const { id } = saveAgentMemory('tier-victim', 'Victim content', 'hot', 'k')
    expect(updateMemory(id, undefined, 'cold', undefined, undefined, 'tier-typist')).toBe(false)
    const row = getAgentMemories('tier-victim', 50).find(m => m.id === id)
    expect(row?.content).toBe('Victim content')
    expect(row?.category).toBe('hot')
  })
})
