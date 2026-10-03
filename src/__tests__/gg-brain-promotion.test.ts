import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import {
  ensureBrainPromotionTasks,
  buildBrainPromotionPrompt,
  defaultBrainPromotionSchedule,
  brainPromotionTaskName,
  BRAIN_PROMOTION_GENERATED_MARKER,
} from '../gg/brain-promotion.js'
import { runCli, selectCandidates, markDone, emptyState, readState } from '../gg/brain-promotion-cli.js'
import {
  applyPreCompactNote,
  ensurePreCompactBrainNote,
  PRECOMPACT_NOTE_BEGIN,
  PRECOMPACT_NOTE_END,
  UPSTREAM_SHARED_LINE,
} from '../gg/precompact-brain-note.js'
import { ensureBrainPromotionForFleet } from '../gg/brain-promotion-fleet.js'
import { buildBrainRulesBody } from '../gg/brain-rules-section.js'

// GG fork, IT-1289. A botok éjszakai átemelő köre: a saját memória céges tudása a
// céges agyba, a gazda tokenjével. A feladat minden boot-kor újragenerálódik, a
// kurzor a store-ban él, a PreCompact-prompt markerek között íródik át.
let dir: string
const writes: string[] = []
const spyWrite = (p: string, data: string) => { writes.push(p); writeFileSync(p, data) }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gg-brainpromo-'))
  writes.length = 0
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('ensureBrainPromotionTasks', () => {
  const opts = () => ({
    agents: ['marveen', 'bubi', 'jean'],
    projectRoot: '/home/gg/marveen',
    scheduledTasksDir: join(dir, 'tasks'),
    atomicWrite: spyWrite,
    now: () => 1790000000,
  })

  it('creates one heartbeat task per agent, addressed to that agent, staggered from 01:05', () => {
    expect(ensureBrainPromotionTasks(opts())).toEqual(['marveen', 'bubi', 'jean'])
    const cfg = (a: string) => JSON.parse(readFileSync(join(dir, 'tasks', brainPromotionTaskName(a), 'task-config.json'), 'utf-8'))
    expect(cfg('marveen')).toMatchObject({ agent: 'marveen', type: 'heartbeat', enabled: true, skipIfBusy: false, schedule: '5 1 * * *', ephemeral: true })
    expect(cfg('bubi').schedule).toBe('12 1 * * *')
    expect(cfg('jean').schedule).toBe('19 1 * * *')
    const skill = readFileSync(join(dir, 'tasks', 'brain-promotion-bubi', 'SKILL.md'), 'utf-8')
    expect(skill).toContain('name: brain-promotion-bubi')
    expect(skill).toContain(BRAIN_PROMOTION_GENERATED_MARKER)
    expect(skill).toContain('node /home/gg/marveen/dist/gg/brain-promotion-cli.js candidates --agent bubi')
  })

  it('is a no-op on the second run -- no disk write', () => {
    ensureBrainPromotionTasks(opts())
    writes.length = 0
    expect(ensureBrainPromotionTasks(opts())).toEqual([])
    expect(writes).toEqual([])
  })

  it('keeps the operator\'s enabled/schedule/createdAt, rewrites a hand-edited prompt', () => {
    ensureBrainPromotionTasks(opts())
    const taskDir = join(dir, 'tasks', 'brain-promotion-bubi')
    const cfgPath = join(taskDir, 'task-config.json')
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'))
    writeFileSync(cfgPath, JSON.stringify({ ...cfg, enabled: false, schedule: '30 4 * * *', type: 'task' }))
    writeFileSync(join(taskDir, 'SKILL.md'), 'kézzel átírva')
    ensureBrainPromotionTasks({ ...opts(), now: () => 1 })
    const after = JSON.parse(readFileSync(cfgPath, 'utf-8'))
    expect(after).toMatchObject({ enabled: false, schedule: '30 4 * * *', type: 'heartbeat', createdAt: 1790000000 })
    expect(readFileSync(join(taskDir, 'SKILL.md'), 'utf-8')).toBe(buildBrainPromotionPrompt({ agent: 'bubi', projectRoot: '/home/gg/marveen' }))
  })

  it('schedule stays a valid hour/minute past the first hour', () => {
    expect(defaultBrainPromotionSchedule(8)).toBe('1 2 * * *')
  })
})

describe('the promotion prompt', () => {
  const p = buildBrainPromotionPrompt({ agent: 'jean', projectRoot: '/x' })

  it('uses an idempotent per-memory key, never asks for approval, never messages the owner', () => {
    expect(p).toContain('`marveen-jean-mem-<id>`')
    expect(p).toContain('`jovahagyta`-t ne adj meg')
    expect(p).toContain('A gazdádnak NE írj')
    expect(p).toContain('marveen-átemelés')
  })

  it('keeps secrets, running state and HR out, and marks doubtful items as megfigyeles', () => {
    expect(p).toMatch(/Titok, token, jelszó[^\n]*\*\*kihagy\*\*/)
    expect(p).toMatch(/Futó állapot[^\n]*\*\*kihagy\*\*/)
    expect(p).toContain('`management`')
    expect(p).toContain('`fajta: "megfigyeles"`')
  })
})

describe('brain-rules block exception', () => {
  it('names the nightly round as the one exception to the background-save ban', () => {
    const body = buildBrainRulesBody()
    expect(body).toContain('`brain-promotion-<neved>`')
    expect(body).toContain('saját `warm` polcodra')
    expect(body.length).toBeLessThanOrEqual(6000)
  })
})

function memDb(path: string): Database.Database {
  const db = new Database(path)
  db.exec(`CREATE TABLE memories (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL, created_at INTEGER NOT NULL, agent_id TEXT NOT NULL, category TEXT NOT NULL, keywords TEXT)`)
  const ins = db.prepare('INSERT INTO memories (id, content, created_at, agent_id, category, keywords) VALUES (?,?,?,?,?,?)')
  ins.run(1, 'jean shared tény', 1790000000, 'jean', 'shared', 'ntak')
  ins.run(2, 'jean futó állapot', 1790000000, 'jean', 'hot', null)
  ins.run(3, 'bubi tény', 1790000000, 'bubi', 'shared', null)
  ins.run(4, 'céges agy: már átemelve', 1790000000, 'jean', 'warm', null)
  ins.run(5, 'jean warm tanulság', 1790086400, 'jean', 'warm', null)
  ins.run(6, 'jean cold döntés', 1790172800, 'jean', 'cold', null)
  return db
}

describe('selectCandidates', () => {
  it('returns only the agent\'s own shared/warm/cold rows after the cursor, in id order, without pointers', () => {
    const db = memDb(join(dir, 'm.db'))
    const all = selectCandidates(db, 'jean', 0, 40)
    expect(all.items.map((i) => i.id)).toEqual([1, 5, 6])
    expect(all.items[0]).toMatchObject({ category: 'shared', created: '2026-09-21', keywords: 'ntak' })
    expect(all.remaining).toBe(0)
    const page = selectCandidates(db, 'jean', 1, 1)
    expect(page.items.map((i) => i.id)).toEqual([5])
    expect(page.remaining).toBe(1)
    db.close()
  })
})

describe('markDone', () => {
  it('advances the cursor monotonically and counts decisions', () => {
    const now = new Date('2026-10-04T01:10:00Z')
    let s = markDone(emptyState('jean'), { id: 5, decision: 'add', brainId: 'b1', title: 'T' }, now)
    s = markDone(s, { id: 1, decision: 'SKIP' }, now)
    expect(s.cursor).toBe(5)
    expect(s.totals).toEqual({ ADD: 1, SKIP: 1 })
    expect(s.log[0]).toEqual({ id: 5, decision: 'ADD', at: now.toISOString(), brainId: 'b1', title: 'T' })
  })

  it('rejects an unknown decision or a bad id', () => {
    expect(() => markDone(emptyState('a'), { id: 1, decision: 'MAYBE' }, new Date())).toThrow(/decision/)
    expect(() => markDone(emptyState('a'), { id: Number.NaN, decision: 'ADD' }, new Date())).toThrow(/id/)
  })
})

describe('runCli', () => {
  it('candidates -> done -> candidates walks the backlog; status lists what was promoted', () => {
    memDb(join(dir, 'm.db')).close()
    const paths = { dbPath: join(dir, 'm.db'), stateDir: join(dir, 'state') }
    const first = JSON.parse(runCli(['candidates', '--agent', 'jean', '--limit', '2'], paths))
    expect(first.items.map((i: { id: number }) => i.id)).toEqual([1, 5])
    expect(first.remaining).toBe(1)
    runCli(['done', '--agent', 'jean', '--id', '1', '--decision', 'ADD', '--brain-id', 'abc', '--title', 'NTAK'], paths)
    runCli(['done', '--agent', 'jean', '--id', '5', '--decision', 'DUP'], paths)
    const second = JSON.parse(runCli(['candidates', '--agent', 'jean'], paths))
    expect(second.items.map((i: { id: number }) => i.id)).toEqual([6])
    const status = JSON.parse(runCli(['status', '--agent', 'jean'], paths))
    expect(status.recentPromoted).toEqual([expect.objectContaining({ id: 1, brainId: 'abc', title: 'NTAK' })])
    expect(readState(paths.stateDir, 'jean').cursor).toBe(5)
  })

  it('never writes the memory database', () => {
    memDb(join(dir, 'm.db')).close()
    const paths = { dbPath: join(dir, 'm.db'), stateDir: join(dir, 'state') }
    const before = readFileSync(paths.dbPath)
    runCli(['candidates', '--agent', 'jean'], paths)
    runCli(['done', '--agent', 'jean', '--id', '1', '--decision', 'SKIP'], paths)
    expect(readFileSync(paths.dbPath).equals(before)).toBe(true)
  })

  it('rejects a path-like agent name and an unknown command', () => {
    const paths = { dbPath: join(dir, 'm.db'), stateDir: join(dir, 'state') }
    expect(() => runCli(['status', '--agent', '../x'], paths)).toThrow(/agent/)
    expect(() => runCli(['drop', '--agent', 'jean'], paths)).toThrow(/unknown command/)
  })

  it('fails loudly on a corrupt state file instead of restarting from zero', () => {
    mkdirSync(join(dir, 'state'))
    writeFileSync(join(dir, 'state', 'jean.json'), '{nem json')
    expect(() => runCli(['status', '--agent', 'jean'], { dbPath: 'x', stateDir: join(dir, 'state') })).toThrow(/unreadable/)
  })
})

const UPSTREAM_PROMPT = `## 1. Memória mentés\n- Aktív feladatok, pending -> category=hot\n${UPSTREAM_SHARED_LINE}\n- Napi napló bejegyzés:\n\n## 2. Skill reflexió`

describe('applyPreCompactNote', () => {
  it('replaces the upstream shared line with the marked block, in place', () => {
    const out = applyPreCompactNote(UPSTREAM_PROMPT)
    expect(out).not.toContain(UPSTREAM_SHARED_LINE)
    expect(out.indexOf(PRECOMPACT_NOTE_BEGIN)).toBeGreaterThan(out.indexOf('category=hot'))
    expect(out.indexOf(PRECOMPACT_NOTE_END)).toBeLessThan(out.indexOf('Napi napló'))
    expect(out).toContain('category=warm')
  })

  it('is idempotent and refreshes a stale block', () => {
    const once = applyPreCompactNote(UPSTREAM_PROMPT)
    expect(applyPreCompactNote(once)).toBe(once)
    const stale = once.replace(/category=warm/, 'ELAVULT')
    expect(applyPreCompactNote(stale)).toBe(once)
  })

  it('appends the block when an upstream rewording removed the anchor line', () => {
    const out = applyPreCompactNote('Teljesen új upstream szöveg.')
    expect(out.startsWith('Teljesen új upstream szöveg.\n\n' + PRECOMPACT_NOTE_BEGIN)).toBe(true)
  })
})

describe('ensurePreCompactBrainNote', () => {
  const settings = () => ({
    hooks: {
      PreCompact: [{ matcher: 'auto', hooks: [{ type: 'agent', prompt: UPSTREAM_PROMPT, timeout: 180 }] }],
      Stop: [{ hooks: [{ type: 'command', command: 'x' }] }],
    },
    model: 'claude-opus-5',
  })

  it('rewrites only the agent hook prompt, keeps everything else, and writes once', () => {
    const p = join(dir, 'settings.json')
    writeFileSync(p, JSON.stringify(settings()))
    expect(ensurePreCompactBrainNote(p, spyWrite)).toBe(true)
    const out = JSON.parse(readFileSync(p, 'utf-8'))
    expect(out.model).toBe('claude-opus-5')
    expect(out.hooks.Stop).toEqual(settings().hooks.Stop)
    expect(out.hooks.PreCompact[0].hooks[0].timeout).toBe(180)
    expect(out.hooks.PreCompact[0].hooks[0].prompt).toContain(PRECOMPACT_NOTE_BEGIN)
    writes.length = 0
    expect(ensurePreCompactBrainNote(p, spyWrite)).toBe(false)
    expect(writes).toEqual([])
  })

  it('leaves a missing, unparsable or hook-less file alone', () => {
    expect(ensurePreCompactBrainNote(join(dir, 'nincs.json'), spyWrite)).toBe(false)
    writeFileSync(join(dir, 'rossz.json'), '{')
    expect(ensurePreCompactBrainNote(join(dir, 'rossz.json'), spyWrite)).toBe(false)
    writeFileSync(join(dir, 'ures.json'), '{"hooks":{}}')
    expect(ensurePreCompactBrainNote(join(dir, 'ures.json'), spyWrite)).toBe(false)
    expect(writes).toEqual([])
  })
})

describe('ensureBrainPromotionForFleet', () => {
  it('main agent first, sub-agents sorted, and patches all three settings copies', () => {
    const home = join(dir, 'home')
    const agentsDir = join(dir, 'agents')
    const write = (p: string) => { mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, JSON.stringify({ hooks: { PreCompact: [{ hooks: [{ type: 'agent', prompt: UPSTREAM_PROMPT }] }] } })) }
    write(join(home, 'settings.json'))
    write(join(agentsDir, 'bubi', '.claude', 'settings.json'))
    write(join(agentsDir, 'bubi', '.claude-config', 'settings.json'))
    const res = ensureBrainPromotionForFleet({
      mainAgentId: 'marveen',
      subAgents: ['peppa', 'bubi', 'marveen'],
      projectRoot: '/r',
      scheduledTasksDir: join(dir, 'tasks'),
      settingsPathFor: (a) => a === 'marveen' ? join(home, 'settings.json') : join(agentsDir, a, '.claude', 'settings.json'),
      agentDirFor: (a) => join(agentsDir, a),
      atomicWrite: spyWrite,
    })
    expect(res.tasks).toEqual(['marveen', 'bubi', 'peppa'])
    expect(res.notes).toHaveLength(3)
    expect(existsSync(join(dir, 'tasks', 'brain-promotion-peppa', 'SKILL.md'))).toBe(true)
  })
})
