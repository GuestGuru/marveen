# -*- coding: utf-8 -*-
"""Render GuestGuru midterm B2B one-pagers to PDF (A4, print ready)."""
import hashlib
import json
import os
import sys
from fpdf import FPDF
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from content import DOCS, CONTACT, APARTMENTS, _NOTES_HU, _NOTES_EN  # noqa: E402

NOTES = {"hu": _NOTES_HU, "en": _NOTES_EN}

BASE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(BASE, "assets")
PHOTOS = os.path.join(ASSETS, "photos")
OUT = os.path.join(BASE, "out")
CACHE = os.path.join(BASE, "_imgcache")
# A hivatalos torzsbetu a Manrope (design.guest.guru/alkotmany).
# A DejaVu csak tartalek, ha a Manrope nincs telepitve.
FONT_MANROPE = "/home/gg/.local/share/fonts/manrope"
FONT_DEJAVU = "/usr/share/fonts/truetype/dejavu"

# ------------------------------------------------------------------ palette
# Swap these once the logo is confirmed. Everything derives from here.
# HIVATALOS ertekek: design.guest.guru/brand (lekerve 2026-08-11).
# A negy markaszin: Indigo #4a509c, Kek #2480b7, Teal #43b9bc, Halvany teal #97d0c8.
# Ugyanez a negy szin van a gg-logo.svg-ben is, tehat egyeznek.
# Korabban a logo-minta.png-bol mert ertekek (#4D409C / #00BEBE) TELESZTETTEK,
# a legnagyobb elteres a telnal volt: mert #00BEBE vs hivatalos #43b9bc.
PAL = {
    "ink": (34, 38, 79),        # sotetitett indigo - cimsor, szoveg, foto-overlay
    "brand": (74, 80, 156),     # Indigo #4a509c - fejlec-sav, CTA-sav, szekciocim
    "brand2": (36, 128, 183),   # Kek #2480b7 - a negyedik markaszin
    "accent": (34, 125, 128),   # Teal #227d80 - a VILAGOS temaju primary a
                                # token-rendszerben. A logo #43b9bc-je feheren
                                # csak 2,36:1 kontraszt, ez 4,87:1.
    "accent_band": (67, 185, 188),  # Teal #43b9bc - logo-teal, csak sotet savon
    "accent_soft": (151, 208, 200),  # Halvany teal #97d0c8 - szoveg indigo hatteren
    "soft": (241, 242, 248),    # halvany indigo panel
    "line": (213, 215, 230),    # hajszalvonal
    "muted": (106, 109, 140),   # masodlagos szoveg
    "white": (255, 255, 255),
}

W, H = 210.0, 297.0
M = 14.0                      # page margin
CW = W - 2 * M                # content width


def hexpal(k):
    return PAL[k]


# ------------------------------------------------------------------ images
def prep(path, w_mm, h_mm, key):
    """Center-crop an image to the target aspect ratio, return cached path.

    2026-08-25: a gyorsitotar kulcsa KORABBAN csak a `key` volt ("cat-big",
    "cat-s0"...), az viszont MINDEN lakaslapon ugyanaz. Emiatt az elsonek
    renderelt lap fotoi rarakodtak a tobbire: tobb lakas lapjan is UGYANANNAK
    az egy lakasnak a kepei alltak. A lapok hibatlannak latszottak, a
    geometria-ellenorzes es a toneparse sem foghatta meg, mert a szoveg
    helyes volt. A kulcs mostantol a FORRASFAJL utvonalat es a celmeretet is
    tartalmazza. (Hogy konkretan mely lakasokrol volt szo, az a helyi
    photos.local.json melle tartozik, nem egy publikus repoba.)
    """
    os.makedirs(CACHE, exist_ok=True)
    sig = hashlib.sha1(
        f"{os.path.abspath(path)}|{w_mm:.2f}x{h_mm:.2f}".encode()
    ).hexdigest()[:10]
    out = os.path.join(CACHE, f"{key}-{sig}.jpg")
    if os.path.exists(out):
        return out
    im = Image.open(path).convert("RGB")
    target = w_mm / h_mm
    iw, ih = im.size
    cur = iw / ih
    if cur > target:
        nw = int(ih * target)
        left = (iw - nw) // 2
        im = im.crop((left, 0, left + nw, ih))
    else:
        nh = int(iw / target)
        top = int((ih - nh) * 0.4)
        im = im.crop((0, top, iw, top + nh))
    px = int(w_mm / 25.4 * 200)
    im = im.resize((px, max(1, int(px / target))), Image.LANCZOS)
    im.save(out, "JPEG", quality=88)
    return out


# Melyik anyag melyik lakás fotóit használja, és melyik mappa képei nem
# hitelesek. Mindkettő TELEPÍTÉS-FÜGGŐ adat, ezért 2026-08-29 óta a
# photos.local.json-ból jön (gitignorált; a photos.local.example.json mutatja a
# szerkezetet). Korábban itt állt beégetve, konkrét lakás-slugokkal, holott ez a
# repo egy PUBLIKUS fork, és a lakás-azonosítóknak nincs helyük egy
# világolvasható fájlban. A blocklist logikája változatlan: jobb az üres keret,
# mint egy másik lakás fotója egy ügyfélnek menő lapon.
_PHOTOS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "photos.local.json")
try:
    with open(_PHOTOS_FILE, encoding="utf-8") as _f:
        _photos_cfg = json.load(_f)
except FileNotFoundError:
    sys.exit(
        f"Hiányzik: {_PHOTOS_FILE}\n"
        "Másold le a photos.local.example.json-t erre a névre, és add meg, melyik\n"
        "anyag melyik lakás fotóit használja. Szándékosan NINCS alapértelmezés:\n"
        "egy néma fallback IDEGEN lakás fotóját tenné egy ügyfélnek menő lapra."
    )
PHOTO_SET = {k: (v[0], v[1]) for k, v in _photos_cfg.get("photo_set", {}).items()}
PHOTO_BLOCKLIST = set(_photos_cfg.get("photo_blocklist", []))


# A lakaslapon a fotorács ELSO kepe a nagy hero, a tobbi harom a jobb oldali
# sav. A Drive-rol erkezo fajlnev-sorrend ehhez veletlenszeru: a drive.py
# 00..NN-re szamozza at oket, tehat egy uj feltoltes felboritja a valasztast.
# Ezert a sorrend ITT dol el, indexekkel a letoltott (rendezett) listaba.
# Ellenorizd, ha a Drive-mappa tartalma valtozik: a gen.py figyelmeztet, ha a
# hossz nem stimmel, es olyankor a nyers sorrendre esik vissza.
#
# A konkrét sorrendek is a photos.local.json-ban vannak (photo_order), mert
# lakás-slugot tartalmaznak, és ez a repo PUBLIKUS fork. A magyarázat, hogy
# MIÉRT az adott sorrend (melyik kép álló, melyik fekvő, mi legyen a hero),
# a helyi fájl "_comment" mezőjébe való, a számok mellé.
PHOTO_ORDER = {k: list(v) for k, v in _photos_cfg.get("photo_order", {}).items()}


def photos_in(slug):
    if slug in PHOTO_BLOCKLIST:
        return []
    d = os.path.join(PHOTOS, slug)
    if not os.path.isdir(d):
        return []
    ok = (".jpg", ".jpeg", ".png", ".webp")
    files = sorted(os.path.join(d, f) for f in os.listdir(d)
                   if f.lower().endswith(ok))
    order = PHOTO_ORDER.get(slug)
    if order:
        if sorted(order) != list(range(len(files))):
            print(f"  ! {slug}: a PHOTO_ORDER {len(order)} kepre szol, "
                  f"a mappaban {len(files)} van - nyers sorrend megy")
        else:
            files = [files[i] for i in order]
    return files


def photo_list(key=None):
    if key and key in PHOTO_SET:
        slug, shift = PHOTO_SET[key]
        ph = photos_in(slug)
        return ph[shift:] + ph[:shift] if ph else ph
    out = []
    for slug in sorted(os.listdir(PHOTOS)) if os.path.isdir(PHOTOS) else []:
        out.extend(photos_in(slug))
    return out


class Page(FPDF):
    def __init__(self):
        super().__init__(format="A4", unit="mm")
        self.set_auto_page_break(False)
        reg = os.path.join(FONT_MANROPE, "Manrope-Regular.ttf")
        bold = os.path.join(FONT_MANROPE, "Manrope-Bold.ttf")
        if not (os.path.exists(reg) and os.path.exists(bold)):
            reg = os.path.join(FONT_DEJAVU, "DejaVuSans.ttf")
            bold = os.path.join(FONT_DEJAVU, "DejaVuSans-Bold.ttf")
        self.add_font("gg", "", reg)
        self.add_font("gg", "B", bold)
        self.set_margins(M, M, M)
        self.set_title("GuestGuru")

    def box(self, x, y, w, h, color, radius=0):
        self.set_fill_color(*color)
        if radius:
            self.rect(x, y, w, h, style="F", round_corners=True,
                      corner_radius=radius)
        else:
            self.rect(x, y, w, h, style="F")

    def img_or_placeholder(self, path, x, y, w, h, key, label=""):
        if path and os.path.exists(path):
            self.image(prep(path, w, h, key), x=x, y=y, w=w, h=h)
        else:
            self.box(x, y, w, h, PAL["soft"])
            self.set_draw_color(*PAL["line"])
            self.set_line_width(0.3)
            self.rect(x, y, w, h)
            self.set_font("gg", "", 7)
            self.set_text_color(*PAL["muted"])
            self.set_xy(x, y + h / 2 - 3)
            self.cell(w, 6, label or "FOTO", align="C")


def logo(pdf, x, y, h, dark_bg=True):
    """Draw the GuestGuru logo. On dark bands it sits on a white pill,
    because the mark is two-tone and must not be recoloured."""
    mark = os.path.join(ASSETS, "gg-logo.svg")
    wm_svg = os.path.join(ASSETS, "logo-wordmark.svg")
    wm_png = os.path.join(ASSETS, "logo-wordmark.png")
    # A felirat vektorosan is megvan (a Drive-os gglogo_v2_text.svg-bol kiemelve,
    # utvonalakka alakitva, tehat Poppins nelkul is helyes). A raszter csak tartalek.
    if os.path.exists(wm_svg):
        wm, wm_aspect = wm_svg, 284 / 39
    elif os.path.exists(wm_png):
        im = Image.open(wm_png)
        wm, wm_aspect = wm_png, im.size[0] / im.size[1]
    else:
        wm, wm_aspect = None, 0
    if wm:
        wm_h = h
        wm_w = wm_h * wm_aspect
        if wm_w > 30:
            wm_w, wm_h = 30.0, 30.0 / wm_aspect
        mark_h = h * 2.4 if os.path.exists(mark) else 0
        gap = 2.6 if mark_h else 0
        total = mark_h + gap + wm_w
        if dark_bg:
            pad = 2.4
            pdf.box(x - pad, y - (mark_h - wm_h) / 2 - pad, total + 2 * pad,
                    mark_h + 2 * pad, PAL["white"], radius=3)
        if mark_h:
            pdf.image(mark, x=x, y=y - (mark_h - wm_h) / 2, h=mark_h)
        pdf.image(wm, x=x + mark_h + gap, y=y, w=wm_w, h=wm_h)
        return total
    pdf.set_font("gg", "B", 13)
    pdf.set_text_color(*(PAL["white"] if dark_bg else PAL["brand"]))
    pdf.set_xy(x, y + h / 2 - 3)
    pdf.cell(50, 6, "GuestGuru")
    return 34


def header_bar(pdf, eyebrow, right_text):
    pdf.box(0, 0, W, 21, PAL["brand"])
    pdf.box(0, 21, W, 1.2, PAL["accent_band"])
    logo(pdf, M, 8.6, 4.4)
    pdf.set_font("gg", "", 7.5)
    pdf.set_text_color(*PAL["white"])
    pdf.set_xy(W - M - 90, 8.2)
    pdf.cell(90, 5, right_text.upper(), align="R")


def footer_cta(pdf, d, y):
    """CTA band with contact block and QR placeholder. Returns nothing."""
    h = H - y
    pdf.box(0, y, W, h, PAL["brand"])
    pdf.box(0, y, W, 1.2, PAL["accent_band"])

    qr = 26.0
    qx = W - M - qr
    qy = y + 8.5
    pdf.box(qx, qy, qr, qr, PAL["white"], radius=4.2)
    pdf.set_font("gg", "", 6)
    pdf.set_text_color(*PAL["muted"])
    pdf.set_xy(qx, qy + qr / 2 - 5)
    pdf.multi_cell(qr, 3.4, "QR-KOD\nPLACEHOLDER", align="C")
    pdf.set_font("gg", "", 5.6)
    pdf.set_text_color(*PAL["accent_soft"])
    pdf.set_xy(qx - 6, qy - 4.4)
    pdf.cell(qr + 6, 3, d["qr_label"].upper(), align="C")

    pdf.set_xy(M, y + 7)
    pdf.set_font("gg", "B", 13)
    pdf.set_text_color(*PAL["white"])
    pdf.multi_cell(CW - qr - 10, 6, d["cta_title"], align="L")
    pdf.set_x(M)
    pdf.set_font("gg", "", 8.2)
    pdf.multi_cell(CW - qr - 12, 4.2, d["cta_text"], align="L")

    pdf.set_xy(M, H - 13)
    pdf.set_font("gg", "B", 9)
    pdf.set_text_color(*PAL["accent_soft"])
    line = f"{CONTACT['email']}     {CONTACT['phone']}     {CONTACT['web']}"
    pdf.cell(CW - qr, 5, line)


# ------------------------------------------------------------------ doc 1-3
def pitch(key, lang, photos):
    d = DOCS[key][lang]
    pdf = Page()
    pdf.add_page()

    strap = ("Középtávú bérlés 1-9 hónapra | Budapest belvárosa" if lang == "hu"
             else "Midterm stays 1-9 months | Central Budapest")
    header_bar(pdf, d["eyebrow"], strap)

    # ---- hero photo + headline overlay
    hy, hh = 22.2, 74.0
    pdf.img_or_placeholder(photos[0] if photos else None, 0, hy, W, hh,
                           f"{key}-hero", "HERO FOTO")
    with pdf.local_context(fill_opacity=0.82):
        pdf.box(0, hy + hh - 40, W, 40, PAL["ink"])
    pdf.set_xy(M, hy + hh - 36.5)
    pdf.set_font("gg", "B", 7.5)
    pdf.set_text_color(*PAL["accent_band"])
    pdf.set_char_spacing(0.75)          # +0.1em, a design-rendszer eyebrow-specje
    pdf.cell(CW, 4, d["eyebrow"].upper())
    pdf.set_char_spacing(0)
    pdf.set_xy(M, hy + hh - 31.5)
    pdf.set_font("gg", "B", 17)
    pdf.set_text_color(*PAL["white"])
    pdf.multi_cell(CW, 7.4, d["headline"], align="L")
    pdf.set_x(M)
    pdf.set_font("gg", "", 8.4)
    pdf.set_text_color(230, 236, 241)
    pdf.multi_cell(CW - 30, 4.2, d["tagline"], align="L")

    y = hy + hh + 6

    # ---- intro
    pdf.set_xy(M, y)
    pdf.set_font("gg", "", 8.6)
    pdf.set_text_color(*PAL["muted"])
    pdf.multi_cell(CW - 54, 4.4, d["intro"], align="L")
    y = pdf.get_y() + 4.5

    pdf.set_draw_color(*PAL["line"])
    pdf.set_line_width(0.4)
    pdf.line(M, y, W - M, y)
    y += 5

    # ---- value props (left column) + photo rail (right)
    col = CW - 52
    rail_x = W - M - 46
    for i, (lead, body) in enumerate(d["props"]):
        pdf.box(M, y + 1.1, 2.2, 2.2, PAL["accent"])
        pdf.set_xy(M + 5.5, y)
        pdf.set_font("gg", "B", 9.2)
        pdf.set_text_color(*PAL["ink"])
        pdf.multi_cell(col - 5.5, 4.6, lead, align="L")
        pdf.set_x(M + 5.5)
        pdf.set_font("gg", "", 8.2)
        pdf.set_text_color(*PAL["muted"])
        pdf.multi_cell(col - 5.5, 4.1, body, align="L")
        y = pdf.get_y() + 3.4

    # photo rail on the right of the props block
    rail_top = hy + hh + 6
    rail_h = y - rail_top - 3
    if rail_h > 30:
        each = (rail_h - 4) / 2
        for j in range(2):
            src = photos[j + 1] if len(photos) > j + 1 else None
            pdf.img_or_placeholder(src, rail_x, rail_top + j * (each + 4), 46,
                                   each, f"{key}-rail{j}", "FOTO")

    # ---- trust panel
    ty = y + 1
    rows = len(d["trust"])
    # 2026-08-14 JAVITAS. Elotte: th = 12 + rows * 4.9. A tetelek KET oszlopban
    # allnak 9,4 mm-es sorkozzel, tehat a magassag a SOROK szama szerint no, nem a
    # tetelek szerint. Negy tetelnel a regi keplet veletlenul eleg volt, otnel mar
    # nem: a panel belelogott a CTA-savba, azt viszont KESOBB rajzoljuk, tehat
    # rafestett a hianyzo sorokra. A lap hibatlannak latszott, kozben harom
    # vallalasbol ketto eltunt rola. A geometria-ellenorzes sem fogta meg, mert a
    # szoveg a lapon BELUL maradt, csak takarva lett.
    lines = (rows + 1) // 2
    th = 12 + lines * 9.4
    _cta_top = H - 42
    # Ket kulon baj van, es csak az egyik sulyos:
    #  - a panel HATTERE belelog a CTA-savba: a CTA kesobb rajzolodik, tehat
    #    ratakar. Ez csak kozmetika, a doboz alja levagottnak latszik.
    #  - a SZOVEG also sora csuszik a CTA ala: az a tetel ELTUNIK a lapról.
    _text_bottom = ty + 9.5 + (lines - 1) * 9.4 + 4.5
    if _text_bottom > _cta_top:
        print(f"  !! SZOVEG VESZETT EL: {d['headline'][:28]!r} - a vallalasok "
              f"also sora {_text_bottom - _cta_top:.1f} mm-rel a CTA-sav ala "
              f"csuszott. Rovidits a propokon.")
    elif ty + th > _cta_top - 2:
        print(f"  ~ kozmetika: {d['headline'][:28]!r} trust-doboz alja "
              f"{ty + th - (_cta_top - 2):.1f} mm-rel levagva (szoveg megvan).")
    pdf.box(M, ty, CW, th, PAL["soft"], radius=4.2)
    pdf.box(M, ty, 2.4, th, PAL["brand"])
    pdf.set_xy(M + 7, ty + 4)
    pdf.set_font("gg", "B", 8.6)
    pdf.set_text_color(*PAL["brand"])
    pdf.set_char_spacing(0.86)
    pdf.cell(CW - 12, 4.5, d["trust_title"].upper())
    pdf.set_char_spacing(0)
    yy = ty + 9.5
    half = (CW - 16) / 2
    for i, t in enumerate(d["trust"]):
        cx = M + 7 + (i % 2) * (half + 2)
        cy = yy + (i // 2) * 9.4
        pdf.set_font("gg", "B", 8)
        pdf.set_text_color(*PAL["accent"])
        pdf.set_xy(cx, cy)
        pdf.cell(3.5, 4, "-")
        pdf.set_xy(cx + 3.5, cy)
        pdf.set_font("gg", "", 7.8)
        pdf.set_text_color(*PAL["ink"])
        pdf.multi_cell(half - 4, 4, t, align="L")

    footer_cta(pdf, d, H - 42)
    return pdf


# ------------------------------------------------------------------ doc 4
def catalogue(lang, photos, apt=None):
    d = dict(DOCS["04-property-catalogue"][lang])
    if apt:
        if apt.get("kirakat", True):
            d["eyebrow"] = ("Prémium középtávú apartman" if lang == "hu"
                            else "Premium midterm apartment")
        else:
            # GG-827 (2026-08-14): kikerult a premium kirakatbol, a lapja a
            # platform-agon hasznosul tovabb. Ne premiumkent cimkezzuk.
            d["eyebrow"] = ("Lakás adatlap" if lang == "hu"
                            else "Property sheet")
        d["headline"] = apt["nev"]
        # A kerulet, az utca es az emelet 2026-08-12 ota a GG3-bol jon (accommodations
        # address/zip). Ami nincs meg az apt rekordban, marad {{kapcsos}} placeholder.
        ker, utca = apt.get("kerulet"), apt.get("utca")
        if ker and utca:
            # 2026-08-25: az ANGOL lapon a magyar "IX. kerület" allt a cim alatt.
            # A kerulet-jeloles ugyanugy fordul, mint a Gyors adatok blokkban.
            ker_txt = ker if lang == "hu" else "District " + ker.split(".")[0]
            d["tagline"] = (f"{ker_txt} - {utca} | "
                            + ("Középtávú bérlés 1-9 hónapra" if lang == "hu"
                               else "Midterm rental, 1-9 months"))
        # 2026-08-14 (Eszti): a lakaslap sajat adatsort hoz. A "Max. fo" kikerult,
        # helyette az AGYAK ELOSZTASA all a chipek helyen, az "Emelet" helyett pedig
        # LIFT, es az a sor CSAK ott jelenik meg, ahol tenyleg van lift.
        if apt.get("specs"):
            d["specs"] = apt["specs"][lang]
        if apt.get("beds"):
            d["features_title"] = "Ágyak" if lang == "hu" else "Beds"
            d["features"] = apt["beds"][lang]
        if apt.get("location"):
            d["location"] = apt["location"][lang]
        if apt.get("intro"):
            d["intro"] = apt["intro"][lang]
        d["notes"] = NOTES[lang]
        fin = list(d["finance"])
        # 2026-08-25: az "Available from" ertek magyar datum volt az angol lapon
        # ("2027. január 3."). Az angol alak a content.py-ban all, szabad_en neven.
        fin.append(("Mikortól szabad" if lang == "hu" else "Available from",
                    apt["szabad"] if lang == "hu"
                    else apt.get("szabad_en", apt["szabad"])))
        d["finance"] = fin
    pdf = Page()
    pdf.add_page()
    strap = ("Középtávú bérlés 1-9 hónapra" if lang == "hu"
             else "Midterm rental, 1-9 months")
    header_bar(pdf, d["eyebrow"], strap)

    # ---- photo grid: 1 large + 3 small
    gy = 28.0
    # 2026-08-14: 65 -> 61. A penzugyi tabla egy sorral hosszabb lett (Mikortol
    # szabad), es emiatt a Megjegyzes 3,8 mm-rel a CTA-savba logott, tehat nemán
    # kimaradt. Negy milimeter a fotoracsbol visszaadja a helyet.
    big_h = 61.0
    big_w = CW * 0.635
    pdf.img_or_placeholder(photos[0] if photos else None, M, gy, big_w,
                           big_h, "cat-big", d["photo_note"])
    sx = M + big_w + 3
    sw = CW - big_w - 3
    small_h = (big_h - 6) / 3
    for j in range(3):
        src = photos[j + 1] if len(photos) > j + 1 else None
        pdf.img_or_placeholder(src, sx, gy + j * (small_h + 3), sw,
                               small_h, f"cat-s{j}", "FOTO")

    # ---- title block
    y = gy + big_h + 5
    pdf.set_xy(M, y)
    pdf.set_font("gg", "B", 20)
    pdf.set_text_color(*PAL["ink"])
    pdf.cell(CW, 9, d["headline"])
    y += 9.5
    pdf.set_xy(M, y)
    pdf.set_font("gg", "B", 9)
    pdf.set_text_color(*PAL["accent"])
    pdf.cell(CW, 5, d["tagline"])
    y += 6.5
    pdf.set_xy(M, y)
    pdf.set_font("gg", "", 8.4)
    pdf.set_text_color(*PAL["muted"])
    pdf.multi_cell(CW - 20, 4.3, d["intro"], align="L")
    y = pdf.get_y() + 4

    # ---- quick specs grid (3 x 2)
    pdf.set_xy(M, y)
    pdf.set_font("gg", "B", 8)
    pdf.set_text_color(*PAL["brand"])
    pdf.cell(CW, 4.5, d["specs_title"].upper())
    y += 6
    cw3 = (CW - 6) / 3
    for i, (k, v) in enumerate(d["specs"]):
        cx = M + (i % 3) * (cw3 + 3)
        cy = y + (i // 3) * 17
        pdf.box(cx, cy, cw3, 15, PAL["soft"], radius=4.2)
        pdf.set_xy(cx + 3.5, cy + 2.2)
        pdf.set_font("gg", "", 6.6)
        pdf.set_text_color(*PAL["muted"])
        pdf.cell(cw3 - 6, 3.4, k.upper())
        pdf.set_xy(cx + 3.5, cy + 6.4)
        pdf.set_font("gg", "B", 9.5)
        pdf.set_text_color(*PAL["ink"])
        pdf.cell(cw3 - 6, 5, v)
    y += 17 * ((len(d["specs"]) + 2) // 3) + 2

    # ---- features chips + finance table, side by side
    left_w = CW * 0.44
    right_x = M + left_w + 6
    right_w = CW - left_w - 6

    pdf.set_xy(M, y)
    pdf.set_font("gg", "B", 8)
    pdf.set_text_color(*PAL["brand"])
    pdf.cell(left_w, 4.5, d["features_title"].upper())
    cy = y + 6.5
    cx = M
    pdf.set_font("gg", "", 7.4)
    for f in d["features"]:
        w = pdf.get_string_width(f) + 7
        if cx + w > M + left_w:
            cx = M
            cy += 8
        pdf.box(cx, cy, w, 6.4, PAL["white"], radius=3.2)
        pdf.set_draw_color(*PAL["line"])
        pdf.set_line_width(0.3)
        pdf.rect(cx, cy, w, 6.4, style="D", round_corners=True, corner_radius=3.2)
        pdf.set_xy(cx, cy)
        pdf.set_text_color(*PAL["ink"])
        pdf.cell(w, 6.4, f, align="C")
        cx += w + 2.5

    pdf.set_xy(right_x, y)
    pdf.set_font("gg", "B", 8)
    pdf.set_text_color(*PAL["brand"])
    pdf.cell(right_w, 4.5, d["finance_title"].upper())
    fy = y + 6.5
    for i, (k, v) in enumerate(d["finance"]):
        rh = 6.6
        if i % 2 == 0:
            pdf.box(right_x, fy, right_w, rh, PAL["soft"])
        pdf.set_xy(right_x + 2.5, fy)
        pdf.set_font("gg", "", 7.6)
        pdf.set_text_color(*PAL["muted"])
        pdf.cell(right_w * 0.42, rh, k)
        pdf.set_xy(right_x + right_w * 0.42, fy)
        pdf.set_font("gg", "B", 7.6)
        pdf.set_text_color(*PAL["ink"])
        pdf.cell(right_w * 0.58 - 2.5, rh, v, align="R")
        fy += rh

    # ---- location + notes strip
    ly = max(cy + 10, fy + 6)
    pdf.set_xy(M, ly)
    pdf.set_font("gg", "B", 8)
    pdf.set_text_color(*PAL["brand"])
    pdf.cell(CW, 4.5, d["location_title"].upper())
    ly += 6
    lw = (CW - 6) / 3
    for i, (k, v) in enumerate(d["location"]):
        cx = M + i * (lw + 3)
        pdf.box(cx, ly, lw, 12, PAL["soft"], radius=4.2)
        pdf.set_xy(cx + 3.5, ly + 1.5)
        pdf.set_font("gg", "", 6.6)
        pdf.set_text_color(*PAL["muted"])
        pdf.cell(lw - 6, 3.4, k.upper())
        pdf.set_xy(cx + 3.5, ly + 5.0)
        pdf.set_font("gg", "B", 7.6)
        pdf.set_text_color(*PAL["ink"])
        pdf.multi_cell(lw - 6, 3.6, v, align="L")
    ly += 15.5

    cta_top = H - 42
    if ly + 8 <= cta_top - 2:
        pdf.set_xy(M, ly)
        pdf.set_font("gg", "B", 7)
        pdf.set_text_color(*PAL["brand"])
        pdf.cell(22, 4, d["notes_title"].upper())
        pdf.set_xy(M + 22, ly)
        pdf.set_font("gg", "", 7.4)
        pdf.set_text_color(*PAL["muted"])
        pdf.multi_cell(CW - 22, 4, d["notes"], align="L")
    else:
        print(f"  ! megjegyzes kihagyva: {d['headline'][:30]} ly={ly:.1f} cta_top={cta_top:.1f} hiany={ly+8-(cta_top-2):.1f}mm")

    footer_cta(pdf, d, H - 42)
    return pdf


def main():
    os.makedirs(OUT, exist_ok=True)
    photos = photo_list()
    made = []
    for lang in ("hu", "en"):
        for key in ("01-corporate-tmc", "02-relocation", "03-film-production"):
            p = pitch(key, lang, photo_list(key))
            f = os.path.join(OUT, f"GuestGuru-{key}-{lang.upper()}.pdf")
            p.output(f)
            made.append(f)
        p = catalogue(lang, photo_list())
        f = os.path.join(OUT, f"GuestGuru-04-katalogus-SABLON-{lang.upper()}.pdf")
        p.output(f)
        made.append(f)
        for apt in APARTMENTS:
            ph = photos_in(apt["slug"])
            p = catalogue(lang, ph, apt)
            nm = apt["slug"].replace("é", "e").replace("á", "a").replace("í", "i")
            f = os.path.join(OUT, f"GuestGuru-04-lakas-{nm}-{lang.upper()}.pdf")
            p.output(f)
            made.append(f)
    for f in made:
        print(os.path.basename(f), os.path.getsize(f) // 1024, "kB")


if __name__ == "__main__":
    main()
