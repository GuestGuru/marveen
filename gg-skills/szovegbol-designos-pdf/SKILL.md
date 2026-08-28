---
name: szovegbol-designos-pdf
description: Kapott nyers szovegbol (AI-kimenet, jegyzet, brief) designos, prezentalhato A4 PDF-dokumentum gyartasa fpdf2-vel, ekezethelyesen. Triggerelodik - "csinalj ebbol PDF-et", "szep designos doksi", "prezentalhato anyag", "olyat mint ez a minta", Gemini/ChatGPT-kimenet formazasa.
---

# Szövegből designos PDF

A cél nem "PDF-be nyomtatott szöveg", hanem tervezett dokumentum: fejléc, számozott
szekciók, kártyák, táblázatok, kiemelt panelek. A motor fpdf2 + Manrope.

## Mikor használd

- Eszti bedob egy hosszú nyers szöveget (jellemzően Gemini/ChatGPT kimenet) és
  prezentálható dokumentumot kér belőle.
- Van egy korábbi PDF minta, aminek a stílusát követni kell.
- NEM ez kell, ha GuestGuru-arculatú értékesítési egyoldalas a feladat, arra a
  `b2b-onepager-gyartas` skill van (GG-paletta, Drive-fotók, lakáskatalógus).

## Eljárás

### 1. Ha van minta-PDF, ELŐBB mérd ki

```python
import pymupdf, collections
d = pymupdf.open(minta)
print(set(f[3] for p in d for f in p.get_fonts()))
cnt = collections.Counter()
for p in d:
    for b in p.get_text('dict')['blocks']:
        for l in b.get('lines', []):
            for s in l['spans']:
                cnt[(s['font'], round(s['size'],1), hex(s['color']))] += len(s['text'])
print(cnt.most_common(20))
for p in d:                       # kitoltoszinek
    for dr in p.get_drawings():
        if dr.get('fill'): print('#%02X%02X%02X' % tuple(int(c*255) for c in dr['fill']))
```
Ebből jön a paletta és a méret-hierarchia. Utána raszterezd ki és NÉZD MEG
(`p.get_pixmap(dpi=85).save(...)`) - a szerkezetet csak úgy látod meg.

### 2. Építs flow-dokumentumot, ne abszolút pozíciókat

Kurzoros `Doc(FPDF)` osztály: `need(h)` új oldalt nyit, ha nem fér, `cy` a kurzor.
Kész, működő motor: `/home/gg/marveen/agents/jean/work/wtc-prezentacio/doc.py`
(fejléc, section, quote, table laptöréssel, kártyák, bullets, labelrows, tölcsér,
sötét záró panel). Új anyaghoz ezt másold és a tartalmi részt írd át.

### 3. Ellenőrzés render után - KÖTELEZŐ

```python
for i, p in enumerate(pymupdf.open(f)):
    for b in p.get_text('blocks'):
        x0, y0, x1, y1 = b[:4]
        if y1 > 842-14 or x1 > 595-30 or x0 < 38: print('WARN', i+1, b[4][:44])
    p.get_pixmap(dpi=85).save(f'out{i}.png')
```
És nézd is meg a képeket, ne csak a WARN-t. A takart vagy dobozból kilógó szöveg
geometriai ellenőrzéssel NEM jön ki.

## Buktatók

- **`self.y` NEVET NE HASZNÁLJ a saját kurzorodra.** Az FPDF-nek saját `self.y`
  attribútuma van (a rajzoló kurzor), amit minden `set_xy` / `multi_cell` átír.
  Ha a flow-kurzorodat is `y`-nak hívod, a layout némán szétesik: a táblázat
  cellái lépcsőzetesen lecsúsznak, a dokumentum 6 oldal helyett 12 lesz.
  Mérve 2026-08-27-én. A kurzor neve legyen `cy`.
- **Manrope-ból hiányzik a `◆` és a `▸`.** Az fpdf2 csak figyelmeztet, a jel
  némán eltűnik. Dísz-jelnek rajzolj kis négyzetet (`fill(x, y, 1.9, 1.9, col)`).
  Ékezet viszont teljes, `ő`/`ű` is megvan.
- **Kártya-magasságot az összegre számold, ne a maxra.** Ha egy dobozban két
  szövegblokk van EGYMÁS ALATT, `max(h1, h2)` alapján méretezve az alsó kilóg a
  dobozból. A geometria-ellenőrzés csak akkor fogja meg, ha a lapszélt is átlépi.
- **`multi_cell` alapértelmezése sorkizárt.** Mindenhol `align="L"`.
- **AI-kimenet takarítása:** a Gemini/ChatGPT szöveg tele van `[cite: 7]`
  maradvánnyal, "nem tudok PDF-et generálni" bevezetővel és "1. DIA" jelöléssel.
  Ezeket ki kell venni, a diákat fejezetté alakítani - kivéve, ha tényleg diás
  megoldást kértek.
- **Az adat, ami a szövegben jött, NEM ellenőrzött adat.** Cégnevek, árbevétel,
  létszám: írd oda a gazdának, hogy ezek a forrásszövegből származnak, és nem
  mérted vissza. Egy vezetőségi anyagban a rossz szám drágább, mint a késés.

## Ellenőrzés

1. Nincs WARN a geometria-ellenőrzésen?
2. Kiraszterezve MINDEN oldalt megnéztél?
3. Nincs félig üres utolsó oldal? (Ha 3-5 mm hiányzik, a térközökből vedd el.)
4. Az ékezetek rendben, `ő` és `ű` is?
5. Megmondtad, mely adatok nincsenek visszaellenőrizve?
