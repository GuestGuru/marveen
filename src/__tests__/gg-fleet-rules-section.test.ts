import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ensureFleetRulesSection,
  buildFleetRulesBody,
  FLEET_RULES_BEGIN,
  FLEET_RULES_END,
} from '../gg/fleet-rules-section.js'

// GG fork, 2026-09-01. Rules 7 and 8 used to be interpolated once, at scaffold
// time, with no markers -- so every later correction reached only agents created
// afterwards, and rule 8 ("only your own token") could never be fixed in place.
// These guard the maintained-block behaviour that replaced it.
const IDENTITY = {
  botName: 'Testbot',
  mainAgentId: 'testbot',
  ownerName: 'Acme',
  agentId: 'colleague',
  projectRoot: '/srv/install',
}

let dir: string
const writes: string[] = []
const spyWrite = (p: string, data: string) => { writes.push(p); writeFileSync(p, data) }

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'gg-fleetrules-')); writes.length = 0 })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('ensureFleetRulesSection', () => {
  it('skips an agent with no CLAUDE.md', () => {
    ensureFleetRulesSection(dir, IDENTITY, spyWrite)
    expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(false)
    expect(writes).toEqual([])
  })

  it('appends both rules on first run and keeps hand-written content', () => {
    const p = join(dir, 'CLAUDE.md')
    writeFileSync(p, '# Persona\n\nSaját szabályok.\n')
    ensureFleetRulesSection(dir, IDENTITY, spyWrite)

    const out = readFileSync(p, 'utf-8')
    expect(out).toContain('Saját szabályok.')
    expect(out).toContain('A gg-mcp a kontroll')
    expect(out).toContain('CSAK A SAJÁT MCP TOKENEDET')
  })

  it('carries the correction that motivated the block', () => {
    expect(buildFleetRulesBody(IDENTITY)).toContain('a FELSŐ korlát, nem a munkaköröd')
  })

  it('is a no-op on the second run', () => {
    const p = join(dir, 'CLAUDE.md')
    writeFileSync(p, '# Persona\n')
    ensureFleetRulesSection(dir, IDENTITY, spyWrite)
    const first = readFileSync(p, 'utf-8')
    writes.length = 0
    ensureFleetRulesSection(dir, IDENTITY, spyWrite)
    expect(writes).toEqual([])
    expect(readFileSync(p, 'utf-8')).toBe(first)
  })

  it('replaces a stale block in place -- the whole point of the change', () => {
    const p = join(dir, 'CLAUDE.md')
    writeFileSync(p, `ELŐTTE\n\n${FLEET_RULES_BEGIN}\nZZ_REGI_SZABALY_ZZ\n${FLEET_RULES_END}\n\nUTÁNA\n`)
    ensureFleetRulesSection(dir, IDENTITY, spyWrite)

    const out = readFileSync(p, 'utf-8')
    expect(out).toContain('ELŐTTE')
    expect(out).toContain('UTÁNA')
    expect(out).not.toContain('ZZ_REGI_SZABALY_ZZ')
    expect(out).toContain('a FELSŐ korlát, nem a munkaköröd')
  })

  it('does not swallow a neighbouring generated block', () => {
    const p = join(dir, 'CLAUDE.md')
    const other = '<!-- BEGIN GENERATED: memory-rules (auto-generated, do not edit by hand) -->\nmem\n<!-- END GENERATED: memory-rules -->'
    writeFileSync(p, `${FLEET_RULES_BEGIN}\nZZ_REGI_ZZ\n${FLEET_RULES_END}\n\n${other}\n`)
    ensureFleetRulesSection(dir, IDENTITY, spyWrite)

    const out = readFileSync(p, 'utf-8')
    expect(out).toContain(other)
    expect(out).not.toContain('ZZ_REGI_ZZ')
  })

  it('writes exactly one well-formed block, whose content is the body', () => {
    const p = join(dir, 'CLAUDE.md')
    writeFileSync(p, '# Persona\n')
    ensureFleetRulesSection(dir, IDENTITY, spyWrite)
    ensureFleetRulesSection(dir, IDENTITY, spyWrite)

    const out = readFileSync(p, 'utf-8')
    expect([out.split(FLEET_RULES_BEGIN).length - 1, out.split(FLEET_RULES_END).length - 1]).toEqual([1, 1])
    const inner = out.slice(out.indexOf(FLEET_RULES_BEGIN) + FLEET_RULES_BEGIN.length, out.indexOf(FLEET_RULES_END)).trim()
    expect(inner).toBe(buildFleetRulesBody(IDENTITY))
  })

  it('keeps rule 8 agent-specific, so a shared copy cannot leak another identity', () => {
    const a = buildFleetRulesBody(IDENTITY)
    const b = buildFleetRulesBody({ ...IDENTITY, agentId: 'someone-else' })
    expect(a).not.toBe(b)
    expect(a).toContain('colleague')
  })
})
