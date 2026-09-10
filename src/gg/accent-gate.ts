// GG fork: accent gate for Hungarian outgoing text on the inter-agent path.
//
// WHY HERE AND NOT ONLY IN THE HELPER: the gate first shipped in
// scripts/agent-msg.sh (2026-09-10), and that was the wrong layer. Measured the
// same day: none of the six sub-agents calls that helper -- all six CLAUDE.md
// files POST to /api/messages with raw curl -- so the helper guarded exactly one
// sender out of nine. POST /api/messages is the convergence point: every sender
// passes through it whatever tool they use, so the check belongs here.
//
// SOURCE OF TRUTH for the thresholds and the word lists is
// ~/.claude/skills/fleet-helper/scripts/fleet.py (the same detector the mem-save
// and daily-log paths use). This is a faithful port, not a new heuristic. If the
// two ever disagree, fleet.py wins and this file is the bug. Parity was measured
// against it over the whole agent_messages corpus before shipping (2026-09-10,
// n=1090 rows): identical whole-text verdict AND identical sentence count on every
// row, so the port is not a second opinion.
//
// WHAT THE NUMBERS MEAN (measured by salesninja 2026-09-09, n=47 log entries +
// n=173 messages): corrupted Hungarian text sits at 0.00-0.13 accents per 100
// characters, healthy text at 5.66-11.36. The 2.0 threshold is the middle of a
// 60x gap, so it neither false-alarms nor lets text through. A plain "zero
// accents" test would be too weak: two corrupted entries kept a single accent,
// probably inside a proper noun, and would have passed.
//
// TWO CAUSES, ONLY ONE OF WHICH ANY GATE CAN FIX (fleet.py's own framing):
//   (a) the WRITING PATH -- shell-embedded printf / python -c / $(...), where the
//       author avoids anything that breaks quoting and the accents leave with the
//       apostrophes. The helper's STDIN + json.dumps already closes this.
//   (b) the REGISTER OF THE WORKING MATERIAL -- the text is BORN without accents,
//       because the surrounding material is ASCII (identifiers, paths, measured
//       numbers). No transport fixes this: only counting before it goes out.
// Measured on this fleet 2026-09-10 (n=1064 inter-agent messages, nine senders):
// the hits are session-shaped, not per-agent. The main agent's 191 hits fall into
// 35 clusters, the largest being a single broadcast to six agents -- one badly
// registered composition that spoiled 39 messages. Per-sender percentages range
// from 0% to 97% across days, so they rank sessions, never agents.
//
// DELIBERATELY NOT PORTED: fleet.py's worst_paragraph(). That one is for auditing
// a STORED corpus, where a half-fixed entry hides a corrupted body behind an
// accented closing. The sentence-level check below covers the same shape for a
// single outgoing message, and it is the pair the helper uses, so the two layers
// agree.
//
// NEVER BLOCKS and never throws. Correct text must never be stopped, and a bug in
// a cosmetic check must never break the message path.

const HU_ACCENTS = new Set('áéíóöőúüűÁÉÍÓÖŐÚÜŰ'.split(''))

/** Frequent Hungarian words that survive accent loss -- the corrupted text has to
 *  still look Hungarian to us, otherwise we would wave through what we are hunting. */
const HU_HINTS = [
  ' hogy ', ' nem ', ' egy ', ' meg ', ' volt ', ' ami ', ' mint ',
  ' csak ', ' ezert ', ' ez a ', ' az a ', ' lett ', ' tehat ',
]

const ACCENT_MIN_PER_100 = 2.0
const ACCENT_MIN_LEN = 200
const SENTENCE_MIN_LEN = 120
/** Below this many Hungarian characters the narrowed ratio has no opinion. */
const HU_NARROW_MIN_LEN = 120
/** A sentence counts as Hungarian at or above this share of function words. */
const HU_FUNC_MIN_SHARE = 4.0

const HU_FUNC = new Set([
  'hogy', 'nem', 'egy', 'meg', 'volt', 'ami', 'amit', 'csak', 'ezert',
  'tehat', 'lett', 'lesz', 'kell', 'mert', 'mar', 'igy', 'ezt', 'azt',
  'ez', 'ha', 'vagy', 'es', 'de', 'mint', 'van', 'nincs', 'sem',
])

const SENT_RE = /[^.!?\n]+[.!?]?/g
const WORD_RE = /[0-9a-zA-Z\u00C0-\u017F]+/g   // same class as fleet.py's [0-9a-zA-Z\u00c0-\u017f]

function countAccents(s: string): number {
  let n = 0
  for (const ch of s) if (HU_ACCENTS.has(ch)) n++
  return n
}

function sentences(text: string): string[] {
  return text.match(SENT_RE) ?? []
}

function words(sentence: string): string[] {
  return (sentence.match(WORD_RE) ?? []).map((w) => w.toLowerCase())
}

/** Accents per 100 characters over the HUNGARIAN-LOOKING sentences only, plus how
 *  many characters that was. ratio is null when there is too little Hungarian text
 *  to have an opinion.
 *
 *  WHY THIS EXISTS (brokermarcsi, 2026-09-09): a bilingual message (Hungarian frame
 *  around an English draft) dilutes the whole-text ratio -- 3.04 overall, 6.42 on the
 *  Hungarian part. The DECISION still uses the whole-text ratio, because over the full
 *  corpus (1416 rows) the narrowed one differs on 3 rows and all three are partly
 *  fixed entries. The narrowed number goes into the WARNING so whoever gets one can
 *  see at a glance whether bilingualism is the cause. */
export function hungarianRatio(text: string): { ratio: number | null; huLen: number } {
  const hu: string[] = []
  for (const sent of sentences(text)) {
    const ws = words(sent)
    if (ws.length === 0) continue
    const hits = ws.filter((w) => HU_FUNC.has(w)).length
    if (hits > 0 && (hits * 100.0) / ws.length >= HU_FUNC_MIN_SHARE) hu.push(sent)
  }
  const joined = hu.join('')
  if (joined.length < HU_NARROW_MIN_LEN) return { ratio: null, huLen: joined.length }
  return { ratio: (countAccents(joined) * 100.0) / joined.length, huLen: joined.length }
}

/** Hungarian-looking sentences over SENTENCE_MIN_LEN with ZERO accents.
 *
 *  WHY THE WHOLE-TEXT RATIO IS NOT ENOUGH (jean, 2026-09-09): the commonest hiding
 *  shape is not the fully unaccented text but the HALF-FIXED one -- a careful,
 *  accented closing on an old unaccented body. The average then climbs over 2.0 and
 *  the gate goes quiet; the more careful the closing, the cleaner the corruption
 *  looks. Measured over the full corpus, the two methods COMPLEMENT each other:
 *  3 rows only the sentence check finds, 3 rows only the ratio finds. */
export function zeroAccentSentences(text: string): string[] {
  const out: string[] = []
  for (const sent of sentences(text ?? '')) {
    if (sent.length < SENTENCE_MIN_LEN) continue
    const ws = words(sent)
    if (ws.length < 5) continue
    if (ws.filter((w) => HU_FUNC.has(w)).length < 2) continue
    if (countAccents(sent) === 0) out.push(sent)
  }
  return out
}

/** The whole-text verdict, or null when there is nothing to say. */
export function accentWarning(text: string): string | null {
  if (!text || text.length < ACCENT_MIN_LEN) return null
  const low = ' ' + text.toLowerCase().split(/\s+/).join(' ') + ' '
  if (HU_HINTS.filter((h) => low.includes(h)).length < 2) return null
  const n = countAccents(text)
  const per100 = (n * 100.0) / text.length
  if (per100 >= ACCENT_MIN_PER_100) return null
  const { ratio, huLen } = hungarianRatio(text)
  let huNote: string
  if (ratio === null) {
    huNote = ` A magyar mondatokra szűkített rész csak ${huLen} karakter, ahhoz kevés, hogy külön véleménye legyen.`
  } else if (ratio >= ACCENT_MIN_PER_100) {
    huNote =
      ` DE a magyar mondatokra szűkítve ${ratio.toFixed(2)}/100 (${huLen} karakter), ami rendben van:` +
      ' valószínűleg kétnyelvű szöveg (angol blokk hígítja az arányt), nem hiba.'
  } else {
    huNote = ` A magyar mondatokra szűkítve is csak ${ratio.toFixed(2)}/100 (${huLen} karakter), tehát nem a kétnyelvűség az ok.`
  }
  return (
    `ékezet-gyanú: ${text.length} karakter, ${n} ékezet (${per100.toFixed(2)}/100, küszöb ${ACCENT_MIN_PER_100.toFixed(1)}).` +
    ' A szöveg magyarnak látszik, de szinte nincs benne ékezet.' +
    huNote
  )
}

/** The single line the API hands back to the sender, or null when the text is fine.
 *
 *  The union of the two checks, exactly as scripts/agent-msg.sh uses them, so the
 *  helper and the endpoint cannot disagree about whether a message is suspect.
 *  The message is ALREADY STORED when this is computed -- that is deliberate: a
 *  cosmetic check must not be able to reject a message. The sender can only fix it
 *  by sending again, so the line says so. */
export function accentGateNote(text: string): string | null {
  try {
    const parts: string[] = []
    const whole = accentWarning(text)
    if (whole) parts.push(whole)
    const zs = zeroAccentSentences(text)
    if (zs.length > 0) {
      parts.push(
        `${zs.length} ékezet nélküli magyar mondat. Első: ${zs[0].trim().slice(0, 120)}`,
      )
    }
    if (parts.length === 0) return null
    return (
      'FIGYELEM: ' +
      parts.join(' | ') +
      ' Az üzenet elment és a címzettnél nem szerkeszthető: ha ez hiba, küldd újra ékezettel,' +
      ' és mondd meg, melyik üzenetet váltja.'
    )
  } catch {
    return null
  }
}
