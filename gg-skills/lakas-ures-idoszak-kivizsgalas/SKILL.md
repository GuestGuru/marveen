---
name: lakas-ures-idoszak-kivizsgalas
description: Tulajdonos (vagy lakásmenedzser) jelzi, hogy egy lakásnak egy jövőbeli hónapra nincs foglalása, és gyanítja, hogy "zárva van valahol". Eldönti, hogy tényleg technikai zár van-e, vagy csak a normál előrefoglalási ritmus. Triggerelődik - "miért nincs egy foglalása sem", "zárva van?", "nem foglalható?", "üres a naptár decemberre", "a tulaj szerint furcsa", kihasználtsági panasz egy konkrét hónapra.
---

# Üres időszak kivizsgálása egy lakásnál

## Mikor használd

Ha valaki azt kérdezi, miért nincs foglalás egy lakásra egy jövőbeli időszakra.
NEM ez a skill kell, ha az ÁR a panasz tárgya ("miért csak ennyiért ment el") --
arra a `tulaj-arazasi-kerdes-kivizsgalas` való.

## Eljárás

1. **Dátum.** `date` -- tudnod kell, hány hónapra előre kérdeznek. Ez a válasz fele.

2. **Lakás azonosítása.** `channex_properties` (limit 100; a lista hosszú, a nevek
   ékezetesek és összevontak, pl. `Hunyadi4-8`, `Corvinstny8-4`). Jegyezd fel a
   property id-t.

3. **Van-e zár?** `channex_restrictions` a base rate planre (`channex_rate_plans` ->
   a `... base rate` nevű) a kérdéses hónap teljes tartományára. Ezt keresed:
   - `stopSell: true` -> ez a technikai zár, ez a válasz
   - `szabadHely: 0` -> foglalt vagy blokkolt nap
   - `minTartozkodas` szokatlanul magas (5+ hétköznap) -> ez kizárja a rövid
     foglalásokat, gyakorlatilag zárként viselkedik
   Ha mind rendben (stopSell false, szabadHely 1, minStay 2-3), akkor NINCS zár, és
   a kérdés innentől keresleti, nem technikai.

4. **Mi történt eddig az adott hónapban?** `channex_bookings` a hónapra. Nézd a
   `statusz` mezőt: a `cancelled` foglalás is információ ("volt, de lemondták").

5. **Működik-e egyáltalán a lakás?** `channex_bookings` a KÖRNYEZŐ hónapokra
   (előtte-utána 1-1 hónap). Ha a szomszédos hónapok tele vannak, a hirdetések és a
   naptár-szinkron biztosan élnek -- ez erős érv a tulaj felé.

6. **Piaci referencia -- EZ A LÉNYEG.** Kérd le UGYANARRA a hónapra 6-8 másik lakás
   foglalásait (egy hívás lakásonként, párhuzamosan mehetnek). Számold meg, hánynál
   nulla. Enélkül a válasz csak vélemény; ezzel mérés.

7. **Válasz.** Számozott lépésekben: nincs/van zár -> mi van a hónapban -> árak és
   min. éjszaka -> a lakás egyébként pörög-e -> a portfólió többi része hogyan áll
   ugyanerre a hónapra. A végén egy mondat, amit a tulajnak továbbadhat.

## Buktatók

- **Ne a saját meglátásoddal kezdd, hanem a stopSell mezővel.** A "biztos csak
  szezonalitás" válasz mérés nélkül vaktában lövés.
- **Egy lakás nem minta.** Ha csak a kérdezett lakást nézed meg, nem tudod
  megkülönböztetni a lakás bajától a piac ritmusát. A 6-8 lakásos referencia gyors
  (párhuzamos hívások) és ez adja a válasz erejét.
- **A `cancelled` foglalást ne hagyd ki.** Ha volt foglalás és lemondták, az mást
  jelent, mint hogy sosem érkezett érdeklődés.
- **A rate plan nem egy.** Egy lakáshoz 10 is tartozhat (base rate, Booking
  Standard/Weekly/Monthly/Nonref, csatorna-specifikus párok). Olvasáshoz a
  `... base rate` a helyes választás; ne tippelj mást.
- **Előrefoglalási ritmus (mérve 2026-08-27):** augusztus végén a következő december
  még jellemzően üres, a decemberi foglalások zöme okt-nov környékén jön be. Egy
  3+ hónappal későbbi hónap üressége önmagában nem hiba.

## Ellenőrzés

Mielőtt válaszolsz, tudnod kell mind az ötöt:
- stopSell / szabadHely / minStay a teljes hónapra
- hány foglalás van a hónapban, ebből hány lemondott
- a szomszédos hónapok foglalásszáma ugyanannál a lakásnál
- hány másik lakásnál nulla ugyanez a hónap (és hánynál nézted)
- az adott hónap árszintje
