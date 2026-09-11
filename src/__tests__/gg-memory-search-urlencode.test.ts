import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// GG fork, 2026-09-11. The documented memory-search example was not URL-encoded, and
// an accented `q` makes the endpoint answer HTTP 400 with a ZERO-BYTE body: the caller
// sees neither data nor an error, which reads as "no such memory". Measured on the live
// dashboard: `q=ékezet` unencoded -> 400 / 0 bytes; the same through
// `curl -G --data-urlencode` -> 31 hits; control `q=kapu` (no accents) unencoded -> 35
// hits, so the endpoint itself is fine and only the non-ASCII query string is dropped.
//
// Why this is guarded in a test and not only in prose: bubi measured that ALL SIX
// colleague agents carry the unencoded form, because both generators emit it, and the
// template's placeholder is itself accented ("KULCSSZÓ") -- so the documented example is
// not merely a bad habit, it fails as written. A regression here silently teaches the
// broken form to every agent created afterwards.
const ROOT = join(__dirname, '..', '..')
const SCAFFOLD = readFileSync(join(ROOT, 'src', 'web', 'agent-scaffold.ts'), 'utf-8')
const TEMPLATE = readFileSync(join(ROOT, 'templates', 'CLAUDE.md.template'), 'utf-8')

const searchBlock = (src: string): string => {
  const i = src.indexOf('/api/memories?agent=')
  return i === -1 ? '' : src.slice(Math.max(0, i - 600), i + 400)
}

describe('the generated memory-search example is URL-encoded', () => {
  it('the sub-agent scaffold uses --data-urlencode', () => {
    expect(SCAFFOLD).toContain('--data-urlencode "q=')
    // the unencoded query string must be gone, not merely accompanied by advice
    expect(searchBlock(SCAFFOLD)).toBe('')
  })

  it('the main-agent template uses --data-urlencode', () => {
    expect(TEMPLATE).toContain('--data-urlencode "q=')
    expect(searchBlock(TEMPLATE)).toBe('')
  })

  it('both say WHY, so nobody re-shortens it to the broken form', () => {
    for (const src of [SCAFFOLD, TEMPLATE]) {
      expect(src).toMatch(/HTTP 400/)
      // the Hungarian instrumental doubles the s: "törzs" + "-vel" -> "törzzsel".
      // My first assertion looked for the nominative and failed on correct text.
      expect(src).toMatch(/ÜRES törzzsel/)
    }
  })
})
