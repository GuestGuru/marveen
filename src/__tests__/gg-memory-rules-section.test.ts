import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ensureMemoryRulesSection,
  buildMemoryRulesBody,
  MEMORY_RULES_BEGIN,
  MEMORY_RULES_END,
} from '../gg/memory-rules-section.js'

// GG fork, 2026-09-01. The rules these agents need before saving a memory lived
// in one file that only the main agent reads. This block carries them into every
// sub-agent's CLAUDE.md, so the idempotency contract matters: it runs on every
// spawn, and must never touch hand-written content around it.
let dir: string
const writes: string[] = []
const spyWrite = (p: string, data: string) => { writes.push(p); writeFileSync(p, data) }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gg-memrules-'))
  writes.length = 0
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('ensureMemoryRulesSection', () => {
  it('does nothing when the agent has no CLAUDE.md', () => {
    ensureMemoryRulesSection(dir, spyWrite)
    expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(false)
    expect(writes).toEqual([])
  })

  it('appends the block on first run, keeping the hand-written content intact', () => {
    const p = join(dir, 'CLAUDE.md')
    writeFileSync(p, '# Persona\n\nSaját, kézzel írt tartalom.\n')
    ensureMemoryRulesSection(dir, spyWrite)

    const out = readFileSync(p, 'utf-8')
    expect(out).toContain('Saját, kézzel írt tartalom.')
    expect(out).toContain(MEMORY_RULES_BEGIN)
    expect(out).toContain(MEMORY_RULES_END)
    expect(out).toContain('Minden számhoz KÖTELEZŐ a mérési ablak')
  })

  it('is a no-op on the second run -- no disk write, so respawns do not churn mtime', () => {
    const p = join(dir, 'CLAUDE.md')
    writeFileSync(p, '# Persona\n')
    ensureMemoryRulesSection(dir, spyWrite)
    const afterFirst = readFileSync(p, 'utf-8')
    writes.length = 0

    ensureMemoryRulesSection(dir, spyWrite)
    expect(writes).toEqual([])
    expect(readFileSync(p, 'utf-8')).toBe(afterFirst)
  })

  it('replaces a stale block in place and leaves surrounding text alone', () => {
    const p = join(dir, 'CLAUDE.md')
    writeFileSync(p, `ELŐTTE\n\n${MEMORY_RULES_BEGIN}\nZZ_ELAVULT_SZABALYOK_ZZ\n${MEMORY_RULES_END}\n\nUTÁNA\n`)
    ensureMemoryRulesSection(dir, spyWrite)

    const out = readFileSync(p, 'utf-8')
    expect(out).toContain('ELŐTTE')
    expect(out).toContain('UTÁNA')
    expect(out).not.toContain('ZZ_ELAVULT_SZABALYOK_ZZ')
    expect(out).toContain(buildMemoryRulesBody())
  })

  it('replaces only its own block when other generated blocks are present', () => {
    const p = join(dir, 'CLAUDE.md')
    const other = '<!-- BEGIN GENERATED: fleet-roster (auto-generated, do not edit by hand) -->\nroster\n<!-- END GENERATED: fleet-roster -->'
    // The sentinel must not be a substring of the real body, or the negative
    // assertion passes for the wrong reason -- "régi" would have matched
    // "a régire hivatkozva" inside the generated text.
    const SENTINEL = 'ZZ_ELAVULT_BLOKK_ZZ'
    writeFileSync(p, `${MEMORY_RULES_BEGIN}\n${SENTINEL}\n${MEMORY_RULES_END}\n\n${other}\n`)
    ensureMemoryRulesSection(dir, spyWrite)

    const out = readFileSync(p, 'utf-8')
    // The non-greedy regex must not swallow the roster block in between.
    expect(out).toContain(other)
    expect(out).not.toContain(SENTINEL)
  })

  it('carries the rules that the fleet actually measured, not just the two headline ones', () => {
    const body = buildMemoryRulesBody()
    expect(body).toContain('A blokkoló ok szűnt meg')
    expect(body).toContain('SZÁNDÉKOT')
    expect(body).toContain('nem bizonyíték a tisztaságra')
    expect(body).toContain('owner')
  })
})
