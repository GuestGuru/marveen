# Éjszakai átemelő kör: a bot-memória céges tudása a céges agyba (IT-1289)

> GG-specifikus. A botok saját memóriájában (`shared`, `warm`, `cold`) lévő céges tudást
> minden bot éjjel maga emeli át a céges agyba (brain.guest.guru), a gazdája nevében.

## Miért

Az IT-1178 óta minden bot CLAUDE.md-jében ott a generált „Céges agy” blokk, és mindegyiknek
saját gg-mcp tokenje van (`marveen/<név>`). A mentés a pillanatban mégis alig működik (mérve
2026-10-03, 09-29 óta: salesninja 2 `brain_save`, a többi bot 0). Közben a botok saját
memóriájában sok a céges tudás, nagy része a 09-29 előtti korból, amikor a `shared` polc még
„közös céges memória” volt. Ezt a pillanatnyi mentés szabálya soha nem hozza át.

**Tamás döntése (2026-10-03):** a bot maga dönti el, mit emel át, a kolléga bevonása nélkül.
Nincs jóváhagyási lista, nincs válaszvárás, és nincs tájékoztató üzenet sem.

## Közös szabály és helyi adapter (IT-1608)

A közös céges memória szabályainak forrása a gg-mcp instructions és a
`gg_knowledge_get(topic: "ceges-agy")` kézikönyv. A gg-mcp telepíti a `ceges-agy`
(tool-leképezés, mentés, javítás, visszavonás) és a `memory-review` (kliensoldali
átnézés, tartós célhely-javaslat) közös skilleket. Marveen nem tart saját példányt
az általános munkafolyamatból: a generált CLAUDE.md-blokk csak a flotta polcait,
a gazda tokenjét és a háttérkörök helyi szabályát köti a központi forráshoz.

A `brain-promotion` a Marveen saját memóriaadaptere: a meglévő bot-sessionben
értékel, ugyanazzal a gazda-tokennel, legfeljebb 40 tétellel; a sorrendkapu,
kurzor és csendes futás megmarad. Új központi LLM-job nem indul. A dream-engine
flotta-memória-egészség és helyi működés; nem a céges agy központi átnézője.

Céges szabály tartós célja a wiki vagy a gg-mcp közös skill forrásrepója,
forrás-id-vel és konkrét javaslattal. A globális bot-created skill és a privát
flotta-tükör nem terjeszti ezt a kollégák Claude/Codex klienseinek. Generált
közös skillt a bot nem szerkeszt: telepítéskor felülíródik. Személyes és
botműködési tudás user/local skillbe kerül, személyes működésmód-váltás a gazda
jóváhagyásával. A saját memória átemelése a brainbe és a jóváhagyást igénylő
tartós szabályváltoztatási javaslat külön művelet.

## Hogyan

| Rész | Hol | Mit csinál |
|---|---|---|
| Ütemezett feladat botonként | `~/.claude/scheduled-tasks/brain-promotion-<agent>/` | `heartbeat` típus (a runner nem üzen a gazdának), naponta 01:05-től 7 percenként szórva, a fő agent az első |
| A feladat írója | `src/gg/brain-promotion.ts`, `src/gg/brain-promotion-fleet.ts` | boot-kor (`src/web.ts`, a hook-regisztrációs ág): a SKILL.md mindig újraíródik, a `task-config.json` `enabled`, `schedule` és `createdAt` mezője megmarad |
| Jelöltek és kurzor | `node dist/gg/brain-promotion-cli.js candidates \| done \| status --agent <név>` | a `store/claudeclaw.db`-t csak olvassa; a haladás a `store/brain-promotion/<agent>.json`-ban |
| PreCompact-prompt | `src/gg/precompact-brain-note.ts` | a „Más agent-nek is -> category=shared” sort `[GG IT-1289 BEGIN/END]` markerek közé írja át: a céges tudás a saját `warm` polcra megy, onnan éjjel átkerül |
| CLAUDE.md-blokk | `src/gg/brain-rules-section.ts` | a „háttérkörben nincs mentés” szabály kivételt kap erre a körre |

### Miért botonként, és miért nem a dream-engine

A gg-mcp token az identitás. A `brain-promotion-<agent>` feladatot a runner a bot SAJÁT
tmux-sessionjébe kézbesíti, és ott a gg-mcp proxy a gazda tokenjével fut, tehát a bejegyzés
szerzője a gazda. A dream-engine a fő agent sessionjében fut: ha ott fésülnénk össze, minden a
fő agent gazdájának nevében menne (az IT-1161 nyitott kérdése).

### Egy kör

1. A bot betölti a `brain_*` toolokat (ha nincsenek, a kör csendben véget ér).
2. Egy körben egyetlen `candidates --limit 40` adag: a saját `shared`/`warm`/`cold` tételei a kurzor után, id szerint.
   A `hot` (futó állapot) és a „céges agy: …” mutatók kimaradnak. A `remaining` a következő
   éjszakára marad; az adag végén nincs újabb lapozás. Ez promptutasítás, nem CLI-szintű napi kvóta.
3. Tételenként dönt a központi kézikönyv szabályával. Titok, futó állapot, HR, a botok
   működése és a gazda preferenciái nem mennek át. Átemelés előtt `brain_search`-öt futtat a
   duplikátumok kiszűrésére, utána `brain_save`. A `kulcs` értéke `marveen-<agent>-mem-<id>`, így
   egy újrafutás nem duplikál. A `fogalmak` között mindig ott a `marveen-átemelés`. Döntésnél a
   `dontotte` a megnevezett ember, különben `agent`, `jovahagyta` nélkül. A bizonytalan tétel
   `megfigyeles`. Ha több írható tér miatt a mentés térválasztást kér, a bot az ismert
   listából explicit `ter`-rel próbálja újra, és a kör további mentéseiben is megadja a teret.
4. Minden tétel után `done --id <id> --decision <ADD|UPDATE|SUPERSEDE|NONE|DUP|SKIP>`, így egy
   megszakadt kör (pl. a 03:00-s újraindítás) ott folytatódik, ahol abbamaradt. A kapott id-sorrend
   kötelező: sikertelen, nem javítható mentésnél a kör megáll, nem lép tovább nagyobb id-re.

A kezdeti állomány (mérve 2026-10-03: a fő agent 392, jean 132, salesninja 126 stb., összesen
~900 tétel) éjszakánként legfeljebb 40 tétellel néhány éjszaka alatt fogy el.

## Kezelés

- **Kikapcsolás egy botnál:** `task-config.json` → `"enabled": false` (a boot nem írja vissza).
- **Mit vitt át:** `node dist/gg/brain-promotion-cli.js status --agent <név>`; a céges agyban
  keresés a `marveen-átemelés` fogalomra, illetve az adott gazda szerzőségére.
- **Visszavonás:** a gazda szól a botnak; a `ceges-agy` közös skill visszavonási szabálya érvényes
  (`brain_archive`, UPDATE/SUPERSEDE esetén az előd visszamentése).
- **Újra-átnézés elölről:** a `store/brain-promotion/<agent>.json` törlése. A `kulcs` miatt nem
  duplikál, csak tokent költ.
- A drift-mérő (`scripts/scheduled-task-drift.sh`) a feladatot `ephemeral` jelöléssel és
  indokkal mutatja: a sablon a kódban él, nem a repó `scheduled-tasks/` mappájában.


## Első éjszakai utóellenőrzés (2026-10-04, IT-1292)

A vizsgált időablak Europe/Budapest szerint 01:00–02:30, UTC-ben
2026-10-03 23:00–2026-10-04 00:30. Az éles kurzorok, a csak olvasott SQLite-napló és a
céges agy `brain_get` / `gg_audit_query` válaszai egymással összevetve:

| Bot | Éjszakai tételek | ADD | UPDATE | DUP | SKIP | Kurzor |
|---|---:|---:|---:|---:|---:|---:|
| marveen | 40 | 3 | 0 | 4 | 33 | 292 |
| brokermarcsi | 58 | 29 | 0 | 1 | 28 | 1069 |
| bubi | 40 | 4 | 0 | 9 | 27 | 892 |
| jean | 40 | 23 | 2 | 5 | 10 | 423 |
| marlenka | 24 | 4 | 0 | 2 | 18 | 1027 |
| peppa | 40 | 19 | 0 | 3 | 18 | 736 |
| salesninja | 40 | 7 | 0 | 11 | 22 | 149 |
| **Összesen** | **282** | **89** | **2** | **35** | **156** | — |

A fő bot összesített számlálója a két előző kézi kört is tartalmazza: az éjszakai eredményt
az állapotfájl `log[].at` időpontjaival kell szűrni, nem a `totals` értékét idézni.
Mind a hét ütemezés elindult. A kurzor előtt nem maradt naplózatlan, jelenleg átemelhető
memória (a teljes kezdeti napló még megvolt). A 40 elemes korlátot brokermarcsi túllépte:
a toolnaplóban második `candidates` hívás látszik. Az IT-1292 ezt a közös promptban
pontosítja: egy futás egy adagot kezel, sorrendben.

Az audit 108 `brain_save` hívást adott: 92 `allow`, 16 `hivo-hiba`. A hibás hívásoknál a
`ter` hiányzott, több írható csapat-tér miatt választani kellett; a későbbi explicit
mentések sikerültek. Az audit célpontjának `sajat` szava a hiányzó paraméter jelölése,
nem a bot által beküldött térnév. A prompt a felsorolt tereket a körben újra használja.
A 92 sikeres hívás és a 91 naplózott célbejegyzés eltérése egy ugyanazon körben végzett,
külön kulcsos pontosítás: az előd a felülírási láncban megmaradt.

A 91 célbejegyzést és a plusz pontosítást `brain_get`-tel ellenőrizve a szerző mindenütt
a megfelelő bot gazdája. A tartalmi mintákban nem találtunk tokent, auth nélküli belépő
azonosítót, egyéni HR-értékelést, futó feladatállapotként mentett bejegyzést vagy pusztán
botüzemeltetési zajt. Ez nem a történeti állítások újramérése: a régi árak, jogi és
működési adatok használat előtt a hivatkozott forrásból ellenőrizendők. A részletes,
belső minták és szerzők az IT-1292-ben vannak, nem ebben a nyilvános repóban.

A `conversation_log` vizsgált időablakában 0 sor volt; a toolnaplóban sem volt
csatornaküldés. Nem keletkezett saját memória vagy napi napló az átemelésről. Az ablakban
látható egy másik `hot` memória és napi napló a 02:07-es dream-engine körhöz tartozott.
A drift-mérő mind a hét `brain-promotion-*` feladatot indokolt `ephemeral`-ként mutatta.

Mérési buktató: a `task_runs.ts` milliszekundum, a `conversation_log.created_at`,
`tool_call_log.created_at` és `memories.created_at` másodperc. Az audit intervallumát a
GG-MCP IT-1294 javításáig UTC `Z` alakban add meg: a `+02:00` alak azonos időpontra hamis
üres eredményt adott. Az audit szöveges válasza szerzőnként részletez, agent-címkét nem
mutat; a bothoz rendelést a helyi toolnaplóval és a mentések szerzőjével ellenőriztük.

A promptváltozás hatását a következő éjszakai körön kell újra mérni (IT-1295, 2026-10-05); a szöveg jelenléte
és a generátor tesztje önmagában nem bizonyítja az agent későbbi utasításkövetését.


## Sorrendvédelem (IT-1295)

Az utómérés 2026-10-10-én a 2026-10-05-i és 10-i természetes köröket vizsgálta:
14 kör, 208 tétel; minden kör legfeljebb 40 elem és egy candidates-hívás. A
rendezett kurzornapló azonban nem bizonyítja a mentések sorrendjét: egy bot egy
későbbi tételt mentett előbb, majd a done-sorokat rendezve írta be.

A `scripts/hooks/brain-promotion-save-gate.py` PreToolUse hook az átemelő
`marveen-<agent>-mem-<id>` kulcsú MCP brain_save előtt a meglévő CLI
`check-save` ellenőrzését futtatja. Csak a kurzor utáni első, saját, átemelhető
tételt engedi menteni; a javító kulcs ugyanarra a még lezáratlan tételre mehet.
A `done` ugyanezt ellenőrzi: átugrás, visszalépés vagy ismételt nyugtázás hibát
ad, és nem ír kurzort. Új állapottár, adatbázis-írás és migráció nincs.

Bekötés: fő botnál a repo `.claude/settings.json`, sub-botoknál a GG
`fleetChannelHooks` overlay; az meglévő hookokkal összeolvad. Hiányzó build vagy
sérült kurzor esetén az átemelő mentés blokkolva van. Telepítéskor előbb build,
majd a hookok regisztrálása és új sessionben az aktiválás ellenőrzése szükséges.
A kód és a teszt nem helyettesíti a következő éles éjszakai kör mérését.

Korlát: a kapu az átemelő kulcsú MCP brain_save útját védi, nem a shelles MCP
hívást vagy az eltérő kulcsot. A szándékosan SKIP-nek minősített hibás mentést
nem tudja megkülönböztetni a valóban kihagyandó tételtől. A 40-es körkorlát
változatlanul promptutasítás. Ezek ellenőrzése a teljes session toolnaplójából
kell, nem pusztán a rendezett kurzorból.

## Éles aktiválás és természetes utómérés (2026-10-13, IT-1580)

A mért runtime `/home/gg/marveen`, HEAD `0417c570` (az IT-1608 utáni main).
A sorrendvédelmet tartalmazó kód 2026-10-11 07:13 körül jutott ki;
a dashboard naplója ugyanakkor mind a hat sub-bot hookbeállításának
frissítését mutatja. A fő bot projektbeállítása és a hat sub-bot
projektbeállítása egy-egy `.*brain_save$` matchert tartalmaz a blokkoló
`brain-promotion-save-gate.py` parancshoz. A buildben megvan a `check-save`
és a szigorú `done`; a beállításokban nincs `disableAllHooks` kapcsoló.

A konfiguráció aktiválását a 2026-10-12 03:00–03:01 közötti, mind a hét
botot érintő természetes processz-újraindítás támasztja alá. A folytatás
`--continue` módban történt: az azonos session-UUID és a változatlan systemd
channels-indulási idő nem jelenti, hogy ugyanaz a Claude processz futott
tovább. A dashboard restart-naplóját és a tényleges processzadatokat is
ellenőrizni kell. A következő természetes nightly így 2026-10-13-ra esett;
a korábbi 2026-10-11-i ablak még a kód telepítése előtt volt.

A teljes session tool-use/result naplókból, a `task_runs` és a kurzorlog
összevetéséből mért ablak: `2026-10-12T23:00:00Z`–`2026-10-13T00:30:00Z`
(Europe/Budapest 2026-10-13 01:00–02:30).

| Bot | Éjszakai tételek | candidates-hívás | Döntés |
|---|---:|---:|---|
| marveen | 5 | 1 | 5 SKIP |
| brokermarcsi | 0 | 1 | üres adag |
| bubi | 0 | 1 | üres adag |
| jean | 0 | 1 | üres adag |
| marlenka | 0 | 1 | üres adag |
| peppa | 0 | 1 | üres adag |
| salesninja | 0 | 1 | üres adag |

Mind a hét runner-sor `fired`, `done`, `intact`, kitöltött befejezéssel.
Mindegyik hívás `--limit 40`; második adag nincs. A fő bot eredeti
jelöltlistája és a sorosan végzett `done`-hívások azonosak:
`1148, 1151, 1152, 1153, 1158`. A hat sub-botnál `remaining=0` és nulla elem.
Az üres adag az elfogadási feltétel szerint megfelelő.

Ebben a mintában **nulla átemelő brain_save** volt, MCP-n és shelles úton is.
Nincs új céges bejegyzés, ezért szerzőségre, legalább öt teljes célbejegyzés
tartalmára, explicit térhasználatra és save/done sorrendre nincs új mentési
minta. Közvetlen PreToolUse-blokkolást vagy javíthatatlan mentési hiba utáni
megállást sem figyeltünk meg; ezekre nem állítunk éles garanciát.
A fent dokumentált shelles/eltérő kulcsú és tudatos SKIP korlátok megmaradnak.

Az ablak `conversation_log`-ja üres. A promotion körökben nincs csatornaküldés,
saját memóriamentés vagy napi napló; az ablak későbbi, 02:15-ös saját hot
memóriája és napi naplója külön háttérfeladathoz tartozik. Éles tesztmentés,
kézi kör, restart, settings-, task-config- vagy kurzorírás nem történt a mérés
során. A részletes session- és runner-azonosítók az IT-1580-ban vannak.

Mérési recept: előbb `PRAGMA table_info(task_runs)`; a mért feladatnév-oszlop
`name`, nem `task_id`. A `ts` milliszekundum, a többi vizsgált SQLite-idő
másodperc. A központi auditot UTC `Z` ablakkal kérdezd; a rotáció miatt az
üres audit önmagában nem bizonyít nulla hívást, ehhez a teljes sessionnapló is
szükséges.
