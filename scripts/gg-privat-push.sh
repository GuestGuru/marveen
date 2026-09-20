#!/usr/bin/env bash
# A privat tukor-repo (GuestGuru/gg-agent-skills) push-a EGY lepesben.
#
# MIERT LETEZIK (merve 2026-09-20, brokermarcsi jelzesere): a push es a zaro
# `update-ref` ket kulon parancs volt, es a masodik egyetlen napon HAROMSZOR
# maradt ki egymas utan. Az URL-es push sosem frissiti a tracking-refet, tehat
# utana a lokalis `origin/main` hazudik -- nem nekem, hanem MINDENKINEK, aki a
# repot olvassa. A tarsagensek nagy reszenek nincs fetch-utja, tehat a tavoli
# fejet a maga erejebol meg sem tudja nezni: nekik ez a ref AZ EGYETLEN forras.
#
# A ket lepes ezert itt EGY parancs, es kulon nem lehet elfelejteni. Az
# `ls-remote` amugy is lefut a visszaigazolashoz, tehat nincs extra koltsege.
#
# Hasznalat:  bash scripts/gg-privat-push.sh [<ellenorzendo-sha> ...]
set -euo pipefail

REPO="${GG_PRIVATE_SKILLS:-$HOME/gg-agent-skills}"
URL="https://x-access-token@github.com/GuestGuru/gg-agent-skills.git"
TOKEN_FILE="${GG_MCP_TOKEN_FILE:-}"
LABEL="${GG_MCP_AGENT_LABEL:-}"
PROXY="${GG_MCP_PROXY:-$HOME/gg-mcp/dist/proxy.js}"

# Az identitas a HIVOE. Sajat token, sajat label -- idegen token JOGCSERE.
if [ -z "$TOKEN_FILE" ] || [ -z "$LABEL" ]; then
  if [ -f "$PWD/.mcp.json" ]; then
    TOKEN_FILE="${TOKEN_FILE:-$(python3 -c "import json;d=json.load(open('.mcp.json'));print(d['mcpServers']['gg-access']['env']['GG_MCP_TOKEN_FILE'])" 2>/dev/null || true)}"
    LABEL="${LABEL:-$(python3 -c "import json;d=json.load(open('.mcp.json'));print(d['mcpServers']['gg-access']['env']['GG_MCP_AGENT_LABEL'])" 2>/dev/null || true)}"
  fi
fi
[ -n "$TOKEN_FILE" ] || { echo "HIBA: nincs GG_MCP_TOKEN_FILE (add meg kezzel, a SAJATODAT)" >&2; exit 1; }
[ -n "$LABEL" ]      || { echo "HIBA: nincs GG_MCP_AGENT_LABEL (add meg kezzel, a SAJATODAT)" >&2; exit 1; }
[ -f "$PROXY" ]      || { echo "HIBA: nincs meg a gg-mcp proxy: $PROXY" >&2; exit 1; }

SP="$(mktemp -d)"; trap 'rm -rf "$SP"' EXIT
printf '#!/bin/sh\nprintf "%%s\\n" "$GITHUB_TOKEN"\n' > "$SP/askpass.sh"; chmod 700 "$SP/askpass.sh"
run() { GG_MCP_TOKEN_FILE="$TOKEN_FILE" GG_MCP_AGENT_LABEL="$LABEL" \
  node "$PROXY" exec --alias github -- \
  sh -c "GIT_ASKPASS=$SP/askpass.sh GIT_TERMINAL_PROMPT=0 $1"; }

echo "== 1. push"
run "git -C '$REPO' push '$URL' HEAD:refs/heads/main" 2>&1 | grep -v '^gg-mcp-proxy exec:' || true

echo "== 2. tavoli SHA MERESE (nem a push kimenete a bizonyitek)"
REMOTE="$(run "git -C '$REPO' ls-remote '$URL' main" 2>/dev/null | awk '{print $1}')"
[ -n "$REMOTE" ] || { echo "HIBA: az ls-remote nem adott SHA-t, a ref NEM frissul" >&2; exit 1; }
echo "   tavoli main: $REMOTE"

echo "== 3. ZARO LEPES: a tracking-ref a MERT ertekre"
git -C "$REPO" update-ref refs/remotes/origin/main "$REMOTE"
echo "   origin/main: $(git -C "$REPO" rev-parse origin/main)"

echo "== 4. ellenorzes"
git -C "$REPO" merge-base --is-ancestor "$(git -C "$REPO" rev-parse HEAD)" "$REMOTE" \
  && echo "   HEAD FENT" || { echo "   HIBA: a HEAD NINCS fent" >&2; exit 1; }
for sha in "$@"; do
  git -C "$REPO" merge-base --is-ancestor "$sha" "$REMOTE" \
    && echo "   $sha FENT" || echo "   $sha NINCS"
done
