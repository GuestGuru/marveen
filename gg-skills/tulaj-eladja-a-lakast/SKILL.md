---
name: tulaj-eladja-a-lakast
description: Tulajdonos jelzi, hogy eladja (vagy árulja) a nálunk lévő lakást, és kérdezi, mi a menete. Válasz-piszkozat összeállítása a felmondási folyamatból, a konkrét lakás adataival. Triggerelődik - "eladjuk a lakást", "árulom az ingatlant", "mi a protokoll", "van ilyen tapasztalatotok", "engedéllyel együtt adjuk el".
---

# Tulaj eladja a lakást — mit válaszolj

## Mikor használd

HelpScout- vagy e-mail-megkeresés, ahol a tulaj eladást jelez. **Ez nem felmondás**,
és ne is kezeld annak: a szerződés addig él, amíg írásban fel nem mondja. Az első
válasz célja a tájékoztatás és két információ megszerzése: a várható dátum, és hogy
a vevő folytatja-e a rövid távú kiadást.

## Eljárás

1. **Olvasd el a szálat.** A tulaj sorszámot mond, nem azonosítót:
   `GET /v2/conversations?query=number:<szám>&status=all`, majd
   `GET /v2/conversations/<id>/threads`. (Részletek: `helpscout-pdf-melleklet`.)
2. **Wiki:** `lakasok/felmondas/folyamat` (a teljes menet + „A lakás eladása" szekció),
   `lakasok/felmondas/lakas-visszaadas-triggerpontok`, `lakasbekerules/engedely`.
3. **Szedd ki a lakás konkrét adatait** a GG3-ból (`gg3` alias, SQL):
   - `accommodations.created_at` → mennyi ideje van nálunk (12 hónapos záradék).
   - jövőbeli foglalások: `booking_units` + `bookings`, `status <> 'cancelled'`,
     `checkout_date >= current_date`.
   - Számold ki, ha MA indulna a 90 nap, mely foglalások esnek túl rajta.
4. **A piszkozat hat pontja** (ez a bevált szerkezet):
   felmondási idő 90 nap · foglalások és a lemondás foglalásonkénti kezelési költsége ·
   az engedély névre szól · ha a vevő folytatja · ha megszűnik a működés (hatósági kör,
   díjas teljes körű ügyintézés) · átadás (textil, kulcs, jegyzőkönyv, hozzáférések).
   ⚠️ A konkrét összegeket NE innen vedd: a `lakasok/felmondas/folyamat` wiki-oldalról
   olvasd ki minden alkalommal, mert változhatnak.
5. **A piszkozat a gazdánál marad.** Semmit nem küldesz ki.
6. Jelezd külön, ami tudatosan kimaradt a levélből (l. Buktatók).

## Buktatók

- 🔴 **A havonkénti naptárnyitást magadtól SOHA ne írd a levélbe — de a vezetőség
  felülírhatja.** A wiki alapértelmezése: „Előre ezt semmiképp ne ajánljuk fel a
  tulajdonosnak". Ezért az első piszkozatba ne tedd bele, hanem a gazdának jelezd
  külön, tartalékként. **Mérve 2026-08-31-én:** a vezetőség pont ezt
  írta felül, és kérte, hogy ajánljuk ki a havi naptárnyitást, a rugalmas kezelést
  az eladásig, és 30 napos felmondási időt a birtokba adáshoz igazítva. Vagyis a
  helyes sorrend: alapból wiki szerint, de a piszkozat átadásakor tedd fel a
  kérdést, mert a válasz megfordíthatja a levél egész hangnemét (búcsúzás helyett
  ajánlat).
- **Ha a rugalmas naptárat megígéred, az operatív teendő is.** A naptár jellemzően
  messzire nyitva van (ellenőrizd: van-e távoli foglalás). A havi nyitáshoz valakinek
  le kell zárnia a távoli hónapokat a GG3-ban. Ne csináld meg magadtól, de ne is
  hagyd szó nélkül — jelezd a gazdának, hogy ez teendő.
- **Az engedély nem száll át a vevőre.** A nyilvántartásba vétel a szálláshely-
  szolgáltató NEVÉRE szól. Amit a vevő megnyer: a minősítés és a dokumentáció már
  megvan, ezért nála a bejelentés gyorsabb. Ezt konkrétan kérdezik („lehet engedéllyel
  együtt"), tehát ki kell mondani.
- **Ellenőrizd a 12 hónapot.** Ha a szerződéskötés és a felmondási idő utolsó napja
  között nincs 12 hónap, a 4. sz. melléklet induló tételei visszaszámlázhatók. 12 hónapon
  túl NE hozd fel, mert fölöslegesen riasztó.
- **A HelpScout sorszám nem az azonosító**, a `/v2/conversations/<szám>` 404.
- **A `lineitem` típusú szálak üresek** (kiosztás, státuszváltás), ne keresd bennük a szöveget.
- **Az üzleti tét nem a levél, hanem a vevő.** Ha a vevő velünk folytatja, nincs
  engedély-visszaadás, nincs foglalás-lemondás, és megmarad a lakás. Ezt ajánld fel
  a levélben is, és javasold a telefonhívást.

## Ellenőrzés

A piszkozat akkor jó, ha (a) kimondja, hogy MOST nincs teendő, (b) konkrét számot
tartalmaz a lakás foglalásairól, (c) mindkét forgatókönyvet végigveszi, és (d) a végén
pontosan két dolgot kér a tulajtól: dátumot és a vevő szándékát.
