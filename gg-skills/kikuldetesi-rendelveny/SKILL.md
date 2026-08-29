---
name: kikuldetesi-rendelveny
description: Havi kiküldetési rendelvény (km-elszámolás) visszafelé számolása egy megadott összegből, a sofőr részére (a személyes adatai a routes.json-ban vannak, nem itt). Triggerelődik - "Péter km-elszámolás", "kiküldetési rendelvény", "megjött Péter összege", "csináld meg a havi elszámolást", NAV üzemanyagár vagy alapnorma kérdés.
---

# Kiküldetési rendelvény visszafelé számolása

## Mikor használd

Anita megad egy összeget (pl. "Péter 32 220-at kér augusztusra"), és ebből kell
kiküldetési rendelvényt előállítani. Az összeg mindig a TELJES térítés:
üzemanyagköltség + amortizáció együtt. Nem csak az üzemanyag.

## Az eszköz

`/home/gg/marveen/agents/brokermarcsi/tools/kikuldetes/generate.py`

```
python3 generate.py --month 2026-08 --total 32220
```

Kapcsolók: `--liters decimal|whole` (alap: decimal), `--tolerance 500`,
`--price-mode auto|vedett|piaci`, `--out`.

Kimenet: `out/Kikuldetesi_rendelveny_2026_08.docx` + JSON összefoglaló
(km, üzemanyag, amortizáció, végösszeg, eltérés a céltól, felhasznált ár).

Mellette:
- `routes.json` -- **az EGYETLEN hely, ahol személyes adat van**: munkáltató és
  sofőr adatai, amortizáció (15 Ft/km), a Drive mappa azonosítója, és a
  megerősített útvonal-lista (23 magyar nagyváros Budapestről, egy irányba).
  CSAK `"confirmed": true` útvonalat használ a megoldó.
  ⚠️ A `.py` fájlok szándékosan NEM tartalmaznak nevet, lakcímet, adószámot
  vagy rendszámot -- mindent innen olvasnak. A `GuestGuru/marveen` fork
  PUBLIKUS, az `agents/` könyvtár pedig `.gitignore`-olt (`.gitignore:19`), és
  ennek így is kell maradnia. Ha valaha verziózni kell ebből valamit, a kódot
  lehet, a `routes.json`-t, a két sablont és az `out/` tartalmát NEM.
- `prices.json` -- NAV gázolaj- és benzinárak hónapra bontva, `vedett` és
  `piaci` oszloppal.
- `template.docx` -- a NORMALIZÁLT sablon. A generátor ezt klónozza és csak a
  táblázat sorait cseréli, így a formázás nem sérül.
- `template_eredeti.docx` -- Anita eredeti Google Docs sablonja, érintetlenül.
- `normalize_template.py` -- ebből állítja elő a `template.docx`-et: egységes
  Calibri, négy méret (16pt cím / 11pt alcím / 10pt fejadatok / 9pt táblázat),
  cellánként egységes kiemelés, plusz a szövegjavítások. Ha Anita új sablont
  küld, azt `template_eredeti.docx` néven mentsd, és futtasd újra ezt.

## Eljárás

1. **Ellenőrizd a hónapra érvényes NAV árat**, mielőtt számolsz:
   https://nav.gov.hu/ugyfeliranytu/uzemanyag/2026-ban-alkalmazhato-uzemanyagarak
   A táblázat oszlopsorrendje: ESZ-95 védett | ESZ-95 piaci | **Gázolaj védett** |
   **Gázolaj piaci** | Keverék | LPG | CNG. Ha hiányzik a hónap a `prices.json`-ból,
   vedd fel mindkét értéket (ahol nincs védett ár, `null`).
2. Futtasd a generátort az ELŐZŐ hónapra.
3. Ha az `diff` nem nulla, mondd meg Anitának, mennyi az eltérés, és kérj
   további útvonalat -- ne "hangold" a kilométert kitalált útra.
4. Töltsd fel a közös Drive mappába .docx-ként ÉS .pdf-ként:

   ```
   GG_MCP_TOKEN_FILE=/home/gg/gg-mcp/tokens/brokermarcsi.token \
   GG_MCP_AGENT_LABEL=marveen/brokermarcsi \
   GG_MCP_UPSTREAM_URL=http://127.0.0.1:3450 \
   /home/gg/.local/bin/gg-mcp-proxy exec --alias google-drive -- \
     python3 drive_upload.py out/Kikuldetesi_rendelveny_ÉÉÉÉ_HH.docx
   ```

   Mappa: `1_LyqYcAAVBIbKOqG_D7ACHhPcf_klxjc` (`Kiküldetési rendelvény`, a
   `GuestGuru backoffice` megosztott meghajtón). Anita a PDF-et íratja alá.
5. A kész fájlt küldd vissza Telegramon csatolmányként is.

## Számítási modell (mérve a 2026. júliusi eredetin)

- Alapnorma: AUDI A6 3.0 TDI (2967 cm3, dízel) -> **7,6 liter/100 km**
  (NAV 60/1992. Korm. rendelet, gázolaj 2001-3000 cm3 sáv)
- Legenként: `liter = round(km * 7,6 / 100, 2)` -- **két tizedes, a pontos norma**
  (Anita, 2026-08-28: nem kell egészre kerekíteni, ha a tizedes pontosabb)
- `üzemanyag = round(liter * NAV_ár)`, `amortizáció = km * 15 Ft`
- A dokumentumban megjelenő literérték és a forintösszeg mindig konzisztens:
  a forint a KIÍRT literből számolódik, nem a kerekítetlenből
- Egy oda-vissza út = 2 leg, azonos napon
- 2026. július validáció: 4 x 127 km Budapest-Balatonfüred, 615 Ft/l ->
  508 km, 24 600 + 7 620 = **32 220 Ft**, pontosan az eredeti

## Drive-buktatók

- **Nincs LibreOffice a gépen**, tehát helyben nem lehet PDF-et gyártani. A
  `drive_upload.py` ugyanazt csinálja, amit Anita kézzel: feltölti a .docx-et
  Google Doc-ká konvertálva, abból exportál PDF-et, majd az ideiglenes Doc-ot
  kukába teszi.
- **A megosztott meghajtón `canTrash`, de NINCS `canDelete`.** A szerepünk
  Contributor. A `DELETE` erre **404**-et ad (a Drive elrejti a jogosultsági
  hibát, nem 403-at küld), amitől úgy tűnik, mintha a fájl nem létezne. A helyes
  művelet: `PATCH {"trashed": true}`.
- **A `q` és az `orderBy` paramétert URL-kódolni kell.** Egy nyers szóköz az
  `orderBy=createdTime desc`-ben `InvalidURL`-t dob még a hálózat előtt.
- **Minden Drive-híváshoz kell a `supportsAllDrives=true`** (listázáshoz az
  `includeItemsFromAllDrives=true` is), különben a megosztott meghajtó nem látszik.
- **A feltöltés idempotens:** ha a névvel már van fájl a mappában, a tartalmát
  frissíti (`PATCH ... uploadType=media`), nem hoz létre `(1)` utótagú duplikátumot.

## Buktatók

- **Az összeg a TELJES térítés.** Ha csak az üzemanyagra számolsz vissza,
  kb. 30%-kal több kilométert raksz be, mint kellene.
- **A védett ár és a piaci ár nem ugyanaz.** 2026 júliusban a gázolaj védett ára
  615 Ft, a piaci 677 Ft. Anita a védettel számol. Gázolajra védett ár csak
  2026 május-július között volt, augusztustól nincs -> a piaci 592 Ft megy.
- **Egy útvonalból csak lépcsőkben lehet építkezni.** Egyetlen 127 km-es
  oda-vissza út 16 110 Ft (615 Ft/l mellett). Tetszőleges összeg eltalálásához
  több, különböző hosszúságú megerősített útvonal kell a `routes.json`-ban.
- **A `--liters whole` csak a 2026. júliusi regresszióhoz kell.** Az eredetit
  egész literrel töltötték ki (9,652 -> 10), ami legenként 214 Ft többletet
  jelentett. Éles futásban maradjon a `decimal`.
- **A dátumok nem valósak, de munkanapra kell esniük.** Anita 2026-08-28:
  a tényleges nap nem számít, hétvégére viszont ne essen. A `trip_dates()`
  a hétvégéket ÉS a magyar munkaszüneti napokat is kihagyja (a mozgó ünnepek
  húsvétból számolva), plusz a hónap 1-jét, mert az az aláírás napja.
- **A célösszeget nem kell forintra eltalálni.** Anita tűrése +/- 500 Ft
  (2026-08-28). A megoldó a legközelebbi elérhető összeget választja, és a
  `within_tolerance` mezőben jelzi, ha kicsúszik.
- **Word több futamra vágja szét a dátumot.** A `Dátum: 2026.08.01.` szöveg
  három `<w:t>` elemben is lehet, ezért a futamonkénti regex CSENDBEN nem talál
  semmit, és a sablon eredeti dátuma marad benn. Ezért van a
  `replace_across_runs()`: összefűz, cserél, majd karakterhosszra visszaosztja
  a futamokra, így a formázás sem sérül. 2026-08-28-án mérve: enélkül a júniusi
  és az augusztusi rendelvény is 2026.08.01-et kapott aláírás-dátumnak.
- **A havi ütemezés a kimeneti fájl létezéséből tudja, hogy a hónap le van zárva**
  (`out/Kikuldetesi_rendelveny_ÉÉÉÉ_HH.docx`). Az ütemezett futásban ezért SOHA ne
  adj `--out` kapcsolót: ha máshova generálsz, a 2-ai futás újra megkérdezi
  Anitát és újra legenerálja a dokumentumot. Kézi próbához használj `_ellenorzes`
  utótagot, ahogy a júliusi regressziós fájl is.
- **Az eredeti sablonban öt betűméret keveredett**, és a kiemelés
  cellán belül is szétesett ('Budapest-' félkövér dőlt, 'Balatonfüred' sima).
  Mivel a `cell_text()` az első futam formázását örökli, ez a generált
  dokumentumba is átment. Ezért fut a `normalize_template.py`. Ha bármikor
  vegyes betűméretet látsz a kimeneten, ott kezdd.
- **Javított szöveghibák az eredetiben:** `Gépjármü` -> `Gépjármű` (2 helyen),
  `(2967m3)` -> `(2967 cm³)` (hengerűrtartalom, nem köbméter), a
  `Fogyasztási normája` cellában bennfelejtett `liter/100 km` töredék,
  `NAV üzem-anyag` -> `NAV üzemanyag`, és a `költségtérítés*` csillaga
  (nem tartozott hozzá lábjegyzet sem a fejlécben, sem a láblécben).
- **Két adathiba, Anita jóváhagyásával javítva 2026-08-28:** a munkáltatói
  `Adószáma` mezőben a sofőr adóazonosító jele állt, a helyes érték a GuestGuru
  Kft. adószáma (`routes.json` -> `employer.tax_number`); az `Anyja neve` és az
  `Adóazonosító jele`
  pedig a bal (munkáltatói) hasábban volt, holott munkavállalói adat -- átkerült
  a jobb hasábba.
- **A fejrész két hasábját minden sor másképp oldotta meg** az eredetiben:
  hol két középre igazított tabulátorpozícióval, hol nyolc alapértelmezett
  tabulátorral addig nyomva, amíg jónak látszott. Ezért a hasábok sosem
  igazodtak egymáshoz, és a bal oldali érték hosszának megváltoztatása (pl. a
  hosszabb adószám) elcsúsztatta a jobb oldalit. Most minden fejléc-sor EGY
  balra igazított tabulátorpozíciót használ 6480 twipsnél (`COL2`), egyetlen
  tabulátorral. Ha a hasáb máshova kell, elég ezt az egy számot átírni.
- **A szám stimmelhet úgy is, hogy a dokumentum hibás.** Ez a hibaosztály
  átmegy minden szám-alapú ellenőrzésen, mert nem a számítás romlik el, hanem
  az, ami a papírra kerül. Kétszer futott bele ez a munka: a Word három futamra
  vágott dátuma miatt minden rendelvény a sablon dátumát örökölte, és a két
  futamra vágott gépjármű-típus miatt a hengerűrtartalom kétszer jelent meg.
  Mindkettőnél a végösszeg tökéletes volt. Ezért **minden generálás után a
  kimenet TELJES szövegét olvasd vissza**, ne csak a számokat.
- **Sablon-módosítás:** ha Anita új sablont küld, cseréld a `template.docx`-et,
  és ellenőrizd a `word/document.xml` táblázat sorindexeit (jelenleg: 4 = első
  adatsor, 8 = amortizáció, 11 = Összesen).

## Ellenőrzés

Regresszió a júliusi eredetivel, minden módosítás után:

```
python3 generate.py --month 2026-07 --total 32220 --liters whole --out /tmp/ell.docx
# elvárt: total 32220, diff 0, km 508, fuel_ft 24600, amort_ft 7620, price 615
```

Aztán olvasd vissza a kész dokumentum TELJES szövegét, ne csak a végösszeget
(a `python-docx` nélküli kiolvasás receptje az `office-fajl-szoveg-kinyeres`
skillben van). Amit nézni kell:

- az aláírás dátuma: az ELŐZŐ hónapot elszámoló rendelvény a KÖVETKEZŐ hónap
  1-jén kel (2026-07 -> 2026.08.01., 2026-08 -> 2026.09.01.)
- a gépjármű típusa egyszer szerepel, a hengerűrtartalom nincs megduplázva
- a fejrész két hasábja: a munkavállalói mezők a JOBB oldalon vannak
- a legek dátuma munkanapra esik, és nincs köztük munkaszüneti nap
- `Gépjármű`, nem `Gépjármü`

A Drive-ra feltöltött PDF-et is érdemes visszaolvasni: az a példány megy
aláírásra, és a konverzió külön lépés, ami külön tud elromlani.
