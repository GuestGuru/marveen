---
name: office-fajl-szoveg-kinyeres
description: PDF vagy DOCX tartalmának kinyerése olyan gépen, ahol nincs poppler-utils, nincs pip, és nincs sudo. Triggerelődik - "pdftoppm is not installed", "No module named pypdf", csatolt PDF/DOCX beolvasása, űrlap vagy táblázat kiolvasása dokumentumból.
---

# PDF/DOCX szöveg kinyerése csupasz Python 3-mal

## Mikor használd

Csatolt dokumentumot kell elolvasni, de a Read tool `pdftoppm is not installed`
hibát ad, és se `pip`, se `sudo apt-get` nem elérhető.

## DOCX -- ezzel kezdd, ha van választás

A .docx egy zip. Táblázatot is épen ad vissza, sorrendhelyesen:

```python
import zipfile, xml.etree.ElementTree as ET
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'; ns={'w':W}
z=zipfile.ZipFile(path); root=ET.fromstring(z.read('word/document.xml'))
def txt(el): return ''.join(n.text or '' for n in el.iter('{%s}t'%W))
for tbl in root.iter('{%s}tbl'%W):
    for tr in tbl.findall('w:tr',ns):
        print(' | '.join(txt(tc).strip() for tc in tr.findall('w:tc',ns)))
```

**Ha PDF-et kaptál egy Office-dokumentumból, kérd el az eredetit.** Öt perc
alatt megvan, amivel a PDF-ből fél óra.

## PDF -- ha muszáj

Objektumok kigyűjtése, FlateDecode, majd a CID-fontok `/ToUnicode` CMap-je
alapján a hex stringek visszafejtése. A `Td`/`Tm` és a `cm` transzformáció
együtt adja a pozíciót, abból lehet sorokat rekonstruálni.
Működő implementáció: `agents/brokermarcsi/tools/kikuldetes/` fejlesztésekor
készült változat (ext4.py minta a scratchpadben).

## Buktatók -- ezek vittek el 20 percet

- **`re.finditer(rb'(\d+)\s+0\s+obj', data)` végtelenségig fut** 300 KB-os
  bináris PDF-en. A tömörített képadatban lévő hosszú számjegysorozatokon a
  `\d+` katasztrofálisan backtrackel. Kösd meg: `rb'(?<![0-9])(\d{1,6}) 0 obj'`.
  Ugyanez minden `\d+`/`.*?` mintára a nyers PDF-bájtokon.
- **`pkill -f valami.py` megöli a saját shelledet**, ha a `bash -c` parancssora
  tartalmazza a mintát. Exit 144 jön vissza, és úgy néz ki, mintha a script
  hasalt volna el. Használj konkrét PID-et, vagy `pkill -f` helyett `timeout`-ot.
- **Google Docs renderelő PDF-je glifánként ad ki `Td`-t**, ezért naiv
  kinyerésnél minden karakter külön sorba kerül. Y-koordináta szerint kell
  csoportosítani (tolerancia ~3 pont), és X szerint rendezni a soron belül.
- **A `cm` operátort is követni kell**, különben minden szöveg ugyanarra az
  Y-ra esik, és teljesen összekeveredik a táblázat.
- **Literál `(...)` stringek mellett `<hex>` stringek is vannak.** Type0/CID
  fontnál csak hex van, és `/ToUnicode` nélkül olvashatatlan.

## Ellenőrzés

A kinyert szövegben keress egy olyan konkrét értéket, amit előre tudsz
(összeg, név, dátum). Ha nem találod, a kinyerés hibás, nem a dokumentum üres.

## Ha te GENERÁLTAD a dokumentumot: olvasd vissza a teljes szöveget

A fenti kiolvasás nem csak idegen fájlokhoz kell. Ha DOCX-et állítasz elő
sablonból, a legalattomosabb hibaosztály az, ahol **a szám stimmel, a dokumentum
mégis hibás** -- mert nem a számítás romlik el, hanem az, ami a papírra kerül.
Ezt semmilyen szám-alapú teszt nem fogja el.

Két mért eset (2026-08-28, kiküldetési rendelvény generátor):

- A Word három futamra vágta a `Dátum: 2026.08.01.` sort, ezért a futamonkénti
  regex csendben nem talált semmit, és MINDEN generált példány a sablon eredeti
  dátumát örökölte. A végösszegek tökéletesek voltak.
- A gépjármű típusa két futamra volt vágva, ezért a javított hengerűrtartalom
  kétszer került bele: `(2967 cm³) (2967 cm³)`.

Szabály: minden generálás után olvasd vissza a kimenet TELJES szövegét, és
hasonlítsd a várt tartalomhoz -- ne csak a számokat nézd. Ha a dokumentum
konvertálva is megy tovább (pl. PDF-be aláírásra), a KONVERTÁLT példányt is
olvasd vissza: az külön lépés, és külön tud elromlani.
