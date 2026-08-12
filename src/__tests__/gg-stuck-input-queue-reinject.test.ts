// GG fork: regression suite for the queue-authoritative stuck-input rescue.
//
// The incident this encodes (2026-08-12, agent-jean): a 911-character
// inter-agent handover parked in the TUI input box, the visible rows showed
// only its TAIL, every screen-derived predicate therefore failed, and the
// upstream decision fell to 'hold' -- five escalations, then an alert asking a
// human for a manual restart. One Enter by hand submitted the whole buffer
// intact, proving the buffer was never truncated; only the VIEW was.
import { describe, it, expect, beforeEach } from 'vitest'
import { initDatabase, createAgentMessage, markMessageDelivered, getDb } from '../db.js'
import {
  normalizeParkedText,
  deliveredEndsWithParkedTail,
  renderDeliveredFrame,
  findQueuedFrameForParkedTail,
  agentForSession,
  QUEUE_REINJECT_LOOKBACK_MS,
  QUEUE_REINJECT_MIN_TAIL,
} from '../gg/stuck-input-queue-reinject.js'

// How the TUI renders a parked line: hard-wrapped at the pane width with an
// indented continuation. parkedInputText() collapses this back; the matcher
// has to survive the same round trip.
function terminalWrap(text: string, width = 74): string {
  const words = text.split(' ')
  const rows: string[] = []
  let row = ''
  for (const w of words) {
    if ((row + ' ' + w).trim().length > width) {
      rows.push(row.trim())
      row = w
    } else {
      row = `${row} ${w}`
    }
  }
  if (row.trim()) rows.push(row.trim())
  return rows.map((r, i) => (i === 0 ? `❯ ${r}` : `  ${r}`)).join('\n')
}

// The box shows only the last `rows` lines -- the head is gone, which is the
// whole reason the screen cannot be trusted.
function visibleTail(wrapped: string, rows = 7): string {
  return wrapped.split('\n').slice(-rows).join('\n')
}

const BRIEFING =
  'SAL-455 -- Peter valaszolt, megerositette a te olvasatodat: a Done-t a SAJAT resze lezarasa miatt tette ra. '
  + 'Ebbol kovetkezik: kell az uj sub-issue a SAL-454 ala a tenyleges piackutatasnak. '
  + 'Az uj issue-t ti nyissatok meg, en nem hozok letre issue-t a ti scope-otokban. '
  + 'A blokkolo tovabbra is az AirDNA-kerdes, ami valasz nelkul all 08-10 ota. Reszemrol ezzel lezarva. Sok sikert.'

describe('normalizeParkedText', () => {
  it('collapses terminal wrap so a scrape and a DB string compare equal', () => {
    const flat = 'egy ket harom negy'
    expect(normalizeParkedText('❯ egy ket\n  harom   negy\n'.replace(/^❯\s*/, ''))).toBe(flat)
  })
})

describe('deliveredEndsWithParkedTail', () => {
  it('matches a wrapped, head-lost tail against the full delivered text', () => {
    const tail = visibleTail(terminalWrap(BRIEFING)).replace(/^\s*❯\s*/, '')
    expect(deliveredEndsWithParkedTail(BRIEFING, tail)).toBe(true)
  })

  it('rejects a tail shorter than the ambiguity floor', () => {
    // "Sok sikert." alone would match half the fleet's messages.
    expect(deliveredEndsWithParkedTail(BRIEFING, 'Sok sikert.')).toBe(false)
    expect('Sok sikert.'.length).toBeLessThan(QUEUE_REINJECT_MIN_TAIL)
  })

  it('rejects a tail belonging to a DIFFERENT message', () => {
    const other = 'Teljesen mas uzenet, sajat zaro mondattal, ami eleg hosszu a kuszob atlepesehez.'
    expect(deliveredEndsWithParkedTail(BRIEFING, other)).toBe(false)
  })

  it('rejects a tail longer than the delivered text (never a substring accident)', () => {
    expect(deliveredEndsWithParkedTail('rovid', `elotte ${BRIEFING}`)).toBe(false)
  })
})

describe('agentForSession', () => {
  it('resolves the main channels session and sub-agent panes', () => {
    expect(agentForSession('bot-channels', 'bot')).toBe('bot')
    expect(agentForSession('agent-jean', 'bot')).toBe('jean')
  })

  it('returns null for a session this recovery has no business touching', () => {
    expect(agentForSession('marveen-worker', 'marveen')).toBeNull()
    expect(agentForSession('', 'marveen')).toBeNull()
  })
})

describe('renderDeliveredFrame', () => {
  it('rebuilds the router frame with the msg_id and the content', () => {
    const text = renderDeliveredFrame({
      id: 138, from_agent: 'salesninja', to_agent: 'jean', content: BRIEFING, origin_note: null,
    })
    expect(text).not.toBeNull()
    expect(text).toContain('msg_id:138')
    expect(text).toContain('SAL-455')
    expect(text).toContain('salesninja')
  })

  it('refuses a sender that sanitizes to nothing (same contract as the router)', () => {
    expect(renderDeliveredFrame({
      id: 1, from_agent: '   ', to_agent: 'jean', content: BRIEFING, origin_note: null,
    })).toBeNull()
  })
})

describe('findQueuedFrameForParkedTail', () => {
  beforeEach(() => {
    initDatabase(':memory:')
  })

  function deliver(from: string, to: string, content: string): number {
    const msg = createAgentMessage(from, to, content)
    markMessageDelivered(msg.id)
    return msg.id
  }

  it('finds the delivered row behind a head-lost parked frame (the jean case)', () => {
    const id = deliver('salesninja', 'jean', BRIEFING)
    const frame = renderDeliveredFrame({
      id, from_agent: 'salesninja', to_agent: 'jean', content: BRIEFING, origin_note: null,
    })!
    const parked = visibleTail(terminalWrap(frame)).replace(/^\s*❯\s*/, '')
    // The premise: the head really is gone from the view.
    expect(parked).not.toContain('[Uzenet @')

    const found = findQueuedFrameForParkedTail('jean', parked)
    expect(found?.id).toBe(id)
    expect(found?.from).toBe('salesninja')
    // What gets re-injected is the WHOLE frame, not the fragment on screen.
    expect(found!.text).toContain('msg_id:' + id)
    expect(found!.text.length).toBeGreaterThan(parked.length)
  })

  it('ignores a message delivered to a DIFFERENT agent', () => {
    const id = deliver('salesninja', 'peppa', BRIEFING)
    const frame = renderDeliveredFrame({
      id, from_agent: 'salesninja', to_agent: 'peppa', content: BRIEFING, origin_note: null,
    })!
    expect(findQueuedFrameForParkedTail('jean', frame)).toBeNull()
  })

  it('ignores a row outside the lookback window', () => {
    const id = deliver('salesninja', 'jean', BRIEFING)
    const frame = renderDeliveredFrame({
      id, from_agent: 'salesninja', to_agent: 'jean', content: BRIEFING, origin_note: null,
    })!
    const future = Date.now() + QUEUE_REINJECT_LOOKBACK_MS + 60_000
    expect(findQueuedFrameForParkedTail('jean', frame, future)).toBeNull()
  })

  it('ignores a row the agent already completed', () => {
    const id = deliver('salesninja', 'jean', BRIEFING)
    const frame = renderDeliveredFrame({
      id, from_agent: 'salesninja', to_agent: 'jean', content: BRIEFING, origin_note: null,
    })!
    getDb().prepare("UPDATE agent_messages SET status = 'done' WHERE id = ?").run(id)
    expect(findQueuedFrameForParkedTail('jean', frame)).toBeNull()
  })

  it('returns null for a human draft that resembles nothing in the queue', () => {
    deliver('salesninja', 'jean', BRIEFING)
    expect(findQueuedFrameForParkedTail('jean', 'ird meg legyszi Esztinek hogy delutan hivom, koszi')).toBeNull()
  })

  it('picks the NEWEST delivery when the same text was delivered twice', () => {
    const first = deliver('salesninja', 'jean', BRIEFING)
    const second = deliver('salesninja', 'jean', BRIEFING)
    expect(second).toBeGreaterThan(first)
    const frame = renderDeliveredFrame({
      id: second, from_agent: 'salesninja', to_agent: 'jean', content: BRIEFING, origin_note: null,
    })!
    const parked = visibleTail(terminalWrap(frame)).replace(/^\s*❯\s*/, '')
    expect(findQueuedFrameForParkedTail('jean', parked)?.id).toBe(second)
  })
})
