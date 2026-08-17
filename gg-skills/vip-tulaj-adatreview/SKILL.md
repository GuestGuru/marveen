---
name: vip-tulaj-adatreview
description: Kiemelt (VIP) tulajdonos adat-alapú áttekintése - foglalásszám és tartózkodás év/év, kihasználtság a piachoz mérve, takarítási díjunk a piaci mediánhoz mérve. Triggerelődik - tulaj megkérdőjelez egy díjemelést, "mutassátok az adatot", negyedéves tulaj-review, "hogyan állunk a piachoz képest", díjemelés indoklása, VIP ügyfél eszkaláció.
---

# VIP tulajdonos adat-review

## Mikor használd

Ha egy kiemelt tulajdonos adatot kér (jellemzően azért, mert megkérdőjelez egy
díjat vagy egy döntést), vagy ha egy rendszeres tulaj-áttekintéshez kellenek a
számok. A cél: minden állítás mögött mért adat legyen, forrással.

Az alábbi öt blokk együtt válaszol a leggyakoribb tulajdonosi kérdésekre:
teljesítünk-e jobban, mint tavaly; jobban-e, mint a piac; drágák vagyunk-e.

## Eljárás

Két adatforrás kell, mindkettő a gg-mcp proxyn át (a kulcs nem kerül a
beszélgetésbe):

```bash
node /home/gg/gg-mcp/dist/proxy.js exec --alias gg3 -- sh <script>   # NHOST_READONLY_CONNECTION_STRING
node /home/gg/gg-mcp/dist/proxy.js exec --alias bpdb -- sh <script>  # BPDB_CONNECTION_STRING
```

### 1-2. Foglalásszám és tartózkodás év/év (GG3)

Érkezés (checkin) szerint, lemondottak nélkül. A `status` értékei: `new`,
`modified`, `cancelled`.

```sql
WITH j AS (
  SELECT date_part('year', bu.checkin_date)::int AS ev,
         bu.booking_id, bu.unit_id,
         (bu.checkout_date - bu.checkin_date) AS ejszaka
  FROM booking_units bu
  JOIN bookings b ON b.id = bu.booking_id
  WHERE NOT COALESCE(bu.is_removed,false)
    AND date_part('month', bu.checkin_date) = :honap
    AND date_part('year',  bu.checkin_date) IN (:ev1, :ev2)
    AND lower(b.status) NOT IN ('cancelled','canceled','declined','rejected')
)
SELECT ev, count(DISTINCT booking_id) AS foglalas,
       count(DISTINCT unit_id) AS aktiv_egyseg,
       sum(ejszaka) AS vendegejszaka,
       round(count(DISTINCT booking_id)::numeric / NULLIF(count(DISTINCT unit_id),0),2) AS foglalas_per_egyseg,
       round(avg(ejszaka)::numeric,2) AS atlag_tartozkodas
FROM j GROUP BY 1 ORDER BY 1;
```

**Mindig normalizálj egységre.** A puszta foglalásszám félrevezet, ha közben nőtt
vagy csökkent a portfólió. (Mért példa 2026-08: a foglalás +7,5%, de a portfólió
-10,3%, tehát egységre vetítve +19,9% volt az igazi szám.)

### 3. A tulaj saját lakásai

Ugyanaz a lekérdezés, `JOIN accommodations` szűréssel. **A lakásokat pontos
névlistával szűrd, ne mintaillesztéssel**: az `ILIKE '%dohany%'` idegen
lakásokat is behúz (mérve: 8 helyett 24 lakást fogott). A tulaj-hozzárendelést
küldés előtt ellenőriztesd emberrel.

### 4. Kihasználtság a piachoz mérve (BPDB)

```sql
SELECT district, count(*) AS listing,
       round(avg(average_daily_rate_ltm)::numeric,0) AS adr_eur,
       round(avg(occupancy_rate_ltm)::numeric,1) AS occ_pct
FROM airdna_active_listings
WHERE district IN ('V','VI','VII','VIII','IX','I','II')
GROUP BY 1 ORDER BY listing DESC;
```

A saját oldalunk a `gg3_adr` táblából jön (`occupancy_pct`, `adr_eur`).

### 5. Takarítási díjunk a piaci mediánhoz mérve (BPDB)

```sql
SELECT count(*) AS listing_db,
       round(percentile_cont(0.25) WITHIN GROUP (ORDER BY charge_value)::numeric,1) AS p25,
       round(percentile_cont(0.5)  WITHIN GROUP (ORDER BY charge_value)::numeric,1) AS median,
       round(percentile_cont(0.75) WITHIN GROUP (ORDER BY charge_value)::numeric,1) AS p75
FROM booking_charges
WHERE charge_name ILIKE '%clean%' AND charge_type='per_stay'
  AND charge_value BETWEEN 1 AND 300;
```

Kapacitás-bontáshoz a `booking_rooms`-ból jön a férőhely — **de csak a piacra,
lásd a buktatót.**

## Buktatók

- **A `booking_rooms` a GG saját listingjeire hibás**: mind `1 szoba /
  max_occupancy = 2`, akkor is, ha a listing neve „Sleeps 12" vagy „4BR".
  Ezért MINDEN kapacitás-normalizált mutató (EUR/fő) a mi oldalunkon
  érvénytelen, és drágábbnak mutat minket a valósnál. A valós GG-kapacitás az
  Airbnb oldalról jön: `airbnb_listings_current.person_capacity` +
  `operator_airbnb_hosts` (GuestGuru: `operator_id = 13`). Mérve 2026-08-12.
- **A `booking_charges` pillanatkép, nincs idősora.** A „mennyivel emeltek a
  versenytársak" kérdés ebből NEM válaszolható meg, csak a jelenlegi szint.
  Mondd ki, ne becsüld meg.
- **Gyakoriság ≠ egységár.** Ha a tartózkodás rövidül, egy vendégéjszakára több
  takarítás jut — ez több MUNKA, de nem indokolja az egy takarításra jutó díj
  emelését. A kettő összemosása a levélben támadható; egy figyelmes tulaj
  kibontja.
- **Az adat, ami ellenünk szól, is menjen bele.** Rövidülő tartózkodásnál a fix
  takarítási díj nagyobb arányt tesz ki a vendég összköltségéből — ez a tulaj
  aggodalmát támasztja alá. Kihagyva a levél hiteltelen lesz, ha ő maga rájön.

## Ellenőrzés

- Minden szám mellett ott a forrás (melyik rendszer, milyen időszak, mekkora minta).
- A foglalásszám egységre normalizálva is szerepel.
- A tulaj lakáslistája nem mintaillesztésből jött.
- Nincs a kimenetben kapacitás-normalizált GG-mutató.
- Ha a levél kiemelt ügyfélnek megy, előbb nézd meg, van-e rá kommunikációs
  útmutató a wikiben (`skillek/` alatt, pl. `zoe-kommunikacio`) — a hangnem ott
  legalább annyit számít, mint a szám.
