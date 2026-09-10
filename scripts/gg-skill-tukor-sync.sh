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
#   gg-skill-tukor-sync.sh --adopt    give every UNVERSIONED agent skill a mirror
set -u
# GG_SYNC_ROOT exists so the tests can run this against a scratch tree; in normal
# use it is unset and the script operates on its own checkout.
cd "${GG_SYNC_ROOT:-$(dirname "$0")/..}" || exit 1

FIX=0
ADOPT=0
case "${1:-}" in
  --fix) FIX=1 ;;
  --adopt) ADOPT=1 ;;
esac

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

stale=0; synced=0; same=0; unversioned=0; adopted=0
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
# How many LIVE copies of a skill NAME exist across the three scopes.
#
# Measured 2026-09-09: bubi asked for a copy of two of peppa's skills, with a
# provenance line added to the copy. Both live copies then mapped onto the SAME
# tracked mirror, so `--fix` would have overwritten peppa's mirror with bubi's
# annotated copy -- silently, on the next routine parity run by whoever got there
# first. The report is still right (the difference IS real), but the automatic
# repair is not: with two live copies there is no single source of truth to copy
# FROM, and picking one is a decision, not a sync.
# A tukor-peldany JELOLT masolat-e, es ha igen, ki a megnevezett forras?
# Kiirja a forras agens-nevet (vagy ures sztringet), exit 0 ha van zaradek.
# Merve 2026-09-10 (peppa jelezte): ket skillnel a tukor es a forras kozti TELJES
# elteres ez a zaradek volt, tehat a "lemaradt peldany" olvasat hamis, es egy --fix
# NEMAN LETOROLTE volna a szarmazas-jelolest.
provenance_src() {
  local f="$1"
  grep -qE 'SZ[AÁ]RMAZ[AÁ]S:' "$f" 2>/dev/null || return 1
  sed -nE 's/.*SZ[AÁ]RMAZ[AÁ]S:\*\* ez a skill \*\*([a-z0-9_-]+)\*\*.*/\1/p' "$f" | head -1
  return 0
}

live_copies() {
  local name="$1" n=0 d
  [ -f "$HOME/.claude/skills/$name/SKILL.md" ] && n=$((n + 1))
  [ -f ".claude/skills/$name/SKILL.md" ] && n=$((n + 1))
  for d in agents/*/.claude/skills/"$name"/SKILL.md; do
    [ -f "$d" ] && n=$((n + 1))
  done
  echo "$n"
}

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
    elif psrc="$(provenance_src "$mirror/SKILL.md" 2>/dev/null)" \
         && [ -n "$psrc" ] && [ "$scope" = "agens:$psrc" ] \
         && [ "$(diff "$live/SKILL.md" "$mirror/SKILL.md" 2>/dev/null \
                 | grep '^>' | grep -vcE 'SZ[AÁ]RMAZ[AÁ]S|forras-peldany|^> *$|^> *---*$|^> *> ')" -eq 0 ]; then
      # JELOLT MASOLAT a megnevezett FORRASAVAL szemben: a teljes elteres a
      # szarmazas-zaradek, tehat NEM drift. EZ AZ AG A FIX-AGAK ELOTT VAN, es ez a
      # lenyeg: egy --fix itt a forrasbol masolna a tukorre, es NEMAN LETOROLNE a
      # szarmazas-jelolest. Merve 2026-09-10, peppa jelezte: ket skillnel a 7 soros
      # elteres teljes egeszeben a zaradek volt. A zaradek visszamasolasa a forrasba
      # ugyanigy hibas: azt iratna vele, hogy o a sajat maga masolata.
      echo "  JELOLT MASOLAT  $name  ($scope a FORRAS, a tukor a masolat)  -- nem drift, nem fixelem"
      same=$((same + 1))
    elif [ "$FIX" = "1" ] && [ "$(live_copies "$name")" -gt 1 ]; then
      echo "  TOBB-PELDANY  $name  ($scope)  -- NEM fixelek, mert $(live_copies "$name") elo peldany kepzodik le UGYANARRA a tukorre:"
      # A masolat CSENDBEN avul: a masolo agensnek semmi nem szol, hogy a forras
      # kozben tovabbment. Merve 2026-09-09: bubi masolata harom koron belul 35
      # sorral maradt le peppa peldanyatol, es a hianybol ketto tulaj-magyarazat
      # volt (eppen az, ami egy elszamolas-vitaban kellett volna). Ezert a riport
      # SZAMOT ad, ne csak listat: a sorkulonbseg mondja meg, mennyire surgos.
      for d in "$HOME/.claude/skills/$name" ".claude/skills/$name" agents/*/.claude/skills/"$name"; do
        [ -f "$d/SKILL.md" ] || continue
        echo "      $(diff "$d/SKILL.md" "$mirror/SKILL.md" 2>/dev/null | grep -c '^[<>]') sor elteres a tukortol: $d"
      done
      # SZARMAZAS-ZARADEK: ha a tukor-peldany JELOLVE van masolatkent ("SZARMAZAS:"
      # blokk, amit a masolo ir bele), akkor a forras es a masolat viszonya
      # SZANDEKOS, es a kulonbseg jellemzoen PONT ez a zaradek. Ilyenkor a
      # "melyik a forras" kerdes el van dontve, nem kell ujra feltenni.
      # Merve 2026-09-10 (peppa jelezte): ket skillnel a 7 soros elteres TELJES
      # EGESZEBEN a zaradek volt, es a "lemaradt peldany" olvasat hamis -- aki a
      # zaradekot visszamasolja a FORRASBA, azt iratja vele, hogy o a sajat maga
      # masolata, tehat korkoros hivatkozast csinal. A szonda ezert megnevezi a
      # forrast, es nem dontest ker.
      if grep -qE '^\s*>?\s*\*\*SZARMAZAS|^\s*>?\s*\*\*SZÁRMAZÁS' "$mirror/SKILL.md" 2>/dev/null; then
        src=$(sed -nE 's/.*SZ[AÁ]RMAZ[AÁ]S:\*\* ez a skill \*\*([a-z0-9_-]+)\*\*.*/\1/p' "$mirror/SKILL.md" | head -1)
        echo "      JELOLT MASOLAT: a tukor-peldany SZARMAZAS-zaradekot visel${src:+ (forras: $src)}."
        echo "      Ez SZANDEKOS, nem drift. A zaradekot NE masold vissza a forrasba: korkoros lenne."
        echo "      Dontes csak akkor kell, ha a zaradekon TUL is van elteres -- azt nezd meg."
      else
        echo "      A masolas itt DONTES: melyik peldany a forras? Nezd meg, es fixelj kezzel."
      fi
      stale=$((stale + 1))
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
      if psrc="$(provenance_src "$mirror/SKILL.md" 2>/dev/null)" && [ -n "$psrc" ]; then
        # Jelolt masolat, de IDE jutott: tehat a zaradekon TUL is van elteres, vagy
        # nem a megnevezett forrast hasonlitjuk hozza. Mindketto valodi lelet.
        echo "  ELTER  $name  ($scope vs $mirror)  -- JELOLT masolat (forras: $psrc), a zaradekon TUL is van elteres"
      else
        echo "  ELTER  $name  ($scope vs $mirror)"
      fi
      diff -rq $DIFF_EXCLUDES "$live" "$mirror" 2>&1 | sed 's/^/      /'
      stale=$((stale + 1))
    fi
    return 0
  done
  # --adopt: close the leak for the one class where the destination is NOT a
  # judgement call. Measured 2026-09-05: all twelve unversioned skills lived under
  # agents/<name>/.claude/skills/, all twelve were GG-specific (GG3, owner billing,
  # a Google Sheet), and the precedent was already in the private repo
  # (gg3-tulaj-lakas-lekerdezes, likewise an agent skill). The count had gone
  # 0 -> 4 -> 8 -> 12 in four days while a "decision" was waiting that, once
  # measured, did not exist.
  #
  # A GLOBAL unversioned skill is deliberately NOT adopted: that one really is a
  # decision (seed-skills/ if machine-independent, private repo if GG-specific),
  # and this script must not make it silently.
  if [ "$ADOPT" = "1" ] && [ "${scope#agens:}" != "$scope" ]; then
    if ! adopt_one "$live" "$name" "$scope"; then
      unversioned=$((unversioned + 1))
      unversioned_list="$unversioned_list $name"
    fi
    return 0
  fi
  unversioned=$((unversioned + 1))
  unversioned_list="$unversioned_list $name"
  return 0
}

# Copy an unversioned agent skill into the private mirror and stage it.
#
# Deliberately stops at `git add`: the commit message is the author's to write, and
# the PUSH needs the CALLER's own gg-mcp identity (CLAUDE.md's hardest rule -- a
# script must never bake one agent's token path into a path other agents run).
# Returns non-zero when the skill must stay on the "decision needed" list.
adopt_one() {
  local live="$1" name="$2" scope="$3" hits
  # A mirror is a git repo; a secret committed there is permanent. This is the same
  # screen the manual round used, kept here so the automatic path is not weaker than
  # the hand one it replaces.
  hits=$(grep -rniE 'ghp_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[0-9A-Za-z-]{10,}|BEGIN [A-Z ]*PRIVATE KEY' "$live" 2>/dev/null | head -3)
  if [ -n "$hits" ]; then
    echo "  NEM ADOPTALVA  $name  ($scope)  -- hitelesito-adat gyanuja, NEZD MEG KEZZEL:"
    printf '%s\n' "$hits" | sed 's/^/      /'
    return 1
  fi
  mkdir -p "$PRIVATE_MIRROR_ROOT/skills/$name" || return 1
  cp -r "$live/." "$PRIVATE_MIRROR_ROOT/skills/$name/" || return 1
  git -C "$PRIVATE_MIRROR_ROOT" add "skills/$name" || return 1
  echo "  ADOPTALVA  $name  ($scope -> $PRIVATE_MIRROR_ROOT/skills/$name)"
  adopted=$((adopted + 1))
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
echo "azonos=$same  elter=$stale  szinkronizalva=$synced  adoptalva=$adopted  verziozatlan=$unversioned"
if [ "$adopted" -gt 0 ]; then
  # Say the remaining step out loud. The copy is the easy half; the half that gets
  # forgotten is the push, and the private repo does not ride the marveen chain.
  echo "A masolas KESZ es stagelve, de MEG NINCS FENT. Hatralevo lepesek:"
  echo "  git -C $PRIVATE_MIRROR_ROOT commit -m \"skills: <mit adoptaltal>\""
  echo "  majd push a SAJAT gg-mcp identitasoddal (ld. gg-fork-push-lanc)."
fi
if [ "$unversioned" -gt 0 ]; then
  echo "verziozatlan (nincs kovetett tukre, DONTES kell -- seed-skills/ ha gep-fuggetlen, a PRIVAT gg-agent-skills/skills/ ha GG-specifikus):"
  for n in $unversioned_list; do echo "  - $n"; done
fi
[ "$stale" -gt 0 ] && exit 1
exit 0
