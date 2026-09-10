import { describe, expect, it } from 'vitest'
import {
  mainChannelsSession,
  mainRecipientWaitNote,
  recipientIsReachable,
} from '../gg/main-recipient-running.js'

// GG fork, 2026-09-10. isAgentRunning() is built on `agent-${name}`, which the main
// agent never uses, so POST /api/messages warned "the message is lost" on every one
// of the 480 messages ever addressed to it -- 478 of which were delivered.
const MAIN = 'marveen'

const runningAgents = (names: string[]) => (name: string) => names.includes(name)
const liveSessions = (names: string[]) => (_host: string | null, s: string) => names.includes(s)
const identity = (s: string) => s

describe('mainChannelsSession', () => {
  it('derives the channels session from the id, not a hardcoded name', () => {
    expect(mainChannelsSession('marveen')).toBe('marveen-channels')
    expect(mainChannelsSession('othermain')).toBe('othermain-channels')
  })
})

describe('recipientIsReachable', () => {
  it('finds the main agent through its channels session, not agent-<name>', () => {
    // The live shape: agent-marveen does NOT exist, marveen-channels does.
    const reachable = recipientIsReachable(
      MAIN, MAIN,
      runningAgents([]), // isAgentRunning would say no for every name
      liveSessions(['marveen-channels', 'agent-jean']),
      identity,
    )
    expect(reachable).toBe(true)
  })

  it('reports the main agent unreachable only when its channels session is gone', () => {
    expect(recipientIsReachable(MAIN, MAIN, runningAgents([]), liveSessions(['agent-jean']), identity)).toBe(false)
  })

  it('leaves the ordinary per-agent check untouched for sub-agents', () => {
    expect(recipientIsReachable('jean', MAIN, runningAgents(['jean']), liveSessions([]), identity)).toBe(true)
    expect(recipientIsReachable('jean', MAIN, runningAgents([]), liveSessions(['jean-channels']), identity)).toBe(false)
  })

  it('never consults the channels session for a sub-agent that happens to have one', () => {
    // A sub-agent named like the main agent's session must not be waved through.
    expect(recipientIsReachable('bubi', MAIN, runningAgents([]), liveSessions(['bubi-channels']), identity)).toBe(false)
  })

  it('sanitizes the sub-agent name before the lookup', () => {
    const seen: string[] = []
    recipientIsReachable('Jean', MAIN, (n) => { seen.push(n); return false }, liveSessions([]), (s) => s.toLowerCase())
    expect(seen).toEqual(['jean'])
  })
})

describe('mainRecipientWaitNote', () => {
  it('says the message waits rather than that it is lost', () => {
    const note = mainRecipientWaitNote(MAIN, MAIN, 'marveen')
    expect(note).not.toBeNull()
    expect(note).toContain('NEM veszik el')
    expect(note).toContain('pending')
    // The sub-agent advice would be actively wrong here, so the note must not tell
    // the sender to start anything. It names that endpoint only to rule it out.
    expect(note).toContain('ne indíts semmit')
    expect(note).toContain('nem a POST /api/agents/<nev>/start indítja')
  })

  it('tells the sender not to resend, since resending is the likely reflex', () => {
    expect(mainRecipientWaitNote(MAIN, MAIN, 'marveen')).toContain('Ne küldd újra')
  })

  it('returns null for a sub-agent so the caller keeps its own wording', () => {
    expect(mainRecipientWaitNote('jean', MAIN, 'jean')).toBeNull()
  })

  it('uses the display name given, so a federated form stays readable', () => {
    expect(mainRecipientWaitNote(MAIN, MAIN, 'gg/marveen')).toContain("'gg/marveen'")
  })
})
