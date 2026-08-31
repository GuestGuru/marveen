---
name: ter-linear-tracker-takaritas
description: A gazda Linear-projektjeinek és issue-inak TÉR-szempontú átvizsgálása és rendberakása a GG Tracker óraadatai alapján - mennyi munkája látszik projekt-szinten, mennyi nem, és mi tehető ezzel. Triggerelődik - "nézd át a Linear projektjeim TÉR szempontból", "hogy jól mérhető legyen az elvégzett munkám", negyedéves TÉR-felkészülés, "updateld az issue-kat", projekt nélküli órák, elavult projekt-státuszok.
---

# TÉR-takarítás: Linear + GG Tracker

## Mikor használd

- A gazdád kéri a Linear-projektjei/issue-i átnézését teljesítményértékelés (TÉR) előtt.
- Valaki azt kéri, hogy "updatelj mindent, hogy jól látszódjon a munkám".
- Egy projekt-szintű óra-kimutatás gyanúsan keveset mutat ahhoz képest, amennyit az illető dolgozott.

## A LEGFONTOSABB, amit előre tudnod kell

**A GG Tracker `time_entries.linear_project_name` / `linear_project_id` mezője a loggolás
pillanatában rögzül, nem élő kapcsolat a Linearhez.** Ha egy issue KÉSŐBB kerül projektbe,
a már meglévő idősorok projekt nélkül maradnak, örökre.

Következmény: **soha ne ígérd meg, hogy "hozzárendelem az issue-kat a projektekhez, és akkor
jól fog látszani a munkád".** A hozzárendelés CSAK a jövőbeli loggolásra hat. Ezt mondd ki az
elemzés ELEJÉN, mielőtt bárki egy napnyi szerkesztést kérne tőled a semmiért.

Ellenőrzés, ha kétséged van (egy issue, két különböző projektnév-értékkel = pillanatfelvétel):
```sql
SELECT linear_issue_identifier,
       COUNT(*) FILTER (WHERE linear_project_name IS NULL)     AS null_db,
       COUNT(*) FILTER (WHERE linear_project_name IS NOT NULL) AS nemnull_db
FROM time_entries WHERE linear_issue_identifier IS NOT NULL
GROUP BY 1 HAVING COUNT(*) FILTER (WHERE linear_project_name IS NULL) > 0
             AND COUNT(*) FILTER (WHERE linear_project_name IS NOT NULL) > 0;
```

## Eljárás

### 1. Mérj, mielőtt bármit írnál

A tracker aliasa **`gg-tracker`** (nem `tracker-sql-olvasas`, az a CSOMAG neve). Ha elbizonytalanodsz,
`gg_secret_get()` alias nélkül kilistázza a helyes neveket.

```bash
GG_MCP_UPSTREAM_URL="http://127.0.0.1:3450" \
GG_MCP_TOKEN_FILE="/home/gg/gg-mcp/tokens/<AGENT>.token" \
GG_MCP_AGENT_LABEL="marveen/<AGENT>" \
node /home/gg/gg-mcp/dist/proxy.js exec --alias gg-tracker --env-var PGURL -- \
  bash -c 'psql "$PGURL" -F"|" -A -f lekerdezes.sql'
```

A négy szám, ami a jelentés gerince (szűrj `ended_at IS NOT NULL`-ra):
- összes óra
- ebből `linear_project_name IS NULL` → **projekt-szinten láthatatlan**
- ebből `linear_issue_identifier IS NULL` → **issue-hoz sem kötött**
- ebből `linear_issue_identifier IS NULL AND COALESCE(description,'')=''` → **visszamenőleg
  rekonstruálhatatlan**. Ezt a számot külön mondd ki: ezen semmilyen szerkesztés nem segít,
  csak loggolási szokás.

### 2. Vesd össze a Linear ÉLŐ állapotával

A tracker adata elavult lehet: lehet, hogy az issue azóta már projektbe került. Kérdezd le a
valódi mai állapotot, mielőtt bármit hozzárendelnél. Csapatonként csoportosítva megy egy
lekérdezésbe (a Linear komplexitás-limitje 10000, egy 250-es `first` több csapatra már sok):

```graphql
t0: issues(filter:{team:{key:{eq:"SAL"}}, number:{in:[73,91,111]}}, first:250){
      nodes{ id identifier title state{name type} project{id name} team{key} } }
```

### 3. Hozzárendelés KÉT kapuval

Csak akkor köss issue-t projekthez, ha mindkettő teljesül:

1. **Van bizonyítékod.** Vagy PRECEDENS (ugyanolyan típusú issue már ott ül a projektben —
   ezt nézd meg, ne feltételezd), vagy szó szerinti szöveg-egyezés a címben. Egy projekt
   "odaillőnek érzése" nem bizonyíték: a TÉR a gazdád teljesítmény-adata, és egy rossz
   besorolás rosszabb, mint a hiányzó.
2. **Az issue csapata MÁR tagja a projektnek.** Különben a hozzárendelés BEHÚZZA az új
   csapatot a projektbe — ez látható szerkezeti változás egy közös projekten, amit nem
   kértek tőled.

Amire nincs bizonyítékod, azt hagyd békén, és a jelentésben SOROLD FEL a legnagyobbakat
órával együtt. A "84 issue-hoz nem nyúltam, mert nem tudtam" tisztességes eredmény.

### 4. Írás, majd ELLENŐRZÉS

Muveletenként külön JSON payload a scratchpadbe, egyetlen `proxy exec`-ben végigfuttatva
(`--data-binary @fajl`), és **a válaszban a `success` mezőt nézd, ne a HTTP-kódot** — a Linear
a hibát is 200-zal adja. Végül kérdezd vissza a módosított entitásokat: a jelentésben csak azt
állítsd késznek, amit visszaolvastál.

Projekt-mutációk, amik TÉR-szempontból tényleg számítanak:
- `projectUpdate(input:{state:"completed"})` — 100%-os, lejárt céldátumú, mégis "planned" projekt
- `projectUpdate(input:{state:"planned"|"started"})` — backlogban álló projekt, ami holnap indul;
  vagy "planned" állapot 78%-os haladással
- `projectUpdate(input:{targetDate:"YYYY-MM-DD"})` — céldátum nélküli projekt, aminek van
  ismert fix eseménye (sajtótájékoztató, alárendelt issue határideje)

## Buktatók

- **Az archivált issue lekérdezhető, de nem szerkeszthető.** `issueUpdate` → 400,
  `"Entity is retired: issue"`. A lekérdezés SIKERE tehát nem garantálja az írásét. A Linear a
  lezárt lead-eket (LEA csapat: "Nem minket választott", "Nem vállaljuk", "Tulaj eltűnt")
  rendszerszinten archiválja — egy mért esetben a 88-ból 26 emiatt bukott el. Van `issueUnarchive`,
  de gondold meg: visszahozza a lezárt tételt az aktív nézetekbe, és a múlt tracker-óráit
  a pillanatfelvétel miatt úgysem menti meg.
- **Ne a kiküldött mutációk számát jelentsd eredményként.** Külön mondd meg, mi ment át és mi nem.
- **Ha issue-t teszel egy lezárt projektbe, nézd meg az issue állapotát.** Egy Backlogban álló
  issue egy `completed` projektben 100% helyett 92%-ra viszi vissza a projektet. Mérve: pont ezt
  rontottam el, és nekem kellett jelentenem.
- **"Lezárni vagy priorizálni?" — ha a gazda rád bízza, a lezárás a mérésen alapuló válasz.**
  Prioritást adni annak, aminek nulla trackelt órája van és hónapok óta nem mozdult, találgatás.
  A `Canceled` visszafordítható, és tegyél mellé indokló kommentet, hogy fél év múlva is látszódjon,
  MIÉRT zárult. Ugyanez a Done/Canceled választásnál: a Done azt állítja, hogy megtörtént.
- **Ha lezárásra kérnek valamit, ami MÁR le van zárva**, ne állapotot változtass — az ok hiányzik,
  nem az állapot. Írd fel a lezáró kommentet a gazda szavaival, és mondd meg neki, hogy már Done volt.
- **A per-user broker miatt minden kommented és szerkesztésed a GAZDA NEVÉBEN jelenik meg**
  a Linearben. Ezért érdemes minden generált kommentet felismerhető prefixszel kezdeni
  (pl. "TÉR-takarítás, <dátum>."), különben ő sem tudja megkülönböztetni a sajátjaitól.

## Ellenőrzés

- A négy mért szám szerepel a jelentésben, és külön ki van mondva, melyiken NEM segít szerkesztés.
- Minden állítás "kész"-ről visszaolvasásból származik, nem a mutáció elküldéséből.
- A hozzá nem rendelt issue-k fel vannak sorolva órával és okkal.
- A saját hibáid (pl. lezárt projektbe került nyitott issue) benne vannak a jelentésben.
