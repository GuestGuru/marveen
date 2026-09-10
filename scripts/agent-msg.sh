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
#   large / multi-line content may come from STDIN when the 3rd arg is "-":
#     echo "<long text>" | bash scripts/agent-msg.sh <from> <to> -
# Output: success -> "OK id=<n>"; failure -> "FAIL <reason>" + a line in store/agent-msg-failures.log, exit 1.
# Env: MARVEEN_WEB_PORT (default 3420), FLEET_HELPER_PY (ekezet-kapu, GG fork -- lasd alabb).
set -uo pipefail

# base dir = the parent of this script's dir (scripts/..), so it works from any CWD / any install
BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${MARVEEN_WEB_PORT:-3420}"
TOKEN_FILE="$BASE/store/.dashboard-token"
URL="http://localhost:${PORT}/api/messages"
LOG="$BASE/store/agent-msg-failures.log"
ACCENT_LOG="$BASE/store/agent-msg-accent.log"   # GG fork: ekezet-kapu utolagos nyoma

FROM="${1:?from required}"; TO="${2:?to required}"; C="${3:?content required (or - for STDIN)}"
FROM_STDIN=0
if [ "$C" = "-" ]; then C="$(cat)"; FROM_STDIN=1; fi

# GG fork: CSONKULAS-GYANU az argv-uton. A shell a script ELOTT fejti ki az
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
[ -r "$TOKEN_FILE" ] || { echo "FAIL: no token file at $TOKEN_FILE"; exit 1; }
TOKEN="$(cat "$TOKEN_FILE")"

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
  ID="$(printf '%s' "$JSON" | python3 -c 'import sys,json
try:
  d=json.load(sys.stdin); print(d.get("id","") if isinstance(d,dict) else "")
except Exception:
  print("")' 2>/dev/null)"
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
    echo "OK id=$ID"; exit 0
  fi
  sleep 1
done
echo "FAIL from=$FROM to=$TO http=${CODE:-?} id='$ID' (after $max tries)"
printf '%s\tFAIL\tfrom=%s\tto=%s\thttp=%s\tresp=%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$FROM" "$TO" "${CODE:-?}" "$(printf '%s' "${JSON:-}" | head -c 200)" >> "$LOG" 2>/dev/null || true
exit 1
