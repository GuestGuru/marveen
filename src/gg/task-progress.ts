// GG fork: progress-based stall detection for the post-fire task watchdog.
//
// Why this exists (2026-08-14, nine false alerts in the dashboard log):
// the watchdog in schedule-runner.ts alerted on "the session has been busy for
// timeoutMs since we injected the prompt". That premise is wrong twice over:
//
//   1. Elapsed busy time is not evidence of a hang. A task that legitimately
//      works for twelve minutes reads identical to one wedged at second five.
//      Measured case: the 07:45 memoria-heartbeat on 2026-08-14 fired, did its
//      mandated skill reflection, patched two SKILL.md files and ran the whole
//      push chain -- and got called stuck at 07:50 while doing exactly that.
//   2. Raising stuckAfterMinutes only moves the same false alert later. It
//      trades a wrong alert at 5 minutes for a wrong alert at 20, and buys the
//      wedged case a longer blind window. Cosmetic, not a fix.
//
// The discriminator between "working" and "wedged" is PROGRESS, not duration --
// the same insight the stuck-tool-call watcher already runs on. A live agent's
// TUI advances its `Worked for Ns` counter on every redraw (~1 Hz) and its pane
// text keeps changing; a wedged render loop repaints the identical bytes
// forever. So we sample a signature of the pane each sweep and restart the
// clock whenever it moves. The alert then means what it says: "this session has
// been busy AND visibly frozen for timeoutMs".
//
// Bias, stated deliberately: any pane change counts as progress, including
// changes we did not cause (a clock in the footer, a token counter ticking).
// That biases toward NOT alerting. It is the correct direction here -- the
// failure mode being fixed is a false alarm that trained the operator to
// ignore the alert, and the genuine wedge (2026-06-02: counter frozen at 31s,
// claude at 0.3% CPU, pane byte-identical across polls) still produces a stable
// signature and still alerts.

import { stuckToolCallSignature } from '../pane-state.js'

export interface TaskProgressState {
  /** Signature of the pane at the last sweep, or null if never sampled. */
  progressSig: string | null
  /** Wall-clock ms when the signature last CHANGED (i.e. last observed progress). */
  lastProgressAt: number
}

// FNV-1a over the pane text. We only ever compare signatures for equality, so a
// non-cryptographic 32-bit hash is the right tool: cheap enough to run on every
// tracked entry on every 60s tick, and a collision would only mean one sweep's
// progress went unnoticed -- self-correcting on the next sweep.
function hashPane(pane: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < pane.length; i++) {
    h ^= pane.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/**
 * A signature that changes whenever the session shows any sign of life.
 *
 * Prefers the TUI tool-call footer (`Worked for Ns`) when present: it is the
 * most direct progress signal the TUI offers, and it moves once a second on a
 * healthy turn. Falls back to hashing the whole pane, which covers the phases
 * where no footer is rendered (streaming text, permission prompt, tool output).
 *
 * Returns null when there is nothing to measure -- a failed capture. Callers
 * must treat null as "no signal", NOT as "no progress": a pane we could not
 * read is not evidence that the agent stopped.
 */
export function paneProgressSignature(pane: string | null): string | null {
  if (pane == null) return null
  const tc = stuckToolCallSignature(pane)
  if (tc) return `tc:${tc.tag}:${tc.seconds}`
  if (!pane.trim()) return null
  return `h:${hashPane(pane)}`
}

/**
 * Fold this sweep's pane observation into an entry's progress state.
 *
 * Pure so the whole stall rule is unit-testable without tmux. Rules:
 *   - first observation seeds the signature and starts the clock at `now`
 *   - a changed signature is progress: adopt it and restart the clock
 *   - an unchanged signature holds the clock where it was (the stall grows)
 *   - a null signature (capture failed / empty pane) is NO SIGNAL: keep the
 *     previous signature and clock untouched, so a flaky capture can neither
 *     manufacture a stall nor silently clear a real one
 */
export function trackPaneProgress(
  state: TaskProgressState,
  pane: string | null,
  now: number,
): TaskProgressState {
  const sig = paneProgressSignature(pane)
  if (sig == null) return state
  if (state.progressSig == null || sig !== state.progressSig) {
    return { progressSig: sig, lastProgressAt: now }
  }
  return state
}
