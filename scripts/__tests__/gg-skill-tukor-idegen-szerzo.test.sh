#!/bin/bash
# GG fork: does `--fix` SAY it when it overwrites a mirror file whose last commit
# came from someone other than the live skill's owner?
#
# Measured by bubi on 2026-09-18 on a throwaway tree: --fix writes from the LIVE
# copy, so a fix contributed to the mirror by a marked copy survives in zero live
# copies. The content itself is not lost (the mirror is a git repo), but nothing in
# the output said so -- and the provenance clause IS re-appended, which made the
# run look as though the marked pair had been handled. The label survived the copy;
# the contribution did not. This test pins the line that now says it.
set -u
PASS=0; FAIL=0
BASE=$(mktemp -d); trap 'rm -rf "$BASE"' EXIT
pass() { PASS=$((PASS+1)); echo "  PASS: $1"; }
fail() { FAIL=$((FAIL+1)); echo "  FAIL: $1"; }

REAL_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ROOT="$BASE/checkout"; MIRROR="$BASE/mirror"; FAKE_HOME="$BASE/home"
mkdir -p "$ROOT/scripts" "$ROOT/.claude/skills" "$FAKE_HOME/.claude/skills" \
         "$ROOT/agents/peppa/.claude/skills/pelda-skill" "$MIRROR/skills/pelda-skill"
cp "$REAL_ROOT/scripts/gg-skill-tukor-sync.sh" "$ROOT/scripts/"
git -C "$MIRROR" init -q
git -C "$MIRROR" config user.name Peppa; git -C "$MIRROR" config user.email peppa@guest.guru

printf 'a\nb\n' > "$MIRROR/skills/pelda-skill/SKILL.md"
git -C "$MIRROR" add -A >/dev/null; git -C "$MIRROR" commit -qm "peppa sora"
printf 'a\nb\nc\n' > "$ROOT/agents/peppa/.claude/skills/pelda-skill/SKILL.md"

run() { ( cd "$ROOT" && HOME="$FAKE_HOME" GG_SYNC_ROOT="$ROOT" GG_PRIVATE_SKILLS="$MIRROR" \
          bash scripts/gg-skill-tukor-sync.sh "$@" 2>&1 ); }

echo ""
echo "Test 1: a gazda sajat commitja utan NINCS idegen-szerzo sor"
OUT=$(run --fix)
if ! echo "$OUT" | grep -q 'IDEGEN SZERZO'; then
  pass "sajat szerzonel nem riaszt (nincs hamis pozitiv a normal uton)"
else
  fail "sajat szerzore is idegen-szerzo sort irt: $OUT"
fi

echo ""
echo "Test 2: IDEGEN szerzo utolso commitja utan KIIRJA, kit ir felul"
git -C "$MIRROR" add -A >/dev/null 2>&1
git -C "$MIRROR" -c user.name=Bubi -c user.email=bubi@guest.guru commit -qm "bubi javitasa" --allow-empty
printf 'a\nb\nc\nd\n' > "$ROOT/agents/peppa/.claude/skills/pelda-skill/SKILL.md"
OUT=$(run --fix)
if echo "$OUT" | grep -q 'IDEGEN SZERZO A TUKORBEN  pelda-skill'; then
  pass "kiirja a skillt"
else
  fail "nem irta ki az idegen szerzot: $OUT"
fi
if echo "$OUT" | grep -qi 'bubi'; then
  pass "megnevezi, KI irta utoljara (a sor enelkul nem cselekvesre valo)"
else
  fail "nem nevezte meg a szerzot: $OUT"
fi

echo ""
echo "Test 3: a figyelmeztetes NEM blokkolja a szinkront"
if echo "$OUT" | grep -q 'SZINKRONIZALVA  pelda-skill' && \
   grep -q '^d$' "$MIRROR/skills/pelda-skill/SKILL.md"; then
  pass "a masolas lefutott (a sor jelez, nem tilt -- egy blokkolo guard a nightly futast allitana meg)"
else
  fail "a figyelmeztetes megallitotta a szinkront: $OUT"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
