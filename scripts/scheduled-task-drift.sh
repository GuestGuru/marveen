#!/usr/bin/env bash
# GG fork: helyorzo-tudatos drift-ellenorzo a scheduled-task SKILL.md-ekre.
#
# MIERT: minden ütemezett feladat KET peldanyban el -- a repoban egy SABLON
# ({{INSTALL_DIR}}, {{OWNER_NAME}}, {{MAIN_AGENT_ID}}, {{BOT_NAME}}, {{WEB_PORT}}
# helyorzokkel), a ~/.claude/scheduled-tasks/ alatt a kirenderelt, FUTO peldany.
# Amikor buktatot irsz a futo peldanyba, az alapertelmezes szerint verziozatlan
# marad. Ez a szkript megmutatja, hol ternek el -- de NEM dont helyetted.
#
# MIT NEM CSINAL, es ez szandekos:
#   - nem masol vissza semmit (a `<` sor lehet potlando tudas VAGY telepites-fuggo ut)
#   - nem mondja meg, hogy egy elteres drift-e (azt a ket szekcio ELOLVASASA dont el;
#     a kulcsszavas grep parity-meresre bizonyitottan alkalmatlan -- 2026-08-20)
#
# Hasznalat:
#   scripts/scheduled-task-drift.sh            # osszefoglalo tabla
#   scripts/scheduled-task-drift.sh -v         # a `<` es `>` sorok kiirasa is
#   scripts/scheduled-task-drift.sh -v <nev>   # egyetlen task reszletesen
set -uo pipefail

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIVE_DIR="${SCHEDULED_TASKS_DIR:-$HOME/.claude/scheduled-tasks}"

# Az identitas a checkout sajat configjabol jon, nem beegetve (lasd CLAUDE.md).
AGENT_ID="$(basename "$INSTALL_DIR")"
BOT_NAME="$(python3 - "$INSTALL_DIR" <<'PY' 2>/dev/null || true
import os, sys, re
d = sys.argv[1]
p = os.path.join(d, 'CLAUDE.md')
try:
    m = re.search(r'^A neved ([A-Za-z0-9_-]+)\.', open(p, encoding='utf-8').read(), re.M)
    print(m.group(1) if m else '')
except Exception:
    print('')
PY
)"
OWNER_NAME="${GG_OWNER_NAME:-GuestGuru}"
WEB_PORT="${WEB_PORT:-3420}"

VERBOSE=0
ONLY=""
for a in "$@"; do
  case "$a" in
    -v|--verbose) VERBOSE=1 ;;
    -*) echo "ismeretlen kapcsolo: $a" >&2; exit 2 ;;
    *) ONLY="$a" ;;
  esac
done

# A helyorzo-keszlet OT elemu. Ha csak az INSTALL_DIR-t es az OWNER_NAME-et
# szurod, olyan sorok latszanak driftnek, mint `skip ha assignee='<agens>'`
# (2026-08-20: a kanban-audit igy adott 20 hamis csak-elo sort).
#
# A ZARO \b SZANDEKOSAN HIANYZIK a nev-helyorzokrol (2026-08-29). A magyar
# ragozo nyelv: az elo peldanyban "GuestGurunak" all, a sablonban
# "{{OWNER_NAME}}nak" -- a zaro szohatar miatt a csere NEM ILLESZKEDETT, es a
# dream-engine meg a memoria-heartbeat is orokre 1/1 hamis driftet mutatott.
# A nyito \b marad, hogy ne illeszkedjunk egy hosszabb szo BELSEJEBE.
#
# A HATODIK ALAK egy ALIAS, nem kulon ertek (2026-09-03): a node seeder
# (substituteTemplatePlaceholders) es az update.sh render_seed_template a
# {{PROJECT_ROOT}}-ot UGYANARRA az utra oldja fel, mint az {{INSTALL_DIR}}-t,
# es a szallitott sablonok kozul nehany ezt az alakot hasznalja
# (ledger-live-drain). Normalizalas nelkul az ilyen task OROKRE 1/1 hamis
# driftet mutat: a ket oldal ugyanazt mondja, csak mas helyorzo-nevvel.
normalize() {
  sed -E \
    -e "s#\\{\\{PROJECT_ROOT\\}\\}#{{INSTALL_DIR}}#g" \
    -e "s#$INSTALL_DIR#{{INSTALL_DIR}}#g" \
    -e "s#localhost:$WEB_PORT#localhost:{{WEB_PORT}}#g" \
    -e "s#\\b$OWNER_NAME#{{OWNER_NAME}}#g" \
    ${BOT_NAME:+-e "s#\\b$BOT_NAME#{{BOT_NAME}}#g"} \
    -e "s#\\b$AGENT_ID#{{MAIN_AGENT_ID}}#g" \
    "$1"
}

find_template() {
  local t="$1" base
  for base in scheduled-tasks seed-scheduled-tasks templates/scheduled-tasks; do
    [ -f "$INSTALL_DIR/$base/$t/SKILL.md" ] && { echo "$base/$t/SKILL.md"; return 0; }
  done
  return 1
}

total_live=0 total_tpl=0 missing=0 ephemeral=0
ephemeral_list=""

# Egy feladat lehet SZANDEKOSAN sablon nelkul: ugyfelhez es datumhoz kotott, nem
# termek-viselkedes (pl. "figyeld X lakas decemberet, amig be nem telik"). Ezt a
# task-config.json "ephemeral": true mezoje mondja ki. 2026-08-29-ig minden ilyen
# feladat "sablon nelkul"-kent jelent meg, es a szam NOTT (1 -> 2), tehat a zaj
# elkezdte elfedni a valodi hianyt -- pont azt, amiert ez a mero letezik.
# A dontes NEM tunik el: az efemer feladatok kulon sorban, nevvel jelennek meg.
is_ephemeral() {
  python3 - "$1" <<'PYEOF' 2>/dev/null
import json, sys
try:
    print('1' if json.load(open(sys.argv[1], encoding='utf-8')).get('ephemeral') is True else '0')
except Exception:
    print('0')
PYEOF
}
printf '%-26s %-24s %8s %8s\n' TASK SABLON 'CSAK-ELO' 'CSAK-SABLON'
printf '%-26s %-24s %8s %8s\n' -------------------------- ------------------------ -------- -----------

for dir in "$LIVE_DIR"/*/; do
  t="$(basename "$dir")"
  [ -n "$ONLY" ] && [ "$t" != "$ONLY" ] && continue
  [ -f "$dir/SKILL.md" ] || continue

  if ! tpl="$(find_template "$t")"; then
    if [ "$(is_ephemeral "$dir/task-config.json")" = "1" ]; then
      ephemeral=$((ephemeral + 1))
      ephemeral_list="$ephemeral_list $t"
    else
      printf '%-26s %-24s %8s %8s\n' "$t" '(NINCS SABLON)' '-' '-'
      missing=$((missing + 1))
    fi
    continue
  fi

  # A normalizalas MINDKET oldalon fut (2026-08-29). A scheduled-tasks/ sablonok
  # NEM egysegesek: a dream-engine helyorzot ir ({{OWNER_NAME}}nak), a
  # memoria-heartbeat konkret erteket (localhost:3420). Ha csak az elo oldalt
  # normalizaljuk, a konkret erteket iro sablon ORoKRE hamis 1/1-et ad, mert az
  # elo oldalbol {{WEB_PORT}} lesz, a sablonbol nem. Mindket oldalt normalizalva
  # a ket iras egy alakra jon ossze, es csak a VALODI elteres marad.
  d="$(diff <(normalize "$dir/SKILL.md") <(normalize "$INSTALL_DIR/$tpl") || true)"
  lt="$(printf '%s' "$d" | grep -c '^<' || true)"
  gt="$(printf '%s' "$d" | grep -c '^>' || true)"
  total_live=$((total_live + lt)); total_tpl=$((total_tpl + gt))
  printf '%-26s %-24s %8s %8s\n' "$t" "$(dirname "$(dirname "$tpl")")" "$lt" "$gt"

  if [ "$VERBOSE" = 1 ] && [ -n "$d" ]; then
    printf '%s' "$d" | grep '^<' | sed 's/^/    ELO   /' || true
    printf '%s' "$d" | grep '^>' | sed 's/^/    SABL  /' || true
    echo
  fi
done

echo
echo "osszesen: csak-elo=$total_live  csak-sablon=$total_tpl  sablon nelkul=$missing  efemer=$ephemeral"
if [ "$ephemeral" -gt 0 ]; then
  echo "efemer (SZANDEKOSAN nincs sablon, task-config.json -> \"ephemeral\": true):"
  for n in $ephemeral_list; do echo "  - $n"; done
fi
cat <<'EOF'

Ertelmezes (a szam onmagaban NEM drift):
  CSAK-ELO   (<) a futo peldany tud tobbet -> valoszinuleg verziozatlan tudas,
               DE lehet telepites-fuggo ut is. Olvasd el, mielott visszairod.
  CSAK-SABLON (>) a sablon tud tobbet -> lehet (a) helyorzo-artefakt vagy a sablon
               sajat magyarazata (hagyd beken), vagy (b) ELMARADT SZINKRON, akar
               egyetlen szoban (2026-08-19: "ketfele" vs "haromfele").
  Ahol a szoveg DARABSZAMOT mond, szamold meg a felsorolast alatta -- mindket
  peldanyban.
EOF
