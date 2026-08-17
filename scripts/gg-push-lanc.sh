#!/bin/bash
# GG fork: push a local branch out to production through the fork's PR chain.
#
# Why this exists (2026-08-17): the chain is branch -> push -> PR develop ->
# merge -> PR main -> merge -> local ff, and every step of it was being done by
# hand from the gg-fork-push-lanc skill. Four days of "the script is still not
# written" in a row, while three separate pieces of work queued up behind it.
# Prose in a skill is not a procedure the machine can run.
#
# There is no `gh` login and no git credential helper on this box. Both the git
# push and the GitHub REST calls therefore go through the gg-mcp proxy, which
# injects GITHUB_TOKEN into the child process env -- never into the conversation.
#
# IDENTITY: the proxy token comes from THIS install's own .mcp.json, or from
# GG_MCP_TOKEN_FILE if the caller sets it. It is never hardcoded. Using someone
# else's token file is not a name swap, it is a RIGHTS swap -- see CLAUDE.md.
#
# Usage:
#   scripts/gg-push-lanc.sh <branch> "<commit message>" [file ...]
#   scripts/gg-push-lanc.sh --resume <branch>     # branch already pushed, just do the PRs
#
#   With files:    those paths are staged and committed.
#   Without files: everything currently staged is committed. If nothing is
#                  staged and the branch already has commits, it just pushes.
#
# Env:
#   GG_MCP_TOKEN_FILE   override the identity (default: from .mcp.json)
#   GG_MCP_AGENT_LABEL  override the audit label (default: from .mcp.json)
#   GG_MCP_PROXY        path to proxy.js (default: from .mcp.json)
#   REPO_SLUG           owner/repo (default: GuestGuru/marveen)
#   DRY_RUN=1           print what would happen, touch nothing remote

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

REPO_SLUG="${REPO_SLUG:-GuestGuru/marveen}"
DRY_RUN="${DRY_RUN:-0}"

die() { printf 'HIBA: %s\n' "$*" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }

# --- identity from this install's own config ---------------------------------
read_mcp_field() {
  python3 - "$1" <<'PY'
import json, sys, os
field = sys.argv[1]
try:
    d = json.load(open('.mcp.json'))
except Exception:
    sys.exit(0)
srv = d.get('mcpServers', {}).get('gg-access', {})
if field == 'proxy':
    args = srv.get('args') or []
    print(args[0] if args else '')
else:
    print(srv.get('env', {}).get(field, ''))
PY
}

TOKEN_FILE="${GG_MCP_TOKEN_FILE:-$(read_mcp_field GG_MCP_TOKEN_FILE)}"
AGENT_LABEL="${GG_MCP_AGENT_LABEL:-$(read_mcp_field GG_MCP_AGENT_LABEL)}"
PROXY="${GG_MCP_PROXY:-$(read_mcp_field proxy)}"

[ -n "$TOKEN_FILE" ] || die "nincs GG_MCP_TOKEN_FILE, es a .mcp.json sem ad egyet -- add meg explicit a SAJAT tokenedet"
[ -s "$TOKEN_FILE" ] || die "a token-fajl hianyzik vagy ures: $TOKEN_FILE (parositas kell, nem restart)"
[ -n "$PROXY" ] && [ -f "$PROXY" ] || die "nincs meg a gg-mcp proxy: '${PROXY:-<ures>}'"

# Run a command with the proxy's github credentials in its env.
gh_exec() {
  GG_MCP_TOKEN_FILE="$TOKEN_FILE" GG_MCP_AGENT_LABEL="$AGENT_LABEL" \
    node "$PROXY" exec --alias github -- "$@"
}

# --- args --------------------------------------------------------------------
RESUME=0
if [ "${1:-}" = "--resume" ]; then
  RESUME=1; shift
  BRANCH="${1:-}"; shift || true
  [ -n "$BRANCH" ] || die "hasznalat: $0 --resume <ag>"
else
  BRANCH="${1:-}"; MESSAGE="${2:-}"
  [ -n "$BRANCH" ] || die "hasznalat: $0 <ag> \"<commit uzenet>\" [fajl ...]"
  [ -n "$MESSAGE" ] || die "commit uzenet kell"
  shift 2 || true
fi

case "$BRANCH" in
  fix/*|feat/*|chore/*|docs/*) ;;
  *) die "csak fix/ feat/ chore/ docs/ elotagu agra pusholunk -- a '$BRANCH' vedett vagy ismeretlen lehet" ;;
esac

# --- secret hygiene: never push a live credential -----------------------------
# The token file itself is the reference; a fixture credential must be synthetic.
scan_secrets() {
  local prefix files
  prefix="$(cut -c1-12 "$TOKEN_FILE")"
  files="$(git diff --cached --name-only)"
  [ -n "$files" ] || return 0
  if [ -n "$prefix" ] && printf '%s\n' "$files" | while read -r f; do
       [ -f "$f" ] && grep -l "$prefix" "$f" 2>/dev/null
     done | grep -q .; then
    die "ELO token-prefix van a stagelt fajlokban -- ALLJ MEG, ne pushold"
  fi
  if printf '%s\n' "$files" | while read -r f; do
       [ -f "$f" ] && grep -ln 'ggp_[0-9a-f]\{20,\}' "$f" 2>/dev/null
     done | grep -q .; then
    die "valodinak latszo ggp_ token van a stagelt fajlokban -- fixturaban szintetikus kell"
  fi
}

# --- 1. branch + commit ------------------------------------------------------
if [ "$RESUME" = "0" ]; then
  step "1. ag es commit: $BRANCH"
  if [ "$DRY_RUN" = "1" ]; then
    echo "   [DRY_RUN] ag letrehozas/valtas kihagyva (jelenlegi: $(git symbolic-ref --short HEAD))"
  else
    git rev-parse --verify "$BRANCH" >/dev/null 2>&1 || git branch "$BRANCH"
    git symbolic-ref --short HEAD | grep -qx "$BRANCH" || git checkout "$BRANCH"
  fi

  if [ "$#" -gt 0 ]; then git add -- "$@"; fi
  scan_secrets

  if git diff --cached --quiet; then
    git rev-list --count "origin/develop..$BRANCH" 2>/dev/null | grep -qv '^0$' \
      || die "nincs se stagelt valtozas, se uj commit az agon -- nincs mit felvinni"
    echo "   nincs uj stagelt valtozas, a meglevo commiteket viszem fel"
  else
    if [ "$DRY_RUN" = "1" ]; then
      echo "   [DRY_RUN] commit: $MESSAGE"
      git diff --cached --stat
    else
      git commit -q -m "$MESSAGE"
      echo "   commit: $(git rev-parse --short HEAD)"
    fi
  fi
fi

# --- 2. push through the proxy ------------------------------------------------
step "2. push a proxyn at"
if [ "$DRY_RUN" = "1" ]; then
  echo "   [DRY_RUN] git push $BRANCH -> $REPO_SLUG"
else
  ASKPASS="$(mktemp)"
  trap 'rm -f "$ASKPASS"' EXIT
  printf '#!/bin/sh\nprintf "%%s\\n" "$GITHUB_TOKEN"\n' > "$ASKPASS"
  chmod 700 "$ASKPASS"
  gh_exec sh -c "GIT_ASKPASS=$ASKPASS GIT_TERMINAL_PROMPT=0 git -C '$REPO_ROOT' push --quiet https://x-access-token@github.com/$REPO_SLUG.git '$BRANCH:refs/heads/$BRANCH'"
  echo "   felment: $BRANCH"
fi

# --- 3. verify what actually landed ------------------------------------------
step "3. verifikacio"
if [ "$DRY_RUN" = "1" ]; then
  echo "   [DRY_RUN] kihagyva"
else
  git fetch -q origin "$BRANCH"
  echo "   remote fej: $(git rev-parse --short FETCH_HEAD)"
  git diff --stat origin/develop FETCH_HEAD | tail -5
  if git show FETCH_HEAD --name-only --format= | while read -r f; do
       [ -n "$f" ] && git show "FETCH_HEAD:$f" 2>/dev/null | grep -ln 'ggp_[0-9a-f]\{20,\}' 2>/dev/null
     done | grep -q .; then
    die "a REMOTE oldalon token-minta van -- azonnal jelezd, ne nyiss PR-t"
  fi
fi

# --- 4-5. PR chain: develop, then main ---------------------------------------
api() {
  local method="$1" path="$2" body="${3:-}"
  local args="-s -X $method -H 'Accept: application/vnd.github+json' -H \"Authorization: Bearer \$GITHUB_TOKEN\""
  [ -n "$body" ] && args="$args -d '$body'"
  gh_exec sh -c "curl $args 'https://api.github.com/repos/$REPO_SLUG/$path'"
}

json_field() { python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get(sys.argv[1]) if isinstance(d,dict) else '')" "$1"; }

open_and_merge() {
  local head="$1" base="$2" title="$3"
  local body num state
  body="$(python3 -c "import json,sys; print(json.dumps({'head':sys.argv[1],'base':sys.argv[2],'title':sys.argv[3]}))" "$head" "$base" "$title")"
  if [ "$DRY_RUN" = "1" ]; then
    echo "   [DRY_RUN] PR $head -> $base"
    return 0
  fi
  num="$(api POST pulls "$body" | json_field number)"
  if [ -z "$num" ] || [ "$num" = "None" ]; then
    # already open? find it
    num="$(api GET "pulls?head=${REPO_SLUG%%/*}:$head&base=$base&state=open" \
      | python3 -c "import json,sys; r=json.load(sys.stdin); print(r[0]['number'] if r else '')")"
  fi
  [ -n "$num" ] || die "nem sikerult PR-t nyitni: $head -> $base"
  echo "   PR #$num: $head -> $base"
  state="$(api PUT "pulls/$num/merge" '{"merge_method":"merge"}' | json_field merged)"
  [ "$state" = "True" ] || die "a PR #$num merge-e nem ment at -- nezd meg kezzel (konfliktus vagy check)"
  echo "   merge OK"
}

step "4. PR -> develop"
open_and_merge "$BRANCH" develop "$BRANCH"

step "5. PR develop -> main"
open_and_merge develop main "release: $BRANCH"

# --- 6. local close ----------------------------------------------------------
step "6. lokalis zaras"
if [ "$DRY_RUN" = "1" ]; then
  echo "   [DRY_RUN] kihagyva"
else
  git checkout -q main
  git pull -q --ff-only origin main
  echo "   main: $(git rev-parse --short HEAD)"
  if git diff --name-only "HEAD~1..HEAD" 2>/dev/null | grep -q '^src/'; then
    echo
    echo "   FIGYELEM: src/ valtozott -> rebuild kell (update.sh), a szolgaltatas a dist/-bol megy"
  fi
fi

step "kesz"
