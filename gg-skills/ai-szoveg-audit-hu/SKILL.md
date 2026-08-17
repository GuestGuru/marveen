---
name: ai-szoveg-audit-hu
description: Magyar szöveg átvizsgálása AI-os szófordulatokra és közérthetőségi hibákra, mérhető bizonyítékkal. Triggerelődik - "hol AI-os ez a szöveg", "nézd át a draftot", "túl gépies", "humanizáld", sajtóanyag vagy ügyfélnek menő doksi lektorálása, több változatban készült anyagcsomag ellenőrzése.
---

# Magyar szöveg AI-audit

## Mikor használd

Ha egy magyar szöveget (sajtóanyag, ügyfél-levél, wiki-oldal, doksicsomag) kell
átnézni, hogy hol hangzik gépiesen, és mit kell átírni. Akkor is, ha a szerző
már "humanizálta" — pont az a nehéz eset.

## Eljárás

1. **Szerezd meg az EREDETI szöveget**, ne az összefoglalóját. Linear issue-nál a
   draft link jellemzően kommentben van, nem a leírásban:

   ```bash
   node /home/gg/gg-mcp/dist/proxy.js exec --alias linear -- sh -c \
     "curl -s -X POST https://api.linear.app/graphql -H 'Content-Type: application/json' \
      -H \"Authorization: \$LINEAR_API_KEY\" -d @/abs/ut/query.json"
   ```
   A queryben kérd le a `comments{nodes{body user{name} createdAt}}` mezőt is.

2. **HTML -> szöveg.** Töltsd le curl-lel, majd python3-mal strippeld
   (`<script>`/`<style>` ki, `</p>` és `<br>` -> újsor, `html.unescape`).
   A `<strong>` tagek SZÁMÁT külön mentsd el: a félkövér-sűrűség önálló jel.

3. **Futtasd a két útmutatót**: `gg_knowledge_get(topic: "humanizer-hu")` és
   `gg_knowledge_get(topic: "kozertheto")`. Ne emlékezetből dolgozz, változnak.

4. **Gépi tiltólistás szűrés** (em dash, kulcsfontosságú, kiemelkedő, Emellett,
   Fontos megjegyezni, kerül ...ra/re, határozói igenév-lánc, hivatali zsargon,
   ezres tagolás ponttal, emoji). Ez a KÖNNYŰ fele. Ha nulla találat, ne írd le,
   hogy "a szöveg rendben van" — menj a 5. lépésre.

5. **Keresd a humanizált AI jegyeit.** Ezeket a tiltólista NEM fogja meg:
   - **Kereszt-dokumentum refrén.** Több változatban készült csomagnál számold
     meg, hány dokumentumban szerepel BETŰRE ugyanaz a mondat. Ez a legerősebb
     egyetlen teszt. Ember minden anyagot újrafogalmaz, a modell átmásol.
   - **Töredékmondat-ritmus.** Rövid csattanó lett az alapértelmezett
     bekezdészáró ("Nem lett." / "Elakadt." / "Ez nem igaz.").
   - **Antitézis-sablon**: "nem X, hanem Y", "Ez nem A. Ez B."
   - **Kereszt-szerkezet**: "Aki X tud, az nem tud Y."
   - **Őszinteség-performansz**: "tisztesség kedvéért", "ezt nem mértük" külön
     dramaturgiai mondatban. A korlát maradjon, a rá hívott figyelem menjen.
   - **Idézőjeles ellenérv-FAQ** azonos ritmusban, mind rövid cáfolattal.
   - **Számmal kezdődő címek** reflexe (Három állítás / Hét javaslat / Négy X).
   - **Ugyanaz a hasonlat több változatban** a csomag különböző anyagaiban.
   - **Félkövér bekezdéskezdés sorozatban** (humanizer 21., folyó szövegbe rejtve).

6. **Terminológia-konzisztencia.** Számold meg a szinonimapárokat (pl.
   "szabálytalan" 81 vs "illegális" 9). A kozertheto szabálya: ugyanarra a
   dologra ugyanaz a szó. Ahol a két szó ERŐSSÉGE eltér, ott ez tartalmi
   kockázat is, nem csak stílus.

7. **Válaszd külön a stílust és a tényállítási kockázatot.** Ami megtámadható
   (bizonyíthatatlan tagadás, adatnál erősebb minősítés), az külön szekcióba
   megy, elöl. Az a fontosabb, mint az összes stílusészrevétel.

8. **Minden észrevételhez konkrét helyettesítő mondat.** "Ez AI-os" önmagában
   használhatatlan visszajelzés.

## Buktatók

- **A tiltólista tisztasága félrevezet.** Egy 0 em dashes, 0 reklámszavas szöveg
  még lehet felismerhetően gépi. A jó humanizálás saját mintázatot hagy.
  (Mérve 2026-08-13, MAR-134: 16 500 szó, nulla klasszikus találat, nyolc
  humanizált-AI mintázat.)
- **A mondathossz-statisztika hazudik a nyers HTML-szövegen.** A táblázatcellák
  és a "2026. augusztus 12." dátumok külön "mondatnak" számítanak, és felviszik
  a rövidmondat-arányt. Vagy védd a dátumokat regexszel a splitelés előtt, vagy
  ne közölj százalékot, hanem sorold fel a valódi találatokat. Egy hibás
  százalék az egész jelentés hitelét viszi.
- **A lábjegyzetek ismétlődése nem hiba.** A forrásjegyzék minden oldalon
  ugyanaz, ezt vágd le (`t.rfind('\nForrások\n')`), mielőtt refrént számolsz,
  különben minden mondatra 6/6-ot kapsz.
- **A szöveget NE írd át kérés nélkül.** Az audit olvasás, az átírás
  módosítás. Add át a listát, és kérdezd meg, melyik anyaggal kezdd.

## Ellenőrzés

- Minden állításhoz van szám vagy idézet? (hány dokumentumban, hányszor)
- A tényállítási kockázatok elöl vannak, a stílus utána?
- Van konkrét javasolt mondat minden kifogásolt fordulathoz?
- A saját jelentésed átment a humanizer ellenőrzőlistán? (em dash: nulla)
