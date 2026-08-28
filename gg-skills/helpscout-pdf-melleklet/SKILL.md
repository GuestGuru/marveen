---
name: helpscout-pdf-melleklet
description: HelpScout beszélgetéshez csatolt PDF (hatósági végzés, számla, szerződés) letöltése és szövegének kinyerése. Akkor használd, ha egy ügyben csatolmány van, és el kell olvasni a tartalmát. Triggerelődik - "nézd meg a csatolt pdf-et", "mi van a végzésben", "olvasd el a mellékletet".
---

# HelpScout PDF melléklet elolvasása

## Mikor használd

Ha egy HelpScout ügyben (`GET /v2/conversations/<id>/threads`) a szálban
`_embedded.attachments` van, és a tartalmára szükség van a válaszhoz.

## Eljárás

### 1. A beszélgetés megkeresése szám alapján

A felhasználó jellemzően a beszélgetés SORSZÁMÁT mondja (pl. 46977), nem az
azonosítóját. A `GET /v2/conversations/<szám>` ezért **404**-et ad.

```
GET https://api.helpscout.net/v2/conversations?query=number:49294&status=all
```

Innen az `_embedded.conversations[0].id` a valódi azonosító.

### 2. Szálak + csatolmány-azonosító

```
GET /v2/conversations/<id>/threads
```

A csatolmány a szál `_embedded.attachments` tömbjében van (`id`, `filename`, `mimeType`).

### 3. Letöltés

A `/data` végpont **base64-ben, JSON-ban** adja vissza a fájlt, nem nyers bájtként:

```
GET /v2/conversations/<id>/attachments/<attachmentId>/data
→ {"data": "<base64>"}
```

Dekódold és mentsd a scratchpadbe.

### 4. Szöveg kinyerése a PDF-ből

⚠️ **A gépen NINCS PDF-eszköz:** nincs `pdftotext`, nincs `pdftoppm` (tehát a
Read tool sem tudja képként megnyitni), nincs `pip`, és nincs `pypdf`. Ne
pazarolj kört a telepítéssel.

Helyette saját Python-dekóder (csak `re` + `zlib` kell), három lépésben:

1. Szedd ki az indirekt objektumokat: `(\d+)\s+(\d+)\s+obj(.*?)endobj`.
2. Minden fonthoz építsd fel a `/ToUnicode` CMap-et (`beginbfchar` / `beginbfrange`)
   — enélkül a szöveg értelmezhetetlen hex-kódokként jön ki (`<01>6<02>-2...`),
   mert a beágyazott subset-fontok saját kódolást használnak.
3. Járd végig a tartalom-streameket, kövesd az aktuális fontot a `Tf`
   operátorból, és a `Tj` / `TJ` operandusokat fordítsd a CMap-pel.

⚠️ **A hatósági és hivatalos PDF-ek szövege jellemzően NEM az oldal
tartalom-streamjében van, hanem `/Subtype /Form` XObjectekben.** Ha csak az
oldalakat dolgozod fel, üres eredményt kapsz (nálam csak az aláírás-záradék
jött ki). Iterálj végig az összes Form XObjecten, mindegyiknek a SAJÁT
`/Resources` fontjaival.

A működő szkript: `pdf-szoveg.py` ebben a mappában.

```bash
python3 pdf-szoveg.py <fájl.pdf>
```

## Buktatók

- **404 a sorszámra.** A beszélgetés sorszáma (`number`) nem azonos az
  azonosítójával (`id`). Mindig keresésen át menj.
- **Üres szöveg.** Ha csak az oldalak tartalom-streamjét nézed, a Form
  XObjectekbe rejtett törzsszöveg kimarad. Ez a leggyakoribb hiba.
- **Hex-szemét a kimenetben.** Elmaradt a `/ToUnicode` feldolgozás.
- **Szkennelt PDF.** Ha a fájlban nincs értelmezhető szöveg-operátor, csak kép,
  akkor OCR kellene, ami nincs telepítve. Ilyenkor mondd meg őszintén, hogy nem
  tudod elolvasni, és kérd meg a felhasználót, hogy másolja be a lényeget.

## Ellenőrzés

A kinyert szöveg akkor jó, ha értelmes magyar mondatok jönnek ki, és megvannak
a hivatalos irat kulcselemei: ügyiratszám, ügyintéző, tárgy, határidő, címzett.
Ha ezek bármelyike hiányzik, valószínűleg nem dolgoztad fel az összes Form
XObjectet.
