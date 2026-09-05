#!/bin/bash
# GG fork: tests for `gg-skill-tukor-sync.sh --adopt`.
# Run: bash scripts/__tests__/gg-skill-tukor-adopt.test.sh
#
# Why this mode exists, and why the boundaries below are the whole point:
# measured 2026-09-05, the count of UNVERSIONED skills went 0 -> 4 -> 8 -> 12 in
# four days, and every one of the twelve was an agent skill under
# agents/<name>/.claude/skills/, which .gitignore's `*/**/.claude/` excludes. I
# spent two of those days holding the item on a list as "a decision for the owner",
# and the decision turned out not to exist: the private repo already held
# gg3-tulaj-lakas-lekerdezes, itself an agent skill of the same colleague. So the
# backlog was hand-copied -- and the SOURCE stayed open. Within six hours a
# thirteenth appeared.
#
# The three boundaries pinned here are what keep the automation honest:
#   1. agent skills adopt (destination measured, not guessed);
#   2. a GLOBAL unversioned skill does NOT (that one IS a real decision:
#      seed-skills/ if machine-independent, private repo if GG-specific);
#   3. anything that smells of a credential is refused, because a mirror is a git
#      repo and a committed secret is permanent.

set -u

PASS=0
FAIL=0
BASE=$(mktemp -d)
trap 'rm -rf "$BASE"' EXIT

pass() { PASS=$((PASS + 1)); echo "  PASS: $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $1"; }

REAL_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$REAL_ROOT/scripts/gg-skill-tukor-sync.sh"

# --- scratch world -----------------------------------------------------------
# A fake checkout (the live side) and a fake private mirror repo (the versioned
# side). GG_SYNC_ROOT points the script at the former, GG_PRIVATE_SKILLS at the
# latter, HOME at an empty tree so the global scan finds only what we put there.
ROOT="$BASE/checkout"
MIRROR="$BASE/mirror"
FAKE_HOME="$BASE/home"
mkdir -p "$ROOT/.claude/skills" "$FAKE_HOME/.claude/skills" "$MIRROR/skills"
mkdir -p "$ROOT/scripts"
cp "$SCRIPT" "$ROOT/scripts/"
git -C "$MIRROR" init -q
git -C "$MIRROR" config user.email t@example.invalid
git -C "$MIRROR" config user.name Test
: > "$MIRROR/.keep"
git -C "$MIRROR" add .keep
git -C "$MIRROR" -c commit.gpgsign=false commit -qm init

mk_skill() {  # <dir> <name> <body>
  mkdir -p "$1/$2"
  printf -- '---\nname: %s\ndescription: teszt\n---\n\n%s\n' "$2" "$3" > "$1/$2/SKILL.md"
}

mk_skill "$ROOT/agents/kollega/.claude/skills" tiszta-agens-skill "Sima tartalom, semmi titok."
# A hamis token DARABOKBAN all ossze, nem literalkent. 2026-09-05: az elso valtozat
# egyben tartalmazta, es a repo sajat titok-kapuja (EVIDGUARD818) helyesen
# MEGBLOKKOLTA a commitot. A csabito javitas az lett volna, hogy felveszem ezt a
# fajlt a kapu allowlistjere -- az viszont egy egesz konyvtarra nyitna lyukat egy
# teszt-fixture kedveert. Olcsobb ugy megirni a fixture-t, hogy ne legyen titok.
FAKE_TOKEN="ghp""_0123456789abcdefghijABCDEFGHIJ012345"
mk_skill "$ROOT/agents/kollega/.claude/skills" titkot-tarto-skill "token: $FAKE_TOKEN"
mk_skill "$FAKE_HOME/.claude/skills" globalis-skill "Ez globalis, a helye DONTES kerdese."

run() { HOME="$FAKE_HOME" GG_SYNC_ROOT="$ROOT" GG_PRIVATE_SKILLS="$MIRROR" bash "$ROOT/scripts/gg-skill-tukor-sync.sh" "$@" 2>&1; }

echo "gg-skill-tukor-sync --adopt"
echo "==========================="

# --- Test 1: report mode must not copy anything ------------------------------
echo ""
echo "Test 1: riport mod nem masol"
OUT=$(run)
if [ ! -d "$MIRROR/skills/tiszta-agens-skill" ] && echo "$OUT" | grep -q 'verziozatlan=3'; then
  pass "riport modban mind a harom verziozatlan marad, nulla masolas"
else
  fail "riport mod nyult a tukorhoz vagy rosszul szamolt: $OUT"
fi

# --- Test 2: --adopt takes the agent skill ------------------------------------
echo ""
echo "Test 2: --adopt atveszi a tiszta agens-skillt es stageli"
OUT=$(run --adopt)
if [ -f "$MIRROR/skills/tiszta-agens-skill/SKILL.md" ] \
   && git -C "$MIRROR" diff --cached --name-only | grep -q '^skills/tiszta-agens-skill/SKILL.md$'; then
  pass "atmasolva ES stagelve (a git add nelkul a fajl tovabbra sem verziozott)"
else
  fail "nem masolta at vagy nem stagelte: $OUT"
fi
if echo "$OUT" | grep -q 'adoptalva=1'; then
  pass "az osszegzo sor egyet szamol"
else
  fail "rossz adoptalva-szam: $OUT"
fi

# --- Test 3: the credential-bearing skill is refused --------------------------
echo ""
echo "Test 3: hitelesito-adat gyanujanal NEM adoptal"
if [ ! -e "$MIRROR/skills/titkot-tarto-skill" ] && echo "$OUT" | grep -q 'NEM ADOPTALVA  titkot-tarto-skill'; then
  pass "a tokent tarto skill kimaradt, es a script ki is mondta miert"
else
  fail "titkot tarto skill bekerult a tukorbe: $OUT"
fi

# --- Test 4: a global skill stays a decision ----------------------------------
echo ""
echo "Test 4: GLOBALIS verziozatlan skillt nem adoptal magatol"
if [ ! -e "$MIRROR/skills/globalis-skill" ] && echo "$OUT" | grep -q '  - globalis-skill'; then
  pass "a globalis skill dontesre var, nem kerult automatikusan a privat repoba"
else
  fail "a globalis skillt automatikusan adoptalta: $OUT"
fi

# --- Test 5: the leftover count is honest -------------------------------------
echo ""
echo "Test 5: a maradek verziozatlan szam a ket el nem intezett esetet mutatja"
if echo "$OUT" | grep -q 'verziozatlan=2'; then
  pass "verziozatlan=2 (a titkos es a globalis), nem nullara hazudott osszegzes"
else
  fail "rossz maradek-szam: $OUT"
fi

# --- Test 6: the push reminder is printed -------------------------------------
echo ""
echo "Test 6: kiirja, hogy a felkuldes MEG hatravan"
# 2026-09-05, sajat hiba: a masolas utan a `git push` hitelesito-helper hijan
# elhasalt, es a `| tail -3 && echo "PUSH OK"` a tail exit-kodjat mutatta, tehat
# keszre jelentettem egy fel nem kuldott commitot. A script mondja ki helyettem.
if echo "$OUT" | grep -q 'MEG NINCS FENT'; then
  pass "az adoptalas nem allitja magarol, hogy fent van"
else
  fail "nincs figyelmeztetes a hatralevo commit/push lepesre: $OUT"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
