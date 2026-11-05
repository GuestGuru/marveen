// GG-specific: the single boot-time entry point of IT-1289, so src/web.ts (an
// upstream file) carries one call and nothing else. See brain-promotion.ts and
// precompact-brain-note.ts for the why.
import { join } from 'node:path'
import { ensureBrainPromotionTasks, brainPromotionTaskName } from './brain-promotion.js'
import { registerScheduledTask } from '../web/schedule-registry.js'
import { logger } from '../logger.js'
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
  // Test seam; the default registers in the scheduled-task registry.
  register?: (dirName: string) => void
}

// Since upstream v1.46 (#2003) the runner fires only tasks whose files match the hash
// in the server-owned registry. These tasks are written by the server from code, like
// the repo-default seeds, so they are registered the same way ('seed:dashboard' there,
// 'server:brain-promotion' here) right after a write. Without this a new agent's task
// would never fire, and any prompt change would silence all of them.
function registerBrainPromotionTask(dirName: string): void {
  try {
    if (registerScheduledTask(dirName, 'server:brain-promotion') === null) {
      logger.warn({ task: dirName }, 'brain-promotion: written task has no readable hash; the runner will not fire it')
    }
  } catch (err) {
    logger.warn({ err, task: dirName }, 'brain-promotion: registering the written task failed; the runner will not fire it')
  }
}

export function ensureBrainPromotionForFleet(opts: BrainPromotionFleetOptions): { tasks: string[]; notes: string[] } {
  const subAgents = [...opts.subAgents].filter((a) => a !== opts.mainAgentId).sort()
  const tasks = ensureBrainPromotionTasks({
    agents: [opts.mainAgentId, ...subAgents],
    projectRoot: opts.projectRoot,
    scheduledTasksDir: opts.scheduledTasksDir,
    atomicWrite: opts.atomicWrite,
  })
  const register = opts.register ?? registerBrainPromotionTask
  for (const agent of tasks) register(brainPromotionTaskName(agent))
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
