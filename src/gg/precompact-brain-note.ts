// GG-specific: the PreCompact memory-save prompt must not send company
// knowledge to the `shared` shelf. IT-1289.
//
// ── Why this file exists ────────────────────────────────────────────────────
//
// templates/settings.json.template ships a PreCompact hook of `type: "agent"`
// whose prompt says "Más agent-nek is -> category=shared". Before 09-29 the
// bots read that as "company knowledge goes to shared", and that is where most
// of the fleet's company knowledge sits today, invisible to every colleague.
//
// Why not edit the template: it is an upstream file (docs/gg-fork-konvenciok.md
// rule 1). And even an edited template would never reach a running bot:
// ensureAgentHooks (src/web/agent-scaffold.ts) merges hooks by `command`, and
// an agent hook has none, so once the PreCompact event exists the template's
// prompt is never looked at again. Measured 2026-10-03: all three copies on
// the host (~/.claude/settings.json, agents/<n>/.claude/settings.json,
// agents/<n>/.claude-config/settings.json) carry the original text.
//
// So this module rewrites the prompt in place, between markers: the line is
// replaced by a marked block on first run, the block is refreshed on later
// runs, and a file whose prompt has neither the line nor the block gets the
// block appended to the prompt (a future upstream rewording must not make the
// rule silently disappear). No write when nothing changed. A missing or
// unparsable file is left alone.
//
// The block points company knowledge at the bot's own `warm` shelf, from where
// the nightly brain-promotion round (src/gg/brain-promotion.ts) carries it to
// the company brain with the owner's token. The PreCompact sub-agent itself is
// not asked to call brain_* tools: whether a hook's sub-agent sees the gg-mcp
// tools is not guaranteed, and the round makes it unnecessary.
import { existsSync, readFileSync } from 'node:fs'

export const PRECOMPACT_NOTE_BEGIN = '[GG IT-1289 BEGIN]'
export const PRECOMPACT_NOTE_END = '[GG IT-1289 END]'

// Az upstream sablon sora, amit kiváltunk.
export const UPSTREAM_SHARED_LINE = '- Más agent-nek is -> category=shared'

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const NOTE_RE = new RegExp(`${escape(PRECOMPACT_NOTE_BEGIN)}[\\s\\S]*?${escape(PRECOMPACT_NOTE_END)}`)

export function buildPreCompactNote(): string {
  return [
    PRECOMPACT_NOTE_BEGIN,
    '- Minden botra igaz, a flotta működéséről szóló tudás (kapu, helper, dashboard API) -> category=shared',
    '- Céges tudás (egy kollégának, embernek is hasznos tény, döntés, tanulság) NEM a shared polcra megy:',
    '  a céges agyba tartozik. Ha a beszélgetésben már elmentetted oda (brain_save), itt ne mentsd újra.',
    '  Ha nem, mentsd category=warm-ként: az éjszakai átemelő kör (brain-promotion) viszi át a céges agyba.',
    PRECOMPACT_NOTE_END,
  ].join('\n')
}

// A prompt-szöveg tisztán: visszaadja az új promptot (változatlan, ha már jó).
export function applyPreCompactNote(prompt: string): string {
  const note = buildPreCompactNote()
  if (NOTE_RE.test(prompt)) return prompt.replace(NOTE_RE, note)
  if (prompt.includes(UPSTREAM_SHARED_LINE)) return prompt.replace(UPSTREAM_SHARED_LINE, note)
  return `${prompt.trimEnd()}\n\n${note}`
}

interface HookLike { type?: string; prompt?: string }
interface HookEntryLike { hooks?: HookLike[] }

// Egy settings.json-t igazít. true, ha írt.
export function ensurePreCompactBrainNote(
  settingsPath: string,
  atomicWrite: (path: string, data: string) => void,
): boolean {
  if (!existsSync(settingsPath)) return false
  let raw: string
  let settings: { hooks?: Record<string, unknown> }
  try {
    raw = readFileSync(settingsPath, 'utf-8')
    settings = JSON.parse(raw)
  } catch {
    return false
  }
  const entries = settings?.hooks?.PreCompact
  if (!Array.isArray(entries)) return false
  let changed = false
  for (const entry of entries as HookEntryLike[]) {
    for (const hook of entry?.hooks ?? []) {
      if (hook?.type !== 'agent' || typeof hook.prompt !== 'string') continue
      const updated = applyPreCompactNote(hook.prompt)
      if (updated !== hook.prompt) {
        hook.prompt = updated
        changed = true
      }
    }
  }
  if (!changed) return false
  atomicWrite(settingsPath, JSON.stringify(settings, null, 2))
  return true
}
