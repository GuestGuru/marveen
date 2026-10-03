// GG-specific: the bot-side helper of the nightly brain-promotion round
// (IT-1289). The scheduled task's SKILL.md (src/gg/brain-promotion.ts) calls
// it as `node dist/gg/brain-promotion-cli.js <command> --agent <name> ...`.
//
// Why a compiled helper and not ad-hoc sqlite3 in the prompt: the candidate
// query and the cursor are the part that must be exact every night (which
// rows, which order, what counts as done), so they live in tested code and the
// model only does the judging. The memories table uses SECONDS in created_at
// (task_runs.ts is the only millisecond column -- the memoria-heartbeat
// SKILL.md records an evening lost to mixing those up).
//
// The database is opened READ-ONLY: this round never edits a bot's memory.
// Progress lives in store/brain-promotion/<agent>.json.
import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { atomicWriteFileSync } from '../web/atomic-write.js'

// Az átnézett polcok: a `hot` futó állapot, az nem megy a céges agyba.
export const PROMOTED_CATEGORIES = ['shared', 'warm', 'cold'] as const

// A brain-szabály szerinti mutató („céges agy: <cím>”): az már átemelt tudás.
const POINTER_RE = /^\s*céges agy:/i

// A naplóban legfeljebb ennyi tétel marad (a `status` és a visszavonás ebből dolgozik).
const LOG_CAP = 1000

export interface PromotionCandidate {
  id: number
  category: string
  created: string
  keywords: string | null
  content: string
}

export interface PromotionLogEntry {
  id: number
  decision: string
  at: string
  brainId?: string
  title?: string
}

export interface PromotionState {
  agent: string
  // Az utolsó lezárt tétel id-je; a következő kör ennél nagyobbat kér.
  cursor: number
  lastRunAt: string | null
  totals: Record<string, number>
  log: PromotionLogEntry[]
}

export const DECISIONS = ['ADD', 'UPDATE', 'SUPERSEDE', 'NONE', 'DUP', 'SKIP'] as const

const AGENT_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i

export function assertAgentName(agent: string | undefined): string {
  if (!agent || !AGENT_RE.test(agent)) throw new Error(`invalid --agent: ${agent ?? '(missing)'}`)
  return agent
}

export function emptyState(agent: string): PromotionState {
  return { agent, cursor: 0, lastRunAt: null, totals: {}, log: [] }
}

export function statePath(stateDir: string, agent: string): string {
  return join(stateDir, `${agent}.json`)
}

export function readState(stateDir: string, agent: string): PromotionState {
  const p = statePath(stateDir, agent)
  if (!existsSync(p)) return emptyState(agent)
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as Partial<PromotionState>
    return {
      agent,
      cursor: Number.isInteger(raw.cursor) ? raw.cursor as number : 0,
      lastRunAt: typeof raw.lastRunAt === 'string' ? raw.lastRunAt : null,
      totals: raw.totals && typeof raw.totals === 'object' ? raw.totals : {},
      log: Array.isArray(raw.log) ? raw.log : [],
    }
  } catch {
    // Sérült állapotfájl: nem indulunk elölről csendben (az újra-átnézés
    // költséges, bár a `kulcs` miatt nem duplikál) -- hibát dobunk.
    throw new Error(`unreadable state file: ${p}`)
  }
}

export function writeState(stateDir: string, state: PromotionState): void {
  mkdirSync(stateDir, { recursive: true })
  atomicWriteFileSync(statePath(stateDir, state.agent), JSON.stringify(state, null, 2) + '\n')
}

export function selectCandidates(
  db: Database.Database,
  agent: string,
  cursor: number,
  limit: number,
): { items: PromotionCandidate[]; remaining: number } {
  const placeholders = PROMOTED_CATEGORIES.map(() => '?').join(',')
  const rows = db.prepare(
    `SELECT id, category, created_at, keywords, content FROM memories
     WHERE agent_id = ? AND category IN (${placeholders}) AND id > ?
     ORDER BY id ASC`,
  ).all(agent, ...PROMOTED_CATEGORIES, cursor) as Array<{
    id: number; category: string; created_at: number; keywords: string | null; content: string
  }>
  const eligible = rows.filter((r) => !POINTER_RE.test(r.content))
  const items = eligible.slice(0, limit).map((r) => ({
    id: r.id,
    category: r.category,
    created: new Date(r.created_at * 1000).toISOString().slice(0, 10),
    keywords: r.keywords,
    content: r.content,
  }))
  return { items, remaining: Math.max(0, eligible.length - items.length) }
}

export function markDone(
  state: PromotionState,
  entry: { id: number; decision: string; brainId?: string; title?: string },
  now: Date,
): PromotionState {
  if (!Number.isInteger(entry.id) || entry.id <= 0) throw new Error(`invalid --id: ${entry.id}`)
  const decision = entry.decision.toUpperCase()
  if (!(DECISIONS as readonly string[]).includes(decision)) {
    throw new Error(`invalid --decision: ${entry.decision} (allowed: ${DECISIONS.join(', ')})`)
  }
  const at = now.toISOString()
  const logEntry: PromotionLogEntry = { id: entry.id, decision, at }
  if (entry.brainId) logEntry.brainId = entry.brainId
  if (entry.title) logEntry.title = entry.title
  return {
    ...state,
    // Monoton: egy régebbi tétel utólagos lezárása nem viszi vissza a kurzort.
    cursor: Math.max(state.cursor, entry.id),
    lastRunAt: at,
    totals: { ...state.totals, [decision]: (state.totals[decision] ?? 0) + 1 },
    log: [...state.log, logEntry].slice(-LOG_CAP),
  }
}

function parseArgs(argv: string[]): { command: string; flags: Record<string, string> } {
  const [command = '', ...rest] = argv
  const flags: Record<string, string> = {}
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (!a.startsWith('--')) throw new Error(`unexpected argument: ${a}`)
    const value = rest[i + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`missing value for ${a}`)
    flags[a.slice(2)] = value
    i++
  }
  return { command, flags }
}

export interface CliPaths {
  dbPath: string
  stateDir: string
}

export function defaultPaths(): CliPaths {
  // dist/gg/brain-promotion-cli.js -> a telepítés gyökere két szinttel feljebb.
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  return {
    dbPath: process.env.BRAIN_PROMOTION_DB ?? join(root, 'store', 'claudeclaw.db'),
    stateDir: process.env.BRAIN_PROMOTION_STATE_DIR ?? join(root, 'store', 'brain-promotion'),
  }
}

export function runCli(argv: string[], paths: CliPaths, now: () => Date = () => new Date()): string {
  const { command, flags } = parseArgs(argv)
  const agent = assertAgentName(flags.agent)
  switch (command) {
    case 'candidates': {
      const limit = flags.limit ? Number(flags.limit) : 40
      if (!Number.isInteger(limit) || limit <= 0 || limit > 500) throw new Error(`invalid --limit: ${flags.limit}`)
      const state = readState(paths.stateDir, agent)
      const db = new Database(paths.dbPath, { readonly: true, fileMustExist: true })
      try {
        const { items, remaining } = selectCandidates(db, agent, state.cursor, limit)
        return JSON.stringify({ agent, cursor: state.cursor, remaining, items }, null, 2)
      } finally {
        db.close()
      }
    }
    case 'done': {
      const state = readState(paths.stateDir, agent)
      const next = markDone(state, {
        id: Number(flags.id),
        decision: flags.decision ?? '',
        brainId: flags['brain-id'],
        title: flags.title,
      }, now())
      writeState(paths.stateDir, next)
      return JSON.stringify({ agent, cursor: next.cursor, totals: next.totals })
    }
    case 'status': {
      const state = readState(paths.stateDir, agent)
      const promoted = state.log.filter((e) => e.brainId)
      return JSON.stringify({
        agent,
        cursor: state.cursor,
        lastRunAt: state.lastRunAt,
        totals: state.totals,
        recentPromoted: promoted.slice(-20),
      }, null, 2)
    }
    default:
      throw new Error(`unknown command: ${command || '(none)'} (candidates | done | status)`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(runCli(process.argv.slice(2), defaultPaths()) + '\n')
  } catch (err) {
    process.stderr.write(`brain-promotion: ${(err as Error).message}\n`)
    process.exit(1)
  }
}
