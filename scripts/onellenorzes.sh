#!/usr/bin/env bash
# GG fork: a flotta onellenorzoi EGY belepesi pontbol, EGY statusszal.
#
# MIERT: 2026-08-21-ig ket fuggetlen onellenorzonk volt (gg-mcp-health.py es
# scheduled-task-drift.sh), es egyiket sem hivta semmi automatikusan -- a
# fo-agens futtatta oket heartbeatbol vagy kezzel. Ha egy reggel elmarad a
# heartbeat, egyik sem szolal meg. Ez a szkript osszefogja oket, hogy a
# napinditoban EGY sor legyen belole.
#
# Kimenet: emberi osszefoglalo + exit-kod.
#   0 = minden zold
#   1 = van mit megnezni (a reszletek a kimenetben)
#   2 = maga az ellenorzes nem futott le (hianyzo szkript, ertelmezhetetlen kimenet)
#
# ⚠️ A drift-szkript szamai NEM hibak: a "csak-elo"/"csak-sablon" sor azt mondja
# meg, HOL nezz, nem azt, hogy baj van (lasd a fejlecét). Ezert ez a szkript a
# driftet TAJEKOZTATASKENT irja ki, es NEM emeli miatta a hibakodot -- kulonben
# minden reggel hamis riasztast adna a kanban-audit szandekos eljaras-elteresere.
#
# Hasznalat:
#   scripts/onellenorzes.sh          # osszefoglalo
#   scripts/onellenorzes.sh -v       # a drift sorai is
set -uo pipefail

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

rc=0
echo "=== Onellenorzes -- $(date '+%Y-%m-%d %H:%M:%S') ==="
echo

# --- 1. gg-mcp health -------------------------------------------------------
echo "[1/2] gg-mcp (flotta-identitas es MCP-kapcsolat)"
if [ ! -f "$INSTALL_DIR/scripts/gg-mcp-health.py" ]; then
  echo "  HIBA: scripts/gg-mcp-health.py nem letezik"
  rc=2
else
  health_json="$(python3 "$INSTALL_DIR/scripts/gg-mcp-health.py" 2>/dev/null || true)"
  if [ -z "$health_json" ]; then
    echo "  HIBA: a szonda nem adott kimenetet"
    rc=2
  else
    summary="$(printf '%s' "$health_json" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception as e:
    print("PARSE_ERROR %s" % e); sys.exit(0)
probs = d.get("problems", 0)
trap = d.get("ambient_token_trap")
rows = d.get("findings", [])
bad = [f for f in rows if f.get("status") not in ("ok", "starting")]
print("PROBLEMS %s" % probs)
print("TRAP %s" % ("IGEN" if trap else "nincs"))
print("AGENTS %d ok=%d" % (len(rows), len([f for f in rows if f.get("status") == "ok"])))
for f in bad:
    print("BAD %s %s %s" % (f.get("agent"), f.get("status"), f.get("session_started", "")))
' 2>/dev/null)"
    if printf '%s' "$summary" | grep -q '^PARSE_ERROR'; then
      echo "  HIBA: a szonda kimenete nem ertelmezheto"
      rc=2
    else
      probs="$(printf '%s' "$summary" | awk '/^PROBLEMS/{print $2}')"
      trap_s="$(printf '%s' "$summary" | awk '/^TRAP/{print $2}')"
      agents="$(printf '%s' "$summary" | grep '^AGENTS' | sed 's/^AGENTS //')"
      echo "  agensek: $agents | problems: $probs | ambient token-csapda: $trap_s"
      printf '%s' "$summary" | grep '^BAD ' | sed 's/^BAD /  FIGYELEM: /'
      [ "${probs:-0}" != "0" ] && rc=1
    fi
  fi
fi
echo

# --- 2. scheduled-task drift ------------------------------------------------
echo "[2/2] scheduled-task sablon-drift (tajekoztatas, nem hibajelzes)"
if [ ! -x "$INSTALL_DIR/scripts/scheduled-task-drift.sh" ]; then
  echo "  HIBA: scripts/scheduled-task-drift.sh nem futtathato"
  rc=2
else
  drift_out="$(bash "$INSTALL_DIR/scripts/scheduled-task-drift.sh" 2>/dev/null || true)"
  if [ -z "$drift_out" ]; then
    echo "  HIBA: a drift-szkript nem adott kimenetet"
    rc=2
  else
    printf '%s\n' "$drift_out" | grep -E '^osszesen:' | sed 's/^/  /'
    nosablon="$(printf '%s' "$drift_out" | grep -c '(NINCS SABLON)' || true)"
    if [ "${nosablon:-0}" != "0" ]; then
      echo "  FIGYELEM: $nosablon futo feladatnak NINCS verziozott sablonja -- ez valodi hiany"
      printf '%s\n' "$drift_out" | grep '(NINCS SABLON)' | sed 's/^/    /'
      rc=1
    fi
    if [ "$VERBOSE" = 1 ]; then
      printf '%s\n' "$drift_out" | sed -n '1,/^osszesen:/p' | sed 's/^/  /'
    fi
  fi
fi

echo
case "$rc" in
  0) echo "OSSZESITES: minden zold." ;;
  1) echo "OSSZESITES: van mit megnezni (lasd a FIGYELEM sorokat)." ;;
  2) echo "OSSZESITES: maga az ellenorzes nem futott le rendesen -- ez a rosszabb eset, mert NEM jelent egeszseget." ;;
esac
exit "$rc"
