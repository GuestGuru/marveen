---
name: fleet-helper
description: Shared, dependency-free Python helpers for the agent fleet - dashboard API (memory, messages, kanban), Telegram MarkdownV2 escaping, and rule-based Mail.app triage. Use to do deterministic work (fetch/filter/SQL/format/escape) in Python instead of burning model tokens doing it in the LLM turn. The dashboard token is read from store/.dashboard-token at call time, never hardcoded.
---

# fleet-helper

Move deterministic work (fetch / filter / SQL / format / escape) out of the model
and into Python, so heartbeats and scheduled tasks stop spending tokens
re-deriving the same plumbing each cycle. Python 3 stdlib only, no pip deps.

No secrets or personal data are baked in: the dashboard token is read from
`store/.dashboard-token` at call time, the project root comes from `CLAW_DIR`
(or is auto-detected), and any personal sender/keyword lists live in a gitignored
`mail_rules.json` (see `scripts/mail_rules.example.json`).

## When to use
- Saving/searching memory, posting daily-log, sending inter-agent messages.
- Reading kanban (due today / stuck / by status) without writing SQL by hand.
- Escaping text for a Telegram MarkdownV2 message.
- An email heartbeat: pre-filter unread mail to a compact JSON before the model
  reasons about it.
- Building a token-cheap heartbeat gate (see "The heartbeat gate pattern" below).

## Scripts
- `scripts/fleet.py` - dashboard API + kanban read helpers + MarkdownV2 escaper
  (CLI and importable module).
- `scripts/mail_triage.py` - rule-based unread Mail.app filter (macOS), JSON out,
  never sends and never marks read.
- `scripts/gate_example.py` - reference heartbeat gate; its shell invocation IS
  the mandatory keep-alive tool call (the LLM turn is not skipped, just cheap).
- `scripts/mail_rules.example.json` - copy to `mail_rules.json` (gitignored) with
  your real senders/keywords.
- `scripts/README.md` - full usage and the heartbeat gate pattern write-up.

## Quick start
🛑 **USE A `../../`-RELATIVE PATH, NOT A BARE RELATIVE PATH -- your shell's
CWD is your own agent directory (`<project-root>/agents/<name>/`), NOT the
repo root, so a bare relative path below resolves to nothing there.** A
sub-agent's CWD is always exactly two levels under the project root
(`agentDir()` in `src/web/agent-config.ts`: `PROJECT_ROOT/agents/<name>`), so
`../../` reaches the root from ANY agent, on ANY machine -- no hardcoded
absolute path needed. (`$CLAUDE_PROJECT_DIR`, used elsewhere for hook
`command` fields, does NOT help here: it is unset in a normal agent Bash
call, measured empty.) (Bitten twice in one night, 2026-08-17: two fleet
agents each ran a root-level `find / -iname fleet.py` trying to locate this
script -- a 10+ minute runaway search under macOS/iCloud folders.)
```bash
P=../../seed-skills/fleet-helper/scripts
python3 $P/fleet.py mdv2 "Tomorrow (8:00) - report!"   # escaped MarkdownV2
python3 $P/fleet.py kanban-due
python3 $P/mail_triage.py 90                            # unread <= 90 min -> JSON
```

## The heartbeat gate pattern (the high-value idea)
Frequent heartbeats often wake the model just to run deterministic checks and
then stay silent - wasted tokens. Naively skipping the turn can be unsafe if your
channel transport (e.g. a Telegram MCP over a stdio pipe) relies on a periodic
local tool call to stay connected. The safe pattern: keep the turn but make it
cheap - the heartbeat's first action runs a `gate.py` via the shell (that one
Bash call IS the keep-alive), the gate does the deterministic checks and prints a
`has_signal` flag; on `false` the model writes one line and stops, on `true` it
only does the judgment + notification. Zero scheduler/runner changes. See
`scripts/README.md` for the full rationale and two hard-won scheduling lessons
(avoid cron collisions with other heartbeats; `skipIfBusy` trade-off).

## Buktatók
- **A `GET /api/messages` mailbox-szűrője `agent=`, NEM `to=` -- és a rossz név nem üres listát ad, hanem hibát.**
  2026-08-24: `?to=marveen&status=pending` -> `{"error":"unknown query parameter","unknown":["to"],...}`.
  Ez most szerencsés volt, mert a végpont KISZÓL; de ha a hívást `| head` vagy
  `>/dev/null` mögé teszed, pont úgy néz ki, mintha nem volna várakozó üzenet --
  vagyis a "nincs pending" hamis megnyugvássá válik restart/handoff után.
  A helyes és a végpont által elfogadott kulcsok: `agent`, `status`, `limit`, `before`.
  ```bash
  curl -s -H "Authorization: Bearer $(cat store/.dashboard-token)" \
    "http://localhost:3420/api/messages?agent=marveen&status=pending&limit=20"
  ```
  Ökölszabály: ha egy listázó végpont `[]`-t ad, előbb győződj meg róla, hogy a
  szűrőnevet elfogadta -- egy `{"error":...}` és egy `[]` a terminálban egyformán
  rövid, de az egyik nem válasz.
- **Inter-agent üzenet LEZÁRÁSÁRA nincs API-végpont, és a státusz nem `completed`.**
  2026-08-12: a `POST /api/messages/<id>/complete` sima `Not found`-ot ad (nem 404-es
  JSON-t, csak a szöveget), tehát a saját magadnak küldött `[FELHÍVÁS]` típusú üzenet
  pendingben ragad, és minden inbox-wakeup újra elédteszi. A DB-út működik, de a
  kézenfekvő szó rossz: az `agent_messages.status` CHECK-je
  `IN ('pending','delivered','done','failed')` -- a `'completed'`
  `sqlite3.IntegrityError: CHECK constraint failed`-del száll el. A helyes:
  ```python
  db.execute("UPDATE agent_messages SET status='done', completed_at=unixepoch(), result=? WHERE id=?", (szoveg, mid))
  db.commit()   # commit nelkul elveszik
  ```
- **A memória-végpontnak BIZTONSÁGI SZŰRŐJE van: shell-parancs mintára HTTP 400-at ad.**
  2026-08-11: két mentés bukott el `{"error":"Content rejected by security filter"}`
  válasszal, mert a szöveg szó szerint idézett egy rekurzív törlés-parancsot, illetve
  egy verziókezelő-inicializáló parancsot. Nem a hossz és nem a JSON-formátum volt a
  baj -- ugyanaz a tartalom átment, amint a parancs helyett a MŰVELETET írtam le
  ("az ágens .git stub könyvtárának eltávolítása"). Technikai tanulságot mentve
  ezért kerüld a parancs-alakot.
  **És ami ezt veszélyessé teszi:** a `curl -s ... -w 'memoria: %{http_code}'` minta
  egy többsoros parancs végén könnyen elsikkad, és azt hiszed, mentetted az emléket.
  A 400 NÉMA veszteség. Mindig nézd meg, hogy 200 jött-e vissza.
- **A memória ID-jét a POST VÁLASZÁBÓL olvasd ki, ne a hot-lista sorrendjéből.**
  A `POST /api/memories` visszaadja az `{"ok":true,"id":<n>}`-t; ha `>/dev/null`-ba
  dobod és később a `GET /api/memories?category=hot` első eleméből következtetsz az
  ID-re, könnyen MÁS agent (vagy egy párhuzamos session) frissebb bejegyzését
  találod el. 2026-08-09: a napindító-mentésem a 128 lett, de a hot-lista alapján a
  127-re tettem rá a „[LEZARVA]" bélyeget -- egy idegen memória kapott hamis
  lezárás-jelölést, a sajátom meg hot maradt. A javítás egy nappal később, a Dream
  Engine ellenőrzésén bukott ki. Helyette:
  ```bash
  ID=$(curl -s -X POST .../api/memories -d '...' | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
  ```
  és **UPDATE előtt olvasd vissza a tartalmat** (`SELECT content ... WHERE id=?`),
  hogy tényleg az legyen, amire számítasz.
- **EGY memóriát olvasni ID alapján NEM lehet, írni és törölni IGEN.** 2026-08-12:
  a `GET /api/memories/<id>` nem létező route, HTML-lel/üres testtel tér vissza, és a
  `json.load()` `JSONDecodeError: Expecting value: line 1 column 1`-gyel száll el --
  ez könnyen úgy néz ki, mintha a memória hiányozna vagy a token lenne rossz.
  A tényleges route-készlet (`src/web/routes/memories.ts`): `POST /api/memories`,
  `GET /api/memories?agent=&q=&category=`, `PUT /api/memories/<id>`,
  `DELETE /api/memories/<id>`, plusz `/import`, `/backfill`, `/stats`.
  Egy konkrét rekord tartalmát tehát a LISTÁBÓL szűrd ki:
  ```bash
  curl -s -H "Authorization: Bearer $T" "http://localhost:3420/api/memories?agent=marveen&q=KULCSSZO" \
    | python3 -c "import json,sys; [print(m['content']) for m in json.load(sys.stdin) if m['id']==209]"
  ```
  A `PUT` törzse `{content, category|tier, agent_id, keywords}`, válasza `{"ok":true}`;
  hiányzó ID-re 404 + `{"error":"Memory not found"}` -- tehát itt is a HTTP-kódot nézd,
  ne a curl exit kódját.
- 🔴 **A `PUT` és a `DELETE` 2026-09-01 óta KÖTELEZŐEN kéri, hogy mondd ki a saját
  ágens-azonosítódat, különben 400.** `PUT`: `"owner": "<sajat agens id>"` a törzsben.
  `DELETE`: `?owner=<sajat agens id>` a query stringben. Ha tudatosan MÁS ágens sorát
  írod vagy törlöd, az `any_owner` (`true`, illetve `?any_owner=1`) mondja ki hangosan.
  Ez **elgépelés-védelem, NEM jogosultság**: a flotta egyetlen dashboard-tokent oszt,
  a szerver nem tudja megkülönböztetni a hívókat -- az `owner` csak azt akadályozza
  meg, hogy egy elvétett ID más memóriáját írja át. Nem opcionális, szándékosan: aki
  elgépeli az ID-t, ugyanaz felejtené el az opcionális mezőt.
  Az `owner` KÜLÖNBÖZIK az `agent_id`-tól: az `agent_id` ÁTSOROLJA a sort egy másik
  ágenshez, az `owner` csak ellenőriz. Nem egyező `owner`-nél 404 jön, nem 403.
  ```bash
  curl -s -w "\nHTTP:%{http_code}\n" -X DELETE -H "Authorization: Bearer $T" \
    "http://localhost:3420/api/memories/516?owner=marveen"
  ```
  Mérve 2026-09-01 23:10, a bevezetés napján: az `owner` nélküli `DELETE` a saját
  szerzője első éles törlésén fogott meg -- a 400 törzse megmondja, mi hiányzik,
  tehát a hibaüzenetet OLVASD el, ne a token vagy az ID körül keresd a bajt.
- 🔴 **Írás-végpontot SOHA ne „próbálj ki" dummy törzzsel élő rekordon. HÁROMSZOR
  fordult elő, és mindháromszor le volt írva előre.** 2026-08-27: üres `PUT` egy
  MÁSIK ágens éles ütemezett feladatán, hogy „létezik-e a végpont" -- a
  `docs/scheduled-tasks.md` egy sorral feljebb mondja ki, hogy a `PUT` merge-elő.
  2026-08-28: „teszt" tartalmú `PUT` egy éles memória-bejegyzésen (484) --
  a helyes metódus ebben a fájlban állt, a fenti route-listában. Egyik sem
  okozott kárt, de mindkettő csak azért nem: az egyik végpont merge-elt, a másik
  szerzője azonnal visszaírta az eredetit.
  **A hibaosztály tehát nem a hiányzó dokumentáció, hanem az el nem olvasott
  dokumentáció.** Ha egy végpont szemantikáját nem tudod, az ELSŐ lépés nem a
  hálózat, hanem a keresés: ez a skill, a seed skillek, `docs/`, végül
  `src/web/routes/*.ts`. Az eredeti eset, amiből ez a szabály lett -- 2026-08-13:
  a 241-es emléket javítani akartam, a `PATCH`-re 404 jött, mire egy ciklussal
  végigpróbáltam a `PUT`/`POST`-ot `{"content":"probe"}` törzzsel -- a `PUT` 200-at
  adott, azaz **felülírta a valódi tartalmat a "probe" szóval**. Vissza tudtam írni,
  mert a szöveg még a kontextusban volt; ha nem lett volna, az emlék végleg elvész.
  Két tanulság, és a második a fontosabb:
  1. A helyes metódus **fentebb, ebben a fájlban le van írva** (`PUT /api/memories/<id>`).
     Az egész próbálgatás azért történt, mert nem olvastam el a saját skillemet,
     mielőtt a `PATCH` 404-re reagáltam. Ismeretlen dashboard-route esetén előbb ez a
     lista, aztán `src/web/routes/*.ts`, és csak legvégül a hálózat.
  2. Ha mégis metódust kell felderítened, azt **nem létező ID-n** tedd
     (`/api/memories/999999`): a 404 vs 405 vs 200 ugyanúgy megkülönbözteti a
     route-okat, csak nem visz el közben egy éles sort.
- **Hot-tier takarítás a heartbeat valódi munkája, ha nincs más.** A `hot` réteg csak
  akkor ér valamit, ha kizárólag AKTÍV dolog van benne; a lezárt "NYITOTT DÖNTÉS" /
  "NYITOTT TEENDŐ" bejegyzések hamis nyitott szálként ülnek ott, és egy friss session
  újra rákérdez arra, amit a gazda már eldöntött. Csendes körben ezért érdemes a
  `GET /api/memories?agent=<én>&category=hot` listát végigvenni, és minden lezárt
  elemet `PUT`-tal `cold`-ra (döntés/tanulság) vagy `warm`-ra (stabil állapot) tenni,
  a szöveg elejére írva a lezárás tényét és dátumát, plusz a hatályos emlék ID-jét.
  **Törlés helyett átminősítés**: az indoklás és a mérés később is érték, csak nem hot.
  Átminősítés ELŐTT ellenőrizd a valóságot (kód/fájl/mérés), ne a saját emléked alapján
  nyilvánítsd lezártnak -- 2026-08-12-én a 180-as teendőt a
  `grep -n "ggFleetRule7" src/web/agent-scaffold.ts` találata zárta le, nem a hitem.
- **A scriptek NEM a skill könyvtárában vannak.** A `~/.claude/skills/fleet-helper/`
  alatt csak ez a SKILL.md van, `scripts/` mappa nincs. A tényleges fájlok a projekt
  gyökeréhez képest élnek: `seed-skills/fleet-helper/scripts/fleet.py`. Ha csak a
  skill könyvtárát nézed, azt hiszed, hogy a helper hiányzik, és kézzel megírod
  ugyanazt. Ellenőrzés indulás előtt:
  ```bash
  ls seed-skills/fleet-helper/scripts/          # fleet.py, mail_triage.py, gate_example.py
  python3 seed-skills/fleet-helper/scripts/fleet.py mdv2 "Teszt (8:00) - ez működik!"
  ```
  2026-07-30-án emiatt írtam saját MarkdownV2 escapert a reggeli napindítóhoz,
  pedig a `mdv2` alparancs kész volt és működött.
- **A KIMENŐ KAPU ÉS A BOLD: minden magyar Telegram-üzenetre érvényes, nem csak a
  napindítóra.** Két dolog kapcsolódik ide, és 2026-08-24-én mindkettő előjött egy
  sima flotta-riportnál -- vagyis a `reggeli-napindito` Buktatókban dokumentálva
  rossz helyen van, mert egy másik feladat nem találja meg.
  1. **A `mdv2` alparancs a TELJES stringet escapeli, a szánt `*bold*` jelölőket is.**
     Bold-tartalmú üzenetnél tehát nem használható közvetlenül. A működő minta:
     írd a nyers szöveget `«...»` jelölőkkel a boldnak, escapelj MINDENT, majd
     cseréld a `«` és `»` karaktert `*`-ra -- azokat az escaper nem érinti.
  2. **A kimenő-szöveg kapu (`scripts/hooks/outgoing-copy-gate.py --check-file`)
     hamis pozitívot ad a `<szám>-es` alakokra**: a kötőjel után önálló `es` szót
     lát, és `és`-t javasol. 2026-08-24: a `4,70-es tisztaság-kategória` bukott el
     rajta. A megoldás ÁTFOGALMAZÁS (`4,70-re csúszott`), nem a kapu kikapcsolása --
     a kapu az ékezet- és gondolatjel-szabályt őrzi, ami valódi hiba szokott lenni.
  Sorrend: nyers szöveg -> kapu (`exit 0`-ig) -> escapelés -> küldés. A kapu a nyers
  szövegen fusson, mert az escapelt backslashek elrontják a szófelismerést.
- **A `sqlite3` CLI hiánya megszűnt, de NE bízz benne vakon.** 2026-07-29-én még
  `command not found` volt (exit 127), 2026-07-31-re feltelepült
  (`/usr/bin/sqlite3`, 3.45.1, mérve). A régi buktató lényege viszont megmarad:
  ha a CLI EGYSZER eltűnik, a `sqlite3 store/claudeclaw.db "SELECT ..."` alakú
  hívás NÉMÁN üres kézzel tér vissza (a bash exit 127, de ha a kimenetet nem
  nézed, úgy tűnik, nincs adat). Ezért a python3-as út marad az alapértelmezés,
  mert az nem tud így elcsúszni:
  ```bash
  python3 -c "
  import sqlite3
  db=sqlite3.connect('store/claudeclaw.db'); db.row_factory=sqlite3.Row
  for r in db.execute('SELECT id,content FROM memories LIMIT 5'): print(dict(r))"
  ```
- A `conversation_log` táblának **nincs `role` oszlopa**; a kézenfekvő
  `SELECT role FROM conversation_log` `OperationalError`-ral száll el. Séma-ellenőrzés
  előbb: `PRAGMA table_info(conversation_log)`.
- Üres eredmény != nincs adat. Mielőtt "nincs találat"-ot jelentesz, nézd meg, hogy
  a lekérdezés egyáltalán lefutott-e (exit kód, kivétel), különben a hiányzó CLI
  vagy egy rossz oszlopnév hamis "minden tiszta" jelentéssé válik.

## Safety
- Token is read from `store/.dashboard-token` at call time; never printed or committed.
- Kanban helpers are READ-ONLY; mutations stay in your own audited flows.
- `mail_rules.json` (your real senders) is gitignored.
