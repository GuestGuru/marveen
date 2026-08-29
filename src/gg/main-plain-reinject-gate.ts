// GG fork: time-gated plain-text re-inject for the MAIN agent's stuck input.
//
// WHY THIS EXISTS. The stuck-input watcher passes `allowPlainReinject: false`
// for MAIN, so a parked non-<channel> text there is never re-injected: the
// watcher logs that it is deferring and waits. On a sub-agent that is fine --
// its owner is awake and can restart it -- but on MAIN the owner is typically
// asleep, and the watcher is waiting for the very person it is protecting. On
// 2026-08-25 that deadlock held from 03:00 until the owner pressed Ctrl-C at
// 06:50; the watcher had SEEN the wedge every minute and chose not to act.
//
// WHY IT IS SAFE TO OPEN THE GATE AT ALL. Two separate risks were folded into
// that one `false`, and only one of them still needs it:
//
//   1. A HUMAN DRAFT must never be destroyed -- a person's typed text has no
//      re-delivery. Still true, and still fully enforced: `decideStuckInputAction`
//      takes the plain-reinject branch only with POSITIVE machine origin
//      (STUCKINPUT805). A hand-typed draft has no machine-origin marker, so it
//      can never reach this branch, with or without this gate.
//   2. A prompt-suggestion GHOST in MAIN's box could be re-typed and submitted
//      as a forged message (the 2026-06-26 phantom-injection class). A ghost is
//      likewise not machine-origin-marked, so the same STUCKINPUT805 check
//      covers it. The blanket `false` predates that check.
//
// So this gate does NOT widen what may be re-injected. It only decides WHEN
// MAIN is allowed to use a branch that is already origin-guarded, and it stays
// shut for the whole fast-escalation window so nothing about the normal
// recovery path changes.
//
// WHY A DELAY AT ALL, if the origin check already protects us? Because "positive
// machine origin" is a heuristic over a scraped terminal box, and the cost of
// being wrong on MAIN is the owner's own text. A long wait costs nothing when
// the fast path works (it resolves in ~45s), and buys a wide margin for the
// human to act first when they are awake. Half an hour is the owner's call
// (2026-08-29): long enough that a waking owner wins the race, short enough
// that a night-time wedge does not hold until morning.
export const MAIN_PLAIN_REINJECT_AFTER_MS = 30 * 60 * 1000

export interface MainPlainReinjectInputs {
  /** watchState.firstSeenAt for this session: when this parked spell began. */
  firstSeenAt: number | null
  /** Date.now() at the tick. */
  now: number
  /** Override for tests; defaults to the 30-minute production threshold. */
  thresholdMs?: number
}

/**
 * True when MAIN's parked-input spell has lasted long enough that the watcher
 * should stop deferring and use the (origin-guarded) plain re-inject.
 *
 * Returns false for a fresh or unknown spell, so the default answer is always
 * "keep waiting" -- a missing timestamp must never open the gate.
 */
export function mainPlainReinjectAllowed(inputs: MainPlainReinjectInputs): boolean {
  const { firstSeenAt, now } = inputs
  const thresholdMs = inputs.thresholdMs ?? MAIN_PLAIN_REINJECT_AFTER_MS
  if (firstSeenAt == null) return false
  // A clock that jumped backwards (NTP step, suspend/resume) must not be read
  // as "stuck forever" -- a negative age is not evidence of anything.
  const age = now - firstSeenAt
  if (!Number.isFinite(age) || age < 0) return false
  return age >= thresholdMs
}
