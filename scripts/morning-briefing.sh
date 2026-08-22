#!/bin/bash
# Marveen - Reggeli napindító
# Trigger: systemd user timer (Linux, <agent>-morning.timer) vagy LaunchAgent
# (macOS), naponta 7:27-kor. Naponta legfeljebb egyszer küld (lásd a guardot).

export PATH="$HOME/.local/bin:$HOME/.bun/bin:/home/linuxbrew/.linuxbrew/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

INSTALL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLAUDE="$(command -v claude)"
[ -z "$CLAUDE" ] && echo "ERROR: claude not found on PATH" >&2 && exit 1
LOG="$INSTALL_DIR/store/morning.log"

# Load config
if [ -f "$INSTALL_DIR/.env" ]; then
  export $(grep -v '^#' "$INSTALL_DIR/.env" | xargs)
fi

CHAT_ID="${ALLOWED_CHAT_ID:-0}"
CALENDAR_ID="${HEARTBEAT_CALENDAR_ID:-primary}"

# Same-day dedup guard: the briefing must go out at most once per calendar
# day no matter how many times the trigger fires (a timer-unit re-activation
# on a systemd user-manager restart, a Persistent= catch-up, or a manual
# re-run). MORNING_FORCE=1 bypasses the guard for deliberate re-sends.
STAMP="$INSTALL_DIR/store/.morning-last-sent"
TODAY="$(date +%F)"
if [ "${MORNING_FORCE:-0}" != "1" ] && [ "$(cat "$STAMP" 2>/dev/null)" = "$TODAY" ]; then
  echo "=== Reggeli napindító $(date) -- SKIP: ma már elküldve (guard: $STAMP) ===" >> "$LOG"
  exit 0
fi

echo "=== Reggeli napindító $(date) ===" >> "$LOG"

cd "$INSTALL_DIR"

# 2026-08-21: a prompt HAT napig nem letezo toolokat kert (search_emails,
# list-events), ezert a -p futas minden reggel azzal hasalt el, hogy "nincs
# email/naptar eszkozom" -- es a napindito az interaktiv sessionre maradt. A
# SKILL.md-ben ez mar 08-12 ota javitva volt (gg-napi-forras.sh), csak ebbe a
# szkriptbe nem irta vissza senki. Ket valtozas:
#   1. a prompt a gg-napi-forras.sh kimenetere epul, nem talalgat toolokat;
#   2. a KULDES nem a -p sessione: az csak a SZOVEGET adja vissza, es a
#      kikuldes innen megy Bot API-val. A -p session ugyanis nem latja a
#      channel-plugin reply tooljat (merve 08-16 ... 08-21, hat reggel).
BRIEF_OUT="$(mktemp)"
if $CLAUDE --dangerously-skip-permissions \
  --channels plugin:telegram@claude-plugins-official \
  -p "Reggeli napindito. NE kuldj semmit sehova -- csak ird ki a KESZ SZOVEGET a valaszodban, mast ne.

1. Email es naptar EGY parancsbol: bash $INSTALL_DIR/scripts/gg-napi-forras.sh
   (Ez kiirja a mai naptarat es az elmult 24 ora leveleit. NE keress
   search_emails / list-events / gg_gmail_* toolt: nincsenek, sosem voltak.
   Ha a szkript HIBA: sort ad, azt jelentsd, ne azt hogy nem elerheto.)
2. Dream Engine: ha letezik es nem ures a $INSTALL_DIR/DREAM.md, annak az ot
   bucketje kerul a szoveg ELEJERE (Skill-javaslatok, Memoria-egeszseg, Top-3,
   External opportunity, Skill-flotta health).
3. AI hirek: WebSearch a tegnapi datummal.
4. A vegen az email es naptar szekcio. Ha egy kategoria ures, hagyd ki.

Formatum: sima szoveg, magyarul, tomoren. NE hasznalj MarkdownV2
escape-eket es NE tegyel koré kodblokkot -- a kikuldes innen tortenik.

KET SZABALY, amit a gazda kifejezetten szamon ker, es amit a 08-22-i elso eles
futas MEGSZEGETT (12 ekezet nelkuli szo ment ki hozza):
  1. MINDEN magyar szo EKEZETES. Nem stiluskerdes. Ha a szoveged tartalmaz
     olyat, hogy \"sajat\", \"ket\", \"kozott\", \"harom\", \"kovetkezo\", akkor
     rossz -- olvasd vissza es javitsd, mielott visszaadod.
  2. NINCS gondolatjel, es a \" -- \" (dupla kotojel) sem helyettesitheti.
     Hasznalj kettospontot, zarojelet vagy uj mondatot." \
  > "$BRIEF_OUT" 2>>"$LOG"; then
  cat "$BRIEF_OUT" >> "$LOG"
  # KIMENO-SZOVEG KAPU (2026-08-22). Ez az ut NEM tool-hivas, tehat egyetlen
  # PreToolUse matcher sem latja -- az elso eles futason (07:27, msg 621) emiatt
  # ment ki ekezet nelkuli magyar szoveg. FAIL-OPEN: a problemakat naplozzuk,
  # de kuldunk, mert a felugyeleti csatornan a nemulas a dragabb (ugyanaz az
  # indoklas, mint a kapu telegram-agaban).
  GATE="$INSTALL_DIR/scripts/hooks/outgoing-copy-gate.py"
  if [ -f "$GATE" ]; then
    if GATE_OUT="$(python3 "$GATE" --check-file "$BRIEF_OUT" 2>&1)"; then
      echo "KAPU: tiszta" >> "$LOG"
    else
      echo "KAPU-FIGYELMEZTETES (a szoveg IGY ment ki, fail-open):" >> "$LOG"
      printf '%s\n' "$GATE_OUT" >> "$LOG"
    fi
  fi
  # MORNING_DRY_RUN=1 -> nincs kikuldes, csak a szoveg a naploba (teszteleshez).
  if [ "${MORNING_DRY_RUN:-0}" = "1" ]; then
    echo "DRY RUN: nem kuldtem ki, a szoveg $(wc -c < "$BRIEF_OUT") bajt" >> "$LOG"
    rm -f "$BRIEF_OUT"
    echo "=== Kesz $(date) -- DRY RUN ===" >> "$LOG"
    exit 0
  fi
  # A kuldes a szkriptbol megy, hogy ne fuggjon a -p session tool-keszletetol.
  TG_TOKEN="$(grep -oP '(?<=^TELEGRAM_BOT_TOKEN=).*' "$HOME/.claude/channels/telegram/.env" 2>/dev/null | tr -d "\"'" | head -1)"
  if [ -n "$TG_TOKEN" ] && [ -s "$BRIEF_OUT" ]; then
    SEND_RES="$(curl -s -X POST "https://api.telegram.org/bot$TG_TOKEN/sendMessage" \
      -d chat_id="$CHAT_ID" --data-urlencode "text=$(cat "$BRIEF_OUT")")"
    if printf '%s' "$SEND_RES" | grep -q '"ok":true'; then
      echo "$TODAY" > "$STAMP"
      echo "KIKULDVE Bot API-val: $(printf '%s' "$SEND_RES" | grep -oP '(?<="message_id":)[0-9]+' | head -1)" >> "$LOG"
    else
      echo "KULDESI HIBA: $SEND_RES" >> "$LOG"
    fi
  else
    echo "KULDES KIMARADT: token vagy szoveg hianyzik (token=${TG_TOKEN:+van}, meret=$(wc -c < "$BRIEF_OUT"))" >> "$LOG"
  fi
fi
rm -f "$BRIEF_OUT"

echo "=== Kész $(date) ===" >> "$LOG"
