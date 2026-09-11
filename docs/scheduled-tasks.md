# Ütemezett feladatok (scheduled tasks)

> Cron-alapú, fájlrendszer-vezérelt automatizációk -- minden feladat egy mappa, a runner 60 másodpercenként nézi és kézbesíti az ágens tmux session-jébe.

---

## Hogyan működik

A schedule runner a dashboard folyamatának részeként fut. 60 másodpercenként végignézi a `~/.claude/scheduled-tasks/` mappában lévő összes feladatot, és amelyiknek a cron kifejezése illeszkedik az aktuális percre, azt kézbesíti a megadott ágens tmux session-jébe mint szöveges promptot.

Kézbesítés után az ágens normál Claude Code session-ként dolgozza fel -- ugyanúgy, mintha te gépelted volna be a promptot.

```
60s tick → cron illeszkedés? → session él? → prompt kézbesítés
                                    ↓ nem
                              auto-start + retry queue
```

---

## Fájlstruktúra

Minden feladat egy önálló mappában él:

```
~/.claude/scheduled-tasks/
  reggeli-napindito/
    SKILL.md          ← a prompt (YAML frontmatter + törzs)
    task-config.json  ← ütemezés, ágens, viselkedési flagek
  memoria-heartbeat/
    SKILL.md
    task-config.json
  ...
```

### SKILL.md

```markdown
---
name: feladat-neve
description: Rövid leírás arról, mit csinál ez a feladat
---

Az ágens ide kapja a promptot. Lehet több bekezdés, lista, utasítások --
ugyanúgy, mintha te gépelted volna be a chat-be.
```

### task-config.json

```json
{
  "schedule": "30 7 * * *",
  "agent": "jarvis",
  "enabled": true,
  "type": "task",
  "skipIfBusy": false,
  "forceSend": false,
  "createdAt": 1776153060
}
```

---

## Mezők referencia

### task-config.json mezők

| Mező | Típus | Alapértelmezett | Leírás |
|------|-------|-----------------|--------|
| `schedule` | string | `"0 9 * * *"` | Cron kifejezés (perc óra nap hónap hétnapja) |
| `agent` | string | főágens | A célpont ágens neve (pl. `"jarvis"`, `"rick"`) |
| `enabled` | boolean | `true` | Ha `false`, a runner átugorja |
| `type` | string | `"task"` | Lásd Feladattípusok |
| `skipIfBusy` | boolean | `false` | Ha `true` és a session foglalt, elveti a tickt |
| `forceSend` | boolean | `false` | Ha `true`, átugorja a busy-ellenőrzést, mindig kézbesít |
| `createdAt` | number | — | Unix timestamp (másodperc), automatikusan töltődik |
| `description` | string | — | Opcionális leírás (ha nincs SKILL.md frontmatter) |
| `targetSession` | string | — | Egyedi tmux session név override (alapból: `agent-<name>`) |

⚠️ **A `description` KÉT helyen élhet, és a SKILL.md frontmatter NYER.** A loader
`description || config.description` sorrendben olvas (`src/web/scheduled-tasks-io.ts`),
tehát ha a SKILL.md frontmatterében van `description:`, a `task-config.json` mezője
SOHA nem látszik az API-n. **Mérve 2026-09-11:** egy ágens a `task-config.json`
leírásának ékezeteit javította atomikus fájl-írással, visszaolvasta a fájlból, és ott
helyesen állt, a `GET /api/schedules` mégis a régi, ékezet nélküli szöveget adta.
Nem cache és nem elavulás: a válasz a SKILL.md frontmatteréből jött, ami érintetlen
maradt. **Eljárás:** ha kézzel szerkeszted a leírást, a SKILL.md frontmatter sorát
írd át, vagy mindkettőt. A `PUT /api/schedules/<nev>` ezt magától megteszi, mert a
`writeScheduledTask` a SKILL.md-t a `description` és a `prompt` mezőből ÚJRAÍRJA.

⚠️ **Az `ephemeral` és az `ephemeral_reason` nem szerepel az API válaszában.** Ezek
dokumentációs mezők a `task-config.json`-ban, a loader nem adja vissza őket, tehát
a `GET` hiánya NEM azt jelenti, hogy nincsenek a fájlban. Aki a listázásból
ellenőrizné őket, hamis nullát kap: a fájlt kell olvasni.

`command` típusú feladatoknál extra mezők:

| Mező | Típus | Alapértelmezett | Leírás |
|------|-------|-----------------|--------|
| `command` | string | — | Raw shell parancs (`bash -lc` alatt fut) |
| `timeoutMs` | number | `10000` | Timeout milliszekundumban |
| `failThreshold` | number | `2` | Ennyi egymást követő hiba után küld Telegram alertet |

---

## Feladattípusok

| Típus | Viselkedés |
|-------|------------|
| `task` | Mindig értesít Telegramon az eredménnyel |
| `heartbeat` | Csendes -- csak akkor ír Telegramon, ha a tartalom fontos/sürgős |
| `command` | Raw shell parancs, nem LLM -- csak a hibákról értesít (ha `failThreshold` átlépve) |

**Mikor melyiket?**
- `task`: reggeli összefoglaló, riport, egyszer futó fontos dolog
- `heartbeat`: 15-30 perces memória-audit, kanban-ellenőrzés -- nem akarod minden ticknél olvasni
- `command`: shell-szintű ellenőrzés (pl. disk usage, service ping) anélkül, hogy LLM token-t költenél

---

## Cron kifejezések

```
perc  óra  nap  hónap  hétnapja
  30    7    *      *         *    → minden nap 7:30
   0    8    *      *       1-5   → hétköznap 8:00
*/15   *    *      *         *    → 15 percenként
   0  8,12,16,20  *  *      *    → naponta 4-szer
   7    2    *      *         *    → hajnali 2:07
   0    9    *      *         1   → hétfőnként 9:00
```

A runner az Europe/Budapest időzónát használja (a node lokális TZ alapján).

---

## skipIfBusy vs. forceSend

Ez a két flag a foglalt session kezelését szabályozza:

- **Alapértelmezett (mindkettő false)**: ha a session foglalt, a feladat retry queue-ba kerül (SQLite). A runner minden ticken újrapróbálja, amíg a session felszabadul. Ha 1 óra után sem sikerül, Telegram alertet küld.

- **skipIfBusy: true**: a tick csendes elvesztése. Csak sűrűn ismétlődő feladatoknál helyes (15-30 percenként), ahol a következő tick úgyis jön. Napi/heti feladatnál soha ne használd.

- **forceSend: true**: átugorja a busy-ellenőrzést, beleküldi a promptot a tmux session-be. A Claude feldolgozza, amint az aktuális feladat elkészül. Kritikus feladatokhoz (pl. reggeli összefoglaló), amelyek nem maradhatnak ki.

---

## Busy-session kezelés és retry queue

Ha a célpont session elfoglalt és `skipIfBusy` nincs beállítva, a feladat bekerül a `pending_task_retries` táblába (SQLite, a dashboardon is látható). A runner minden 60s ticken újrapróbálja. Ha 1 órán túl is pending marad, Telegram alertet küld.

Ha a session egyáltalán nem fut:
1. A runner megpróbálja auto-startolni az ágenst
2. A feladat retry queue-ba kerül
3. Amint a session elindul és Claude betöltött, kézbesíti

---

## Auto-start viselkedés

Ha egy ütemezett feladatnak kellene futnia, de a célpont session nem létezik (pl. az ágens le volt állítva), a runner automatikusan elindítja az ágenst, majd retry queue-n keresztül kézbesíti a promptot. Ez biztosítja, hogy egy napjában egyszer futó feladat (pl. `0 2 * * *`) ne maradjon ki, ha az ágens éppen nem volt fut közben.

---

## Biztonsági korlátok

A prompt injektálás előtt egy "untrusted" preamble kerül eléje, hogy az esetleg felhasználói adatból érkező tartalom ne hajtson végre kód-injekciót az ágens context-jében. A maximális prompt hossz 50 000 karakter (~12K token) -- ennél nagyobb kérelmet a backend elutasít 413-mal.

---

## API referencia

A dashboard Bearer tokennel védett (token: `store/.dashboard-token`).

```bash
TOKEN=$(cat /Users/jonasgergo/Documents/marveen/store/.dashboard-token)
```

### Lista

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3420/api/schedules
```

### Létrehozás

```bash
curl -s -X POST http://localhost:3420/api/schedules \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "feladat-neve",
    "description": "Rövid leírás",
    "prompt": "A részletes prompt szövege amit az ágens megkap",
    "schedule": "0 8 * * *",
    "agent": "jarvis",
    "type": "heartbeat",
    "skipIfBusy": true
  }'
```

#### Sub-ágensnek szóló feladat: ELŐBB próbálja meg ő maga

🔴 **A korábbi állítás itt MEGDŐLT (2026-09-08).** Ez a szakasz korábban azt mondta, hogy
a sub-ágens a saját nevére szóló ütemezést **nem tudja** létrehozni, mert a governance
hard-gate elutasítja (`Self-pace TILTOTT -- sub-agentkent NEM utemezhetsz sajat jovobeli
turn-t`), tehát a fő-ágensnek kell POST-olnia helyette. **Mérve 2026-09-08:** brokermarcsi
a SAJÁT tokenjével hozta létre a `konyvelesi-anyag-hianylista` feladatot, és visszaolvasva
`enabled: true`, `agent: brokermarcsi` (`~/.claude/scheduled-tasks/konyvelesi-anyag-hianylista/task-config.json`,
`createdAt` 1788891843). A gate tehát nem áll ott, ahol ez a doksi mondta.

**A helyes sorrend ezért:** ha egy sub-ágens ütemezést kér tőled, először kérdezd meg,
**próbálta-e maga** -- egy `/api/schedules` POST a saját dashboard-tokenjével. A fő-ágens
csak akkor POST-oljon helyette, ha nála TÉNYLEG elutasításba fut. A tiltás ágensenként és
időben eltérhet, tehát a mérés dönt, nem ez a bekezdés.

⚠️ **A hiba formája nem az elutasítás volt, hanem hogy meg sem próbálta.** brokermarcsi
saját szavával: egy régi emléknek hitt, és nem futtatta le a POST-ot. Ezért **a megméretlen
tiltás drágább, mint egy elutasítás** -- az elutasítás legalább hibaüzenetet ad, egy
emlékbe fagyott „nem lehet" viszont némán fenntartja magát, és minden kör megerősíti.
Ez általános szabály, nem csak az ütemezésre: ha egy „tiltott"-nak hitt művelet olcsón
kipróbálható, próbáld ki, mielőtt megkerülő utat építesz rá.

Ha mégis te POST-olsz helyette (mert nála elakadt), a lenti négy ellenőrzés kötelező --
azok a delegálás miatt kellenek, nem a gate miatt, tehát változatlanul érvényesek.

**Amit a fő-ágensnek ilyenkor ellenőriznie kell, és ami nélkül némán rossz eredmény
születik:**

1. **A promptot SZÓ SZERINT vidd be, teljes ékezettel.** Ne "tömörítsd" -- a kérő ágens
   ismeri a saját folyamatát, te nem. Az ékezet-szabály itt is él: az ékezet nélküli
   prompt ékezet nélküli kimenő üzenetet szül a címzettnél.
2. **Kérd el tőle, MELYIK az a néhány mondat, ahol némán rossz SZÁM keletkezne**, és
   azokat a beírás után külön `grep`-eld vissza a lementett `SKILL.md`-ből. A fenti
   esetben három ilyen volt (egy részletfizetés felső korlátja, egy két forrásból
   összeadódó összeg, és egy kivétel egy táblázat-sorban) -- mindhárom olyan, amit egy
   ártalmatlannak tűnő rövidítés kivágott volna, és az eredmény attól még lefutott volna.
3. **Küszöb-dátumnál a HATÁR is mondja meg, melyik futás esik bele** (lásd a Frissítés
   szekció figyelmeztetését).
4. **Nézd meg, mi történik, ha az ablak NEM elég.** Egy `heartbeat`, ami csendben zár,
   a hiányt is elhallgatja: ha az esemény az ablak után következik be, az a hónap némán
   kimarad. A javítás nem feltétlenül a szélesebb ablak -- az ugyanazt a hibaformát
   tartja meg, csak ritkábban --, hanem hogy az **utolsó futás mondja ki, mi hiányzik**.
   Így a csend nem azt jelenti, hogy minden rendben, hanem azt, hogy tudunk róla.

**A feladat SABLONT is kap? Ügyfél-feladatnál jellemzően NEM, és ez tudatos döntés.**
A drift-mérő (`scripts/scheduled-task-drift.sh`) minden sablon nélküli élő feladatot
kiír, és a reflex az, hogy pótoljuk. **Egy ügyfél-folyamatnál ez adatszivárgás lenne:**
a repo-sablon a PUBLIKUS forkba megy, a prompt viszont neveket, díjazást, folyamatban
lévő tartozást tartalmazhat. Ilyenkor a `task-config.json` kapjon `"ephemeral": true`-t
-- a mérő ettől nevesítve, külön sorban listázza, tehát a döntés látszik, de nem zajként.

⚠️ **Az `ephemeral` neve félrevezet, a jelentése tágabb.** Eddig „ügyfélhez és DÁTUMHOZ
kötött, ideiglenes" feladatokat jelölt (egy lakás decemberi figyelése). 2026-09-03-án
két HAVONTA, tartósan futó elszámolási feladat is ezt kapta: a közös bennük nem az
élettartam, hanem hogy **nem termék-viselkedés, és személyes adatot hordoz.** A mérő ezt
a különbséget nem tudja megállapítani -- csak a szerző. (Mérve ugyanaznap: `sablon nelkul`
5 -> 3, `efemer` 2 -> 4, egyetlen mezővel, sablon-írás nélkül.)

**Visszaigazolás:** a `{"ok":true}` nem bizonyíték. Olvasd vissza a promptot a lementett
`~/.claude/scheduled-tasks/<nev>/SKILL.md`-ből (hossz + a kritikus mondatok), és nézd meg,
hogy a runner listázza-e a feladatot -- csak ezt jelentsd késznek.

### Frissítés

```bash
curl -s -X PUT http://localhost:3420/api/schedules/feladat-neve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"schedule": "0 9 * * *", "enabled": true}'
```

Csak a megadott mezők frissülnek -- a többi változatlan marad.

⚠️ **De CSAK az ISMERT mezők -- egy ismeretlen kulcsot a végpont NÉMÁN eldob, és
`{"ok":true}`-val nyugtáz.** Mérve 2026-09-05: két feladatra kiadott
`PUT {"ephemeral_reason": "..."}` mindkétszer `ok:true`-t adott, és a
`task-config.json` egyikben sem változott. A `200` itt tehát azt jelenti, hogy a
kérés értelmes volt, nem azt, hogy megtörtént, ami a legrosszabb fajta csend: a
hívó késznek jelenti a munkát.
**Eljárás:** minden PUT után olvasd vissza a mezőt a fájlból, ne a válaszkódból
higgy. ⚠️ **De a `name` NINCS a `task-config.json`-ban** (mérve 2026-09-08: a
fájl mezői `agent`, `createdAt`, `description`, `enabled`, `forceSend`, `schedule`,
`skipIfBusy`, `type`) -- a feladat nevét a KÖNYVTÁR adja. Ha a visszaolvasásban a
`name`-re is ránézel, `None`-t kapsz, és egy pillanatra úgy tűnik, hogy a létrehozás
hiányos. Nem az: a `prompt` sem a configban van, hanem a `SKILL.md`-ben. Ha a mező nincs a whitelistán (dokumentációs mezők, pl. `ephemeral_reason`
tipikusan nincsenek), írd közvetlenül a `task-config.json`-ba, atomikusan
(`json.load` -> módosítás -> `.tmp` -> `os.replace`), a többi kulcs megtartásával.

⚠️ **Éles feladaton ne próbálgasd, létezik-e a végpont.** A merge-elő szemantika
fentebb ki van mondva, tehát nincs mit felderíteni. 2026-08-27: egy üres `PUT`-tal
"teszteltem" a végpont létezését egy perccel korábban létrehozott, MÁS ágensnek
szóló feladaton. Nem sérült semmi, de csak azért, mert a PUT merge-elő; egy
felülíró végpont kiürítette volna. Felderítéshez eldobható teszt-objektum való.

⚠️ **A `prompt` mezőt MINDIG teljes ékezettel írd, akkor is, ha más ágensnek szól.**
2026-08-26-án mérve: a reggeli napindító azért ment ki 30 ékezet nélküli magyar
szóval, mert maga a prompt volt ékezet nélküli, miközben a szabályában ékezetet
kért. A modell a prompt regiszterét követi, tehát az ékezet nélküli utasítás
ékezet nélküli kimenő üzenetet szül a címzett ágensnél is.

⚠️ **Küszöb-dátumnál a határ is mondja meg, melyik futás esik bele.** Az „X UTÁN
jelents" megfogalmazásban maga az X napi futás kimarad. Írd ki: „X-TŐL KEZDVE,
tehát már az X-i futáskor". 2026-08-27: egy puszta dátum-csere így majdnem némán
hagyta volna pont azt a kört, ami az első jelentésnek volt szánva.

### EGYSZERI ébresztő: nincs one-shot mód, tehát a törlés a te dolgod

A runner cron-alapú, `run_at` vagy „egyszer" opció **nincs**. Egy konkrét napra szóló
ébresztőt dátumos cronnal kell felvenni (`0 8 9 9 *` = szeptember 9., 08:00), ez viszont
**JÖVŐRE ÚJRA LEFUT**, ha senki nem szedi le. A minta, ami 2026-09-08-án bevált
(peppa kérte, Réka várt tőle egy jelentést másnap reggel):

1. a `name` tartalmazza a dátumot (`peppa-ntak-hollo1-20260909`), hogy egy listázásból
   is látszódjon, mikor évült el;
2. a `description` mondja meg, hogy EGYSZERI, ki kérte és miért;
3. a **prompt utolsó mondata kérje meg a címzettet**, hogy a futás után szóljon vissza,
   mert ő tudja először, hogy kész;
4. és ugyanabban a körben menjen egy `hot` memória a törlés-teendővel. **Ez a lépés a
   fontos:** a 3. pont egy másik ágens emlékezetére bíz egy takarítást, a 4. viszont
   rád. Ha csak a 3. van meg, a feladat egy évig ott ül.
5. **A törlés ELŐTT mérd le, hogy tényleg lefutott** -- a címzett ágens visszajelzése
   nem bizonyíték, csak jelzés. Egy törölt ütemezés, ami sosem futott le, némán
   elveszti a feladatot:
   ```bash
   python3 -c "
   import sqlite3, datetime
   db = sqlite3.connect('store/claudeclaw.db')
   for r in db.execute(\"SELECT name, ts, status FROM task_runs WHERE name = 'a-feladat-neve' ORDER BY ts DESC LIMIT 3\"):
       print(r[0], datetime.datetime.fromtimestamp(r[1]/1000).strftime('%m-%d %H:%M'), r[2])
   "
   ```
   ⚠️ **A tábla oszlopa `name`, NEM `task_name`** (2026-09-09-én ebbe futottam bele:
   `no such column: task_name`), és a `ts` **ezredmásodperc**, nem másodperc -- a
   `fromtimestamp(r[1])` osztás nélkül 2026 helyett a távoli jövőbe mutat. A séma
   ellenőrzése (`PRAGMA table_info(task_runs)`) olcsóbb, mint a találgatás.
   A `status` `fired` értéke azt jelenti, hogy a prompt kiment az ágenshez.

A törlés maga a lenti `DELETE`.

⚠️ **SUB-ÁGENSNÉL az 5. lépés NEM a `DELETE`, hanem egy törlés-kérés a fő-ágenshez, és
ez SZÁNDÉKOS.** A `scripts/self-pace-gate.mjs` a `/api/schedules` írásait megtagadja
minden sub-ágensnek, és a `HTTP_WRITE_RX` (130. sor) a `DELETE`-et is felsorolja a
`POST/PUT/PATCH` mellett, tehát a takarító hívás ugyanúgy fennakad, mint a létrehozó.
Mérve 2026-09-10: jean egyszeri Zoe-emlékeztetője lefutott 08:00-kor, magát törölni nem
tudta, és a fenti öt lépést egyébként hibátlanul végigvitte. A falba a DOKUMENTÁCIÓ
miatt futott bele, ami idáig a `DELETE`-et adta utolsó lépésként.

**Miért nem nyitjuk ki a gate-et erre:** a gate nem tudja megkülönböztetni az elavult
egyszeri feladat törlését attól, hogy egy ágens a SAJÁT heartbeat- vagy felügyeleti
feladatát szedi le. Mindkettő ugyanaz a hívás ugyanattól az ágenstől, tehát a „szűk"
kinyitás pont azt engedné meg, amiért a gate létezik.

**A működő eljárás, ami 09-10-én elsőre végigment:** a sub-ágens inter-agent üzenetben
kéri a törlést, megadva a feladat nevét és azt, hogy lefutott; a fő-ágens a törlés ELŐTT
lemér a `task_runs`-ból (fenti 5. pont), és csak utána hívja a `DELETE`-et. A `hot`
memória a törlés-teendőről (4. pont) így a fő-ágensnél is jár, nem csak a létrehozónál.
### Törlés

```bash
curl -s -X DELETE http://localhost:3420/api/schedules/feladat-neve \
  -H "Authorization: Bearer $TOKEN"
```

### Enable / disable

```bash
curl -s -X POST http://localhost:3420/api/schedules/feladat-neve/toggle \
  -H "Authorization: Bearer $TOKEN"
```

### Azonnali futtatás (Run Now)

```bash
curl -s -X POST http://localhost:3420/api/schedules/feladat-neve/run \
  -H "Authorization: Bearer $TOKEN"
```

### Pending retry lista és törlés

```bash
# lista
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3420/api/schedules/pending

# egy pending retry törlése (id a lista válaszából)
curl -s -X DELETE http://localhost:3420/api/schedules/pending/42 \
  -H "Authorization: Bearer $TOKEN"
```

---

## Dashboard

Az ütemezett feladatok vizuálisan is kezelhetők a dashboardon: http://localhost:3420/#schedules

- Feladatok listája (név, ágens, cron, típus, enabled állapot)
- Enable/disable toggle
- Run Now gomb (azonnali futtatás teszteléshez)
- **Futtatási előzmények (ℹ gomb)**: az utolsó 10 futtatás adatai -- pontos időpont, állapot, és közelítő tokenfogyasztás
- Új feladat varázsló: rövid leírásból AI-val kibővített promptot generál, interaktív cron-szerkesztővel
- Pending retries panel: a retry queue-ban várakozó feladatok, manuális törlési lehetőséggel

### Futtatási állapotok

| Állapot | Jelentés |
|---------|----------|
| `fired` / Rendben | A prompt sikeresen kézbesült az ágens session-jébe |
| `error` / Hiba | Kivétel keletkezett a kézbesítés során |
| `skipped` / Kihagyva | `skipIfBusy=true` és a session foglalt volt -- a tick szándékosan kihagyva |

Az előzmények az utolsó 30 napot tartalmazzák; régebbi sorok automatikusan törlődnek.

Az állapotok lekérdezhetők az API-n is:

```bash
TOKEN=$(cat store/.dashboard-token)
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3420/api/schedules/reggeli-napindito/runs" | jq .
```

A tokenszám közelítő: az ágens teljes tokenforgalmát összesíti a futtatás pillanatától a következő futtatás kezdetéig (max. 1 óra). Ha az ágens ebben az ablakban más feladatot is végzett, az is beleszámít.

---

## Meglévő feladatok

| Feladat | Ágens | Ütemezés | Típus | Leírás |
|---------|-------|----------|-------|--------|
| `reggeli-napindito` | jarvis | `30 7 * * *` | task | Napi reggeli összefoglaló (email, naptár, AI hírek) |
| `memoria-heartbeat` | jarvis | `*/15 * * * *` | heartbeat | Memória-audit és skill reflexió 15 percenként |
| `kanban-audit` | jarvis | `0 8,12,16,20 * * *` | heartbeat | Kanban-tábla ellenőrzése naponta 4-szer |
| `dream-engine` | jarvis | `7 2 * * *` | dream-engine | Éjszakai analízis és javaslatgenerálás |
| `bumblebee-hygiene-scan` | jarvis | `0 9 * * 1` | heartbeat | Heti higiénia-ellenőrzés hétfőnként |
| `folyamatos-ellenorzes` | jarvis | `*/30 * * * *` | heartbeat | Általános ellenőrzés (jelenleg disabled) |

---

## Kapcsolódó dokumentumok

- [Háttér-feladatok](background-tasks.md) -- egyszeri, hosszú futású feladatok (nem cron-alapú)
- [Memória rendszer](memory-system.md)
- [Kanban](kanban.md)
