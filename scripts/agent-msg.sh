#!/usr/bin/env bash
# agent-msg.sh -- reliable inter-agent message send for the Marveen fleet.
#
# WHY: the common `curl -s ... >/dev/null && echo sent` pattern is DANGEROUS -- curl exits 0 even when
# the server REJECTED the request (401/400/5xx), producing a SILENT send failure: the recipient never
# gets the message and two agents can wait on each other forever. The /api/messages router itself is
# fine (HTTP 200 + a message id); the bug is that the SENDER never checks the result. This helper checks
# the HTTP status AND the returned message id, and RETRIES on failure. A message counts as sent only
# when an id came back.
#
# Usage:  bash scripts/agent-msg.sh <from> <to> "<content>"
#   content: plain text (quotes / newlines OK) -- the body is built with json.dumps, so the JSON side
#   has no quoting pitfalls. The SHELL side does, and it fails SILENTLY:
#
#   WARNING: inside a double-quoted argument the shell expands `backticks`, $VAR and $(...) BEFORE this
#   script ever sees the text. A message full of `path/to/file` markdown then arrives with holes where
#   the paths were -- and the send still reports "OK id=<n>", because the transport worked perfectly.
#   Measured 2026-08-31 (msg 249): every backticked path vanished from a message to another agent, and
#   only re-reading the stored row revealed it. Prefer STDIN with a QUOTED heredoc for anything
#   containing backticks, $ or code:
#     cat <<'EOF' | bash scripts/agent-msg.sh <from> <to> -
#     ... text with `backticks` and $vars kept verbatim ...
#     EOF
#   (The quoted 'EOF' is what disables expansion; an unquoted EOF re-opens the same hole.)
#
#   NOT BYTE-FAITHFUL, and not meant to be: `C="$(cat)"` strips TRAILING NEWLINES, so every
#   message sent through this helper loses them (the endpoint's own content.trim() would do the
#   same, but the helper gets there first -- measured 2026-09-10 with a staged probe: 10000
#   characters with no trailing newline store as 10000, the same text with one stores as 9999).
#   For prose this is nothing. For a code fragment, a file excerpt, or anything where trailing
#   whitespace carries meaning, the content changes SILENTLY and the send still reports OK.
#   jean's conclusion, and the right one: not a bug to fix, because this channel carries
#   MESSAGES, not data. If you need to move bytes, write a file and send the path.
#   large / multi-line content may come from STDIN when the 3rd arg is "-":
#     echo "<long text>" | bash scripts/agent-msg.sh <from> <to> -
# Output: success -> "OK id=<n>"; failure -> "FAIL <reason>" + a line in store/agent-msg-failures.log, exit 1.
#
# LOG FORMAT, store/agent-msg-failures.log (tab-separated, one line per failure):
#   <YYYY-MM-DD HH:MM:SS>  FAIL  from=<a>  to=<b>  url=<endpoint>  http=<code>  resp=<first 200 bytes>
# CHANGED 2026-09: the `url=` field is NEW. It was added together with the
# env-overridable base URL, because from that point a failure can mean "posted to
# the wrong address" and the old line could not distinguish that from a dead
# server. A parser written against the pre-2026-09 format sees one extra field;
# parse by the `key=` names, not by position.
# Env:
#   MARVEEN_API_BASE   full base URL, e.g. https://marveen.example.com (overrides host+port)
#   MARVEEN_WEB_PORT   port for the default localhost base (default 3420)
#   MARVEEN_TOKEN_FILE bearer token file (default <repo>/store/.dashboard-token)
#   MARVEEN_HOMOGLYPH_BIN  the checker (default <repo>/scripts/lib/homoglyph.py)
#   FLEET_HELPER_PY    ekezet-kapu (GG fork -- lasd alabb)
# MEASURED 2026-09-13: a remote agent runs this helper OUTSIDE this repo, where localhost:3420
# does not exist -- it had to fall back to raw curl, i.e. exactly the unchecked pattern this file was
# written to eliminate. A hardcoded base URL silently un-installs the helper for everyone not on this
# VM, so the base is env-overridable and the two endpoints stay ONE script.
set -uo pipefail

# base dir = the parent of this script's dir (scripts/..), so it works from any CWD / any install
BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${MARVEEN_WEB_PORT:-3420}"
API_BASE="${MARVEEN_API_BASE:-http://localhost:${PORT}}"
API_BASE="${API_BASE%/}"
TOKEN_FILE="${MARVEEN_TOKEN_FILE:-$BASE/store/.dashboard-token}"
URL="${API_BASE}/api/messages"
LOG="$BASE/store/agent-msg-failures.log"
ACCENT_LOG="$BASE/store/agent-msg-accent.log"   # GG fork: ekezet-kapu utolagos nyoma

FROM="${1:?from required}"; TO="${2:?to required}"; C="${3:?content required (or - for STDIN)}"
FROM_STDIN=0
if [ "$C" = "-" ]; then C="$(cat)"; FROM_STDIN=1; fi

[ -r "$TOKEN_FILE" ] || { echo "FAIL: no token file at $TOKEN_FILE"; exit 1; }
TOKEN="$(cat "$TOKEN_FILE")"

# --- Homoglyph gate, BEFORE the payload is built (MSGGATE924) --------------
# On the RAW text, not on the JSON: json.dumps escapes a Cyrillic letter into
# \uXXXX, and a checker reading the encoded body would be looking at a string
# where the problem is no longer visible as a letter. The gate has to see what
# the sender typed.
#
# WHY IT IS HERE AND NOT IN EACH AGENT'S TOOLBOX. Measured 2026-09-24 across
# three agents: two had built this guard for themselves, independently, because
# both had been bitten by it; the third had no guard at all. And no CLAUDE.md
# prescribes those private wrappers -- they all name THIS helper. The result was
# predictable in hindsight: the agent who WROTE such a wrapper spent a whole day
# calling this script directly, with the check run beside it in a separate
# command instead of in front of it. One message went out contaminated while the
# checker printed "NEM KULDOM EL" next to it. The rule that needs remembering is
# not a rule; it has to sit in the path of the action.
#
# FAIL-OPEN ON A MISSING CHECKER, AND LOUDLY -- a deliberate exception to the
# repo's usual fail-closed stance for gates (see .git/hooks/pre-commit.d). This
# helper is the fleet's mandated message route: blocking every inter-agent
# message on an install whose lib file is absent would be a far worse failure
# than the one being prevented, and it would be a NEW failure, not today's. A
# missing checker is exactly today's state, so the honest behaviour is to send
# and say so. Contaminated text with the checker PRESENT is refused, which is
# where the closed direction belongs.
# Overridable so the suite can measure the missing-checker branch too.
HG="${MARVEEN_HOMOGLYPH_BIN:-$BASE/scripts/lib/homoglyph.py}"
if [ -r "$HG" ] && command -v python3 >/dev/null 2>&1; then
  # THE CHECKER IS A VERDICT, NOT A FILTER: what goes out is the text the
  # sender typed, never the checker's stdout. Measured in the 2026-09-24 review
  # of #1541: a checker that exits 0 with EMPTY stdout made this helper send an
  # empty message and report OK -- a broken tool silently replaced the message
  # instead of failing. The exit code is the only thing read here.
  printf '%s' "$C" | python3 "$HG" >/dev/null
  HG_RC=$?
  case "$HG_RC" in
    0) : ;;
    # 3 is the checker's one documented refusal code; anything else is the
    # CHECKER failing, not the text. They must not share a message: "refused"
    # sends the sender to rewrite a word that may be perfectly fine, while a
    # crashed checker is an unmeasured send and the operator's problem.
    3) echo "FAIL: homoglyph gate refused the message; nothing was sent." >&2
       exit 3 ;;
    *) echo "FAIL: homoglyph checker CRASHED (rc=$HG_RC) at $HG; nothing was sent." >&2
       echo "  This is not a verdict on the text -- fix or unset MARVEEN_HOMOGLYPH_BIN." >&2
       exit 4 ;;
  esac
else
  echo "WARN: homoglyph checker not found at $HG -- sending UNCHECKED." >&2
fi

# GG fork: CSONKULAS-GYANU az argv-uton. (A homoglif-kapu UTAN fut, mert a
# figyelmeztetes nyersen idezi az uzenet veget, es egy visszautasitott uzenet
# szennyezett betujet nem szabad a stderr-re kiirni -- upstream MSGGATE924 tesztje.) A shell a script ELOTT fejti ki az
# argumentumot, tehat egy idezojel a szovegben lezarhatja a stringet es a maradek
# elveszik -- a script ebbol semmit nem lat, a POST sikerul, es "OK id=<n>" megy
# vissza fel tartalommal. Ugyanaz a nema kuldes-hiba, ami ellen a helper keszult,
# csak egy szinttel beljebb. Merve 2026-09-10 (salesninja, msg 1076): a szoveg 1303
# karakter utan vagodott el, pontosan ott, ahol egy idezojel kovetkezett volna, es a
# helper OK id=1076-ot irt. NEM a script evalja az argumentumot (nincs benne eval) --
# a hivo shellje eszi meg, ezert a script csak a TUNETRE tud szolni.
# A jelzes kuszobe salesninja meresebol jon (n=1041, 200 karakter feletti uzenet): 20
# nem mondatzaro vegzodes, abbol 9 utvonal vagy URL, 7 alairas, 4 gyanus -- tehat
# ritka es olcso. NEM BLOKKOL: egy heurisztika nem utasithat vissza ep uzenetet.
if [ "$FROM_STDIN" = "0" ]; then
  C="$C" SELF="${BASH_SOURCE[0]}" FROM="$FROM" TO="$TO" python3 - >&2 <<'PYTRUNC' || true
import os
c = (os.environ.get("C") or "").rstrip()
if c and c[-1] not in ".!?:;)\"'\u2019\u201d\u2026":
    print("FIGYELEM: az uzenet argv-rol jott es nem mondatvegen er veget: ..."
          + c[-40:]
          + " | Ha a szoveg idezojelet vagy zarojelet tartalmazott, a HIVO shellje mar"
            " levaghatta, es a kuldes akkor is sikeres lesz, csak fel tartalommal."
            " Biztosabb ut STDIN-rol, IDEZETT heredoc-kal:"
          + "  cat <<'EOF' | bash %s %s %s -" % (os.environ.get("SELF", "agent-msg.sh"),
                                                 os.environ.get("FROM", "<from>"),
                                                 os.environ.get("TO", "<to>")))
PYTRUNC
fi

# GG fork: ekezet-kapu a KIMENO inter-agent uzenetre (nem upstream igeny, a
# fleet-helper skillre tamaszkodik). A fleet-helper mar merte, hogy a magyar szoveg
# ket kulon uton veszti el az ekezeteket (idezojel-kerulo iras, illetve mar ekezet
# nelkul szuletett munkaanyag), es a mem-save / daily-log uton ezert figyelmeztet.
# Az inter-agent ut volt az EGYETLEN orizetlen, pedig ez a flotta legnagyobb magyar
# szovegforgalma. Merve 2026-09-10 (n=1064 uzenet, kilenc kuldo): 309 esik a kapuba,
# ebbol 191 a fo-agens sajat kimenoje (37,5%), es meg aznap is 101-bol 37.
# NEM BLOKKOL, a mem-save-vel azonos szemantikaval: csak stderr-re szol, es a
# kuldes akkor is lefut. Ha a fleet-helper nincs telepitve, a kapu csendben kimarad.
FLEET_PY="${FLEET_HELPER_PY:-$HOME/.claude/skills/fleet-helper/scripts/fleet.py}"
ACCENT_WARN=""
if [ -r "$FLEET_PY" ]; then
  ACCENT_WARN="$(C="$C" FLEET_PY="$FLEET_PY" python3 - <<'PYGATE' 2>/dev/null || true
import os, importlib.util
try:
    spec = importlib.util.spec_from_file_location("fleet_gate", os.environ["FLEET_PY"])
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    t = os.environ.get("C", "")
    out = []
    w = m.accent_warning(t)
    if w:
        out.append(w)
    z = m.zero_accent_sentences(t)
    if z:
        out.append("FIGYELEM: %d ekezet nelkuli magyar mondat a kimeno uzenetben. Elso: %s"
                   % (len(z), z[0].strip()[:120]))
    if out:
        # a fleet.py altalanos tanacsa a memoriara szol (PUT-tal cserelheto); az
        # inter-agent uzenet MAR a cimzett sessionjebe kerult es nem szerkesztheto,
        # tehat itt csak az ujrakuldes javit.
        out.append("Ez inter-agent uzenet: a kuldes lefut, es a cimzettnel NEM "
                   "szerkesztheto. Ha hiba, kuldd ujra ekezettel, es mondd meg, "
                   "melyik uzenetet valtja.")
    print(" | ".join(out))
except Exception:
    pass
PYGATE
)"
  [ -n "$ACCENT_WARN" ] && printf '%s\n' "$ACCENT_WARN" >&2
fi

BODY="$(FROM="$FROM" TO="$TO" C="$C" python3 -c 'import json,os; print(json.dumps({"from":os.environ["FROM"],"to":os.environ["TO"],"content":os.environ["C"]}))')"

attempt=0; max=3; CODE=""; ID=""
while [ "$attempt" -lt "$max" ]; do
  attempt=$((attempt+1))
  RESP="$(curl -s -X POST "$URL" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "$BODY" -w $'\n%{http_code}' 2>/dev/null || true)"
  CODE="$(printf '%s' "$RESP" | tail -n1)"
  JSON="$(printf '%s' "$RESP" | sed '$d')"
  # An id ALONE is not delivery. The router answers 200 WITH an id even when the
  # recipient is not running, and says so in a separate `warning` field
  # (src/web/routes/messages.ts) whose text spells out that such a message is
  # LOST rather than queued. This helper read only the id, so it printed
  # "OK id=..." for a message that never arrived -- the exact failure the header
  # above says it exists to prevent, one field further in. The exit code stays 0
  # on purpose: the row really was accepted, so this is not a send failure. It
  # just must not be silent.
  read -r ID WARN <<EOF
$(printf '%s' "$JSON" | python3 -c 'import sys,json
try:
  d=json.load(sys.stdin)
  if not isinstance(d,dict): d={}
except Exception:
  d={}
w=" ".join(str(d.get("warning","")).split())
print((d.get("id","") or "-"), w)' 2>/dev/null)
EOF
  [ "$ID" = "-" ] && ID=""
  # GG fork: a VEGPONT sajat ekezet-figyelmeztetese a valasz accentWarning mezojeben
  # jon (src/gg/accent-gate.ts). salesninja meresi megjegyzese, 2026-09-10: a helper
  # eddig CSAK az id-t olvasta ki, tehat ezt a mezot eldobta. Normal esetben nem
  # veszteseg, mert a lokalis kapu ugyanazt a detektort futtatja -- DE a lokalis kapu
  # kimarad, ha a fleet-helper nincs telepitve (szandekos, `[ -r "$FLEET_PY" ]`), es
  # akkor a szerver uzenete az EGYETLEN jelzes. Pont a friss, fel-telepitett agensnel
  # harapna. Ha a lokalis kapu mar szolt, nem duplazunk.
  SRV_WARN="$(printf '%s' "$JSON" | python3 -c 'import sys,json
try:
  d=json.load(sys.stdin); print(d.get("accentWarning","") if isinstance(d,dict) else "")
except Exception:
  print("")' 2>/dev/null)"
  if { [ "$CODE" = "200" ] || [ "$CODE" = "201" ]; } && [ -n "$ID" ]; then
    # GG fork: a kapu figyelmeztetese naplozva is, mert a hivo gyakran `2>&1 | tail -2`-vel
    # hivja a scriptet, es akkor a stderr-sor elveszik. Igy utolag is kimutathato.
    if [ -z "${ACCENT_WARN:-}" ] && [ -n "${SRV_WARN:-}" ]; then
      # a lokalis kapu hallgatott (vagy ki sem futott), de a szerver szolt
      ACCENT_WARN="[vegpont] $SRV_WARN"
      printf '%s\n' "$ACCENT_WARN" >&2
    fi
    [ -n "${ACCENT_WARN:-}" ] && printf '%s\tACCENT\tfrom=%s\tto=%s\tid=%s\t%s\n' \
      "$(date '+%Y-%m-%d %H:%M:%S')" "$FROM" "$TO" "$ID" "$ACCENT_WARN" >> "$ACCENT_LOG" 2>/dev/null || true
    if [ -n "${WARN:-}" ]; then
      echo "OK id=$ID  WARNING: $WARN" >&2
      echo "OK id=$ID (warning)"
    else
      echo "OK id=$ID"
    fi
    exit 0
  fi
  sleep 1
done
echo "FAIL from=$FROM to=$TO url=$URL http=${CODE:-?} id='$ID' (after $max tries)"
printf '%s\tFAIL\tfrom=%s\tto=%s\turl=%s\thttp=%s\tresp=%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$FROM" "$TO" "$URL" "${CODE:-?}" "$(printf '%s' "${JSON:-}" | head -c 200)" >> "$LOG" 2>/dev/null || true
exit 1
