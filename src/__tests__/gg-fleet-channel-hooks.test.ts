import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fleetChannelHooks, wantsFleetChannelHooks } from '../gg/fleet-channel-hooks.js'
import { isUnsafeHookCommand } from '../web/agent-scaffold.js'

// GG fork (FLEETHOOK905). Measured 2026-09-02 and again 2026-09-05: none of the
// six colleagues had ledger-capture, ledger-outbound, ledger-replay,
// outgoing-copy-gate or telegram-reply-guard. Not a decision anyone made -- the
// main agent keeps those in PROJECT scope (<install>/.claude/settings.json),
// which a sub-agent running in agents/<name>/ never reads, and the shipped
// template never carried them. The visible cost was in the colleagues' own
// output: nothing checked their outgoing Hungarian for stripped accents or em
// dashes, and a restart left them with no conversation at all.

const ROOT = '/home/gg/marveen'

describe('fleetChannelHooks', () => {
  const hooks = fleetChannelHooks(ROOT)
  const commands = Object.values(hooks).flatMap((entries) =>
    (entries as Array<{ hooks?: Array<{ command?: string }> }>).flatMap((e) =>
      (e.hooks ?? []).map((h) => h.command ?? ''),
    ),
  )

  it('carries exactly the five scripts the colleagues were missing', () => {
    for (const script of [
      'ledger-capture.py',
      'ledger-outbound.py',
      'ledger-replay.py',
      'outgoing-copy-gate.py',
      'telegram-reply-guard.py',
    ]) {
      expect(commands.some((c) => c.includes(script)), script).toBe(true)
    }
  })

  it('guards the outgoing text on all THREE ways out, not just the reply tool', () => {
    // A tidier single matcher would be wrong: a curl in Bash that posts a message
    // bypasses every tool-level guard, so Bash needs its own entry alongside the
    // e-mail tools and the channel reply tool.
    const gated = (hooks.PreToolUse as Array<{ matcher?: string }>).map((e) => e.matcher)
    expect(gated).toContain('Bash')
    expect(gated).toContain('.*send_email.*')
    expect(gated).toContain('mcp__plugin_telegram_telegram__reply')
  })

  it('replays the conversation on a real restart, not on a compact', () => {
    // 'compact' belongs to taskstate-replay. Claiming it here would double up on
    // one event and leave a genuine restart (startup) with no conversation.
    const matchers = (hooks.SessionStart as Array<{ matcher?: string }>).map((e) => e.matcher)
    expect(matchers).toEqual(['startup|resume|clear'])
  })

  it('fails OPEN: a missing script must never block a colleague prompt', () => {
    for (const c of commands) {
      expect(c.startsWith("bash -c '[ -f "), c).toBe(true)
      expect(c.endsWith("; exit 0'"), c).toBe(true)
    }
  })

  it('survives the registration guard, which rejects temp-dir hook paths', () => {
    // Not decoration. isUnsafeHookCommand refuses /tmp, /var/tmp and /dev/shm
    // paths, so a fleet built from a scratch checkout would silently register
    // NOTHING -- the same trap that produced 27 phantom test failures on
    // 2026-09-02 when the tests themselves ran from a /tmp worktree.
    for (const c of commands) expect(isUnsafeHookCommand(c), c).toBe(false)
    expect(
      Object.values(fleetChannelHooks('/tmp/scratch-checkout'))
        .flatMap((entries) => (entries as Array<{ hooks?: Array<{ command?: string }> }>)
          .flatMap((e) => (e.hooks ?? []).map((h) => h.command ?? '')))
        .every((c) => isUnsafeHookCommand(c)),
    ).toBe(true)
  })
})

describe('wantsFleetChannelHooks', () => {
  it('applies to colleagues', () => {
    expect(wantsFleetChannelHooks('bubi', 'marveen')).toBe(true)
    expect(wantsFleetChannelHooks('brokermarcsi', 'marveen')).toBe(true)
  })

  it('SKIPS the main agent, whose settings file is a different scope', () => {
    // The main agent's file is ~/.claude/settings.json (USER scope) while these
    // same hooks already run for it from <install>/.claude/settings.json (PROJECT
    // scope). Both scopes fire. Adding them here would log every message to the
    // ledger TWICE and run the Stop guard twice.
    expect(wantsFleetChannelHooks('marveen', 'marveen')).toBe(false)
  })
})

describe('the wiring in agent-scaffold', () => {
  it('merges the overlay instead of replacing the template events', () => {
    // The template's own UserPromptSubmit / PostToolUse / SessionStart entries
    // (staleness-guard, provenance-gate, channel-inbox-drain, voice-reply-directive,
    // skill-usage-capture, taskstate-replay) must survive. A plain assignment would
    // silently drop them, and nothing else in the suite would notice.
    const src = readFileSync(join(__dirname, '..', 'web', 'agent-scaffold.ts'), 'utf-8')
    expect(src).toContain('fleetChannelHooks')
    expect(src).toContain('wantsFleetChannelHooks')
    expect(src).toMatch(/\[\.\.\.\(\(tplHooks\[event\] as unknown\[\]\) \?\? \[\]\), \.\.\.\(entries as unknown\[\]\)\]/)
  })
})
