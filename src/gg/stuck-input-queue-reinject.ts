// GG fork: authoritative recovery for a head-lost inter-agent frame parked in
// a Claude TUI input box.
//
// THE GAP THIS CLOSES (measured 2026-08-12 14:51-14:53 on agent-jean).
// salesninja handed a 911-character SAL-455 briefing to jean. The router
// delivered it, the TUI parked it without submitting, and the stuck-input
// watcher escalated five times and then gave up with
// "Stuck input -- multi-row/truncated, holding (no bare-Enter; awaiting
// keystroke fix)". The pane sat wedged until a human sent one Enter by hand.
//
// Why every existing move was unavailable:
//   - The box is taller than the visible rows, so the TUI renders only its
//     TAIL. parkedInputText() scrapes what is VISIBLE, hence a fragment.
//   - The frame head ("[Uzenet @salesninja-tol ... msg_id:138]:") scrolled
//     off, so parkedMachineOriginInput() saw no anchored prefix and no
//     truncated-marker -> machineOrigin=false -> reinject-plain was refused
//     (correctly: an uncertain park may be a human draft).
//   - A bare Enter is forbidden on a multi-row box (it can insert a newline
//     instead of submitting), so decideStuckInputAction() fell to 'hold'.
//   - Re-injecting the SCRAPE would deliver a head-lost fragment -- the exact
//     corruption STUCKINPUT805 documents. Refusing that is right.
//
// The fix is to stop reading the screen. The full text is in the queue: the
// router logged the row it delivered into this very pane. If the visible tail
// is the END of a recently delivered message's rendered frame, we re-inject
// that DB row rebuilt through the SAME single-source wrapper the router uses
// (classifyAgentMessage + wrapAgentMessageForDelivery) -- so the untrusted
// framing, the msg_id and the preamble are byte-identical to the original
// delivery, and nothing is reconstructed from pixels.
//
// The tail match doubles as the origin proof that machineOrigin could not
// supply: text that ends exactly like a message the router delivered to this
// agent minutes ago is not a human's hand-typed draft. That is why this is
// also safe on the MAIN session, where allowPlainReinject is false.
import { getDb } from '../db.js'
import { logger } from '../logger.js'
import { MAIN_AGENT_ID } from '../config.js'
import { classifyAgentMessage, wrapAgentMessageForDelivery } from '../web/agent-message-wrap.js'
import { clearInputBuffer, sendPromptToSession } from '../web/agent-process.js'
import { withSessionSendLock } from '../web/session-send-lock.js'
import { channelsSessionName } from '../web/main-agent.js'

/** How far back a delivered row may be and still explain a parked box. */
export const QUEUE_REINJECT_LOOKBACK_MS = 30 * 60 * 1000

/** Newest N delivered rows considered for one recovery attempt. */
export const QUEUE_REINJECT_CANDIDATES = 10

/**
 * Shortest visible tail accepted as a match.
 *
 * A short tail is ambiguous: several messages can end with "Koszonom." and
 * matching the wrong row would re-inject the wrong briefing. 48 normalized
 * characters is well past any boilerplate sign-off while still far below the
 * ~300+ characters even a two-row box shows.
 */
export const QUEUE_REINJECT_MIN_TAIL = 48

export interface QueuedFrame {
  /** agent_messages.id -- the row whose rendered frame is parked. */
  id: number
  from: string
  /** The exact prefix+wrapped text the router injected for this row. */
  text: string
}

interface DeliveredRow {
  id: number
  from_agent: string
  to_agent: string
  content: string
  origin_note: string | null
}

/**
 * Terminal-wrap normalization, matching parkedInputText()'s collapse so a
 * screen scrape and a DB string are compared on equal terms. The TUI breaks
 * lines at the pane width and indents continuations, which turns single
 * spaces into newline+indent; collapsing every whitespace run to one space
 * makes the two representations comparable.
 */
export function normalizeParkedText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Is `parkedTail` the end of `delivered`?
 *
 * Deliberately an endsWith, not a similarity score: the visible box always
 * ends where the buffer ends, so a genuine match is exact after
 * normalization. Anything fuzzier would risk re-injecting a DIFFERENT message
 * than the one parked.
 */
export function deliveredEndsWithParkedTail(
  delivered: string,
  parkedTail: string,
  minTail = QUEUE_REINJECT_MIN_TAIL,
): boolean {
  const tail = normalizeParkedText(parkedTail)
  if (tail.length < minTail) return false
  const full = normalizeParkedText(delivered)
  if (tail.length > full.length) return false
  return full.endsWith(tail)
}

/**
 * Rebuild the exact text the router injected for a queue row. Returns null
 * when the sender no longer classifies (a from_agent that sanitizes to empty
 * must never be wrapped -- same contract as the router).
 */
export function renderDeliveredFrame(row: DeliveredRow): string | null {
  const cls = classifyAgentMessage(row.from_agent, row.to_agent)
  if (!cls) return null
  const { prefix, wrapped } = wrapAgentMessageForDelivery(
    cls.category,
    cls.safeFrom,
    row.from_agent,
    row.content,
    row.id,
    row.origin_note,
  )
  return prefix + wrapped
}

/**
 * Recently delivered, not-yet-completed rows for `agent`, newest first.
 *
 * status='delivered' is the whole point: 'pending' has not reached the pane
 * yet, and 'done'/'failed' were already processed, so neither can be what is
 * wedged in the box right now.
 */
export function recentDeliveredRows(
  agent: string,
  now: number,
  lookbackMs = QUEUE_REINJECT_LOOKBACK_MS,
  limit = QUEUE_REINJECT_CANDIDATES,
): DeliveredRow[] {
  const cutoff = Math.floor((now - lookbackMs) / 1000)
  return getDb()
    .prepare(
      `SELECT id, from_agent, to_agent, content, origin_note
         FROM agent_messages
        WHERE to_agent = ? AND status = 'delivered'
          AND COALESCE(delivered_at, created_at) >= ?
        ORDER BY COALESCE(delivered_at, created_at) DESC, id DESC
        LIMIT ?`,
    )
    .all(agent, cutoff, limit) as DeliveredRow[]
}

/**
 * The delivered row whose rendered frame ends with `parkedTail`, or null.
 *
 * Newest-first with a first-match return: when the same message is delivered
 * twice, the later row is the one in the box.
 */
export function findQueuedFrameForParkedTail(
  agent: string,
  parkedTail: string,
  now: number = Date.now(),
  lookbackMs = QUEUE_REINJECT_LOOKBACK_MS,
): QueuedFrame | null {
  if (normalizeParkedText(parkedTail).length < QUEUE_REINJECT_MIN_TAIL) return null
  for (const row of recentDeliveredRows(agent, now, lookbackMs)) {
    const text = renderDeliveredFrame(row)
    if (text == null) continue
    if (deliveredEndsWithParkedTail(text, parkedTail)) {
      return { id: row.id, from: row.from_agent, text }
    }
  }
  return null
}

/**
 * Which agent owns a tmux session: the main agent runs in
 * `${MAIN_AGENT_ID}-channels`, sub-agents in `agent-<name>`. Pure so the
 * derivation is provable for any id, and null for anything else (a session
 * this recovery has no business touching).
 */
export function agentForSession(session: string, mainAgentId: string = MAIN_AGENT_ID): string | null {
  if (session === channelsSessionName(mainAgentId)) return mainAgentId
  const sub = /^agent-(.+)$/.exec(session)
  return sub ? sub[1] : null
}

/**
 * Clear the wedged box and re-inject the authoritative frame.
 *
 * Runs as ONE 'recover'-mode critical section for the same reason
 * reinject-block does (DELIVLOCK805): clear+re-inject mutates the input box,
 * so it must not race a live delivery into this pane. A skipped lane is not a
 * failure -- the next watcher tick retries within the attempts budget.
 *
 * Returns true when the re-inject ran, false when it was skipped.
 */
export async function reinjectQueuedFrame(session: string, frame: QueuedFrame): Promise<boolean> {
  const res = await withSessionSendLock(session, null, 'recover', async () => {
    await clearInputBuffer(session)
    await sendPromptToSession(session, frame.text, null, { lockMode: 'held' })
  })
  if (!res.ran) {
    logger.info(
      { session, msgId: frame.id },
      'Stuck-input recovery (reinject-queued) skipped: a delivery is in flight into this pane (fail-closed)',
    )
    return false
  }
  logger.warn(
    { session, msgId: frame.id, from: frame.from },
    'Stuck input -- head-lost inter-agent frame, re-injected from the message queue (authoritative, not the screen scrape)',
  )
  return true
}

/**
 * Last-resort move for a parked box the upstream decision left on 'hold'.
 *
 * Called ONLY from the 'hold' branch, so it can never pre-empt a move the
 * upstream logic considers safe -- it converts a dead end (wedged until a
 * human presses Enter) into a recovery, and returns false to leave the
 * original 'hold' behaviour untouched whenever the queue cannot explain the
 * parked text.
 */
export async function tryQueuedFrameRecovery(
  session: string,
  parkedTail: string | null,
  now: number = Date.now(),
): Promise<boolean> {
  if (parkedTail == null) return false
  const agent = agentForSession(session)
  if (agent == null) return false
  let frame: QueuedFrame | null = null
  try {
    frame = findQueuedFrameForParkedTail(agent, parkedTail, now)
  } catch (err) {
    // A failing lookup must never break the recovery tick: without this the
    // watcher would throw out of its loop and stop recovering EVERY session,
    // trading one wedged pane for all of them.
    logger.warn({ err, session, agent }, 'Stuck-input queue lookup failed; falling back to hold')
    return false
  }
  if (frame == null) return false
  return reinjectQueuedFrame(session, frame)
}
