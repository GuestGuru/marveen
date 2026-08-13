// GG fork regression test for the 2026-08-12 "template still teaches the old
// rule" bug.
//
// On 2026-08-11 the install owner overruled fleet rule 7: gg-mcp is the control
// surface, so a colleague agent does NOT need permission from the main agent or
// the owner to write/run scripts or reach what its own rights map allows. The
// four live agents' CLAUDE.md files were rewritten by hand the same evening --
// but generateClaudeMd()'s prompt still emitted the old "ask the boss first"
// text, so the NEXT agent onboarded would have regressed silently.
//
// Two things are locked down here: the rule text itself (src/gg/fleet-rules.ts)
// and the fact that the scaffold prompt actually interpolates it instead of
// carrying a hardcoded copy.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ggFleetRule7 } from '../gg/fleet-rules.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCAFFOLD_PATH = join(__dirname, '..', 'web', 'agent-scaffold.ts')

const IDENTITY = { botName: 'Marveen', mainAgentId: 'marveen', ownerName: 'GuestGuru' }

describe('ggFleetRule7: gg-mcp is the control, not the boss', () => {
  const rule = ggFleetRule7(IDENTITY)

  it('starts as list item 7 so it drops into the numbered fleet-rules block', () => {
    expect(rule.startsWith('7. ')).toBe(true)
    expect(rule).not.toMatch(/\n/)
  })

  it('states that no permission is needed, and names the rights map as the boundary', () => {
    expect(rule).toContain('NEM kell engedélyt kérned')
    expect(rule).toContain('gg_allowed_tools')
  })

  it('does not reinstate the old ask-first gate for scripts', () => {
    // The old text made ANY runnable script (scraper, Playwright, login script)
    // conditional on pinging the boss. That gate is gone; only the two
    // non-gg-mcp carve-outs remain.
    expect(rule).not.toMatch(/ELŐBB szólj a Főnöknek\.\*\*/)
    expect(rule).toContain('szkriptet írhatsz és futtathatsz')
  })

  it('keeps the two carve-outs that gg-mcp does not cover', () => {
    // (a) foreign service login with an own credential, (b) automating a system
    // gg-mcp holds no key for. These are still boss-first because no rights map
    // governs them.
    expect(rule).toContain('idegen szolgáltatásba')
    expect(rule).toContain('amihez a gg-mcp nem ad kulcsot')
  })

  it('keeps the credential-handling and key-scope warnings', () => {
    expect(rule).toContain('gg-mcp-proxy exec')
    expect(rule).toContain('SZÉLESEBB')
  })

  it('is parameterised, not hardcoded to this install', () => {
    const other = ggFleetRule7({ botName: 'Tanfield', mainAgentId: 'tanfield', ownerName: 'Acme' })
    expect(other).toContain('Tanfield')
    expect(other).toContain('tanfield')
    expect(other).toContain('Acme')
    expect(other).not.toMatch(/Marveen|marveen|GuestGuru/)
  })
})

describe('generateClaudeMd prompt: rule 7 comes from the fork module', () => {
  const src = readFileSync(SCAFFOLD_PATH, 'utf-8')

  it('interpolates ggFleetRule7 in the fleet-rules block', () => {
    expect(src).toContain('${ggFleetRule7(')
    // Tolerant of extra named imports from the same module: rule 8 joined this
    // import on 2026-08-13, and pinning the braces to rule 7 alone made adding a
    // sibling rule fail a test about rule 7's wiring.
    expect(src).toMatch(/import\s*{[^}]*\bggFleetRule7\b[^}]*}\s*from\s*'\.\.\/gg\/fleet-rules\.js'/)
  })

  it('no longer carries the superseded rule-7 text inline', () => {
    // The exact bug: the old sentence survived in the prompt string after the
    // live agents had already been corrected.
    expect(src).not.toContain('Login-automatizálás / külső credential / futtatható szkript')
  })
})
