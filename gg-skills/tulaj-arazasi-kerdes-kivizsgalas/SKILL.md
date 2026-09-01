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
GET /v2/conversations?query=(number:<NUMBER>)&status=all
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

### 9. ÚJ LAKÁS: nincs ár-pálya, a TÁRS-LAKÁSOK adják a viszonyítást
Ha a lakás pár hete ment élesbe, a 4. lépés (`pricesnapshots` ár-pálya) ÜRES:
egyetlen `store_date` van, tehát nincs mit lelépcsőzve bemutatni. A helyettesítő
bizonyíték: **mit kérnek UGYANAZON a napon a hasonló lakások** (azonos label,
azonos méret-sáv), és hol áll közöttük ez a lakás.

```sql
WITH tars AS (
  SELECT u.id, u.name, u.occ_adults FROM units u
  JOIN unit_labels ul ON ul.unit_id=u.id
  WHERE ul.label_id='<a vizsgalt lakas labelje>' AND u.occ_adults >= <meret>
)
SELECT t.name, t.occ_adults,
  round(avg(ps.price/100.0) FILTER (WHERE ps.future_date BETWEEN '<tol>' AND '<ig>')::numeric) AS kert,
  count(*) FILTER (WHERE ps.is_available) AS szabad
FROM tars t JOIN pricesnapshots ps ON ps.unit_id=t.id AND ps.store_date='<ma>'
GROUP BY 1,2 ORDER BY 2 DESC, 1;
```

Ehhez tedd hozzá az ALAPÁRAT is (`rates`: `price`, `min_price`, `occupancy`) a
társakéval együtt. Ez mondja meg, hogy a lakás tudatosan a sáv alján indul-e.
A wiki (`skillek/arazasi-sema-magyarazat`) kimondja: **új lakásnak kb. egy év,
amíg megtalálja az árazását, az elején szándékosan olcsóbban hirdetjük a
foglalásokért és a review-kért.** Ha az alapár tényleg a sáv alján van, ez nem
hiba, hanem a leírt stratégia -- és pont ez a tulajnak szóló válasz magja.

🔴 **A TÁRS-CSOPORTOT A FÉRŐHELY ÉS AZ ÁGYSZÁM EGYÜTT HATÁROZZA MEG.**
Ez a szakasz eredetileg azt a tanulságot hordozta, hogy „az alacsony induló
alapár csak a felfutás eszköze". Ugyanaznap kiderült, hogy **ez a következtetés
a rossz társ-csoportból jött**, és vissza kellett vonni. Tanulságnak a JAVÍTOTT
eljárás maradt:

- `occ_adults >= N` önmagában NEM társ-csoport. Egy „6 fő felett" szűrő
  túlnyomórészt 6 fős lakást fog, és lehúzza az átlagot; egy 8 fős, 3
  hálószobás lakás ehhez mérve mindig jónak látszik.
- Szűkíts `double_beds` + `occ_adults` együttesére, és NÉZD MEG A LISTÁT,
  mielőtt átlagolsz. Mérve: két, papíron egyaránt „nyolc fős" lakás alapára
  között KÉTSZERES eltérés volt, mert az egyiknél nulla franciaágy szerepelt.
- A `labels` is a társ-csoport része. Ha a vizsgált lakás egy kategóriával
  lejjebb van, mint a valódi társai, az önmagában magyarázza a fél árat, és
  ez NEM az árazó műve, hanem beállítás.

Ha a valódi társakhoz mérve a kért ár és az alapár is nagyjából FELE, az nem
felfutási kedvezmény. Ilyenkor a tulajnak IGAZA van, csak nem a dinamikus
árazás a felelős, és a válasz nem lehet „ez a normál holtszezoni működés".

⚠️ **Ilyenkor NE menjen ki a megnyugtató levél**, amíg valaki rá nem néz az
alapárra és a kategóriára. Ha ma azt írjuk, hogy minden rendben, és jövő héten
emelünk, az visszaüt.

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
  napján, ugyanabban a lakásban. Egy mért fesztivál-esetben ez adta a döntő számot
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


- 🔴 **A szezonalitást MÉRET SZERINT szűrd, különben súlyosan alulbecsülsz.**
  Ugyanarra a hónapra mérve a nagy egységek (6+ fő) átlagos éjszakai ára
  közel KÉTSZERESE a kicsikének (2-4 fő). Egy nagy lakást a kis egységek
  átlagához mérve a tulaj joggal gondolná, hogy nagyon rosszul áll, holott
  fölötte van. A `units.occ_adults` a szűrő. (Mérve 2026-09-01.)

- ⚠️ **A HelpScout URL-jében MINDKÉT szám szerepel.**
  `/conversation/<ID>/<NUMBER>` -- az első a conversation id, a második a
  number. A kereséshez a NUMBER kell (`query=(number:<NUMBER>)`), a threadek
  lekéréséhez az ID. Ha az URL megvan, a keresést át is ugorhatod.

- ⚠️ **Új lakásnál olvasd el a szál ELŐZŐ levelét is.** Egy mért esetben a
  tulaj levele fölött ott állt a saját onboarding-levelünk, amiből kiderült,
  hogy a hirdetés két napja él. Enélkül az egész kérdés „miért olcsó a lakásom"-nak
  látszik, holott „miért ilyen a felfutás"-ról szól, és teljesen más a válasz.

- 🔴 **A tulaj nettó kifizetését SOHA ne számold újra.** A „nekem csak 50 euró
  marad tisztán" típusú félmondat külön kérdés, és a hiteles forrás az
  `app.guest.guru` tulaj oldala, mert azt összetett üzleti logika állítja elő.
  Válaszd külön a két szálat, és a nettóra a tulaj oldal bontását hivatkozd.

- 🔴 **A MÁSODPERCRE pontos `created_at` árulja el az ÁTVETT foglalásokat.**
  Átvett lakásnál a korábbi üzemeltetés foglalásai tömeges importtal kerülnek
  be: több foglalás jön létre ugyanabban a másodpercben. Az utána, EGYESÉVEL,
  órák-napok különbséggel érkezők a mi értékesítésünk. Ha ezt nem választod
  szét, a tulaj SAJÁT régi árait a mi teljesítményünknek nézed, és pont
  fordítva állítod be a válasz irányát. Kérd le
  `(b.created_at AT TIME ZONE 'Europe/Budapest')` teljes időbélyeggel, ne csak
  dátumra vágva. (Mérve 2026-09-01: négy foglalás 2,4 másodpercen belül.)

- 🔴 **KÉRDEZZ RÁ A LAKÁS ELŐZMÉNYÉRE, mielőtt teljesítményt értékelsz.**
  Átvett-e a lakás, mikor és melyik csatornán indult, most nyílt-e új felület?
  Egy 2026-09-01-i esetben az első elemzésem fél-igaz volt, amíg ki nem derült,
  hogy a lakás átvett, a szeptembere a tulaj sajátja, és az Airbnb előző nap
  nyílt. Mindhárom megfordította a válasz egy-egy részét. Ez EGY kérdés a
  gazdának, és olcsóbb, mint egy visszavont elemzés.

- ⚠️ **Vadonatúj lakásnál a tulaj oldalon NINCS MIT MUTATNI.** Ha az első
  érkezés még nem volt meg, nincs lezárt elszámolási hónap, tehát a „nekem
  ennyi marad" típusú félmondat a tulaj SAJÁT becslése, nem egy kimutatásé.
  Ezt mondd ki, és nevezd meg, melyik hónap lesz az első statement.

## Ellenőrzés
- Megvan mind a négy szám: elért ár, kért ár és annak időtartama, tavalyi ár,
  havi átlag?
- Nevesítetted az eladatlan éjszakákat?
- Kimondtad, hogy melyik évek adata teljes és melyiké csonka?
- A válasz a munkafolyamat nyelvén szól, nem táblanevekkel?
- Új lakásnál: megnézted a társ-lakások kért árát ÉS az alapárakat, és
  méret szerint szűrted a szezonalitást?
- A társ-csoportot ágyszámmal is szűkítetted, és SZEMRE megnézted a listát?
- Szétválasztottad az átvett (importált) és a saját foglalásokat?
- Rákérdeztél a lakás előzményére (átvétel, csatorna-nyitás)?
