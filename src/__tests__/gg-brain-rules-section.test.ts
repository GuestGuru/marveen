import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ensureBrainRulesSection,
  buildBrainRulesBody,
  BRAIN_RULES_BEGIN,
  BRAIN_RULES_END,
} from '../gg/brain-rules-section.js'
import { MEMORY_RULES_BEGIN, MEMORY_RULES_END } from '../gg/memory-rules-section.js'

// GG fork, IT-1178 (M7-A2). A céges agy használati szabálya a botoknál: mi megy
// a saját memóriába és mi a céges agyba. A blokk minden spawnkor fut, ezért a
// marker-szerződés ugyanolyan szigorú, mint a memory-rules blokké.
let dir: string
const writes: string[] = []
const spyWrite = (p: string, data: string) => { writes.push(p); writeFileSync(p, data) }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gg-brainrules-'))
  writes.length = 0
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('ensureBrainRulesSection', () => {
  it('does nothing when the agent has no CLAUDE.md', () => {
    ensureBrainRulesSection(dir, spyWrite)
    expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(false)
    expect(writes).toEqual([])
  })

  it('appends the block on first run, keeping the hand-written content intact', () => {
    const p = join(dir, 'CLAUDE.md')
    writeFileSync(p, '# Persona\n\nSaját, kézzel írt tartalom.\n')
    ensureBrainRulesSection(dir, spyWrite)

    const out = readFileSync(p, 'utf-8')
    expect(out).toContain('Saját, kézzel írt tartalom.')
    expect(out).toContain(BRAIN_RULES_BEGIN)
    expect(out).toContain(BRAIN_RULES_END)
    expect(out.trimEnd().endsWith(BRAIN_RULES_END)).toBe(true)
  })

  it('is a no-op on the second run -- no disk write, so respawns do not churn mtime', () => {
    const p = join(dir, 'CLAUDE.md')
    writeFileSync(p, '# Persona\n')
    ensureBrainRulesSection(dir, spyWrite)
    const afterFirst = readFileSync(p, 'utf-8')
    writes.length = 0

    ensureBrainRulesSection(dir, spyWrite)
    expect(writes).toEqual([])
    expect(readFileSync(p, 'utf-8')).toBe(afterFirst)
  })

  it('replaces a stale block in place and leaves surrounding text alone', () => {
    const p = join(dir, 'CLAUDE.md')
    writeFileSync(p, `ELŐTTE\n\n${BRAIN_RULES_BEGIN}\nZZ_ELAVULT_BRAIN_ZZ\n${BRAIN_RULES_END}\n\nUTÁNA\n`)
    ensureBrainRulesSection(dir, spyWrite)

    const out = readFileSync(p, 'utf-8')
    expect(out).toContain('ELŐTTE')
    expect(out).toContain('UTÁNA')
    expect(out).not.toContain('ZZ_ELAVULT_BRAIN_ZZ')
    expect(out).toContain(buildBrainRulesBody())
  })

  // A sub-agentek fájljában a memory-rules blokk már ott van; a nem mohó regex
  // nem nyelheti el, és a két blokk nem keveredhet.
  it('leaves the neighbouring memory-rules block untouched', () => {
    const p = join(dir, 'CLAUDE.md')
    const memory = `${MEMORY_RULES_BEGIN}\nZZ_MEMORY_BODY_ZZ\n${MEMORY_RULES_END}`
    writeFileSync(p, `${BRAIN_RULES_BEGIN}\nZZ_ELAVULT_BRAIN_ZZ\n${BRAIN_RULES_END}\n\n${memory}\n`)
    ensureBrainRulesSection(dir, spyWrite)

    const out = readFileSync(p, 'utf-8')
    expect(out).toContain(memory)
    expect(out).not.toContain('ZZ_ELAVULT_BRAIN_ZZ')
  })

  it('writes exactly one well-formed block, and its content is the body', () => {
    const p = join(dir, 'CLAUDE.md')
    writeFileSync(p, '# Persona\n\nKézi tartalom.\n')
    ensureBrainRulesSection(dir, spyWrite)
    ensureBrainRulesSection(dir, spyWrite)

    const out = readFileSync(p, 'utf-8')
    expect([out.split(BRAIN_RULES_BEGIN).length - 1, out.split(BRAIN_RULES_END).length - 1]).toEqual([1, 1])
    const start = out.indexOf(BRAIN_RULES_BEGIN) + BRAIN_RULES_BEGIN.length
    expect(out.slice(start, out.indexOf(BRAIN_RULES_END)).trim()).toBe(buildBrainRulesBody())
  })
})

describe('buildBrainRulesBody -- what the block teaches', () => {
  const body = buildBrainRulesBody()

  // A `replace` csereszövegében a `$&` / `$1` speciális: a blokk nem tartalmazhat `$`-t.
  it('contains no dollar sign, so String.replace inserts it verbatim', () => {
    expect(body).not.toContain('$')
  })

  it('points at the handbook instead of repeating it', () => {
    expect(body).toContain('gg_knowledge_get(topic: "ceges-agy")')
    // A sablonok, a mezők és a JSON-példák a kézikönyvben élnek, nem itt.
    expect(body).not.toContain('Hol érvényes: <')
    expect(body).not.toContain('"fajta"')
    expect(body.length).toBeLessThanOrEqual(6000)
  })

  // Négy bot kézzel írt CLAUDE.md-je a `shared`-et nevezi közös céges
  // memóriának (mérve 2026-09-29). A blokknak ki kell mondania, hogy ő nyer.
  it('overrides the scaffold-time "shared is company memory" wording', () => {
    expect(body).toContain('A `shared` polc nem a céges agy')
    expect(body).toContain('EZ a blokk a mérvadó')
    expect(body).toContain('Ne mentsd mindkét helyre')
  })

  it('scopes the fleet personal-data rule to the shared shelf, but keeps the key rule everywhere', () => {
    expect(body).toContain('személyes-adat-szabálya a `shared` polcra szól')
    expect(body).toContain('auth nélküli végpont')
  })

  it('carries the decision order, HR included, with the 403 answer', () => {
    for (const s of ['Futó állapot', 'A Linearba', 'HR-ügy', '`management`', '403', 'kérés nélkül', '`warm`']) {
      expect(body).toContain(s)
    }
  })

  it('saves in the owner\'s name only what the owner\'s work produced', () => {
    expect(body).toContain('a gazdád nevében')
    expect(body).toContain('amit egy másik bottól kaptál, azt az a bot mentse')
    expect(body).toContain('`gg_allowed_tools` válaszának')
  })

  it('puts the confirmation into the channel reply, not the terminal', () => {
    expect(body).toContain('Telegram- vagy Slack-válasz')
    expect(body).toContain('Elmentettem a céges agyba:')
    expect(body).toContain('`letrejott: false`')
  })

  // Döntés (2026-09-30, IT-1178): a gazda jelenléte nélküli háttérkör (heartbeat)
  // NEM ment a céges agyba; a mentés a beszélgetésben, látható visszaigazolással
  // történik. A terv első változata még megengedte (utólagos visszaigazolással).
  it('does not save in a background round without the owner', () => {
    expect(body).toContain('Heartbeatben')
    expect(body).toContain('ne ments a céges agyba')
    expect(body).toContain('a gazdáddal folytatott beszélgetésben')
    expect(body).not.toContain('heartbeatben mentettél')
  })

  // Az archiválás nem aktiválja vissza a felülírt elődöt (gg-brain IT-1072):
  // UPDATE/SUPERSEDE után a sima archiválás a régi tényt is eltüntetné.
  it('undoes by branch: archive for ADD, restore the predecessor for UPDATE/SUPERSEDE', () => {
    expect(body).toContain('`brain_archive`')
    expect(body).toContain('`UPDATE` vagy `SUPERSEDE`: NE archiváld')
    expect(body).toContain('`chain.older`')
    expect(body).toContain('`visszaallitas: true`')
  })
})

// A fő-agens a mintában (memory-rules) kimarad, mert a kézi CLAUDE.md-je hordozza
// a szabályt. A céges agyról viszont semmit nem hordoz, ezért itt MINDKÉT hívási
// pont kell -- és ha az egyik elmarad, az semmilyen futási hibát nem ad.
describe('wiring', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf-8')

  it('every sub-agent spawn refreshes the block', () => {
    expect(read('src/web/agent-process.ts')).toMatch(/ensureBrainRulesSection\(agentDir\(name\), atomicWriteFileSync\)/)
  })

  it('the main agent gets it at dashboard start, on live instances only', () => {
    const src = read('src/web.ts')
    const gate = src.indexOf('if (!webOnly) {\n    ensureFederationClaudeMdSection()')
    const call = src.indexOf('ensureBrainRulesSection(PROJECT_ROOT, atomicWriteFileSync)')
    expect(gate).toBeGreaterThan(-1)
    expect(call).toBeGreaterThan(gate)
    // ugyanabban a blokkban: a következő záró kapcsos zárójel előtt
    expect(call).toBeLessThan(src.indexOf('\n  }', gate))
  })
})
