// GG fork: input selection for the nightly daily digest (runDailyDigest).
//
// Upstream picks the digest input with getMemoriesForChat(chatId, 50), which
// filters on chat_id only. On a fleet install every sub-agent that works for
// the same owner writes its memories under the SAME Telegram chat_id, so the
// main agent's digest summarised the whole fleet's day as its own (measured
// 2026-11-15 on the GG install: the owner's chat holds rows from seven agents;
// 13 wrong digests between 2026-10-26 and 2026-11-15, card #1225). The query
// also ordered by accessed_at with a LIMIT 50 and filtered the 24h window
// afterwards, so a busy day could drop the agent's own fresh rows in favour of
// recently *read* old ones.
//
// This selector keeps the chat_id scope, adds agent_id, applies the time
// window in SQL, skips earlier digests and retracted rows, and returns the
// newest `limit` rows in chronological order.
import { getDb, type Memory } from '../db.js'

const DIGEST_PREFIX = '[Napi naplo '

export function getDigestInputMemories(
  chatId: string,
  agentId: string,
  sinceSec: number,
  limit = 80,
): Memory[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM memories
        WHERE chat_id = ? AND agent_id = ? AND created_at >= ?
          AND retracted_at IS NULL
          AND substr(content, 1, ${DIGEST_PREFIX.length}) != ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
    )
    .all(chatId, agentId, sinceSec, DIGEST_PREFIX, limit) as Memory[]
  // Newest rows win the cap; the digest prompt reads them oldest first.
  return rows.reverse()
}
