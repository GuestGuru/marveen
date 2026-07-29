// GG-specific: non-destructive access.json writes.
//
// ── Why this file exists (and why it is a separate file) ────────────────────
//
// The channel setup endpoint (POST /api/agents/:name/channels/:provider) used
// to rewrite access.json unconditionally with an empty allowlist:
//
//     { dmPolicy: 'pairing', allowFrom: [], groups: {}, pending: {} }
//
// It never read the existing file, so every prior approval was lost. This is
// not hypothetical: on 2026-07-28 21:42 a setup call wiped the channel grant
// that discord-group-bootstrap had written at 21:37. For an onboarding flow
// this is fatal — rotating a bot token would silently lock out everyone who
// could talk to the agent.
//
// This module lives under src/gg/ on purpose. GuestGuru runs a FORK of
// marveen and pulls upstream changes regularly, so GG-specific logic stays in
// files upstream does not have, and the touch points in shared files are kept
// to a single line. That way an upstream merge never conflicts with our code.

import { existsSync, readFileSync } from 'node:fs'

/**
 * The subset of access.json that both the channel plugin and we understand.
 * Unknown keys are preserved verbatim (see mergeAccessFile) — the plugin owns
 * this file and may add fields we know nothing about.
 */
export interface AccessFile {
  dmPolicy?: 'pairing' | 'allowlist' | 'disabled'
  allowFrom?: string[]
  groups?: Record<string, unknown>
  pending?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * Defaults for a DM-pairing channel (Discord / Telegram / Slack) that has
 * never been configured.
 */
export const PAIRING_DEFAULTS: AccessFile = {
  dmPolicy: 'pairing',
  allowFrom: [],
  groups: {},
  pending: {},
}

/**
 * Merge the desired changes into an existing access file.
 *
 * Rules:
 *  - existing `allowFrom` / `groups` / `pending` are KEPT (that is the whole
 *    point — those are the approvals we must not lose);
 *  - unknown top-level keys are kept, because the channel plugin co-owns this
 *    file and rewrites it from its own schema;
 *  - only the fields explicitly present in `changes` are overwritten.
 *
 * `defaults` is a parameter because providers do not share a schema: the
 * DM-pairing channels use dmPolicy/allowFrom/groups/pending, while Google Chat
 * uses policy/owner/allowDomains/roles/spaces. Both suffer from the same
 * overwrite bug, so both should go through here.
 *
 * Pure function: takes the parsed current state, returns the next state. The
 * file I/O lives in mergeAccessFile so this stays trivially testable.
 */
export function mergeAccess(
  current: AccessFile | null,
  changes: Partial<AccessFile> = {},
  defaults: AccessFile = PAIRING_DEFAULTS,
): AccessFile {
  const base: AccessFile = current
    ? { ...defaults, ...current }
    : { ...defaults }
  return { ...base, ...changes }
}

/**
 * Read access.json (if any) and return the merged next state, ready to write.
 *
 * A corrupt or unreadable file is treated as "no file": we fall back to the
 * fresh defaults rather than throwing. Losing a broken allowlist is bad, but
 * refusing to configure the channel at all is worse — and the plugin itself
 * does the same (it backs up corrupt files and starts fresh).
 */
export function mergeAccessFile(
  path: string,
  changes: Partial<AccessFile> = {},
  defaults: AccessFile = PAIRING_DEFAULTS,
): AccessFile {
  let current: AccessFile | null = null
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        current = parsed as AccessFile
      }
    } catch {
      // corrupt file → treat as absent
    }
  }
  return mergeAccess(current, changes, defaults)
}
