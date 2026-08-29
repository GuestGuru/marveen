# -*- coding: utf-8 -*-
"""SABLON a one-pager tartalom-fajlhoz. VALODI ADAT IDE NEM KERUL.

2026-08-29: ez a fajl korabban a negy GG-lakas VALOS adatait tartalmazta (cim,
kiadhatosagi datum, agy-elrendezes). A repo egy PUBLIKUS fork, ezert a valos
tartalom atkerult a `content.py`-ba, amit a .gitignore kizar; itt csak a
SZERKEZET maradt, kitoltendo helyorzokkel.

Hasznalat:
    cp content.example.py content.py    # CSAK ha meg nincs content.py!
    # majd a content.py-t toltod ki -- a gen.py abbol olvas.

FIGYELEM: ha a `content.py` MAR LETEZIK, ne masold felul ezzel a fajllal, mert
az elveszi a valos tartalmat. Eloszor nezd meg: `ls -l content.py`.
"""

CONTACT = {
    "email": "<kapcsolati e-mail>",
    "web": "<weboldal>",
    "phone": "[+36 XX XXX XXXX]",
}

# Tenyek, amikre a pitch-ek es a lakaslapok hivatkoznak. A "hol" mezo mondja meg,
# melyik anyagban jelenik meg -- ez teszi ellenorizhetove, hogy mi honnan jon.
FACTS = [
    {"ertek": "<egy ellenorzott teny, amire hivatkozunk>",
     "hol": "<melyik anyag melyik pontja hasznalja>"},
]

_WIFI_HU = "Gyors és stabil"
_WIFI_EN = "Fast and stable"


def _specs_hu(m2, halo, furdo, kerulet, lift):
    sorok = [f"{m2} m2", f"{halo} hálószoba", f"{furdo} fürdő", kerulet, _WIFI_HU]
    if lift:
        sorok.append("Lift")
    return sorok


def _specs_en(m2, halo, furdo, kerulet, lift):
    rows = [f"{m2} sqm", f"{halo} bedroom", f"{furdo} bathroom", kerulet, _WIFI_EN]
    if lift:
        rows.append("Lift")
    return rows


# EGYETLEN minta-rekord, kitalalt adattal. A valodi lakasok a content.py-ban vannak.
# A "lift" kulcs szandekosan bool: ahol nincs lift, ott a sor MEG SEM JELENIK MEG,
# tehat a hianya nem kap hangsulyt.
APARTMENTS = [
    {
        "slug": "minta-lakas-1", "nev": "<Lakás neve>", "kirakat": True,
        "szabad": "<ÉÉÉÉ. hónap N.>", "szabad_en": "<N Month YYYY>",
        "kerulet": "<N. kerület>", "utca": "<utca neve>",
        "lift": True,
        "specs": {"hu": _specs_hu("<m2>", "<háló>", "<fürdő>", "<N. kerület>", True),
                  "en": _specs_en("<sqm>", "<bedrooms>", "<baths>", "<District N>", True)},
        "beds": {"hu": ["Háló: 140x200", "<további ágy>"],
                 "en": ["Bedroom: 140x200", "<further bed>"]},
        "location": {
            "hu": [("Tömegközlekedés", "<mi és hány perc séta>"),
                   ("A közelben", "<két-három tájékozódási pont>"),
                   ("Elhelyezkedés", "<kerület, utca>")],
            "en": [("Public transport", "<what and how many minutes>"),
                   ("Nearby", "<two or three landmarks>"),
                   ("Location", "<district, street>")]},
        "intro": {
            "hu": "<Két-három mondat arról, KINEK jó ez a lakás. Nem másokkal "
                  "szemben pozicionálunk, hanem azzal, amit mi adunk hozzá; "
                  "összehasonlító mondat nincs.>",
            "en": "<Two or three sentences on WHO this flat suits.>"},
    },
]

_NOTES_HU = "A bérleti díj, a kaució és a rezsi az ajánlatban szerepel."
_NOTES_EN = "Rent, deposit and utilities are set out in the offer."

DOCS = {}
