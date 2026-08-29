# -*- coding: utf-8 -*-
"""Fill-in checklist: every unverified placeholder across the one-pagers."""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import Page, PAL, W, H, M, CW, OUT, logo  # noqa: E402
from content import DOCS, FACTS, APARTMENTS  # noqa: E402
import os as _os

TITLES = {
    "01-corporate-tmc": "1. Céges kiküldetések & utazási irodák",
    "02-relocation": "2. Relokációs ügynökségek",
    "03-film-production": "3. Filmes produkciók & stábok",
    "04-property-catalogue": "4. Lakáskatalógus sablon",
}

PAT = re.compile(r"\[[^\]]{1,80}\]|\{\{[^}]{1,80}\}\}")


def walk(node, out):
    if isinstance(node, str):
        out.extend(PAT.findall(node))
    elif isinstance(node, (list, tuple)):
        for n in node:
            walk(n, out)
    elif isinstance(node, dict):
        for v in node.values():
            walk(v, out)


def collect(key):
    """Egyedi placeholderek, mellettük hogy hany helyen fordulnak elo.
    A darabszam kell: a '[X]' onmagaban egy sor, de ot kulonbozo adatot takar."""
    found = []
    walk(DOCS[key]["hu"], found)
    seen, uniq = {}, []
    for f in found:
        if f not in seen:
            seen[f] = 0
            uniq.append(f)
        seen[f] += 1
    return [(f + (f" ({seen[f]} helyen)" if seen[f] > 1 else "")) for f in uniq]


def need(pdf, y, space):
    """Start a new page if `space` mm would not fit."""
    if y + space <= H - 16:
        return y
    pdf.add_page()
    pdf.box(0, 0, W, 16, PAL["brand"])
    logo(pdf, M, 6.4, 4.4)
    pdf.set_xy(W - M - 90, 5.6)
    pdf.set_font("gg", "", 7)
    pdf.set_text_color(*PAL["white"])
    pdf.cell(90, 5, "KITÖLTENDŐ ADATOK", align="R")
    return 26


def build():
    pdf = Page()
    pdf.add_page()
    pdf.box(0, 0, W, 36, PAL["brand"])
    pdf.box(0, 36, W, 1.2, PAL["accent"])
    logo(pdf, M, 8.5, 4.4)
    pdf.set_xy(M, 21.5)
    pdf.set_font("gg", "B", 13)
    pdf.set_text_color(*PAL["white"])
    pdf.cell(140, 6, "Kitöltendő adatok")
    pdf.set_xy(W - M - 110, 23.5)
    pdf.set_font("gg", "", 7)
    pdf.cell(110, 4, "GG-104 középtávú bérlés, egyoldalasok | belső munkalap", align="R")

    y = 43
    pdf.set_xy(M, y)
    pdf.set_font("gg", "", 8)
    pdf.set_text_color(*PAL["muted"])
    pdf.multi_cell(CW, 4.2,
                   "Minden [szögletes] és {{kapcsos}} jelölés olyan adat, amit nem "
                   "tudtam forrásból ellenőrizni, ezért nem írtam bele találgatást. "
                   "Amíg ezek benne vannak, az anyag NEM mehet ki ügyfélnek. "
                   "A jobb oldali oszlop az, amit tőled kérek.", align="L")
    y = pdf.get_y() + 5

    for key, title in TITLES.items():
        items = collect(key)
        asks = DOCS[key]["to_verify"]
        y = need(pdf, y, 12 + 4.6 * max(len(items), len(asks)))
        pdf.set_xy(M, y)
        pdf.set_font("gg", "B", 9.5)
        pdf.set_text_color(*PAL["brand"])
        pdf.cell(CW, 5.5, title)
        y += 7

        colw = (CW - 6) / 2
        pdf.set_xy(M, y)
        pdf.set_font("gg", "B", 6.6)
        pdf.set_text_color(*PAL["muted"])
        pdf.cell(colw, 4, "PLACEHOLDEREK A SZÖVEGBEN")
        pdf.set_xy(M + colw + 6, y)
        pdf.cell(colw, 4, "AMIT KÉRDEZEK")
        y += 5

        y0 = y
        yy = y
        for it in items:
            pdf.box(M, yy + 1.3, 1.6, 1.6, PAL["accent"])
            pdf.set_xy(M + 4, yy)
            pdf.set_font("gg", "", 7.4)
            pdf.set_text_color(*PAL["ink"])
            pdf.multi_cell(colw - 4, 3.8, it, align="L")
            yy = pdf.get_y() + 0.8
        left_end = yy

        yy = y0
        for a in asks:
            pdf.box(M + colw + 6, yy + 1.3, 1.6, 1.6, PAL["brand"])
            pdf.set_xy(M + colw + 10, yy)
            pdf.set_font("gg", "", 7.4)
            pdf.set_text_color(*PAL["ink"])
            pdf.multi_cell(colw - 4, 3.8, a, align="L")
            yy = pdf.get_y() + 0.8

        y = max(left_end, yy) + 5

    # global items
    y = need(pdf, y, 60)
    pdf.set_xy(M, y)
    pdf.set_font("gg", "B", 9.5)
    pdf.set_text_color(*PAL["brand"])
    pdf.cell(CW, 5.5, "Mindegyik anyagra")
    y += 7
    for g in [
        "Telefonszám a láblécbe (most [+36 XX XXX XXXX]).",
        "QR-kód célja: melyik oldalra vigyen (elérhető apartmanok listája, "
        "kapcsolatfelvételi űrlap, vagy naptár-foglalás)?",
        "Logó vektoros vagy nagy felbontású PNG, fehér változatban is.",
        "Márkaszínek: a mostani paletta ideiglenes, a logóból veszem ki, "
        "vagy add meg a hivatalos hexeket.",
        "Kell-e cégadat a láblécbe (cégnév, székhely, adószám, nyilvántartási szám)?",
        "Az EN verzióban maradjon-e magyar cégforma és címzés, vagy nemzetközi formátum?",
    ]:
        y = need(pdf, y, 10)
        pdf.box(M, y + 1.3, 1.6, 1.6, PAL["accent"])
        pdf.set_xy(M + 4, y)
        pdf.set_font("gg", "", 7.6)
        pdf.set_text_color(*PAL["ink"])
        pdf.multi_cell(CW - 4, 4, g, align="L")
        y = pdf.get_y() + 1

    # ---- per apartment: what is still missing
    y = need(pdf, y, 50)
    y += 4
    pdf.set_xy(M, y)
    pdf.set_font("gg", "B", 9.5)
    pdf.set_text_color(*PAL["brand"])
    pdf.cell(CW, 5.5, "Lakásonként, ami még hiányzik")
    y += 7
    base = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)),
                         "assets", "photos")
    for apt in APARTMENTS:
        d = _os.path.join(base, apt["slug"])
        n = len([f for f in _os.listdir(d)]) if _os.path.isdir(d) else 0
        # 2026-08-14: a max_fo es az emelet kikerult a lakas-rekordbol. Helyettuk
        # az agyak elosztasa es a lift all, es a merethez tartozo adatok mar
        # megvannak (Eszti, 2026-08-14), tehat azok lekerultek a hianylistarol.
        ker = apt.get("kerulet")
        beds = apt.get("beds", {}).get("hu", [])
        van = [f"{len(beds)} ágy megadva" if beds else None,
               f"{n} fotó" if n else None,
               ker,
               "lift" if apt.get("lift") else None,
               apt["szabad"] if "{{" not in apt["szabad"] else None]
        van = [v for v in van if v]
        hi = ["bérleti díj", "kaució", "rezsi"]
        if not ker:
            hi.insert(0, "cím és kerület")
        if not beds:
            hi.insert(0, "ágyak elosztása")
        if not n:
            hi.insert(0, "FOTÓ (a mappa üres)")
        if "{{" in apt["szabad"]:
            hi.append("mikortól szabad")
        y = need(pdf, y, 16)
        pdf.set_xy(M, y)
        pdf.set_font("gg", "B", 8.2)
        pdf.set_text_color(*PAL["ink"])
        pdf.cell(CW, 4.4, apt["nev"])
        y += 4.6
        pdf.set_xy(M + 4, y)
        pdf.set_font("gg", "", 7.2)
        pdf.set_text_color(*PAL["muted"])
        pdf.multi_cell(CW - 8, 3.8,
                       "Megvan: " + (", ".join(van) if van else "semmi") +
                       "\nKell: " + ", ".join(hi), align="L")
        y = pdf.get_y() + 2.5

    # ---- verified facts and their sources
    y = need(pdf, y, 40)
    y += 4
    pdf.set_xy(M, y)
    pdf.set_font("gg", "B", 9.5)
    pdf.set_text_color(*PAL["brand"])
    pdf.cell(CW, 5.5, "Ellenőrzött adatok és forrásuk")
    y += 7
    pdf.set_xy(M, y)
    pdf.set_font("gg", "", 7.4)
    pdf.set_text_color(*PAL["muted"])
    pdf.multi_cell(CW, 4,
                   "Ezek NEM placeholderek: forrásból ellenőriztem őket, és be vannak "
                   "töltve az anyagba. Azért látod itt, hogy tudd ellenőrizni, és hogy "
                   "fél év múlva is kiderüljön, honnan jött a szám.", align="L")
    y = pdf.get_y() + 3

    cols = [56, 58, 46, 22]
    heads = ["ADAT", "HOL SZEREPEL", "FORRÁS", "MIKORI"]
    pdf.box(M, y, CW, 6, PAL["brand"])
    cx = M
    for i, h in enumerate(heads):
        pdf.set_xy(cx + 2, y)
        pdf.set_font("gg", "B", 6.4)
        pdf.set_text_color(*PAL["white"])
        pdf.cell(cols[i] - 2, 6, h)
        cx += cols[i]
    y += 6
    for i, fct in enumerate(FACTS):
        vals = [fct["ertek"], fct["hol"], fct["forras"], fct["datum"]]
        pdf.set_font("gg", "", 6.8)
        # a valodi sortoresek szama kell, nem becsles - kulonben atlog a kovetkezo sorba
        nlines = max(len(pdf.multi_cell(cols[j] - 4, 3.6, v, align="L",
                                        dry_run=True, output="LINES"))
                     for j, v in enumerate(vals))
        rh = nlines * 3.6 + 2.4
        y = need(pdf, y, rh + 2)
        if i % 2 == 0:
            pdf.box(M, y, CW, rh, PAL["soft"])
        cx = M
        for j, v in enumerate(vals):
            pdf.set_xy(cx + 2, y + 1.2)
            pdf.set_font("gg", "B" if j == 0 else "", 6.8)
            pdf.set_text_color(*(PAL["ink"] if j == 0 else PAL["muted"]))
            pdf.multi_cell(cols[j] - 4, 3.6, v, align="L")
            cx += cols[j]
        y += rh

    f = os.path.join(OUT, "GuestGuru-06-kitoltendo-adatok-HU.pdf")
    pdf.output(f)
    return f


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    print(os.path.basename(build()))
