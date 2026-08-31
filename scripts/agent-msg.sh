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
# Env: MARVEEN_WEB_PORT (default 3420).
set -uo pipefail

# base dir = the parent of this script's dir (scripts/..), so it works from any CWD / any install
BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${MARVEEN_WEB_PORT:-3420}"
TOKEN_FILE="$BASE/store/.dashboard-token"
URL="http://localhost:${PORT}/api/messages"
LOG="$BASE/store/agent-msg-failures.log"

FROM="${1:?from required}"; TO="${2:?to required}"; C="${3:?content required (or - for STDIN)}"
[ "$C" = "-" ] && C="$(cat)"
[ -r "$TOKEN_FILE" ] || { echo "FAIL: no token file at $TOKEN_FILE"; exit 1; }
TOKEN="$(cat "$TOKEN_FILE")"

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
  if { [ "$CODE" = "200" ] || [ "$CODE" = "201" ]; } && [ -n "$ID" ]; then
    echo "OK id=$ID"; exit 0
  fi
  sleep 1
done
echo "FAIL from=$FROM to=$TO http=${CODE:-?} id='$ID' (after $max tries)"
printf '%s\tFAIL\tfrom=%s\tto=%s\thttp=%s\tresp=%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$FROM" "$TO" "${CODE:-?}" "$(printf '%s' "${JSON:-}" | head -c 200)" >> "$LOG" 2>/dev/null || true
exit 1
