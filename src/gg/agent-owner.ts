// GG-specific: per-agent human owner ("whose assistant is this?").
//
// ── Why this file exists ────────────────────────────────────────────────────
//
// Upstream models an install as ONE human plus that human's assistants: the
// single `OWNER_NAME` env value is substituted into every generated persona,
// into the heartbeat prompt, and into the kanban assignee list. That is right
// for a personal install and wrong for a company one.
//
// At GuestGuru the install is shared: one box, one main agent (the router),
// and one bot PER COLLEAGUE. Everyone reaches the company systems through
// gg-mcp with their OWN token, so the access side is already per-person --
// only the identity side was missing. Without it every generated persona told
// the new agent that it belongs to the operator, which produced bots that
// believed they reported to someone they do not work for.
//
// The fix is to stop conflating three distinct roles:
//
//   operator  -- who runs the box and owns the install; still OWNER_NAME.
//                Code changes, credentials and fleet-wide policy are theirs.
//   owner     -- whose assistant a given agent is; per agent, this module.
//                Day-to-day instructions, escalation and tone follow this.
//   main      -- the router / hub agent; still MAIN_AGENT_ID.
//
// Nothing here changes an install that never sets an owner: resolveAgentOwner()
// falls back to OWNER_NAME, so single-person installs behave exactly as before.
//
// This module lives under src/gg/ on purpose. GuestGuru runs a FORK of marveen
// and pulls upstream regularly, so GG-specific logic stays in files upstream
// does not have, and the touch points in shared files stay one line each.

import { join } from 'node:path'
import { OWNER_NAME } from '../config.js'
import { agentDir, readFileOr, listAgentNames } from '../web/agent-config.js'
import { atomicWriteFileSync } from '../web/atomic-write.js'

/** Where the owner is persisted, alongside model / displayName / team. */
function configPath(name: string): string {
  return join(agentDir(name), 'agent-config.json')
}

/**
 * The agent's stored owner, or null when unset.
 *
 * Returns null (not OWNER_NAME) so callers can tell "inherits the operator"
 * apart from "explicitly owned by the operator" -- the dashboard needs that
 * distinction to render an empty field rather than a pre-filled one.
 */
export function readAgentOwner(name: string): string | null {
  try {
    const config = JSON.parse(readFileOr(configPath(name), '{}')) as { owner?: unknown }
    if (typeof config.owner !== 'string') return null
    const trimmed = config.owner.trim()
    return trimmed || null
  } catch {
    // A corrupt config must not break persona generation: fall back to unset.
    return null
  }
}

/** Persist (or clear, with null / empty) the agent's owner. */
export function writeAgentOwner(name: string, owner: string | null): void {
  const path = configPath(name)
  let config: Record<string, unknown> = {}
  try { config = JSON.parse(readFileOr(path, '{}')) } catch { /* start fresh */ }
  const trimmed = (owner ?? '').trim()
  if (trimmed) config['owner'] = trimmed
  else delete config['owner']
  atomicWriteFileSync(path, JSON.stringify(config, null, 2))
}

/**
 * Who this agent answers to, for persona text and escalation.
 *
 * Falls back to the operator, which keeps every pre-existing install and the
 * main agent itself on the old behaviour.
 */
export function resolveAgentOwner(name: string): string {
  return readAgentOwner(name) ?? OWNER_NAME
}

/**
 * Every distinct human on this install: the operator plus each agent's owner.
 *
 * The kanban assignee list uses this so a card can be handed to a colleague
 * who is not the operator. Order is stable (operator first, then insertion
 * order) because the dashboard renders it as a dropdown and a jumping list is
 * hostile. Comparison is case-sensitive on purpose: these are display names
 * the operator typed, and folding them would merge two real people whose
 * names differ only in case far more often than it would dedupe a typo.
 */
export function listOwnerNames(): string[] {
  const seen = new Set<string>([OWNER_NAME])
  const out: string[] = [OWNER_NAME]
  for (const agent of listAgentNames()) {
    const owner = readAgentOwner(agent)
    if (!owner || seen.has(owner)) continue
    seen.add(owner)
    out.push(owner)
  }
  return out
}
