---
name: gg3-inspections-lekerdezes
description: Lakásellenőrzések (inspections) kimutatása a GG3 éles adatbázisából - ki mit ellenőrzött, hol nincs szemle, mióta nem járt ott senki. Triggerelődik - "ki ellenőrizte", "volt-e szemle", "melyik lakásban nem volt ellenőrzés", "hány szemlét csinált X", inspections, lakásszemle, quality control.
---

# GG3 lakásellenőrzések lekérdezése

## Mikor használd

Bármilyen kérdés arról, hogy egy lakásellenőr hol járt, hol nem, mikor volt utoljára
szemle, vagy melyik lakás maradt ki. A GG3 felületén (`/inspections`) ez csak listázva
látszik, kimutatást csak az adatbázisból lehet csinálni.

## Hol vannak az adatok

**Nem a `gg3_read` toolban.** Az csak 11 árazás/naptár táblát lát, az inspections nincs
köztük. A szemlék az éles GG3 Postgresben vannak, a `gg3` alias read-only kapcsolatán
(`gg3-olvasas` csomag kell hozzá).

Táblák:

- `inspections` — egy szemle. `unit_id`, `created_by` (= a szemlélő, FK `auth.users.id`),
  `inspected_at`, `notes`
- `inspection_checks` — az ellenőrzési pontok, PG trigger hozza létre a csoport sablonjából
- `units` → `accommodations` → `groups` — az egység, a lakás és a csoport
- `auth.users` — `display_name`, `email`

Egy szemle mindig **unit**-hoz tartozik, a lakás (`accommodation`) egy szinttel feljebb van.
A legtöbb lakásnak egy egysége van, de nem mindnek — ha "lakás" a kérdés, `accommodation`
szinten aggregálj.

## Eljárás

1. **Azonosítsd a szemlélőt név alapján**, és nézd meg, hány szemléje van. Ne az első
   találatot vedd, a névegyezés félrevisz (lásd Buktatók).

   ```sql
   SELECT i.created_by, u.display_name, u.email, count(*) AS db,
          min(i.inspected_at)::date AS elso, max(i.inspected_at)::date AS utolso
   FROM inspections i LEFT JOIN auth.users u ON u.id = i.created_by
   GROUP BY 1,2,3 ORDER BY db DESC;
   ```

2. **Szűrj aktív lakásra.** Nincs `archived` oszlop, két mező adja együtt:

   ```sql
   WHERE coalesce(a.is_hidden,false)=false
     AND (a.termination IS NULL OR a.termination > current_date)
   ```

3. **Hiány-lekérdezés** (hol nem járt az illető), a lakás korával és azzal, hogy más
   ellenőrizte-e — e nélkül a lista félrevezető:

   ```sql
   WITH szemlelo AS (
     SELECT DISTINCT u.accommodation_id
     FROM inspections i JOIN units u ON u.id=i.unit_id
     WHERE i.created_by='<uuid>'
   ),
   akt AS (
     SELECT a.id, a.name, g.name AS csoport, a.created_at::date AS felvive
     FROM accommodations a JOIN groups g ON g.id=a.group_id
     WHERE coalesce(a.is_hidden,false)=false
       AND (a.termination IS NULL OR a.termination > current_date)
   ),
   barki AS (
     SELECT u.accommodation_id, count(*) AS ossz, max(i.inspected_at)::date AS utolso
     FROM inspections i JOIN units u ON u.id=i.unit_id GROUP BY 1
   )
   SELECT akt.csoport, akt.name, akt.felvive,
          coalesce(b.ossz,0) AS ossz_szemle, b.utolso
   FROM akt LEFT JOIN barki b ON b.accommodation_id=akt.id
   WHERE akt.id NOT IN (SELECT accommodation_id FROM szemlelo)
   ORDER BY akt.csoport, coalesce(b.ossz,0), akt.name;
   ```

4. **Kontroll-lekérdezés** mindig fusson: összes szemle, ebből `created_by IS NULL`,
   aktív lakások száma, ebből ahány az illetőnél van. A számoknak ki kell jönniük.

## Futtatás (shell-út, saját identitással)

```bash
GG_MCP_TOKEN_FILE=<a saját .mcp.json-od GG_MCP_TOKEN_FILE értéke> \
GG_MCP_AGENT_LABEL=marveen/<sajat_nev> \
GG_MCP_UPSTREAM_URL=http://127.0.0.1:3450 \
node /home/gg/gg-mcp/dist/proxy.js exec --alias gg3 --env-var DBURL -- \
  sh -c 'psql "$DBURL" -f lekerdezes.sql'
```

SOHA ne más ágens vagy a főágens token-fájlját add meg. A hosszú SQL-t fájlba írd
(scratchpad), ne `-c` inline — az idézőjelek szétesnek a magyar szövegben.

Olvasható kimenet hosszú listánál:

```
\pset pager off
\pset format unaligned
\pset fieldsep ' | '
```

## Buktatók

- **Névegyezés.** 2026-08-13-án ugyanaz a keresztnév KÉT fiókon szerepelt az
  `auth.users`-ben: egy régebbi, magyaros írásmódú, nulla szemlével, és egy
  ékezet nélküli, céges címre szóló, ami a ténylegesen dolgozó ellenőré volt.
  **A szemle-darabszám dönti el, melyik az élő fiók, nem a név helyesírása.**
  Ha kétes, írd meg a gazdának, melyik fiókkal számoltál.
  (A két konkrét e-mail cím szándékosan nincs itt: magánszemély azonosítója, a
  tanulság pedig nélküle is teljes -- a lekérdezés úgyis kiadja mindkét sort.)
- **A csupasz hiánylista félrevezet.** A "soha nem járt ott" lista tele lesz frissen
  belépett lakásokkal. Bontsd szét: (a) ahol egyáltalán senki nem szemlézett,
  (b) friss lakás, ahol más már járt, (c) régi lakás, rendszeres szemlével, de az
  illetőtől soha. Csak a (c) valódi lefedettségi hiány.
- **Idegen csoport = nem a mi portfóliónk.** Két `groups` sor van: `GuestGuru` (a mi
  kezelt portfóliónk) és `BP Apartman` (3 lakás, külső használó — a rendszert használja,
  de a lakásokat nem mi menedzseljük, ezért nincs és nem is kell rájuk szemle).
  Portfólió-szintű kimutatásnál szűrj `g.name='GuestGuru'`-ra, különben idegen lakások
  kerülnek a listába, amiket a kolléga nem ismer fel — ez volt a második javítási kör
  2026-08-13-án.
- **Külföldi lakás.** A `Málta-MillionSunsets` a GuestGuru csoportban van, de Xemxijában
  (Málta), 6 egységgel. Hazai fizikai folyamat (szemle, takarítás) nem értelmezhető rá,
  vedd ki vagy jelöld külön.
- **Unit vs accommodation.** Ha lakás szinten aggregálsz, ellenőrizd külön, hogy
  többegységes lakásnál nem maradt-e ki egy egység.
- **A backoffice a GG lakásnevet ismeri fel** (`accommodations.name`, "Kertész33"
  formájú). Néhány lakásnak nincs ilyen neve, hanem márkanév-szerű (Budapest Apartment,
  Central Apartment) — ezeknél mindig írd oda a címet (`zip`, `address`) is, különben a
  kolléga nem tudja beazonosítani, melyik lakásról van szó.
- **Kerület-szűrés az irányítószámból**: `btrim(coalesce(zip,'')) LIKE '106%'` a
  VI. kerületre. A `zip` mezőben van záró szóköz és tabulátor is, `btrim` nélkül a
  szűrés némán kihagy sorokat. Egy-két lakásnál a `zip` üres, és az irányítószám az
  `address` mezőben áll — ezeket kézzel nézd meg.
- **A hidden lakásokat mindig előre zárd ki, és mondd is meg hány volt.** A kolléga
  jellemzően külön rákérdez; ha a számot előre megadod (pl. "235-ből 67 hidden, 168-cal
  számoltam"), egy körrel kevesebb.

- **Kevert alap a összefoglalóban.** A legkínosabb hiba: az összképben a szűretlen
  számot írod (168 lakás, 132-ben járt), a listában viszont a szűrtet (30) — a kolléga
  azonnal észreveszi, hogy nem jön ki a kivonás. **Egy összefoglalóban egy alap
  szerepeljen**, a szűrt: összes(szűrt) = ahol járt + ahol nem. A szűretlen szám mehet
  külön mondatban, "viszonyításnak" megjelöléssel. (Mérve 2026-08-13, TUL-918.)

## Ellenőrzés

- A szemlélőnkénti darabszámok összege = `SELECT count(*) FROM inspections`
- `created_by IS NULL` sorok száma nulla (ha nem, azok gazdátlan szemlék, említsd)
- Aktív lakások száma = (ahol járt) + (ahol nem járt)
