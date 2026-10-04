// GG-specific: the single boot-time entry point of IT-1289, so src/web.ts (an
// upstream file) carries one call and nothing else. See brain-promotion.ts and
// precompact-brain-note.ts for the why.
import { join } from 'node:path'
import { ensureBrainPromotionTasks } from './brain-promotion.js'
import { ensurePreCompactBrainNote } from './precompact-brain-note.js'

export interface BrainPromotionFleetOptions {
  mainAgentId: string
  // A látható al-agentek (a rejtett technikai workernek nincs gazdája).
  subAgents: string[]
  projectRoot: string
  scheduledTasksDir: string
  // agentSettingsPath(): a fő agentnél ~/.claude/settings.json.
  settingsPathFor: (agent: string) => string
  agentDirFor: (agent: string) => string
  atomicWrite: (path: string, data: string) => void
}

export function ensureBrainPromotionForFleet(opts: BrainPromotionFleetOptions): { tasks: string[]; notes: string[] } {
  const subAgents = [...opts.subAgents].filter((a) => a !== opts.mainAgentId).sort()
  const tasks = ensureBrainPromotionTasks({
    agents: [opts.mainAgentId, ...subAgents],
    projectRoot: opts.projectRoot,
    scheduledTasksDir: opts.scheduledTasksDir,
    atomicWrite: opts.atomicWrite,
  })
  const notes: string[] = []
  const paths = [
    opts.settingsPathFor(opts.mainAgentId),
    ...subAgents.flatMap((a) => [
      opts.settingsPathFor(a),
      // Az izolált config-dir másolata spawnkor a ~/.claude/settings.json-ból
      // frissül; itt azért igazítjuk, hogy a futó botra se kelljen várni.
      join(opts.agentDirFor(a), '.claude-config', 'settings.json'),
    ]),
  ]
  for (const p of paths) {
    if (ensurePreCompactBrainNote(p, opts.atomicWrite)) notes.push(p)
  }
  return { tasks, notes }
}
