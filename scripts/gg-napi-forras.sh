#!/bin/bash
# GG fork: fetch today's calendar + last 24h inbox for the morning briefing.
#
# Why this exists (2026-08-11): four separate morning briefings skipped the
# email/calendar sections with "the Gmail and Calendar tools are not available
# in this session". That reading is correct but the conclusion was wrong -- there
# never were gg_gmail_* / gg_calendar_* MCP tools. The `google-olvasas` pack
# hands out KEYS (google-gmail-ro, google-calendar-ro), and the Google API is
# called directly through the proxy. The SKILL.md said so, in prose, and it still
# happened four times -- so the command moves out of the model's memory and into
# a script it just runs.
#
# The key never enters the conversation: gg-mcp-proxy puts it in the child
# process env. Read-only scopes.
#
# Usage:  bash scripts/gg-napi-forras.sh            # both sections
#         bash scripts/gg-napi-forras.sh naptar     # calendar only
#         bash scripts/gg-napi-forras.sh email      # inbox only
#
# Exit 0 even when a section fails -- the briefing must not die on one bad leg;
# the failure is printed instead, so it can be reported honestly.

set -uo pipefail

TOKEN_FILE="${GG_MCP_TOKEN_FILE:-/home/gg/gg-mcp/tokens/marveen.token}"
PROXY="/home/gg/gg-mcp/dist/proxy.js"
WHAT="${1:-mind}"
TODAY="$(date +%F)"

run_proxy() {  # $1 = alias, $2 = shell command using the injected env var
  GG_MCP_TOKEN_FILE="$TOKEN_FILE" GG_MCP_AGENT_LABEL="marveen/Marveen" \
    node "$PROXY" exec --alias "$1" -- sh -c "$2" 2>&1 | grep -v '^gg-mcp-proxy exec:'
}

naptar() {
  echo "=== NAPTAR ($TODAY) ==="
  run_proxy google-calendar-ro \
    "curl -s -H \"Authorization: Bearer \$GOOGLE_CALENDAR_RO_ACCESS_TOKEN\" \
     'https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${TODAY}T00:00:00%2B02:00&timeMax=${TODAY}T23:59:59%2B02:00&singleEvents=true&orderBy=startTime&prettyPrint=false'" \
  | python3 -c "
import json,sys
raw=sys.stdin.read(); i=raw.find('{')
if i < 0: print('  HIBA: nem jott JSON valasz'); sys.exit(0)
try: d=json.loads(raw[i:])
except Exception as e: print('  HIBA:', e); sys.exit(0)
if 'error' in d: print('  HIBA:', d['error'].get('message')); sys.exit(0)
items=d.get('items',[])
if not items: print('  (nincs mai esemeny)')
for e in items:
    s=e.get('start',{}); en=e.get('end',{})
    t  = s.get('dateTime','')[11:16] if s.get('dateTime') else 'egesz nap'
    t2 = en.get('dateTime','')[11:16] if en.get('dateTime') else ''
    print(f\"  {t}{'-'+t2 if t2 else ''}  {e.get('summary','(nincs cim)')}\")
"
}

email() {
  echo "=== EMAIL (24 ora, spam/promo nelkul) ==="
  # Two calls: the list endpoint returns ids only, metadata needs one GET each.
  # Both run inside ONE proxy exec so the key is handed out once.
  run_proxy google-gmail-ro '
    IDS=$(curl -s -H "Authorization: Bearer $GOOGLE_GMAIL_RO_ACCESS_TOKEN" \
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=newer_than:1d%20-in:spam%20-category:promotions&maxResults=20&prettyPrint=false" \
      | tr "," "\n" | grep -o "\"id\":\"[^\"]*\"" | cut -d"\"" -f4)
    for id in $IDS; do
      curl -s -H "Authorization: Bearer $GOOGLE_GMAIL_RO_ACCESS_TOKEN" \
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/$id?format=metadata&metadataHeaders=From&metadataHeaders=Subject&prettyPrint=false"
      echo
    done' \
  | python3 -c "
import json,sys
n=0
for line in sys.stdin:
    line=line.strip()
    if not line.startswith('{'): continue
    try: d=json.loads(line)
    except Exception: continue
    if 'error' in d:
        print('  HIBA:', d['error'].get('message')); continue
    h={x['name']:x['value'] for x in d.get('payload',{}).get('headers',[])}
    n+=1
    print(f\"  {h.get('From','')[:44]:46} | {h.get('Subject','(nincs targy)')[:65]}\")
if n==0: print('  (nincs level, VAGY a lekeres nem adott vissza semmit -- nezd meg a nyers kimenetet)')
else: print(f'  osszesen: {n}')
"
}

case "$WHAT" in
  naptar)  naptar ;;
  email)   email ;;
  *)       naptar; echo; email ;;
esac
exit 0
