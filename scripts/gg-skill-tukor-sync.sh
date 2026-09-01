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

# Where the GG-specific mirror lives. 2026-09-01, the owner's decision: GG skills
# go to the PRIVATE GuestGuru/gg-agent-skills repo, not to this PUBLIC fork.
#
# Why this matters more than it sounds: the mirroring is AUTOMATIC (the dream-engine
# runs `--fix` nightly, and scripts/hooks/skill-mirror-guard.py nags when a mirror
# is stale). Declaring "we now use the private repo" without retargeting THIS script
# would have kept publishing every night -- and the near-miss that started the whole
# thread was an EDIT to an already-mirrored skill, not a new one.
PRIVATE_MIRROR_ROOT="${GG_PRIVATE_SKILLS:-$HOME/gg-agent-skills}"

# Mirror roots. `seed-skills` (machine-independent) stays in this repo; the
# GG-specific ones moved out. Kept as a list so a future third target is one word.
MIRRORS="seed-skills skills"

stale=0; synced=0; same=0; unversioned=0
unversioned_list=""

# Files that live NEXT TO a skill but deliberately never reach the mirror: build
# artifacts, and the local config files that keep deployment-specific or personal
# data out of this PUBLIC fork (drive.folders.json, photos.local.json, content.py).
# Without this list every such file is reported as drift FOREVER -- 2026-08-29, the
# b2b-onepager skill produced four "Only in ..." lines on its very first run, all
# four intentional. The exclusions are derived from .gitignore's own gg-skills/**
# entries, so the checker and the ignore rules cannot drift apart: add a pattern
# there and this picks it up.
DIFF_EXCLUDES="-x __pycache__ -x *.pyc"
while read -r pat; do
  [ -n "$pat" ] && DIFF_EXCLUDES="$DIFF_EXCLUDES -x $pat"
done < <(sed -nE 's#^skills/\*\*/(.+)$#\1#p' "$PRIVATE_MIRROR_ROOT/.gitignore" 2>/dev/null || true)

# $1 is the skill DIRECTORY, not its SKILL.md. A skill may ship helper files next
# to the manifest (helpscout-pdf-melleklet/pdf-szoveg.py is 141 lines,
# b2b-onepager-gyartas/scripts/ is six files), and comparing only SKILL.md would
# report a confident "azonos" while a helper silently drifted. That is the same
# blind spot as the agents/ one below, one level down -- found 2026-08-28 while
# fixing the first.
check_one() {
  local live="$1" name="$2" scope="$3" m mirror lf mf f repo
  # The PRIVATE repo is checked first: since 2026-09-01 that is where a GG-specific
  # skill belongs, so a skill present in both must be compared against the one that
  # is actually maintained.
  for m in "$PRIVATE_MIRROR_ROOT/skills" $MIRRORS; do
    mirror="$m/$name"
    # Only a TRACKED mirror counts; an untracked copy is not versioned. The private
    # mirror is a SEPARATE repo, so `git ls-files` has to run inside it, not here.
    case "$m" in
      "$PRIVATE_MIRROR_ROOT"/*) repo="$PRIVATE_MIRROR_ROOT" ;;
      *) repo="." ;;
    esac
    git -C "$repo" ls-files --error-unmatch "${mirror#$repo/}/SKILL.md" >/dev/null 2>&1 || continue
    if diff -rq $DIFF_EXCLUDES "$live" "$mirror" >/dev/null 2>&1; then
      same=$((same + 1))
    elif [ "$FIX" = "1" ]; then
      cp -r "$live/." "$mirror/"
      # A file dropped from the live skill must disappear from the mirror too,
      # otherwise the mirror accumulates dead files that nothing ever removes.
      lf=$(mktemp); mf=$(mktemp)
      ( cd "$live" && find . -type f | sort ) > "$lf"
      ( cd "$mirror" && find . -type f | sort ) > "$mf"
      while read -r f; do
        [ -n "$f" ] || continue
        rm -f "$mirror/$f"
        echo "  TOROLVE  $name/${f#./}  (mar nincs az elo skillben)"
      done < <(comm -13 "$lf" "$mf")
      rm -f "$lf" "$mf"
      echo "  SZINKRONIZALVA  $name  ($scope -> $mirror)"
      synced=$((synced + 1))
    else
      echo "  ELTER  $name  ($scope vs $mirror)"
      diff -rq $DIFF_EXCLUDES "$live" "$mirror" 2>&1 | sed 's/^/      /'
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
  check_one "$d" "$(basename "$d")" "globalis"
done
for d in .claude/skills/*/; do
  [ -f "$d/SKILL.md" ] || continue
  check_one "$d" "$(basename "$d")" "agens"
done
# Sub-agents keep their own skills under agents/<name>/.claude/skills/. These were
# INVISIBLE to this script until 2026-08-28, and all eight of them turned out to be
# unversioned -- the checker reported a green "verziozatlan=1" while eight skills by
# five different colleagues sat outside the repo. A checker that cannot see a whole
# class of skills is worse than none: it certifies a gap it never looked at.
for d in agents/*/.claude/skills/*/; do
  [ -f "$d/SKILL.md" ] || continue
  owner=$(basename "$(dirname "$(dirname "$(dirname "$d")")")")
  check_one "$d" "$(basename "$d")" "agens:$owner"
done

echo
echo "azonos=$same  elter=$stale  szinkronizalva=$synced  verziozatlan=$unversioned"
if [ "$unversioned" -gt 0 ]; then
  echo "verziozatlan (nincs kovetett tukre, DONTES kell -- seed-skills/ ha gep-fuggetlen, a PRIVAT gg-agent-skills/skills/ ha GG-specifikus):"
  for n in $unversioned_list; do echo "  - $n"; done
fi
[ "$stale" -gt 0 ] && exit 1
exit 0
