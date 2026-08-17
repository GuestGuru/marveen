---
name: google-sheets-biztonsagos-iras
description: Meglévő Google Sheet fülének bővítése adatvesztés nélkül a Sheets API-n át. Triggerelődik - "írd bele a táblázatba", "egészítsd ki a fület", "fűzd hozzá a Sheethez", values:append használata, meglévő elemzési tábla frissítése, "felülírta a tartalmat".
---

# Google Sheet biztonságos bővítése

## Mikor használd

Amikor egy MÁR LÉTEZŐ Google Sheet fülébe kell írni úgy, hogy a benne lévő
tartalom megmarad. Új, üres Sheet létrehozásánál ez a skill felesleges.

A kulcs-veszély: a `values:append` NEM a fül végére ír. Egy összefüggő
"táblázat-blokk" végét keresi a megadott kezdőcellától, és ha a blokk egy üres
sornál véget ér, az append AZ ÜRES SOR HELYÉRE ír — vagyis felülírja mindazt,
ami alatta van. Tagolt, üres sorokkal elválasztott elemzési füleknél ez
garantált adatvesztés.

## Eljárás

1. **Mentsd le, mielőtt hozzányúlsz.** Ez nem opcionális, ez a skill lényege.
   ```bash
   curl -s -G '.../values:batchGet' \
     --data-urlencode 'ranges=<Fül neve>!A1:Z200' \
     -H "Authorization: Bearer $GOOGLE_DRIVE_ACCESS_TOKEN" > backup.json
   ```
   Kérj bőven nagyobb tartományt, mint amekkorára számítasz, és ELLENŐRIZD a
   visszakapott sorszámot (`len(values)`), mielőtt továbbmész.

2. **Építsd fel a teljes új tartalmat** a mentésből + a hozzáfűzendő blokkból,
   Pythonban. A payloadot mindig fájlba írd (`json.dumps`), ne a parancssorban
   idézőjelezd.

3. **Írd ki `clear` + `PUT update` párossal, A1-től.** Ez determinisztikus:
   pontosan az lesz a fülben, amit a memóriában összeraktál.
   ```bash
   curl -s -X POST '.../values/<range A1:Z200>:clear' -H 'Content-Length: 0' ...
   curl -s -X PUT  '.../values/<range A1>?valueInputOption=RAW' -d @full.json ...
   ```

4. **Ellenőrizd cellánként, hogy az eredeti sorok sértetlenek.** Ne a
   `updatedRows` számot nézd, hanem vesd össze a mentéssel:
   ```python
   ok = all((new[i][0] if i < len(new) and new[i] else "") ==
            (old[i][0] if old[i] else "") for i in range(len(old)))
   ```

## Buktatók

- **`values:append` tagolt fülön = adatvesztés.** (2026-08-12, SAL-455 Szentendre.)
  A hívás `200`-at ad és sikeresnek látszik: a válasz `updates.updatedRange`-e
  árulja el a bajt. Ha a fül 33 soros, és az `updatedRange` `A2:B15`, akkor nem a
  végére írtál, hanem a 2. sortól FELÜL. A `tableRange` mező mutatja, mit hitt az
  API táblázatnak — ha ez `A1` vagy `A1:A2`, az append rossz helyre fog írni.
  Ilyenkor azonnal állítsd helyre a mentésből; ne írj rá még egy javítást.
- **A `:append` és a `:clear` POST, az `update` PUT.** A `clear`-nél kell a
  `Content-Length: 0`, különben egyes proxykon elakad.
- **A fülnév URL-kódolása.** A `!`, a szóköz, az aposztróf és az ékezet mind
  kódolandó (`'5. Budapest vs Szentendre'!A1` →
  `%275.%20Budapest%20vs%20Szentendre%27%21A1`). A leggyorsabb út egy `sh`
  szkript fájlba írva, előre kódolt konstansokkal — a beágyazott idézőjelek egy
  `proxy exec -- sh -c "..."` láncban kezelhetetlenné válnak.
- **`valueInputOption=RAW`**, különben a `=` kezdetű vagy szám-szerű cellákat
  képletként/dátumként értelmezi.
- **A token a `google-drive` aliasból jön, és a Sheets API-t IS hajtja** — külön
  `spreadsheets` scope nem kell. (Env-név: `GOOGLE_DRIVE_ACCESS_TOKEN`.)

## Ellenőrzés

- A mentés sorszáma > 0, és megvan a fülben várt tartalom.
- Írás után a régi sorok első cellái egyeznek a mentéssel, sorrendben.
- Az `updatedRange` az A1-től a teljes új hosszig tart, nem valahonnan középről.
- Ha bármi felülíródott: állítsd helyre a mentésből, majd JELENTSD a gazdádnak.
  A csendes javítás rosszabb, mint a hiba, mert a következő olvasó nem tudja,
  hogy a fájl egy ideig sérült volt.
