// GG fork: the main agent is reachable under a DIFFERENT tmux session name than
// every sub-agent, and POST /api/messages did not know that.
//
// ── What was measured (2026-09-10) ─────────────────────────────────────────
//
// `agentSessionName(name)` is `agent-${name}`, and `isAgentRunning()` is built on
// it. The main agent does not run there: its sessions are `<id>-channels`,
// `<id>-worker` and `<id>-worker-fast`. So `isAgentRunning(MAIN_AGENT_ID)` returned
// false on EVERY message addressed to the main agent, and the endpoint answered
// `targetRunning: false` plus a warning saying the message "nem várakozik, hanem
// elveszik".
//
// That warning is false for this recipient, and measurably so: of 480 messages ever
// addressed to the main agent, 478 were delivered. It is also the fleet's
// most-addressed mailbox, so the fleet's most-seen warning was the wrong one --
// which trains every agent to ignore the `warning` field, and that SAME field
// carries the true warning for a genuinely stopped sub-agent. A warning that cries
// wolf on the busiest path is worse than no warning.
//
// ── Why the message really waits ───────────────────────────────────────────
//
// Delivery to the main agent is a PULL model (see message-router.ts): the router
// deliberately does NOT tmux-inject into the perpetually busy channels session;
// the main agent drains its own inbox on each turn. Pending is therefore the normal
// resting state, not a fault. Measured latency over those 478 deliveries: median 12
// seconds, 90th percentile 265 seconds, max 2054 seconds, with 54 messages waiting
// over four minutes. Batch drains of 3-10 messages at one timestamp are routine.
//
// This matters beyond the wording: an agent that reads a multi-minute wait as a
// delivery outage will re-send, escalate, or report a broken fleet. One did exactly
// that today, sampling a four-minute window and concluding delivery had stopped at
// the minute the dashboard restarted. The same batch-drain shape is visible in the
// history well before that restart.
//
// Pure functions with the lookups injected, so the behaviour is testable without a
// tmux server or a live config.

/** The main agent's long-lived channels session, same derivation as main-agent.ts. */
export function mainChannelsSession(mainAgentId: string): string {
  return `${mainAgentId}-channels`
}

/**
 * Is this local recipient reachable at all?
 *
 * For the main agent, ask about the channels session; for everyone else, the
 * ordinary per-agent check. Returns true for a recipient we cannot classify, so a
 * lookup failure never invents a warning.
 */
export function recipientIsReachable(
  storedTo: string,
  mainAgentId: string,
  isAgentRunning: (name: string) => boolean,
  sessionExists: (host: string | null, session: string) => boolean,
  sanitize: (name: string) => string,
): boolean {
  if (storedTo === mainAgentId) {
    return sessionExists(null, mainChannelsSession(mainAgentId))
  }
  return isAgentRunning(sanitize(storedTo))
}

/**
 * The warning text for an unreachable MAIN agent, or null when the recipient is an
 * ordinary agent (the caller keeps its own wording for those).
 *
 * Deliberately not the sub-agent text: the message is not lost. The pull model
 * leaves it pending until the main agent's next turn, which is exactly what the
 * history shows happening, so the note says that instead of telling the sender to
 * start an agent that is not started that way.
 */
export function mainRecipientWaitNote(
  storedTo: string,
  mainAgentId: string,
  displayTo: string,
): string | null {
  if (storedTo !== mainAgentId) return null
  return (
    `'${displayTo}' csatorna-sessionje nem látszik, de az üzenet NEM veszik el: a fő ágens ` +
    'PULL modellben dolgozik, a saját bejövő sorát minden körben leszívja, tehát a sor a ' +
    'következő körig pending marad. Ne küldd újra és ne indíts semmit: a fő ágenst nem a ' +
    'POST /api/agents/<nev>/start indítja. Ha órák óta semmi nem mozdul, az a channels ' +
    'session ügye, nem a küldésé.'
  )
}
