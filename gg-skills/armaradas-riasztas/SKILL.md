---
name: armaradas-riasztas
description: Ármaradás-riasztás (4-es feladat) - melyik lakásunk ADR-je marad el a saját comp setjétől, mennyivel, és mikor állítottuk utoljára az árát. Triggerelődik - "futtasd a 4-est", "ármaradás", "hol maradtunk le árban", "elmaradt bevétel", "comp set összehasonlítás", heti árazási kör.
---

# Ármaradás-riasztás

## Mikor használd

Áron kéri a 4-es feladatot, vagy heti körben árazási elmaradást keresel.
Kimenet: lakásonként rés (EUR és %), comp set mintamérettel, occupancy kereszt-jel,
bázisár utolsó állítása, becsült elmaradt bevétel.

## Eljárás

### 1. Hozzáférés

A gg-mcp kulcsokat a proxy adja a gyerek-processz env-jébe, a beszélgetésbe soha:

```bash
# A SAJAT identitasodat add meg -- mindketto a sajat .mcp.json-odban all.
# Idegen token-fajlt hasznalni JOGCSERE, nem nevcsere (lasd CLAUDE.md).
GG_MCP_TOKEN_FILE=<a sajat .mcp.json-odbol> \
GG_MCP_AGENT_LABEL=<a sajat .mcp.json-odbol> \
GG_MCP_UPSTREAM_URL=<a sajat .mcp.json-odbol, ha proxy-modban futsz> \
gg-mcp-proxy exec --alias bpdb --env-var CONN -- sh -c "psql \"\$CONN\" -A -F'|' -f QUERY.sql"
```

Aliasok: `bpdb` (piaci adat), `gg3` (éles GG3 DB, read-only).
Ha csak `gg_login` látszik a tool-listában, nincs token -> `gg_login`, a kódot
add oda Áronnak (10 percig él).

### 2. A mi oldalunk (GG3)

```sql
-- realizált ADR + occupancy: a BPDB gg3_adr táblájából (LTM ablak!)
-- bázisár utolsó állítása:
SELECT u.id, u.name, a.name, r.price, r.min_price, r.updated_at
FROM units u JOIN accommodations a ON a.id=u.accommodation_id
JOIN rates r ON r.unit_id=u.id
WHERE a.termination IS NULL;
```

### 3. Comp set (BPDB / AirDNA)

```sql
SELECT l.platform_id, a.district, a.submarket_name, a.accommodates,
       a.average_daily_rate_ltm AS adr, a.occupancy_rate_ltm AS occ
FROM airdna_listings_current a
JOIN listings l ON l.platform='airbnb' AND l.platform_id=a.airbnb_property_id AND l.is_open
WHERE a.district IS NOT NULL AND a.average_daily_rate_ltm IS NOT NULL;
```

Comp set = azonos kerület + kapacitás-sáv (1-2 / 3-4 / 5-6 / 7+), a GG saját
listingjei kizárva (`operator_active_listings WHERE operator_id=13`), min. 10 elem.
Párosítás: `gg3_adr.airbnb_id = airdna_listings_current.airbnb_property_id`.

### 4. Értékelés

- rés = (comp set medián ADR - a mi ADR-ünk) / medián
- **kereszt-jel**: ha a mi occupancy-nk MAGASABB a comp seténél -> alulárazás.
  Ha alacsonyabb -> nem ár-probléma, ne riassz, nézd meg külön.
- elmaradás becslés = rés x 90 nap x saját occupancy. **Felső korlát**, mondd ki.

Kész szkript: `scratchpad/analyze2.py` mintája (2026-08-12).

## Buktatók

- **A hirdetett forward árat NE használd elmozdulás-mérésre.** A BPDB
  `booking_calendar_forward`-ban csak két snapshot van (2026-06-05, 2026-08-01),
  és a 30/60/90 napos ablak közben elmozdul. A különbség szezonalitást mér, nem
  árváltozást. 2026-08-12-én minden comp setben -3..-18% "esés" jött ki: artefakt.
- **A GG3 napi ára nem az OTA-ár.** A `rate_date_sync.price` nettó bázis; az OTA-n
  channel modifier + takarítás + IFA + ÁFA után jelenik meg. Naiv összevetésből
  60-83%-os hamis rés jött ki. Ezért megy az összehasonlítás realizált ADR-en.
- **`is_hidden` nem kivezetés.** 19 lakás `is_hidden=true`, mégis 2027-ig árazva.
  Csak `termination IS NULL`-ra szűrj.
- **Az árak fillérben/centben vannak** a GG3-ban (`price/100`).
- **Kapacitás-eltérés**: az AirDNA `accommodates` és a GG3 `occ_adults` eltérhet
  (Ráday18: 7 vs 6). Ilyenkor rossz comp setbe eshet, mindig ellenőrizd a top
  tételeknél, és jelezd Áronnak.
- **A NULLA TALÁLAT A LEKÉRDEZÉST MÉRI, NEM A VALÓSÁGOT.** Ha egy szűrő üreset
  ad, az elsődleges gyanúsított a szűrő, nem a világ. Háromszor bukott meg 2026
  augusztus-szeptemberben, három külön rendszeren: grep a kódban (paraméteres
  route-ot nem fogott, ezért "nincs ilyen végpont"), Drive fullText (generált
  PDF-ben nem találta meg a benne álló szót), és a BPDB (0 szentendrei rekord).
  **KÉT KÜLÖN HIBA, ÉS A JAVÍTÁSUK NEM CSERÉLHETŐ FEL** (jean szétválasztása,
  2026-09-01):
  - **Rossz mintával kérdeztem a forrást.** A forrásnak van szerkezete, én meg
    szövegként kerestem benne. Javítás: PARSER, illetve azonosságra egész érték.
  - **A forrást meg se kérdeztem, csak az INDEXÉT.** Nincs mit parseolni.
    Javítás: SZEREZD MEG A FORRÁST.
  Ez a második a veszélyesebb nálam, mert **amivel dolgozom, az jórészt index**:
  a WebSearch, a Drive fullText, a Linear- és wiki-kereső. Mind alkalmas arra,
  hogy MIT olvass el; **egyik sem arra, hogy kijelentsd, valami NINCS.**
  **POZITÍV KONTROLL KÖTELEZŐ**, mielőtt hiányt jelentesz: futtasd ugyanazt a
  lekérdezést egy esetre, amiről TUDOD, hogy benne van. Ha azt sem hozza vissza,
  a lekérdezés a hibás.
  A 2-es feladatnál (keresleti jel) a "egyetlen nap sem tér el 0-tól" ÁLLÍTÁS,
  nem az adat hiánya -- azt DB-ből mérem, ott a parser-ág áll.
  A 3-as feladatnál (új események) a "ezen a héten nem találtam új bejelentést"
  KIZÁROLAG indexből jön, tehát a gyengébb állítás: írd oda, hogy a keresés nem
  hozott találatot, NE azt, hogy nem volt bejelentés.
- **Az "LTM" NEM ablak-jelzés.** A hosszat mondja meg (12 hónap), a HELYÉT nem.
  Ugyanez a "tavalyi" és a "jelenlegi" -- ablak-jelzésnek NÉZNEK ki, de egyik sem
  köti le a mérés idejét. Az ablakot a MÉRÉS DÁTUMA rögzíti, nem az adat típusa.
  (jean pontja, 2026-09-01.)
- **LTM-ablakok nem azonosak, és a különbség FUTÁSONKÉNT változik.** 2026-08-12-én
  mérve: `gg3_adr` 2025-03-18..2026-03-18, az AirDNA ennél frissebb -- de ezt NE
  vedd át kész tényként, mert azóta mindkettő elmozdult. Minden futásnál kérdezd
  le a tényleges min/max dátumot mindkét oldalon, és a jelentésbe a LEKÉRDEZETT
  ablakot írd, ne ezt a sort.

## Ellenőrzés

Mielőtt küldöd:
- [ ] a top 10-nél a kapacitás egyezik-e (AirDNA vs GG3)
- [ ] minden comp set n >= 10, a mintaméret benne van a jelentésben
- [ ] minden számhoz forrás + lehúzási időpont + a vonatkozó periódus
- [ ] a két LTM-ablak tényleges min/max dátuma LEKÉRDEZVE ebben a futásban
      (nem a skillből átvéve), és a jelentésben szerepel
- [ ] a becslés becslésként van jelölve, a módszerrel együtt
- [ ] MINDEN "nincs ilyen" / "nincs eltérés" állítás mögött futott pozitív
      kontroll (ismert pozitív esetet visszaad-e a lekérdezés)
- [ ] az occupancy kereszt-jel megnézve (a res + alacsony occ NEM ármaradás)
- [ ] soha nem állítasz árat, csak jelzel
