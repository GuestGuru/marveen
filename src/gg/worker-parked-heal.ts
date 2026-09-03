/**
 * GG fork: the readiness gap that made the background worker alert the owner
 * instead of healing itself.
 *
 * MEASURED 2026-09-03 on the reference host. The worker session repeatedly
 * logged `worker never became ready`, and the captured paneTail showed WHY: the
 * request prompt sat UNSENT in the input box (`❯ (delivery mechanism, not part
 * of the task): 1. Write your COMPLETE response ...`). Two verdicts disagreed
 * about that exact pane:
 *
 *   - `isSessionReadyForPrompt()` -> FALSE (real, normal-intensity parked text;
 *     the dim-ghost guard does not strip it), so the 90s boot poll never ends;
 *   - `classifyWorkerPane()` -> 'idle', because `detectPaneState` reports
 *     'typing' for a parked box and the worker classifier folds 'typing' into
 *     'idle'. `shouldSelfHeal('idle')` is false, so the Escape self-heal was
 *     never even attempted.
 *
 * Evidence that the gap was total, not intermittent: `pane parked on unexpected
 * chrome` and `self-heal cleared the parked chrome` each appear ZERO times in
 * the dashboard log, while `worker never became ready` appears repeatedly. The
 * self-heal existed and had never once run.
 *
 * The consequence was not a silent degradation: every occurrence fired
 * `alertWorkerStuck` -> a Telegram message to the owner about a worker that a
 * single Ctrl-U would have fixed, while agent-gen / capability-summary /
 * heartbeat / digest consumers failed for that round.
 *
 * The fix reuses the proven cleaner (`clearStaleParkedInput`, dim-guarded,
 * cooldown-backed, stability-confirmed) that already runs for CHANNEL sessions
 * -- the worker path simply never called it. This module holds only the
 * decision, so the gap itself is pinned by a test instead of by a comment.
 */

/** The worker pane classes, mirrored from agent-worker.ts's WorkerPaneClass. */
export type WorkerPaneClassLike = 'empty' | 'auth' | 'busy' | 'idle' | 'modal' | 'unknown'

export type ParkedHealDecision = 'clear-parked' | 'skip'

/**
 * Should the boot poll try the parked-input cleaner this tick?
 *
 * ONLY in the contradiction state described above: the pane reads 'idle' (so
 * the Escape self-heal declines it) while readiness says no. Every other class
 * is already covered and must not be touched here:
 *   - 'busy'            -> the worker is working; clearing would truncate it
 *   - 'modal'/'unknown' -> the existing Escape self-heal owns these
 *   - 'auth'            -> credential recovery owns this (Ctrl-U cannot help)
 *   - 'empty'           -> the session is still booting; nothing is parked yet
 *
 * `alreadyTried` makes it one bounded attempt per boot poll: the cleaner is
 * itself cooldown-guarded, and a box that survives one pass is a real wedge
 * that must reach the restart + alert path rather than spin here.
 *
 * The grace window is shared with the Escape self-heal on purpose: normal boot
 * chrome (MOTD, plugin load) resolves well inside it, so a healthy startup is
 * never interrupted by keystrokes.
 */
export function decideWorkerParkedHeal(opts: {
  ready: boolean
  paneClass: WorkerPaneClassLike
  elapsedMs: number
  graceMs: number
  alreadyTried: boolean
}): ParkedHealDecision {
  if (opts.ready) return 'skip'
  if (opts.alreadyTried) return 'skip'
  if (opts.paneClass !== 'idle') return 'skip'
  if (opts.elapsedMs <= opts.graceMs) return 'skip'
  return 'clear-parked'
}
