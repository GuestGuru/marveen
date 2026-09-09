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
  - **KET escaper van, es a rossz valasztas nemitja a formazast (2026-08-28-i meres).**
    `mdv2` MINDENT escapel, a `*`-ot IS: az `*felkover*` markereidbol `\*felkover\*`
    lesz, tehat sima szoveg. Ez akkor helyes, ha PROGRAMBOL rakod ossze az uzenetet
    (escapeled a dinamikus reszt, aztan te teszed ra a `*`-ot). KEZZEL IRT hosszu
    uzenethez (reggeli napindito) `mdv2b` kell: az a `*`-ot meghagyja, minden mast
    escapel, ES kuldes elott lefuttatja az `outgoing_gate_check`-et (em dash,
    ` -- `, paratlan csillag). Ha talal valamit, exit 2 es NEM ad kimenetet.
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
python3 $P/fleet.py mdv2 "Tomorrow (8:00) - report!"   # escaped MarkdownV2 (kills *bold*)
cat brief.txt | python3 $P/fleet.py mdv2b            # keeps *bold*, refuses em dash / " -- "
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
- **A Telegram `reply` tool `format` paramétere alapból `text`, nem `markdownv2`.**
  2026-09-07: escapelt MarkdownV2 szöveget küldtem `format` nélkül, és a címzettnél a
  backslashek nyersen jelentek meg ("Fura a válaszod: nyers markdown formázás van
  benne, meg egy csomó felesleges \\ karakter"). **A formázást a paraméter kapcsolja
  be, nem maga a szöveg** -- az escapelés önmagában csak elrontja a sima szöveget.
  Ha MarkdownV2-t escapelsz, a `format: "markdownv2"` KÖTELEZŐ ugyanabban a hívásban.
- **Kimenő ellenőrzőt SOHA ne futtass a küldéssel egy parancsban.**
  2026-09-07: `gate; agent-msg.sh ...` egy Bash-hívásban -- a gate nyolc hiányzó
  ékezetet jelzett és 1-gyel lépett ki, de a küldés a `;` után úgyis lefutott, tehát
  az ékezet nélküli üzenet kiment. Ugyanaz a hibaosztály, mint a lentebbi elsikkadó
  `%{http_code}`: az ellenőrzés lefut, csak nem KAPUZ. Két külön lépés, és a küldés
  csak a 0-s exit után.
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

## Ékezet-kapu a write-ágakon (2026-09-09 óta)

A `daily-log`, `mem-save` és `msg` ág kiküldés ELŐTT megnézi a tartalmat, és ha
200 karakternél hosszabb, magyarnak látszik (legalább két gyakori magyar
kötőszó ékezet nélkül is felismerhető alakban), és 2,0 ékezet/100 karakter alatt
van, egy `FIGYELEM: ekezet-gyanu` sort ír a **stderr**-re. **NEM blokkol** -- a
helyes szöveget sosem akarjuk megállítani, és egy fals riasztás nem érhet többet
egy elveszett bejegyzésnél.

**Miért kell, ha a helper amúgy is átviszi az ékezetet:** mert két külön ok van,
és a helper csak az egyiket zárja ki.
- **(a) az írás útja** -- ágyazott `printf`, `python -c`, `$(...)`: az ékezetek az
  aposztrófokkal együtt esnek ki. Ezt a STDIN + `json.dumps` megoldja.
- **(b) a munkaanyag regisztere** -- a szöveg MÁR ékezet nélkül születik meg (pl.
  egy audit közben olvasott sok régi, ékezet nélküli bejegyzés után). Ezt a
  helper NEM fogja meg, mert pontosan azt viszi be, amit kap. Bizonyíték: jean
  négy bejegyzése közül három nulla ékezetes volt, a negyedik 98, és mind a négy
  ugyanazon az úton ment be.

**A küszöb mért, nem tippelt** (salesninja, 2026-09-09, n=47 napló + n=173
üzenet): a romlott szövegek 0,00-0,13 ékezet/100 karakter között vannak, az épek
5,66-11,36 között. A 60-szoros rés miatt a 2,0 sem fals riasztást, sem
átcsúszást nem ad. **A puszta „nulla ékezet" ellenőrzés KEVÉS**: két romlott
bejegyzés egyetlen ékezetet megtartott (tulajdonnévben), és átcsúszott volna.

**Visszamérve a valós adaton:** napi napló 10/10 elkapva, 0 elszalasztva, 0 fals
riasztás; üzenetek 10 elkapva, 0 fals riasztás. A két „nem jelzett" romlott
üzenet gépi hook-riasztás volt (PROD-FA ŐRSÉG), nem ágens által írt próza --
azokra helyes a hallgatás.

⚠️ **A kapu nem mentesít a saját ellenőrzés alól, ha NEM a helperen írsz.** A
Telegram-válasz, a wiki-írás és a github_commit nem megy át rajta.

## Utólagos ékezet-audit (`accent-audit`) -- és a `flagged: 0` csapdája

```bash
python3 $P/fleet.py accent-audit mem  marveen      # forrás: out | log | mem
python3 $P/fleet.py accent-audit out  -  7         # minden ágens, utolsó 7 nap
```

A kaput lefuttatja MÁR LEÍRT szövegeken, a **DB-ből** (nem az API-ból, az némán
csonkít). Ez nem előzi meg a hibát, hanem kimutatja, és nem a szándékon múlik.

⚠️ **A `flagged: 0` ÖNMAGÁBAN NEM TELJESSÉG-ÁLLÍTÁS, és ezt mérve tudjuk.**
bubi mérése, 2026-09-09: 34 saját emlékéből az audit **28-at vizsgált meg**, a
hatból **kettő tényleg romlott volt** (0,00 ékezet/100 karakter), és a nyelvi
szűrő rejtette el őket. Ugyanezen a napon nálam a shared polcon egy bejegyzés
(#721) ugyanígy csúszott át, miután épp azt jelentettem, hogy nulla romlott van.

**Az ok szerkezeti, nem küszöb-hangolás kérdése.** A kihagyott bejegyzések
jórészt TULAJDONNEVEKBŐL és rendszernevekből állnak (lakásnév, ágensnév, e-mail
cím, összegek), tehát kevés bennük a magyar funkciószó. A nyelvi szűrő pont ott
gyengül el, ahol a szöveg adatszerű -- és a memóriában pont az ilyen bejegyzés a
gyakori. bubi saját, FÜGGETLENÜL írt szűrője ugyanezt a két sort hagyta ki,
ugyanezért: két egymástól független szűrő ugyanott vakult meg.

**Ezért a válasz megmondja, mihez képest nulla:**
- `checked` -- ennyi sort vizsgált meg ténylegesen
- `skipped.short` -- 200 karakter alatt, ki sem került a vizsgálatba
- `skipped.nonhu` -- a nyelvi szűrő dobta ki
- `skipped.nonhu_below_threshold` + `nonhu_below_rows` -- ezek közül HÁNY (és
  melyik) állna a küszöb alatt, ha mégis megmérnénk. **Ez a lista a lényeg:**
  amíg ez nem üres, a `flagged: 0` nem jelenti, hogy nincs romlott sor.

**Teljesség-állítás előtt** ezért mindig a `checked` + `skipped` összegét vesd
össze a korpusz méretével, és nézd meg a `nonhu_below_rows`-t. Ha nulla romlottat
akarsz állítani, azt nyelvi szűrő NÉLKÜL, csak hosszra szűrve mérd -- az a mérés
nem tud alulmérni.

## Safety
- Token is read from `store/.dashboard-token` at call time; never printed or committed.
- Kanban helpers are READ-ONLY; mutations stay in your own audited flows.
- `mail_rules.json` (your real senders) is gitignored.
