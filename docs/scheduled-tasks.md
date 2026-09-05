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

#### Sub-ágensnek szóló feladat: a FŐ-ÁGENS hozza létre, nem ő maga

Egy sub-ágens a saját nevére szóló ütemezést **nem tud** létrehozni: a governance
hard-gate elutasítja (`Self-pace TILTOTT -- sub-agentkent NEM utemezhetsz sajat
jovobeli turn-t`). Ez **védelem, nem hiba** -- egy ágens, ami magának ütemez jövőbeli
turnt, felügyelet nélkül tud munkát generálni magának. A helyes út: a sub-ágens
inter-agent üzenetben megküldi a kért `name` / `agent` / `type` / `schedule` / `prompt`
négyest, és a FŐ-ÁGENS POST-olja. (2026-09-03, brokermarcsi -- nála másodszor jött elő,
tehát ez visszatérő minta, nem egyszeri akadás.)

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
higgy. Ha a mező nincs a whitelistán (dokumentációs mezők, pl. `ephemeral_reason`
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
