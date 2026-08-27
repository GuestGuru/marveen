---
name: ai-szoveg-audit-hu
description: Magyar szöveg átvizsgálása AI-os szófordulatokra és közérthetőségi hibákra, mérhető bizonyítékkal. Triggerelődik - "hol AI-os ez a szöveg", "nézd át a draftot", "túl gépies", "humanizáld", sajtóanyag vagy ügyfélnek menő doksi lektorálása, több változatban készült anyagcsomag ellenőrzése.
---

# Magyar szöveg AI-audit

## Mikor használd

Ha egy magyar szöveget (sajtóanyag, ügyfél-levél, wiki-oldal, doksicsomag) kell
átnézni, hogy hol hangzik gépiesen, és mit kell átírni. Akkor is, ha a szerző
már "humanizálta": pont az a nehéz eset.

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

3. **A gépi kört a `gg_humanize` tool csinálja, ne kézzel.** Ugyanazt a két wiki-oldalt
   (`skillek/humanizer-hu`, `skillek/kozertheto`) futtatja szerveroldalon, amit
   korábban `gg_knowledge_get`-tel kellett behúzni és fejben alkalmazni.

   **DETEKTORKÉNT használd, ne átíróként.** A tool átírt szöveget ad vissza, az
   audit viszont olvasás (lásd a Buktatókat). Az eljárás: hívd meg
   `mode: "both"`-tal a `context.genre` és `context.audience` megadásával, majd
   a `--- Változások:` listát ÉS az eredeti/átírt eltérést vedd találat-listának.
   Az átírt szöveget NE add át kész anyagként.

   **`mode: "lint-only"` NE használd, néma.** Mérve 2026-08-26-án három szövegen:
   a bemenetet adja vissza betűre, találat nélkül, még em dash-re is. Nem a
   szerver hibája: a `gg-mcp/src/tools/humanize.ts` kimenet-formázója csak a
   `report.changes` és `report.warnings` mezőt írja ki, a `report.lintBefore` /
   `lintAfter` mezőt deklarálja, de eldobja. Lint-only módban a rewrite üres,
   tehát nem marad semmi látható. Amíg ez nincs javítva, `both` a lint-út is.

4. **Amit a tool megfog, azt ne írd le újra.** Mérve: a klasszikus tiltólistát
   (em dash, hivataloskodás, szenvedő szerkezet, csevegő bevezető) és az 5. pont
   mintázatai közül a töredékmondat-ritmust, az antitézis-sablont, az
   őszinteség-performanszt és a számmal kezdődő címeket is elkapta és megnevezte.
   A te dolgod az, ami EGY szövegből nem látszik: a 5. pont kereszt-dokumentum
   tesztjei, a 6. pont, a 7. pont. Ha nulla találat, ne írd le, hogy "a szöveg
   rendben van", hanem menj a 5. lépésre.

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
  módosítás. Add át a listát, és kérdezd meg, melyik anyaggal kezdd. Ez a
  `gg_humanize`-ra is áll: a tool kimenete BIZONYÍTÉK, nem leszállítandó anyag.
- **A `gg_humanize` javaslata KÉT dolgot ronthat el, és mindkettő ügyfél felé megy.**
  Jean mérte 2026-08-26-án, a VIP csomag emailen. (1) **Szakkifejezés-csere:** a
  "management díj"-at "kezelési díj"-ra cserélte. Magyarosabb, csakhogy a GG
  szerződéseiben, a havi elszámolásban és a Sheetekben MANAGEMENT DÍJ szerepel, és
  két külön szó ugyanarra pont ott zavar, ahol a tulaj a számot keresi. Minden
  bevett céges vagy szerződéses szót tegyél vissza. (2) **Érv-gyengítés:** ahol az
  eredetiben erős, konkrét állítás állt ("az értékelés dönti el a következő félév
  foglaltságát és árszintjét"), ott általánosabbra vette ("segítenek abban, hogy a
  lakás vonzó maradjon"). A közérthetőség javul, az érv elvész; értékesítési
  szövegnél állítsd vissza. Amit viszont jól csinál: rövidebb mondatok, kevesebb
  hivataloskodás, a rövidítéseket kibontja (tfh, ifa), a hosszú felsorolást
  átfutható listára bontja.
- **A `gg_humanize` nem kapu.** LLM-hívás: nem determinisztikus, hálózatot kér,
  és javít ahelyett hogy megállítana. A kimenő-szöveg kapu
  (`marveen/scripts/hooks/outgoing-copy-gate.py`) ettől független és marad:
  az blokkol, szótárból, hívás nélkül. A kettő nem váltja ki egymást.

## Ellenőrzés

- Minden állításhoz van szám vagy idézet? (hány dokumentumban, hányszor)
- A tényállítási kockázatok elöl vannak, a stílus utána?
- Van konkrét javasolt mondat minden kifogásolt fordulathoz?
- A saját jelentésed átment a humanizer ellenőrzőlistán? (em dash: nulla)
