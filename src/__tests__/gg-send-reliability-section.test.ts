import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ensureSendReliabilitySection,
  buildSendReliabilityBody,
  SEND_RELIABILITY_BEGIN,
  SEND_RELIABILITY_END,
} from '../gg/send-reliability-section.js'

// GG fork, 2026-09-10. docs/inter-agent-send-reliability.md claims every agent
// verifies its sends by default; measured on this fleet, all six sub-agents had
// the rule nowhere, because the claim is about the MAIN agent's template. These
// guard the maintained-block behaviour that closes that gap.
const IDENTITY = {
  agentId: 'colleague',
  projectRoot: '/srv/install',
  dashboardOrigin: 'http://localhost:3420',
  tokenPath: '/srv/install/store/.dashboard-token',
}

let dir: string
const writes: string[] = []
const spyWrite = (p: string, data: string) => { writes.push(p); writeFileSync(p, data) }

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'gg-sendrel-')); writes.length = 0 })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('buildSendReliabilityBody', () => {
  it('states the rule that only a returned id counts as sent', () => {
    const body = buildSendReliabilityBody(IDENTITY)
    expect(body).toContain('`id`')
    expect(body).toContain('NÉMA küldés-hiba')
  })

  it('addresses the agent by its own name and an absolute helper path', () => {
    const body = buildSendReliabilityBody(IDENTITY)
    expect(body).toContain('/srv/install/scripts/agent-msg.sh colleague')
    // The `from` must never be another agent's id -- that would make the example
    // itself an identity swap.
    expect(body).not.toContain('agent-msg.sh marveen')
  })

  it('tells the agent to read the accent warning the endpoint returns', () => {
    expect(buildSendReliabilityBody(IDENTITY)).toContain('accentWarning')
  })

  it('teaches the QUOTED heredoc, since an unquoted one re-opens the expansion hole', () => {
    expect(buildSendReliabilityBody(IDENTITY)).toContain("<<'EOF'")
  })

  // jean and salesninja, 2026-09-10: the documented raw-curl example is exposed to TWO
  // measured failure classes, and naming only the missing verify+retry leaves the second
  // one invisible. The trigger is the QUOTE, not the parenthesis -- "avoid parentheses"
  // would be a false lesson.
  it('names the quote, not the parenthesis, as the truncation trigger', () => {
    const body = buildSendReliabilityBody(IDENTITY)
    expect(body).toContain('IDÉZŐJEL, nem a zárójel')
  })

  // The cheapest diagnostic found that day: the stored row separates the two layers.
  it('gives the stored-length diagnostic that tells the two layers apart', () => {
    const body = buildSendReliabilityBody(IDENTITY)
    expect(body).toContain('TÁROLT hosszt')
    expect(body).toContain('küldés ELŐTT')
  })

  // jean's boundary: state what was measured and what was not, so nobody reads the
  // delivery result as a blanket guarantee.
  it('states the limits of the delivery measurement instead of generalising it', () => {
    const body = buildSendReliabilityBody(IDENTITY)
    expect(body).toContain('Amit NEM mértünk')
    expect(body).toContain('ne általánosíts')
  })
})

describe('ensureSendReliabilitySection', () => {
  it('skips an agent with no CLAUDE.md', () => {
    ensureSendReliabilitySection(dir, IDENTITY, spyWrite)
    expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(false)
    expect(writes).toEqual([])
  })

  it('appends on first run and keeps hand-written content', () => {
    const p = join(dir, 'CLAUDE.md')
    writeFileSync(p, '# Persona\n\nSaját szabályok.\n')
    ensureSendReliabilitySection(dir, IDENTITY, spyWrite)
    const out = readFileSync(p, 'utf-8')
    expect(out).toContain('Saját szabályok.')
    expect(out).toContain(SEND_RELIABILITY_BEGIN)
    expect(out).toContain(SEND_RELIABILITY_END)
    expect(writes).toEqual([p])
  })

  it('replaces only between the markers on a later run', () => {
    const p = join(dir, 'CLAUDE.md')
    writeFileSync(
      p,
      `# Persona\n\n${SEND_RELIABILITY_BEGIN}\nrégi, elavult szöveg\n${SEND_RELIABILITY_END}\n\n## Saját szekció\nMarad.\n`,
    )
    ensureSendReliabilitySection(dir, IDENTITY, spyWrite)
    const out = readFileSync(p, 'utf-8')
    expect(out).not.toContain('régi, elavult szöveg')
    expect(out).toContain('## Saját szekció')
    expect(out).toContain('Marad.')
    expect(out.indexOf(SEND_RELIABILITY_BEGIN)).toBeLessThan(out.indexOf('## Saját szekció'))
  })

  it('writes nothing when the block is already current', () => {
    const p = join(dir, 'CLAUDE.md')
    writeFileSync(p, '# Persona\n')
    ensureSendReliabilitySection(dir, IDENTITY, spyWrite)
    expect(writes.length).toBe(1)
    ensureSendReliabilitySection(dir, IDENTITY, spyWrite)
    expect(writes.length).toBe(1) // idempotent: no second write
  })

  it('leaves a neighbouring generated block intact', () => {
    const p = join(dir, 'CLAUDE.md')
    const other =
      '<!-- BEGIN GENERATED: fleet-roster (auto-generated, do not edit by hand) -->\nroster\n<!-- END GENERATED: fleet-roster -->'
    writeFileSync(p, `# Persona\n\n${other}\n`)
    ensureSendReliabilitySection(dir, IDENTITY, spyWrite)
    const out = readFileSync(p, 'utf-8')
    expect(out).toContain(other)
    expect(out).toContain(SEND_RELIABILITY_BEGIN)
  })

  it('does not eat the text between two different generated blocks', () => {
    const p = join(dir, 'CLAUDE.md')
    writeFileSync(
      p,
      `${SEND_RELIABILITY_BEGIN}\nrégi\n${SEND_RELIABILITY_END}\n\nKÖZTES SZÖVEG\n\n<!-- BEGIN GENERATED: fleet-roster (auto-generated, do not edit by hand) -->\nroster\n<!-- END GENERATED: fleet-roster -->\n`,
    )
    ensureSendReliabilitySection(dir, IDENTITY, spyWrite)
    const out = readFileSync(p, 'utf-8')
    expect(out).toContain('KÖZTES SZÖVEG')
    expect(out).toContain('roster')
  })
})
