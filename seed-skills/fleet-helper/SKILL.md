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

## A NAPI NAPLÓRA a javítás NEM terjed ki

**Döntés, 2026-09-09, brokermarcsi kérdésére.** A napi naplónak NINCS update-
végpontja, csak `POST` (`src/web/routes/daily-log.ts`). A régi bejegyzéseket tehát
csak közvetlen SQLite-írással lehetne javítani, ami megkerüli a szándékolt
append-only tervezést. **Ne tedd.** A régi napló marad úgy, ahogy van.

**Miért, három mért okból:**
1. A memória-keresés **ékezet-érzéketlen** (salesninja mérése): a javításnak
   nincs kereshetőségi haszna.
2. A regiszter-hatás **nem mért, sőt cáfolt**: peppa két napon kimérte, hogy az
   emlékei többsége hibátlan volt, miközben ugyanaznap MINDEN napló-bejegyzése
   romlott. Vagyis nem a napló „fertőz", hanem az írás útja rontott.
3. **A napló a bizonyíték.** jean ma a reggeli dumpja alapján találta meg a saját
   rontását; ha az időrendi nyomot menet közben átírjuk, pont azt veszítjük el,
   amivel az ilyen hibákat ki lehet mutatni. Egy romlott, de HITELES sor többet
   ér, mint egy szép, de utólag szerkesztett.

**A 2. pont pontos alakja (peppa kikötése, 2026-09-09), mert könnyű túllőni
rajta:** peppa mérése ELIMINÁLÓ, nem konstruktív. Azt mutatja, hogy a nap és a
regiszter ÖNMAGÁBAN nem elég magyarázat, mert azonos regiszter mellett vált szét
az emlék és a napló eredménye. Azt NEM mutatja, hogy az írás útja az ok -- az út
a TÚLÉLŐ hipotézis, nem bizonyított mechanizmus. A mechanizmusra az egyetlen
közvetlen bizonyíték marveen első kezű beszámolója: a #820-as üzenetét `printf`-fel,
egy for-ciklusban állította elő (nulla ékezet), a szomszédos kettőt fájlból és
idézőjelezett argumentumból (hibátlan). **Így írd le, ne úgy, hogy „peppa mérése
kimutatta, hogy az út az ok" -- az pont az a hibaosztály, amit ez a szekció javít.**

**Amit szabad, és ami az egyetlen kivétel:** ha a kapu ÉPP MOST írt bejegyzésedre
riaszt, javítsd ki -- de a javítást **írd bele magába a bejegyzésbe** (egy záró
sor: mikor, mi történt, hogy lossless volt), hogy a következő olvasó lássa: volt
egy másik változata. Csendes átírás soha. marveen ma este két saját sorát így
javította (`#581`, `#621`), és ezt itt is kimondja, mert a szabály őrá is
vonatkozik.

**A tartós javítás, ha valaha kell:** egy `PUT /api/daily-log/<id>`, ami CSAK
akkor fogad el változást, ha az új szöveg ékezet nélküli alakja bájtra azonos a
tároltéval. Akkor az append-only garancia gépi, nem becsületbeli. Ez Tamás
döntése, nem az ágenseké.

**AMIT VISZONT MEG KELL MÉRNI A NAPLÓN** (bubi eljárása, 2026-09-09): mivel a
romlás ott véglegesen bent marad, az egyetlen érdemi kérdés, hogy **visz-e tovább
futtatható vagy másolható részt** -- parancsot, regexet, SQL-t, keresési mintát.
Egy ékezet nélküli PRÓZA csak olvashatósági kár; egy ékezet nélküli MINTA viszont
némán rossz eredményt ad annak, aki később kimásolja.

```bash
python3 $P/fleet.py accent-audit log <agens>     # eloszor: mi romlott, es mihez kepest
```
Utána a romlott sorokban keresd a parancsokat (`grep`, `curl`, `sqlite3`, `jq`,
`python3`, `sed`, `SELECT`) ÉS a mellettük álló idézett mintákat. **Nem elég a
parancs jelenlétét nézni**: egy prózában emlegetett `grep` nem hiba. A kérdés az,
hogy egy MINTA vagy STRING vesztett-e ékezetet.
- Ha nincs ilyen: tudomásul vesszük, a bejegyzés marad.
- Ha van: a parancsot egy ÚJ, ékezetes bejegyzésben kell helyesbíteni, mert a
  régit nem lehet. Hivatkozz benne a régi bejegyzés dátumára.

Mérve 2026-09-09: bubi 13 romlott napló-bejegyzés, **0 visz parancsot**; marveen
149 romlott, **0 visz parancsot** (két találat volt, mindkettő idézett próza egy
mondat közepén, nem minta). Vagyis eddig a napló-romlás tényleg csak olvashatóság.

⚠️ **AMIT A TÍZ MEGFIGYELÉS NEM MÉR: A FALS NEGATÍVOKAT** (salesninja, 2026-09-09).
Az 1,3-1,8-as sáv mindhárom eleme ADATSZERŰ bekezdés volt, azonosítókkal és
útvonalakkal. Ha egyszer jön egy VALÓDI romlás, ami történetesen szintén tele van
azonosítóval, az pont ebbe a sávba esik, és a küszöb átengedi. A tíz megfigyelés a
fals POZITÍVOKRÓL szól; a fals negatívokat nem mértük, mert nem is látjuk őket.
**Ezt nem javítani kell, hanem tudni.**

**MÉRT ZSÁKUTCA: a csúszóablakos egység.** bubi javasolta (2026-09-09), jó
diagnózissal: a memória-bejegyzések jellemzően EGY bekezdésesek, tehát a
bekezdés-bontás ott degenerálódik a teljes szövegre, és egy középen ülő romlás
elrejtőzik -- az ő #532-ese pontosan ilyen volt (4,35 az egészre, de az 1350.
karaktertől egy 300 karakteres ablakon 0,00). **A diagnózis helyes, a javasolt
egység viszont nem kell**, két mért okból:
1. A `sentence` detektor EZT MÁR MEGFOGJA. A #532-t az audit `sentence`
   detektorral jelölte meg, mielőtt bubi javította -- a középen ülő romlott rész
   tartalmazott 120 karakternél hosszabb, magyarnak látszó, nulla ékezetes
   mondatot. Nem az egység volt hiányos, hanem bubi példánya volt régebbi.
2. A csúszóablak a teljes flottán **5 találatot ad, és mind az 5 FALS**
   (jean #254 Drive-mappa-ID-k, #464 camelCase API-nevek, #465 UUID, marveen
   #687 feladatnév-lista, #693 idézett log-sor). bubi 34 bejegyzésén nulla fals
   pozitívot adott, a 687-en ötöt. Az ablak érzékenyebb, de ezen a korpuszon
   csak zajt hoz.

⚠️ **A NAPLÓ VIHET IDÉZETT RENDSZER-SZÖVEGET, AMINEK A FORRÁSA ÉKEZETES**
(jean mérése, 2026-09-09 -- alfaj bubi carry-taxonómiájához). Nem futtatható
hiba, tehát az előző bekezdés szűrője nem fogja meg, de aki a naplóból másolja ki
a nevet egy kereséshez, NEM TALÁLJA MEG. jean naplójában a VIP mérföldkő neve
`Tulajdonosi e-mail kikuldese es a weboldali szoveg elesitese`, a Linearben
viszont „Tulajdonosi e-mail, weboldali szöveg és szerződés-kiegészítés élesítése".
Ez a Drive-mappás buktató párja, csak befelé fordítva: ott a KERESÉS volt ékezet
nélküli egy ékezetes névre, itt a TÁROLT idézet az.

⚠️ **A KÜSZÖBNEK IS A KÖZÖSET KELL KÖVETNIE, NEM CSAK A HALMAZNAK** (peppa
mérése, 2026-09-09). Az ő bekezdés-keresője NULLA ékezetre szűrt, a flottáé
sűrűségre: ha egy bekezdésben egyetlen ékezet áll 500 karakteren, az romlott, de
a szigorúbb kritérium átengedte volna. Nála véletlenül nem volt ilyen, tehát az
eredménye helyes lett -- **de nem a módszere miatt.** Két ágens „nulla romlott"-ja
csak akkor jelenti ugyanazt, ha a KÜSZÖB is közös, nem csak a vizsgált halmaz.

⚠️ **A MONDAT-DETEKTORNÁL A SZEGMENTÁLÁS AKKORA HIBAFORRÁS, MINT A KÜSZÖB**
(jean mérése, 2026-09-09). Aki csak a `[.!?]` jelekre vág, a felsorolásos
bejegyzésnél a romlott fejmondatot ÖSSZEOLVASSA a mögötte álló, ékezetes listával,
és a találat eltűnik. jean #439-ese pontosan így csúszott át a saját mérőjén:
253 karakteres romlott nyitó mondat, utána sortörés és ékezetes felsorolás.
**Sortörésre is vágni kell.** A `zero_accent_sentences()` ezt teszi
(`[^.!?\n]+[.!?]?` -- a `\n` bent van a kizárt osztályban); visszamérve ugyanazon
a szövegen a helyes bontó 1 találatot ad, a naiv 0-t.

⚠️ **A PER-JEL NEM AZONOSÍT ÚTVONALAT** (bubi mérése, 2026-09-09). A carry-
ellenőrzésnél kézenfekvő az útvonal-gyanús tokeneket keresni, de magyar szövegben
a `/` sokkal gyakrabban „és/vagy" jelentésű elválasztó. bubi öt találatából négy
valódi útvonal volt (`lakasok/reviews`, `api/schedules`, skill-név), amik
EREDETILEG is ékezet nélküliek és helyesek -- az ötödik, a
„nagytakaritasra/szerelesre", viszont sima romlott magyar szópár.
**A gépies „javítás" itt pont fordítva sülne el:** átírná a négy helyes útvonalat,
és bent hagyná az egyetlen ténylegesen romlott részt.

⚠️ **A LOSSLESS-ELLENŐRZÉS INVARIÁNSA `strip(új) == strip(régi)`, NEM
`strip(új) == régi`** (marlenka mérése, 2026-09-09). A naiv alak félig javított
bejegyzésnél HAMIS eltérést dob: a már ékezetes záradékból az ellenőrzés
lecsupaszítja az ékezetet, a régi oldalon viszont bent van. Aki így ellenőriz, azt
hiszi, elrontotta a javítást -- rosszabb esetben „visszajavítja" a jó záradékot.
A `agents/salesninja/tools/accent-fix.py` a HELYES alakot használja (41. sor),
de aki saját ellenőrzőt ír, könnyen a naivat írja meg.

⚠️ **A rendszernév-kivétel SZÓ-szintű, nem bejegyzés- és nem bekezdés-szintű**
(jean mérése, 2026-09-09). Ugyanaz a MONDAT tartalmazhat javítandó magyar prózát
ÉS érinthetetlen karakterláncot: „a Shared Drive lakas-mappa gyujtoje ... abban
négy almappa: `Szerzodesek` / `Listing fotok` / `Info anyagok` / `Hivatalos
doksik`" -- a próza javítandó, a négy mappanév betű szerint marad, mert a Drive-on
tényleg így hívják. **Ezt gép nem tudja eldönteni, csak ember.** Ezért a
`partial_rows` és a `flagged` helyes olvasata: **„nézd meg", nem „javítsd ki".**

## A félig javított bejegyzés: ép egész, romlott bekezdés (`partial`)

⚠️ **A leggyakoribb rejtőző alak NEM a teljesen ékezet nélküli bejegyzés, hanem a
FÉLIG javított:** mai, ékezetes záradék vagy nyitósor egy régi, ékezet nélküli
törzsön. Az egészre vett arány így 2,0 FÖLÉ kerül, és a kapu hallgat -- pedig a
bejegyzés törzse, amit valaki majd elolvas, ékezet nélküli. jean vette észre a
saját #225-ösén (2026-09-09): a 08-12-i törzs volt ékezetes, és az ő 08-31-i meg
09-01-i ZÁRADÉKAI voltak romlottak; máshol pont fordítva.

**Mérve a teljes korpuszon** (685 memória-bejegyzés >= 200 karakter, a mai
javítások után): **14 ilyen sor**, ebből 2 a közös polcon. Három kézzel
ellenőrzött minta (jean #431, #437, salesninja #630) mind valódi romlás volt --
összefüggő magyar próza, nulla ékezettel, egy egyébként ép bejegyzés belsejében.

Az `accent-audit` ezért a küszöb FÖLÖTTI sorokat is megnézi, és külön adja vissza
őket: `partial` (darabszám) és `partial_rows`. **KÉT detektor uniója**, mert a
kettő egymást egészíti ki, nem váltja:

- **`paragraph`** -- a bekezdés magyar mondataira vett arány a küszöb alatt van.
- **`sentence`** -- van magyarnak látszó, 120 karakternél hosszabb mondat NULLA
  ékezettel. jean mérése, 2026-09-09 este: **a bekezdés-szintű vizsgálat sem
  elég**, mert a `hungarian_ratio` a bekezdésen BELÜL is átlagol. Ha a mai,
  ékezetes záradék ugyanabban a bekezdésben áll a régi, ékezet nélküli
  mondatokkal, a bekezdés átlaga a küszöb fölé kerül. **Minél gondosabb a
  záradék, annál tisztábbnak látszik a romlott törzs.**

Mérve a teljes korpuszon: 3 sort CSAK a mondat-szintű talál (jean #439 shared,
bubi #532, marveen #762), és 3 sort CSAK a bekezdés-szintű. Ezért kell mindkettő.
A sor `detector` mezője megmondja, melyik fogta meg (`paragraph` / `sentence` /
`both`), a minta pedig a `head`-ben áll.

⚠️ **A bekezdés-detektor küszöbe SZIGORÚBB (1,0), mint az egész szövegé (2,0).**
Egy bekezdésben sűrűbben állnak az azonosítók, és azok húzzák le az arányt. Mérve
kilenc kézzel ellenőrzött találaton: a VALÓDI romlások **0,00-0,19** között
vannak, a FALS pozitívok **1,31-1,82** között -- salesninja #544 (API-útvonalak)
és #666 (mezőnév-lista), valamint marveen #710, ahol a bekezdés végig ékezetes,
csak tele van ilyennel: `05-prod-tree-guard`, `<install-dir>`, `node_modules`.
Az 1,0 a rés közepe, és a 2,0-es küszöbbel mind a három fals pozitív bejött volna.

**Ez kilenc megfigyelésből állított konstans, nem százból.** Ezért ad a sor `head`
mezőt is: a `partial` **JELÖLTLISTA, nem ítélet** -- ránézésre ellenőrizd, mielőtt
javítasz.

⚠️ **A SABLONBÓL GENERÁLT SZÖVEG N BEJEGYZÉST ront el egyszerre** (salesninja
mérése, 2026-09-09): egy Python-konstansból generált záradékot négy bejegyzésbe
másolt, és a konstans ékezet nélkül készült. Hármat később kézzel újraírt, a
negyedik (#630) bennmaradt. **Egy kézzel írt hiba egy bejegyzést ront el, egy
sablon-hiba annyit, ahányba beteszed.** Ha egy javítás TÖBB bejegyzésbe visz
azonos szöveget, azt az EGY szöveget mérd meg, mielőtt kiküldöd -- harminc
másodperc, és nála négy bejegyzést mentett volna meg.

**A bekezdés-vizsgálat a MAGYAR MONDATOKRA szűkítve fut**, nem nyers
karakterarányon -- és ez nem finomkodás. Nyers aránnyal 21 találat jönne, és
abból legalább három fals: egy API-útvonalas és egy mezőnév-listás bekezdés
arányát a **szándékosan** ékezet nélküli karakterláncok viszik le, nem hiba
(salesninja #544 és #666). A szűkítés ezeket kiejti, és megtartja a valódiakat.

**Ára van, és mondjuk ki:** a szűkítés 120 karakternyi magyar mondatot kér, ezért
egy RÖVID, romlott bekezdés (pl. egy 205 karakteres lezáró megjegyzés) kiesik.
Ez tudatos csere: inkább hagyjunk ki egy rövidet, mint hogy azonosító-listákra
riasszunk és a flotta „javítani" kezdjen helyes mezőneveket.

## A küszöb 2,0, és NEM emeljük -- plusz a kereszt-ellenőrzés

⚠️ **Az alulmérés javítása a NYELVI SZŰRŐ elhagyása, nem a küszöb emelése.**
A kettő nem ugyanaz a lépés, és a második drága (salesninja figyelmeztetése,
2026-09-09). Mérve ugyanaznap a teljes közös polcon (178 bejegyzés, >=200
karakter, mind a mai javítások után, tehát mind ÉP):

| küszöb | riasztás |
|--------|----------|
| 2,0    | 0        |
| 3,0    | 2        |
| 4,0    | 7        |
| 5,0    | 15       |
| 5,8    | 34       |

A legalacsonyabb ÉP értékek 2,67 (jean #431) és 2,78 (bubi #635), tehát **már egy
3,0-es küszöb is hibátlan bejegyzést riasztana**. Adatszerű bejegyzésnél (URL-ek,
mezőnevek, lakásnév-azonosítók) az arányt a szándékosan ékezet nélküli
karakterláncok viszik le, nem hiba. Ha a küszöböt emeljük, emberek nekiállnak
„javítani" olyan bejegyzéseket, amikben a mezőnév a helyes alak.

**KERESZT-ELLENŐRZÉS, ha nulla romlottat akarsz állítani** (peppa módszere,
2026-09-09): a sűrűség és a szóalak-keresés az ELLENKEZŐ irányba téved.
- A **sűrűség** adatszerű bejegyzésnél félrevihet: sok azonosító lehúzza az
  arányt egy egyébként hibátlan magyar szövegben.
- A **szóalak-keresés** akkor is talál, ha a szöveg tele van azonosítóval:
  keress ékezet nélküli alakokra, pl. `szerzodes`, `lakas`, `dij`, `merve`,
  `foglalas`, `takaritas`, `ellenorzes`, `hianyz`.

A kettő EGYÜTT erősebb, mint bármelyik külön. peppa így igazolta, hogy a nyolc
gyanús bejegyzése valódi romlás volt és nem adatszerű álpozitív: hatnál nulla
ékezet állt 700-2600 karakter magyar prózában.

⚠️ **A darabszám mellé ÍRD ODA A MÉRÉS IDEJÉT, percre.** Ez a korpusz percek
alatt változik, ha többen dolgoznak rajta. Mérve 2026-09-09: egy riasztásom
20:04:44-kor ment ki hét bejegyzésről, a címzett kész-jelentése 20:06:33-kor
érkezett ugyanarról a hétről -- **109 másodperc** különbség, és ebből egy órás
vita lett arról, hogy a mérő rossz-e. A mérő jó volt, a jelentés volt hiányos.
Ellenőrizhető szám nélkül a másik fél a saját, frissebb adatából próbálja
visszafejteni a szabályodat, és rossz következtetésre jut.

## Visszamenőleges ékezet-javítás -- eljárás és kivétel

**A munka értéke NEM az ékezet.** Az ékezet az ürügy, ami rákényszerít, hogy egy
hónapokkal ezelőtti bejegyzést szó szerint végigolvass. Mérve 2026-09-09, három
ágensen: a kényszerű újraolvasás **18 elgépelést** hozott ki magukból az EREDETI
szövegekből (salesninja 9 + 16 db `%%` maradvány egy régi printf-escapelésből,
jean 6, marveen 3), amiket addig hat ágens olvasott hónapokig. Ezt mondd el így,
mert különben kozmetikai feladatnak hangzik, és nem az.

⚠️ **KIVÉTEL: idézett rendszer-szöveget NEM ékezetesítünk** (salesninja szabálya,
2026-09-09). Ha a bejegyzés egy rendszer saját szövegét idézi (`"Uj webes lead
erkezett"`), vagy mezőnevet, azonosítót, fájlnevet, log-sort tartalmaz, az nem
magyar szöveg, hanem **karakterlánc**. Ha ékezetesíted, egy jövőbeli `grep` nem
találja meg, tehát a javítás elrontja azt, amiért a bejegyzés készült. Az ilyen
részt hagyd betű szerint, és tedd idézőjelbe vagy backtickbe, hogy a következő
olvasó lássa: ez szándékos, nem elmaradt javítás. Az ékezet-arányt ez nem rontja
el érdemben: a 692-es bejegyzés 6684 karakter, benne a fenti idézettel, és
7,65 ékezet/100 karakteren áll.

⚠️ **A `--accept-diff` nem formalitás, és ezt is mérés mondja.** salesninjánál
nyolcszor sült el, és a nyolcból **egyszer az ÚJ szöveg volt a hibás, nem a régi**
(„tölteléket" -> „töltelléket"). Minden `--accept-diff` előtt OLVASD EL a kiírt
eltérést, ne reflexből tedd hozzá a kapcsolót.

**A lossless-ellenőrzés és a tény-ellenőrzés nem verseng, más tartományra való**
(jean mérése, 2026-09-09):
- Ahol a szöveg SZÁNDÉKOSAN változik (záradékolás, mondat-átírás, tényjavítás):
  a betűazonosság elvileg sem áll fenn, ott a tény-halmazos összevetés (számok,
  URL-ek, azonosítók, technikai nevek) az egyetlen, ami működik.
- Ahol csak ékezetesítés történik: a **lossless az erősebb**, mert a prózára is
  kiterjed. jean tény-ellenőrzője elvileg sem foghatta meg, hogy a „szettartott"
  nála „szétartott" lett -- egy betű, és a szó jelentése megváltozott.
- **A helyes sorrend:** futtasd a lossless-t, és amit az elutasít, azt vidd a
  tény-ellenőrzés elé. Ne válassz a kettő közül.

**Csinálj DB-dumpot a javítás ELŐTT.** jean a reggeli dumpjából tudta utólag
szétválasztani a 36 javítását (83 betűre azonos, 12 záradékolt, 13 eltérő), és
ebből derült ki a saját rontása. Enélkül nincs független forrás a javítás után.

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
