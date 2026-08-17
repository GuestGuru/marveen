---
name: tulaj-arazasi-kerdes-kivizsgalas
description: Tulajdonos megkérdőjelezi egy időszak (fesztivál, hosszú hétvége, ünnep) elért árát - "miért csak ennyiért ment el", "a Sziget már nem kiemelt időszak?". Kideríti, MEDDIG és MENNYIÉRT kértük, mikor engedtünk, mennyi kelt el, és mi volt tavaly. Triggerelődik - HelpScout árazási panasz, "miért ennyi", "kiemelt időszak", "tavaly többért ment el", elszámolás-vita.
---

# Tulajdonosi árazási kérdés kivizsgálása

## Mikor használd
Egy tulaj (HelpScout, e-mail, Slack) megkérdőjelezi, hogy egy adott időszak
miért annyiért kelt el, amennyiért. Tipikus alakok: „a Sziget alatt csak 96
euróért ment el", „tavaly többet hozott", „ez már nem kiemelt időszak?".

## Eljárás

### 1. A levél beolvasása
HelpScout: a felületen látott 5 jegyű szám a **conversation NUMBER, nem az id**.
Az id-vel hívva 404 jön. Előbb keresd meg:
```
GET /v2/conversations?query=(number:49355)&status=all
```
majd a kapott `id`-vel: `GET /v2/conversations/<id>/threads`.

### 2. A lakás azonosítása (GG3, `gg3` kulcs)
```sql
SELECT u.id, u.name, a.id AS acc_id, a.name
FROM units u JOIN accommodations a ON a.id=u.accommodation_id
WHERE u.name ILIKE '%<lakasnev>%' OR a.name ILIKE '%<lakasnev>%';
```

### 3. Mi kelt el, mennyiért
```sql
SELECT bud.date, bud.rate/100.0 AS vendeg_ar, bud.published_price/100.0 AS publikalt,
       b.channel, b.status, bu.checkin_date, bu.checkout_date,
       (b.created_at AT TIME ZONE 'Europe/Budapest')::date AS foglalva
FROM booking_unit_dates bud
JOIN booking_units bu ON bu.id=bud.booking_unit_id AND NOT bu.is_removed
JOIN bookings b ON b.id=bu.booking_id
WHERE bu.unit_id='<uuid>' AND bud.date BETWEEN '<tol>' AND '<ig>'
ORDER BY bud.date;
```
A HIÁNYZÓ dátum = eladatlan éjszaka. Ezt nevesítsd, mert a tulaj gyakran nem
tudja, hogy egy éjszaka üresen maradt.

### 4. Az ÁR-PÁLYA: meddig és mennyiért kértük (`pricesnapshots`)
Ez a legerősebb bizonyíték, és a legtöbben nem tudják, hogy létezik. A tábla
naponta rögzíti minden lakás minden jövőbeli napjára a kért árat.
```sql
SELECT store_date,
  round(max(price/100.0) FILTER (WHERE future_date='<nap1>')) a1,
  round(max(price/100.0) FILTER (WHERE future_date='<nap2>')) a2,
  count(*) FILTER (WHERE is_available) AS szabad, max(min_stay) AS minstay
FROM pricesnapshots
WHERE unit_id='<uuid>' AND future_date BETWEEN '<tol>' AND '<ig>'
GROUP BY store_date ORDER BY store_date;
```
Amit ebből ki kell olvasni és el kell mondani:
- **meddig tartottuk a magas árat** (hónapokban),
- **mikor és mekkorát vágtunk** (lépcsők),
- **mikor engedtünk a minimum éjszakából** (`min_stay`), mert ez gyakran
  fontosabb az árnál: 4 éjszakás minimum egy rövid-tartózkodású fesztiválon
  kizárja a keresletet,
- **mikor jött a foglalás** a vágásokhoz képest.

### 5. „Kiemelt időszakként áraztuk?" - a közvetlen válasz
Egy régebbi `store_date`-en hasonlítsd össze az érintett napok kért árát a
KÖRÜLÖTTE lévő napokéval:
```sql
SELECT future_date, round(price/100.0), min_stay
FROM pricesnapshots WHERE unit_id='<uuid>' AND store_date='<pl. 3 honappal korabban>'
  AND future_date BETWEEN '<esemeny-1het>' AND '<esemeny+1het>' ORDER BY 1;
```
Ha az esemény napjaira lényegesen többet kértünk, akkor a válasz: igen, kiemeltként
áraztuk, a piac nem vette meg. Ez tényszerű és leszereli a vádat.

### 6. Tavalyi összehasonlítás
Ugyanaz a 3. lépés az előző évi eseményablakra. Az esemény DÁTUMA évente
mozog - keresd ki, ne feltételezd (Sziget: 2022-23 aug. 10-15, 2024 aug. 7-12,
2025 aug. 6-11, 2026 aug. 11-15, öt naposra rövidítve).

### 7. Az egész hónap, viszonyításnak
```sql
SELECT extract(year from bud.date) ev, count(*) ejszaka,
       round(avg(bud.rate/100.0)::numeric,1) atlag_ar
FROM booking_unit_dates bud
JOIN booking_units bu ON bu.id=bud.booking_unit_id AND NOT bu.is_removed
JOIN bookings b ON b.id=bu.booking_id
WHERE bu.unit_id='<uuid>' AND b.status<>'cancelled' AND extract(month from bud.date)=<ho>
GROUP BY 1 ORDER BY 1;
```
Gyakran ez menti meg a beszélgetést: egy gyenge hét mellett a hónap egésze lehet
a lakás legjobb éve.

### 8. Piaci viszonyítás (`bpdb` kulcs)
```sql
SELECT count(*), round(percentile_cont(0.5) WITHIN GROUP (ORDER BY average_daily_rate_ltm)::numeric) median_adr,
 round(percentile_cont(0.75) WITHIN GROUP (ORDER BY average_daily_rate_ltm)::numeric) p75,
 round(avg(occupancy_rate_ltm)::numeric,1) kihasznaltsag
FROM airdna_active_listings WHERE district='<rom.szam>' AND accommodates BETWEEN 2 AND 3
  AND average_daily_rate_ltm>0;
```
„Az elért ár a kerületi éves medián X-szerese" nagyon hatásos mondat.

## Buktatók

- **A HelpScout-szám nem id.** 404-et kapsz, ha közvetlenül hívod. Lásd 1. lépés.
- **`gg_secret_get` nem ad kulcsot, ha a fiók nincs összekötve.** Ez NEM
  jogosultság-hiány; a hiba megadja a `tools.guest.guru/connect/<rendszer>`
  linket, azt kell a gazdának egyszer megnyitnia.
- **Az árak fillérben/centben vannak** (`rate`, `price`, `published_price`):
  osztás 100-zal. A `bookings.currency` NEM mindig EUR - HUF-os foglalások
  szétverik az átlagot, szűrj `b.currency='EUR'`-ra.
- **`pricesnapshots.sold_price` és a szélső `price` értékek szemetesek**
  (egy nézett napra 11 000 000 is előfordult). Sose átlagolj rajtuk, használj
  mediánt, vagy nézd lakásonként.
- **A FOLYÓ év adata csonka.** A még el nem kelt jövőbeli éjszakák nincsenek
  benne a `booking_unit_dates`-ben, ezért a jövőbeli hónapok átlagára FELFELÉ
  torzít (az olcsó last minute még nem történt meg). Év/év összehasonlításnál
  csak LEZÁRT időszakot hasonlíts, és mondd ki, ha a hónap még nincs vége.
- **A portfólió évről évre változik.** Nyers évátlagot ne hasonlíts: szűkíts
  azokra a lakásokra, amik MINDKÉT évben szerepelnek, különben a lakás-mix
  változását nézed trendnek.
- **Ne erősítsd meg a tulaj (vagy a kolléga) premisszáját mérés nélkül.**
  A „a fesztivál-felár évről évre csökken" feltevés a PORTFÓLIÓ egészén mérve
  NEM állta meg a helyét (2022 +36%, 2023 +43%, 2024 +40%, 2025 +60%,
  2026 +47%). Ugyanez a feltevés a KONKRÉT lakásra viszont igaz volt.
  Mondd meg, melyik viszonyítási alapon mérsz.

- **A viszonyítási alap dönti el, meggyőző-e a válasz.** A tulajdonosi levélbe
  a lakás SAJÁT hónapja való, nem a portfólió- vagy piaci átlag: mennyi volt az
  esemény hetének átlagos éjszakai ára, és mennyi UGYANANNAK a hónapnak a többi
  napján, ugyanabban a lakásban. Steindl7-nél ez adta a döntő számot
  (2023 +40%, 2024 +41%, 2025 +10%, 2026 -6%): négy év alatt a felár nullára
  fogyott, és az utolsó évben a fesztiválhét már OLCSÓBB volt egy átlagos
  augusztusi napnál. Ugyanez a szám mondja ki a másik felét is: ha a hónap
  többi napja közben a legjobb évét hozza, akkor nem a lakás gyengült, hanem
  az esemény. Ezt a metrikát a tulaj a saját felületén ellenőrizni tudja.
  (Réka kérésére került be, 2026-08-14.)

- **Változó hosszúságú eseménynél ÖSSZBEVÉTELT ne hasonlíts.** A Sziget 2026-ban
  hat nap helyett öt napos volt, tehát a hét összbevétele magától is kisebb.
  Csak az éjszakai átlagár hasonlítható. Ugyanígy: ha a folyó hónap még nincs
  vége, adj meg egy AZONOS ablakot is (pl. minden évre aug. 1-22.).

## Ellenőrzés
- Megvan mind a négy szám: elért ár, kért ár és annak időtartama, tavalyi ár,
  havi átlag?
- Nevesítetted az eladatlan éjszakákat?
- Kimondtad, hogy melyik évek adata teljes és melyiké csonka?
- A válasz a munkafolyamat nyelvén szól, nem táblanevekkel?
