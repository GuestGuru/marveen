---
name: channel-ledger-provider
description: A marveen conversation-continuity ledger (scripts/hooks/ledger-*.py) bővítése vagy javítása új csatorna-szolgáltatóra (Discord, Slack, stb.), illetve ledger-hiba diagnózisa. Triggerelődik - új channel plugin telepítve, "a beszélgetés kiesett újraindulásnál", "a discord thread nincs a naplóban", ledger-capture / ledger-outbound / ledger-replay / ledger-live-drain hibakeresés.
---
# Channel ledger: új provider bekötése

## Mikor használd
- Új channel plugin (discord, slack, ...) került az `enabledPlugins`-be, és a beszélgetés-folytonosságnak arra is működnie kell.
- Egy csatorna beszélgetése nem jelenik meg a `SessionStart` replay-ben újraindulás után.
- A `conversation_log` sorok rossz `chat_id`-vel vagy rossz aggal íródnak.

Háttér doksi: `docs/conversation-continuity.md` (a mechanizmus teljes leírása).

## Eljárás
1. **Ne nyúlj a sémához.** A `conversation_log` oszlopait egy drift-teszt fagyasztja (`db.ts` initDatabase vs `ledger_lib.py`). Új provider NEM jelent új oszlopot.
2. **Névterezd a chat_id-t** a séma helyett: nem-telegram csatorna = `"<provider>:<chat_id>"`, a telegram BARE marad. Helpers: `ledger_lib.qualify_chat(provider, chat_id)` és `split_chat(chat_id)`. Így a régi sorok, a drain statefile-ok és a `chat_id=0` owner shorthand változatlanul működnek.
3. **Reply tool feloldás**: a provider -> reply tool leképezés a `ledger_lib.REPLY_TOOLS`-ban van (`DEFAULT_PROVIDER = "telegram"`). Új providernél ide vedd fel, hogy a replay a helyes csatornán tudjon válaszolni.
4. **Outbound hook matcher**: a `.claude/settings.json` PostToolUse matchere legyen provider-generikus regex (`mcp__plugin_[a-z0-9-]+_[a-z0-9-]+__reply`), ne egy konkrét tool neve.
5. **Inbound capture** a `<channel source="plugin:<provider>:<server>" ...>` blokkból parse-ol; a provider onnan jön, ne hardcode-old.
6. **Teszt**: `bash scripts/__tests__/conversation-ledger.test.sh` -- de lásd a Buktatókat (élő installon nem futtatható minden).
7. Dokumentáld a `docs/conversation-continuity.md` *Multi-provider* szekciójában.

## Buktatók
- **A vitest suite NEM fut élő installon** (sandbox guard: a suite nem mutálhat éles telepítést). Futtatás: `git ls-files`-ból másolt tiszta példányban, külön könyvtárban.
- **A settings.json hook-változás csak a KÖVETKEZŐ indulásnál lép életbe.** Outbound naplózás bekötése után szólj a gazdának, hogy a kimenő oldal a mostani sessionben még nem naplózódik.
- **Turn KÖZBEN érkező üzenet rés (nyitott!)**: az "A message arrived while you were working" típusú, futó turn közben beeső csatorna-üzenet NEM triggerel `UserPromptSubmit`-et, így a `ledger-capture` kihagyja. A live-drain sem látja, mert sosem került a ledgerbe. Ha ezt javítod, ne a capture-t told meg, hanem külön forrásból (channel inbox) pótold.
- **Plugin bekapcsolás kizárólagos lehet**: új channel plugin telepítésekor a régi (telegram) `false`-ra állhat az `enabledPlugins`-ben. Nézd meg, mielőtt "majd telegramon jóváhagyatjuk" jellegű utat ígérsz.
- **A replay NEM thread-szeparált, csak cimkézett.** `ledger_lib.recent()` az utolsó `RECENT_LIMIT` (20) fordulót `WHERE agent_id=?` szűréssel adja vissza, chat_id/thread szerinti szűrés NÉLKÜL; a `ledger-replay` csak provider-taggel jelöli a nem-default sorokat. Vagyis minden szál minden threadje ugyanabba a session-kontextusba töltődik vissza. Ne állítsd a gazdának, hogy "a threadek külön vannak" -- a tárolás cimkézett, az izoláció nincs meg. Ha valódi izoláció kell, a `recent()`-be chat_id szűrő kell, cserébe a keresztbe hivatkozás ("kapcsold vissza, amit a másik csatornán kértem") elveszik.
- **Visszamenőleges beszélgetés nincs a naplóban.** A javítás előtti thread csak manuális backfill-lel kerül be (provider history fetch -> `INSERT OR IGNORE`). Kérdezd meg a gazdát, kell-e.

## Ellenőrzés
- `sqlite3 store/claudeclaw.db "select agent_id, chat_id, direction, substr(text,1,40) from conversation_log order by id desc limit 10;"` -- a nem-telegram sorok `provider:` prefixszel jönnek, a telegramosok csupaszon.
- Kézzel: küldj egy üzenetet az új csatornán, majd nézd meg, hogy megjelent-e `direction='in'` sorként; válaszolj, és ellenőrizd a `direction='out'` sort (ehhez már újraindult sessionre van szükség, ha a matchert most vetted fel).
- A `SessionStart` replay ténylegesen betölt-e: friss session kontextusában ott kell lennie a "LEGFRISSEBB FORDULÓK" blokknak a helyes csatornával.
