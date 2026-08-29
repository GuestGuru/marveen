# -*- coding: utf-8 -*-
"""Designer guide (layout spec) for the GuestGuru midterm one-pagers."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import Page, PAL, W, H, M, CW, OUT, logo  # noqa: E402


def hx(c):
    return "#%02X%02X%02X" % c


SWATCHES = [
    ("brand", "Indigó", "Fejléc-sáv, CTA-sáv, szekciócímek", "Header bar, CTA band, section titles"),
    ("brand2", "Kék", "Negyedik márkaszín, itt nem használt", "Fourth brand colour, unused here"),
    ("accent", "Teál", "Bullet-négyzetek, vonalak", "Bullet squares, rules"),
    ("accent_soft", "Halvány teál", "Szöveg indigó háttéren", "Text on indigo"),
    ("ink", "Ink", "Címsorok, fotó-overlay", "Headlines, photo overlay"),
    ("soft", "Soft", "Panelek, spec-dobozok", "Panels, spec boxes"),
]

STYLES = {
    "hu": [
        ("H1 / Hero cím", "17", "Bold", "Fehér", "Hero fotón, overlayen"),
        ("Eyebrow", "7", "Bold caps", "Accent", "Hero cím fölött, fejlécben"),
        ("Tagline", "8,4", "Regular", "#E6ECF1", "Hero cím alatt"),
        ("Bevezető", "8,6", "Regular", "Muted", "Hero alatti 3 sor"),
        ("Prop-cím", "9,2", "Bold", "Ink", "Értékpont indítása"),
        ("Szövegtörzs", "8,2", "Regular", "Muted", "Értékpont magyarázata"),
        ("Szekciócím", "8", "Bold caps", "Brand", "Panel- és blokkcímek"),
        ("Bizalmi sor", "7,8", "Regular", "Ink", "Bizalmi panel elemei"),
        ("Doboz-címke", "6,6", "Regular caps", "Muted", "Spec- és adat-doboz"),
        ("Doboz-érték", "9,5", "Bold", "Ink", "Spec- és adat-doboz"),
        ("CTA-cím", "13", "Bold", "Fehér", "CTA-sáv"),
        ("Kontakt-sor", "9", "Bold", "Accent", "Lábléc"),
    ],
    "en": [
        ("H1 / Hero title", "17", "Bold", "White", "On hero photo, over overlay"),
        ("Eyebrow", "7", "Bold caps", "Accent", "Above hero title, in header"),
        ("Tagline", "8.4", "Regular", "#E6ECF1", "Below hero title"),
        ("Intro", "8.6", "Regular", "Muted", "Three lines below hero"),
        ("Prop title", "9.2", "Bold", "Ink", "Value point lead-in"),
        ("Body", "8.2", "Regular", "Muted", "Value point explanation"),
        ("Section label", "8", "Bold caps", "Brand", "Panel and block titles"),
        ("Trust item", "7.8", "Regular", "Ink", "Trust panel entries"),
        ("Box label", "6.6", "Regular caps", "Muted", "Spec and location boxes"),
        ("Box value", "9.5", "Bold", "Ink", "Spec and location boxes"),
        ("CTA title", "13", "Bold", "White", "CTA band"),
        ("Contact line", "9", "Bold", "Accent", "Footer"),
    ],
}

GUIDE = {
    "hu": {
        "title": "Designer útmutató",
        "sub": "GuestGuru középtávú bérlés, B2B egyoldalasok | GG-104 | A4, 210 x 297 mm",
        "sections": [
            ("1. Márka-alapok", [
                "A négy márkaszín a design.guest.guru/brand oldalról jön: Indigó #4A509C, Kék #2480B7, "
                "Teál #43B9BC, Halvány teál #97D0C8. Ez a hivatalos forrás, ne mérj ki színt a logóból.",
                "A teál a felület kb. 5%-a: bullet-négyzetek, a fejléc alatti vonal, a CTA felső vonala.",
                "Tipográfia: a wordmark Poppins 700, +3% betűközzel, a \'GUEST.\' indigó, a \'GURU\' teál. "
                "A törzsszöveg betűtípusát a design-rendszer nem írja elő; a referencia-render DejaVu Sans, "
                "Canvában és InDesignban Poppins vagy Inter.",
                "Betűméretek (pt): H1 17, szekciócím 8 nagybetűs +0,4 betűköz, prop-cím 9,2 B, "
                "szövegtörzs 8,2, címke 6,6 nagybetűs, láb 5,6-9.",
                "Sortáv: szövegtörzs 4,1 mm (kb. 1,25x), címsor 7,4 mm. Balra zárt szedés, sehol nem sorkizárt.",
                "Logó: a márkaszabály TILTJA az átszínezést, a szürkeárnyalatot, a forgatást és a ráírást. "
                "Sötét sávon ezért nem fehér változat kell, hanem fehér alátét (lekerekített pill).",
                "A mark vektoros (gg-logo.svg), tehát bármekkorára nagyítható. Minimum 26 px; ez alatt a "
                "keret nélküli app-mark megy. App-fejlécben app-mark van, dokumentumon a teljes logó.",
            ]),
            ("2. Rács és margók", [
                "Oldalmargó 14 mm mindenhol, hasznos szélesség 182 mm.",
                "A fejléc-sáv és a CTA-sáv KIFUT a lapszélig (0-tól 210 mm-ig), a tartalom nem.",
                "Két fő oszlop a pitch-oldalon: szöveg 130 mm, fotó-sáv 46 mm, köztük 6 mm.",
                "Katalógus-oldal: 3 oszlopos rács (3 x 57,3 mm, 3 mm köz) a spec- és elhelyezkedés-dobozokhoz.",
                "Függőleges ritmus: blokkok között 4-6 mm, szekciók között 8-10 mm.",
            ]),
            ("3. Vizuális hierarchia (fentről lefelé)", [
                "1. szint - Fejléc-sáv: logó + egy soros pozicionáló felirat. Nem versenyez a címmel.",
                "2. szint - Hero fotó + rátett cím: a lap 25%-a. Itt dől el, hogy elolvassák-e a többit.",
                "3. szint - Bevezető 3 sor: a probléma, amit megoldunk. Muted színnel, kisebb súllyal.",
                "4. szint - 5 érték-pont: félkövér indítás, utána magyarázat. Ez a lap gerince.",
                "5. szint - Bizalmi panel: soft háttér, brand színű bal él. Bizonyíték, nem ígéret.",
                "6. szint - CTA-sáv: egy kérés, egy QR, három elérhetőség. Semmi más.",
            ]),
            ("4. Doboz-elhelyezés", [
                "A jobb oldali wireframe mm-pontos. A számok a bal felső sarok koordinátái.",
                "A hero-overlay 82% opacitású Ink téglalap, a fotó alsó 40 mm-ét fedi. "
                "Ne csökkentsd 70% alá, mert a fehér cím elveszik.",
                "A bizalmi panel magassága a soroktól függ, de a CTA-sáv fix: a lap alsó 42 mm-e.",
                "Ha egy szöveg nem fér ki, NE a betűméretet vidd le. Rövidítsd a szöveget.",
            ]),
            ("5. Fotóhasználat", [
                "Hero: tág, világos nappali vagy konyha, ember nélkül. Fekvő vágás, 210 x 74 mm.",
                "Fotó-sáv: két álló vágás, 46 mm széles, hálószoba és munkasarok. Ne két hasonlót.",
                "Katalógus: 1 nagy (115 x 74 mm) + 3 kicsi (64 x 22,7 mm). A nagy mindig a nappali.",
                "Vágás középre igazítva, portré forrásnál a felső 40%-ból. Minimum 200 dpi nyomtatáshoz.",
                "Ne tegyél szöveget a fotóra overlay nélkül. Sehol.",
            ]),
            ("6. Ikonográfia", [
                "Alapértelmezésben nincs ikon: a tömör accent négyzet (2,2 x 2,2 mm) a bullet.",
                "Ha a designer ikont akar, vonalas stílus, 1,5 pt vastagság, brand szín, 5 mm-es doboz.",
                "Javasolt párosítás: számla - dokumentum, folyamat - nyíl-lánc, cím - térkép-pin, "
                "takarítás - permetező, reggeli - csésze, szerződés - pecsét, lakcímkártya - kártya, "
                "bútorozott - kanapé, hosszabbítás - naptár, kapcsolattartó - fejhallgató, "
                "nagy apartman - épület, hálószoba - ágy, menetrend - csapó, elszámolás - számológép.",
                "Ikon és szöveg között 3 mm. Ikon soha nem színes, csak brand vagy accent.",
            ]),
            ("7. Átültetés Canvába / InDesignba", [
                "Canva: A4 sablon, Position > Advanced menüben mm-pontos X/Y megadható. "
                "Készíts Brand Kitet a hat hexből, és a hat szín legyen elnevezve.",
                "InDesign: állítsd be a 14 mm-es margót és a 3 oszlopot, a fejléc- és CTA-sáv "
                "kifutó (bleed 3 mm). Karakterstílusok: H1, Eyebrow, Prop-cím, Body, Label, Contact.",
                "A katalógus-sablonból csinálj mesteroldalt: a {{...}} placeholderek maradjanak "
                "szöveges változóként, hogy a GG3-ból jövő adat behelyettesíthető legyen.",
                "Export: PDF/X-4, 300 dpi, beágyazott betűk. Emailhez külön 150 dpi-s, 1 MB alatti verzió.",
            ]),
            ("8. Amit ne", [
                "Ne használj gradienst, árnyékot vagy 3D effektet. A lap sík.",
                "Ne tegyél a lapra négynél több fotót (a katalógus a kivétel).",
                "Ne írj bekezdésbe hatnál több sort.",
                "Ne hagyd benne a [szögletes] és {{kapcsos}} placeholdereket az ügyfélnek menő verzióban.",
            ]),
        ],
    },
    "en": {
        "title": "Designer guide",
        "sub": "GuestGuru midterm B2B one-pagers | GG-104 | A4, 210 x 297 mm",
        "sections": [
            ("1. Brand basics", [
                "Colours: the six values below are the entire palette. Do not add a seventh; the accent carries emphasis.",
                "Accent covers roughly 5% of the surface: bullet squares, contact line, top rule of the CTA band.",
                "Typography: one grotesque family, two weights (Regular + Bold). Reference render uses DejaVu Sans; "
                "use Inter or Poppins in Canva, Inter / Söhne / Neue Haas in InDesign.",
                "Sizes (pt): H1 17, section title 8 uppercase +0.4 tracking, prop title 9.2 Bold, "
                "body 8.2, label 6.6 uppercase, footer 5.6-9.",
                "Leading: body 4.1 mm (approx. 1.25x), headline 7.4 mm. Everything ranged left, never justified.",
                "Logo: white version on dark bands, minimum 8 mm height, 6 mm clear space around it.",
            ]),
            ("2. Grid and margins", [
                "14 mm page margin all round, 182 mm live area.",
                "The header band and the CTA band BLEED to the page edge (0 to 210 mm); content does not.",
                "Two main columns on the pitch page: 130 mm text, 46 mm photo rail, 6 mm gutter.",
                "Catalogue page: 3-column grid (3 x 57.3 mm, 3 mm gutter) for spec and location boxes.",
                "Vertical rhythm: 4-6 mm between blocks, 8-10 mm between sections.",
            ]),
            ("3. Visual hierarchy (top to bottom)", [
                "Level 1 - Header band: logo plus a one-line positioning strap. It must not compete with the title.",
                "Level 2 - Hero photo with overlaid headline: 25% of the page. This decides whether the rest gets read.",
                "Level 3 - Three-line intro: the problem we solve. Muted colour, lighter weight.",
                "Level 4 - Five value points: bold lead-in, then the explanation. This is the spine of the page.",
                "Level 5 - Trust panel: soft background, brand-coloured left edge. Evidence, not promises.",
                "Level 6 - CTA band: one request, one QR, three contact details. Nothing else.",
            ]),
            ("4. Box placement", [
                "The wireframe on the right is millimetre-accurate. Numbers are top-left corner coordinates.",
                "The hero overlay is an Ink rectangle at 82% opacity covering the bottom 40 mm of the photo. "
                "Do not drop below 70% or the white headline disappears.",
                "The trust panel height follows its rows, but the CTA band is fixed: the bottom 42 mm of the page.",
                "If copy does not fit, do NOT reduce the type size. Shorten the copy.",
            ]),
            ("5. Photography", [
                "Hero: wide, bright living room or kitchen, no people. Landscape crop, 210 x 74 mm.",
                "Photo rail: two portrait crops, 46 mm wide, bedroom and work corner. Never two similar shots.",
                "Catalogue: 1 large (115 x 74 mm) plus 3 small (64 x 22.7 mm). The large one is always the living room.",
                "Centre crop; from portrait sources take the top 40%. Minimum 200 dpi for print.",
                "Never place text over a photo without an overlay.",
            ]),
            ("6. Iconography", [
                "By default there are no icons: the solid accent square (2.2 x 2.2 mm) is the bullet.",
                "If the designer wants icons: line style, 1.5 pt stroke, brand colour, 5 mm box.",
                "Suggested pairings: invoice - document, process - arrow chain, location - map pin, "
                "cleaning - spray bottle, breakfast - cup, contract - stamp, address card - ID card, "
                "furnished - sofa, extension - calendar, account manager - headset, "
                "large apartment - building, bedroom - bed, schedule - clapperboard, billing - calculator.",
                "3 mm between icon and text. Icons are never multicolour, only brand or accent.",
            ]),
            ("7. Moving it into Canva / InDesign", [
                "Canva: A4 template; Position > Advanced accepts exact mm X/Y. Build a Brand Kit "
                "from the six hex values and name each colour.",
                "InDesign: set the 14 mm margin and 3 columns; header and CTA bands bleed (3 mm). "
                "Character styles: H1, Eyebrow, Prop title, Body, Label, Contact.",
                "Turn the catalogue into a master page: keep the {{...}} placeholders as text variables "
                "so data coming from GG3 can be substituted.",
                "Export: PDF/X-4, 300 dpi, embedded fonts. Plus a 150 dpi email version under 1 MB.",
            ]),
            ("8. What not to do", [
                "No gradients, drop shadows or 3D effects. The page is flat.",
                "No more than four photos on a page (the catalogue is the exception).",
                "No paragraph longer than six lines.",
                "Never ship [square] or {{curly}} placeholders in a client-facing version.",
            ]),
        ],
    },
}


def swatch_row(pdf, y, lang):
    w = (CW - 5 * 3) / 6
    for i, (k, name, hu, en) in enumerate(SWATCHES):
        x = M + i * (w + 3)
        pdf.box(x, y, w, 13, PAL[k], radius=1.5)
        if k in ("soft", "line"):
            pdf.set_draw_color(*PAL["line"])
            pdf.set_line_width(0.3)
            pdf.rect(x, y, w, 13)
        pdf.set_xy(x, y + 14)
        pdf.set_font("gg", "B", 6.4)
        pdf.set_text_color(*PAL["ink"])
        pdf.cell(w, 3, name)
        pdf.set_xy(x, y + 17)
        pdf.set_font("gg", "", 6.4)
        pdf.set_text_color(*PAL["muted"])
        pdf.cell(w, 3, hx(PAL[k]))
        pdf.set_xy(x, y + 20)
        pdf.set_font("gg", "", 5.6)
        pdf.multi_cell(w, 2.8, hu if lang == "hu" else en, align="L")
    return y + 32


WIRE_PITCH = [
    (0, 0, 210, 16, "Fejléc-sáv / Header band", "brand"),
    (0, 16, 210, 74, "Hero fotó + cím-overlay / Hero photo + headline", "ink"),
    (14, 96, 128, 18, "Bevezető / Intro", "soft"),
    (14, 119, 128, 88, "5 értékpont / 5 value points", "soft"),
    (150, 96, 46, 55, "Fotó 2", "line"),
    (150, 155, 46, 52, "Fotó 3", "line"),
    (14, 212, 182, 33, "Bizalmi panel / Trust panel", "soft"),
    (0, 255, 210, 42, "CTA-sáv + kontakt + QR", "brand"),
]

WIRE_CAT = [
    (0, 0, 210, 16, "Fejléc-sáv / Header band", "brand"),
    (14, 22, 115, 74, "Fő fotó / Main photo", "line"),
    (132, 22, 64, 22, "Fotó 2", "line"),
    (132, 47, 64, 22, "Fotó 3", "line"),
    (132, 72, 64, 22, "Fotó 4", "line"),
    (14, 101, 182, 22, "Cím + tagline + leírás", "soft"),
    (14, 127, 182, 32, "Gyors adatok 3x2 / Quick specs", "soft"),
    (14, 163, 78, 34, "Felszereltség / Features", "soft"),
    (98, 163, 98, 44, "Pénzügy / Financials", "soft"),
    (14, 211, 182, 19, "Elhelyezkedés / Location", "soft"),
    (14, 234, 182, 8, "Megjegyzés / Notes", "soft"),
    (0, 263, 210, 34, "CTA-sáv + kontakt + QR", "brand"),
]


def wireframe(pdf, x0, y0, scale, blocks, caption):
    pdf.set_font("gg", "B", 7)
    pdf.set_text_color(*PAL["brand"])
    pdf.set_xy(x0, y0 - 5)
    pdf.cell(80, 4, caption.upper())
    pdf.set_draw_color(*PAL["ink"])
    pdf.set_line_width(0.4)
    pdf.rect(x0, y0, 210 * scale, 297 * scale)
    for (bx, by, bw, bh, label, col) in blocks:
        X, Y = x0 + bx * scale, y0 + by * scale
        BW, BH = bw * scale, bh * scale
        pdf.box(X, Y, BW, BH, PAL[col] if col != "line" else PAL["soft"])
        pdf.set_draw_color(*PAL["line"])
        pdf.set_line_width(0.2)
        pdf.rect(X, Y, BW, BH)
        pdf.set_font("gg", "", 5.4)
        pdf.set_text_color(*(PAL["white"] if col in ("brand", "ink")
                             else PAL["muted"]))
        pdf.set_xy(X + 1, Y + BH / 2 - 3.4)
        pdf.multi_cell(BW - 2, 3.0, f"{label}\n{int(bx)},{int(by)} - "
                                    f"{int(bw)}x{int(bh)} mm", align="C")


def build(lang):
    g = GUIDE[lang]
    pdf = Page()

    # ---------- page 1
    pdf.add_page()
    pdf.box(0, 0, W, 36, PAL["brand"])
    pdf.box(0, 36, W, 1.2, PAL["accent"])
    logo(pdf, M, 8.5, 4.4)
    pdf.set_xy(M, 21.5)
    pdf.set_font("gg", "B", 13)
    pdf.set_text_color(*PAL["white"])
    pdf.cell(120, 6, g["title"])
    pdf.set_xy(W - M - 110, 23.5)
    pdf.set_font("gg", "", 7)
    pdf.cell(110, 4, g["sub"], align="R")

    y = 44
    pdf.set_xy(M, y)
    pdf.set_font("gg", "B", 8)
    pdf.set_text_color(*PAL["brand"])
    pdf.cell(CW, 4.5, ("PALETTA" if lang == "hu" else "PALETTE"))
    y = swatch_row(pdf, y + 6, lang)

    for title, items in g["sections"][:4]:
        pdf.set_xy(M, y)
        pdf.set_font("gg", "B", 9)
        pdf.set_text_color(*PAL["brand"])
        pdf.cell(CW, 5, title)
        y += 6
        for it in items:
            pdf.box(M + 0.5, y + 1.4, 1.6, 1.6, PAL["accent"])
            pdf.set_xy(M + 4.5, y)
            pdf.set_font("gg", "", 7.8)
            pdf.set_text_color(*PAL["ink"])
            pdf.multi_cell(CW - 4.5, 3.9, it, align="L")
            y = pdf.get_y() + 1.4
        y += 3.5

    # ---------- page 2
    pdf.add_page()
    pdf.box(0, 0, W, 16, PAL["brand"])
    logo(pdf, M, 6.4, 4.4)
    pdf.set_xy(W - M - 90, 5.6)
    pdf.set_font("gg", "", 7)
    pdf.set_text_color(*PAL["white"])
    pdf.cell(90, 5, g["title"].upper() + " | 2", align="R")

    y = 24
    for title, items in g["sections"][4:]:
        pdf.set_xy(M, y)
        pdf.set_font("gg", "B", 9)
        pdf.set_text_color(*PAL["brand"])
        pdf.cell(CW, 5, title)
        y += 6
        for it in items:
            pdf.box(M + 0.5, y + 1.4, 1.6, 1.6, PAL["accent"])
            pdf.set_xy(M + 4.5, y)
            pdf.set_font("gg", "", 7.8)
            pdf.set_text_color(*PAL["ink"])
            pdf.multi_cell(CW - 4.5, 3.9, it, align="L")
            y = pdf.get_y() + 1.4
        y += 3.5

    # ---------- page 3: wireframes
    pdf.add_page()
    pdf.box(0, 0, W, 16, PAL["brand"])
    logo(pdf, M, 6.4, 4.4)
    pdf.set_xy(W - M - 90, 5.6)
    pdf.set_font("gg", "", 7)
    pdf.set_text_color(*PAL["white"])
    pdf.cell(90, 5, ("WIREFRAME | 3"), align="R")

    sc = 0.42
    wireframe(pdf, M, 30, sc, WIRE_PITCH,
              "Pitch one-pager (doc 1-3)")
    wireframe(pdf, M + 94, 30, sc, WIRE_CAT,
              "Katalógus sablon (doc 4)" if lang == "hu"
              else "Catalogue template (doc 4)")

    note = ("A koordináták a lap bal felső sarkától, milliméterben. "
            "A fejléc- és CTA-sáv kifutó, minden más a 14 mm-es margón belül."
            if lang == "hu" else
            "Coordinates are in millimetres from the top-left corner of the page. "
            "Header and CTA bands bleed; everything else stays inside the 14 mm margin.")
    pdf.set_xy(M, 30 + 297 * sc + 10)
    pdf.set_font("gg", "", 7.4)
    pdf.set_text_color(*PAL["muted"])
    pdf.multi_cell(CW, 4, note, align="L")

    # ---------- character styles table
    ty = pdf.get_y() + 8
    pdf.set_xy(M, ty)
    pdf.set_font("gg", "B", 8)
    pdf.set_text_color(*PAL["brand"])
    pdf.cell(CW, 4.5, ("KARAKTERSTÍLUSOK" if lang == "hu"
                       else "CHARACTER STYLES"))
    ty += 6.5
    heads = (["Stílus", "pt", "Súly", "Szín", "Hol"] if lang == "hu"
             else ["Style", "pt", "Weight", "Colour", "Where"])
    cols = [40, 12, 20, 30, CW - 102]
    pdf.box(M, ty, CW, 6, PAL["brand"])
    cx = M
    for i, h in enumerate(heads):
        pdf.set_xy(cx + 2, ty)
        pdf.set_font("gg", "B", 6.6)
        pdf.set_text_color(*PAL["white"])
        pdf.cell(cols[i] - 2, 6, h.upper())
        cx += cols[i]
    ty += 6
    for i, row in enumerate(STYLES[lang]):
        if i % 2 == 0:
            pdf.box(M, ty, CW, 5.6, PAL["soft"])
        cx = M
        for j, v in enumerate(row):
            pdf.set_xy(cx + 2, ty)
            pdf.set_font("gg", "B" if j == 0 else "", 6.8)
            pdf.set_text_color(*(PAL["ink"] if j == 0 else PAL["muted"]))
            pdf.cell(cols[j] - 2, 5.6, v)
            cx += cols[j]
        ty += 5.6

    f = os.path.join(OUT, f"GuestGuru-05-designer-guide-{lang.upper()}.pdf")
    pdf.output(f)
    return f


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for lg in ("hu", "en"):
        print(os.path.basename(build(lg)))
