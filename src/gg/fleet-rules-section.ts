// GG-specific: fleet rules 7 and 8 as a MAINTAINED generated block.
//
// ── Why this file exists ────────────────────────────────────────────────────
//
// 2026-09-01. Rules 7 and 8 are produced by ggFleetRule7/8 (src/gg/fleet-rules.ts)
// and interpolated into the CLAUDE.md that generateClaudeMd() writes -- ONCE, at
// scaffold time, with no markers around them. So the text an agent lives by is a
// snapshot of the rule as it stood on the day that agent was created, and every
// later correction reaches only agents created afterwards.
//
// That went unnoticed until a rule 7 amendment ("having the permission is not
// authorization -- your role can be narrower than the rights map") was pushed and
// reported to the owner as live. It was live in the code and in nobody's file.
// An agent measured it and said so: rules 7 and 8 sat outside every generated
// marker, while the memory-rules block right below them updated on each spawn.
// One word, "generated", covering two different mechanisms.
//
// Rule 8 -- "use ONLY your own gg-mcp token" -- had the same exposure, and that
// one is the fleet's hardest rule: a stale copy of it cannot be corrected at all.
//
// So the rules move into markers and are rewritten on every spawn, exactly like
// the fleet roster. The one-time removal of the old unmarked copies is a
// migration, not a code path: this module never edits text outside its markers.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ggFleetRule7, ggFleetRule8, type FleetRule8Identity } from './fleet-rules.js'

export const FLEET_RULES_BEGIN = '<!-- BEGIN GENERATED: fleet-rules (auto-generated, do not edit by hand) -->'
export const FLEET_RULES_END = '<!-- END GENERATED: fleet-rules -->'

// Non-greedy: stop at the FIRST end marker, so a file holding several generated
// blocks does not get everything between the first BEGIN and the last END eaten.
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const FLEET_RULES_BLOCK_RE = new RegExp(
  `${escape(FLEET_RULES_BEGIN)}[\\s\\S]*?${escape(FLEET_RULES_END)}`,
)

export function buildFleetRulesBody(identity: FleetRule8Identity): string {
  return [
    '## Flotta-szabályok, amiket a rendszer tart karban',
    '',
    'Ez a két szabály a legutóbbi indulásodkor generálódott, tehát ez a MÉRVADÓ szövegük.',
    'Ha a fenti, kézzel írt részben régebbi megfogalmazás szerepel, EZT vedd figyelembe.',
    '',
    ggFleetRule7(identity),
    ggFleetRule8(identity),
  ].join('\n')
}

// Same five-rule idempotency contract as ensureFleetRosterSection: no CLAUDE.md
// -> skip; markers present -> replace only between them; absent -> append;
// unchanged content -> no write at all; every write atomic.
export function ensureFleetRulesSection(
  agentClaudeMdDir: string,
  identity: FleetRule8Identity,
  atomicWrite: (path: string, data: string) => void,
): void {
  const claudeMdPath = join(agentClaudeMdDir, 'CLAUDE.md')
  if (!existsSync(claudeMdPath)) return

  const block = `${FLEET_RULES_BEGIN}\n${buildFleetRulesBody(identity)}\n${FLEET_RULES_END}`

  let existing: string
  try {
    existing = readFileSync(claudeMdPath, 'utf-8')
  } catch {
    return
  }

  const updated = FLEET_RULES_BLOCK_RE.test(existing)
    ? existing.replace(FLEET_RULES_BLOCK_RE, block)
    : existing.trimEnd() + '\n\n' + block + '\n'

  if (updated === existing) return
  atomicWrite(claudeMdPath, updated)
}
