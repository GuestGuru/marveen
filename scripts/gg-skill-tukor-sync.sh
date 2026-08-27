#!/bin/bash
# GG fork: skill mirror parity checker.
#
# Why this exists (2026-08-27): a patched SKILL.md lives in the LIVE tree
# (~/.claude/skills or <repo>/.claude/skills), and its versioned copy lives in
# one of the repo mirrors. Nothing syncs the two, and BOTH usual measures are
# blind to the gap:
#   - `git status` is clean, because the tracked file was never touched;
#   - `git ls-files | grep -c SKILL.md` is unchanged, because the file exists,
#     it is merely stale.
# Running scripts/skill-index.sh is not evidence either: it regenerates the
# index, it does not touch the mirrors. On 2026-08-26 the same omission
# happened twice in one day, both times with an index regeneration at the end.
#
# Deliberately NOT folded into scripts/skill-index.sh: that file is upstream,
# and every upstream file we edit is a future merge conflict (docs/gg-fork-konvenciok.md).
#
# Usage:
#   gg-skill-tukor-sync.sh            report only, exit 1 if any mirror is stale
#   gg-skill-tukor-sync.sh --fix      copy live -> mirror for every stale pair
set -u
cd "$(dirname "$0")/.." || exit 1

FIX=0
[ "${1:-}" = "--fix" ] && FIX=1

# Mirror roots, in the order skill-management documents them.
MIRRORS="gg-skills seed-skills skills"

stale=0; synced=0; same=0; unversioned=0
unversioned_list=""

check_one() {
  local live="$1" name="$2" scope="$3" m mirror
  for m in $MIRRORS; do
    mirror="$m/$name/SKILL.md"
    # Only a TRACKED mirror counts; an untracked copy is not versioned.
    git ls-files --error-unmatch "$mirror" >/dev/null 2>&1 || continue
    if diff -q "$live" "$mirror" >/dev/null 2>&1; then
      same=$((same + 1))
    elif [ "$FIX" = "1" ]; then
      cp "$live" "$mirror"
      echo "  SZINKRONIZALVA  $name  ($scope -> $mirror)"
      synced=$((synced + 1))
    else
      echo "  ELTER  $name  ($scope vs $mirror)  csak-elo=$(diff "$live" "$mirror" | grep -c '^<')  csak-repo=$(diff "$live" "$mirror" | grep -c '^>')"
      stale=$((stale + 1))
    fi
    return 0
  done
  unversioned=$((unversioned + 1))
  unversioned_list="$unversioned_list $name"
  return 0
}

for d in "$HOME"/.claude/skills/*/; do
  [ -f "$d/SKILL.md" ] || continue
  check_one "$d/SKILL.md" "$(basename "$d")" "globalis"
done
for d in .claude/skills/*/; do
  [ -f "$d/SKILL.md" ] || continue
  check_one "$d/SKILL.md" "$(basename "$d")" "agens"
done

echo
echo "azonos=$same  elter=$stale  szinkronizalva=$synced  verziozatlan=$unversioned"
if [ "$unversioned" -gt 0 ]; then
  echo "verziozatlan (nincs kovetett tukre, DONTES kell -- seed-skills/ ha gep-fuggetlen, gg-skills/ ha GG-specifikus):"
  for n in $unversioned_list; do echo "  - $n"; done
fi
[ "$stale" -gt 0 ] && exit 1
exit 0
