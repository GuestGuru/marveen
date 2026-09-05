/**
 * GG fork (FLEETHOOK905): the conversation ledger and the outgoing guards, for
 * the SUB-AGENTS too.
 *
 * MEASURED 2026-09-02, re-measured 2026-09-05. The main agent carries five hooks
 * that no colleague had:
 *
 *   ledger-capture.py      inbound message -> conversation_log
 *   ledger-outbound.py     reply-tool call -> conversation_log
 *   ledger-replay.py       SessionStart: inject this agent's own recent turns
 *   outgoing-copy-gate.py  accent + em-dash guard on everything sent out
 *   telegram-reply-guard.py  Stop: an unanswered inbound may not end the turn
 *
 * Why they were missing is a scoping accident, not a decision: the main agent's
 * copies live in PROJECT scope (<install>/.claude/settings.json), which applies
 * only to a session whose cwd is the install root. A sub-agent runs in
 * agents/<name>/, so its project scope is agents/<name>/.claude/settings.json,
 * written from templates/settings.json.template -- and that template never had
 * them. The consequence, in the colleagues' own output: nothing checked their
 * outgoing Hungarian for stripped accents or em dashes, and they had no
 * conversation ledger at all, so a restart lost the thread.
 *
 * WHY A SEPARATE MODULE, not four more entries in the template: the template is
 * an upstream file (its last five commits are upstream PRs), and every upstream
 * file we edit is a future merge conflict (docs/gg-fork-konvenciok.md). This
 * keeps the fork's surface in agent-scaffold.ts down to one call.
 *
 * THE SIDE EFFECT THAT HAD TO BE MEASURED FIRST, because ledger-replay injects
 * context into SEVEN sessions that all restart within seconds of each other at
 * 03:00:
 *   - Isolation: agent_id comes from cwd. Measured for all six colleague dirs --
 *     agents/bubi -> 'bubi', ... -- so a session can only ever replay its OWN
 *     chat. No cross-owner leakage, which was the real risk (a colleague's
 *     session opening with someone else's conversation).
 *   - Volume: bounded by design at DEFAULT_BYTE_BUDGET (8192 bytes) per session,
 *     and today it is nearly nothing -- conversation_log holds 407 rows for the
 *     main agent, 4 for salesninja, and ZERO for the other five, so the first
 *     restarts after this change replay an empty history and no-op.
 */

import { join } from 'node:path'

/**
 * Wrap a hook script the way the shipped template does: if the file is missing
 * (a checkout moved, a partial install), the bash test exits 0 rather than
 * letting python3 exit non-zero and block the prompt. A real policy block (the
 * script exists and returns non-zero) still propagates through `exec`.
 *
 * The path deliberately appears twice, matching the template's own form, so the
 * hook-registration guard's basename matching still recognises the command.
 */
function failOpen(script: string): string {
  return `bash -c '[ -f ${script} ] && exec python3 ${script}; exit 0'`
}

/**
 * The five hook entries, in templates/settings.json.template's shape so
 * ensureAgentHooks's existing merge/dedup/timeout-sync passes handle them with
 * no special casing.
 *
 * Matchers are copied from the main agent's working project-scope config rather
 * than reinvented -- notably the outgoing gate's THREE separate matchers. A
 * single combined matcher would look tidier and would be wrong: the gate has to
 * sit on Bash (a curl that posts a message bypasses every tool-level guard),
 * on the e-mail tools, and on the channel reply tool, and those are distinct
 * matcher expressions in the harness.
 */
export function fleetChannelHooks(projectRoot: string): Record<string, unknown> {
  const h = (name: string) => failOpen(join(projectRoot, 'scripts', 'hooks', name))
  const gate = h('outgoing-copy-gate.py')
  return {
    UserPromptSubmit: [
      { hooks: [{ type: 'command', command: h('ledger-capture.py'), timeout: 15 }] },
    ],
    PostToolUse: [
      {
        // Provider-generic: any channel plugin's reply tool, not just Telegram.
        matcher: 'mcp__plugin_[a-z0-9-]+_[a-z0-9-]+__reply',
        hooks: [{ type: 'command', command: h('ledger-outbound.py'), timeout: 15 }],
      },
    ],
    PreToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: gate, timeout: 15 }] },
      { matcher: '.*send_email.*', hooks: [{ type: 'command', command: gate, timeout: 15 }] },
      {
        matcher: 'mcp__plugin_telegram_telegram__reply',
        hooks: [{ type: 'command', command: gate, timeout: 15 }],
      },
    ],
    Stop: [
      { matcher: '*', hooks: [{ type: 'command', command: h('telegram-reply-guard.py'), timeout: 10 }] },
    ],
    SessionStart: [
      {
        // NOT 'compact' -- that is taskstate-replay's event. This one restores the
        // conversation after a real restart.
        matcher: 'startup|resume|clear',
        hooks: [{ type: 'command', command: h('ledger-replay.py'), timeout: 15 }],
      },
    ],
  }
}

/**
 * The main agent is deliberately EXCLUDED.
 *
 * Its settings file is ~/.claude/settings.json (USER scope), while these same
 * five hooks already run for it from <install>/.claude/settings.json (PROJECT
 * scope). Both scopes fire, so adding them here would run every one of them
 * TWICE for the main agent: two ledger rows per message, and a doubled Stop
 * guard. The colleagues have no such project-scope file, which is exactly why
 * they need the overlay and the main agent does not.
 */
export function wantsFleetChannelHooks(name: string, mainAgentId: string): boolean {
  return name !== mainAgentId
}
