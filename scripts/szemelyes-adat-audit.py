#!/usr/bin/env python3
"""Szemelyesadat-audit a SAJAT emlekeiden es napi naploidon, DB-bol.
HELYET ad vissza, nem erteket: tabla, sor-id, minta-nev, talalat-szam.
Hasznalat:  python3 audit.py <agent_id>
"""
import sqlite3, re, sys
agent = sys.argv[1]
KOZT = r'(utca|u\.|krt\.?|[uú]t(ja)?|k[oö]r[uú]t|t[eé]r|k[oö]z|s[eé]t[aá]ny|rakpart)'
HOSSZU = r'(utca|k[oö]r[uú]t|s[eé]t[aá]ny|rakpart)'
PATS = {
 'email':        re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}'),
 'cegadoszam':   re.compile(r'\b[0-9]{8}-[0-9]-[0-9]{2}\b'),
 'tizjegyu':     re.compile(r'(?<![0-9-])[0-9]{10}(?![0-9-])'),
 'telefon':      re.compile(r'\+36[ /-]?[0-9]{1,2}[ /-]?[0-9]{3}[ /-]?[0-9]{4}|\b06[ /-]?[237][0-9][ /-]?[0-9]{3}[ /-]?[0-9]{4}\b'),
 'uuid':         re.compile(r'\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b', re.I),
 'cim':          re.compile(r'\b[A-ZÁÉÍÓÖŐÚÜŰ][A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]*([ ]'+KOZT+r'|'+HOSSZU+r')[ ]+[0-9]{1,3}([/][A-Za-z])?\b'),
}
db = sqlite3.connect('/home/gg/marveen/store/claudeclaw.db')
for tabla in ('memories', 'daily_logs'):
    rows = list(db.execute(f"SELECT id, content FROM {tabla} WHERE agent_id=?", (agent,)))
    print(f"== {tabla}: {len(rows)} sor ==")
    for name, p in PATS.items():
        hits = [(r[0], len(p.findall(r[1] or ''))) for r in rows if p.search(r[1] or '')]
        n = sum(h[1] for h in hits)
        print(f"  {name}: {len(hits)} sor / {n} talalat" + (f" -> id: {', '.join(str(h[0]) for h in hits)}" if hits else ""))
print("\nMINDEN TALALATOT OLVASS EL, a szam onmagaban semmit nem mond.")
print("A tizjegyu minta tulnyomoreszt hamis (chat_id, unix ido, szamlasorszam), de a")
print("2026-09-13-i kor legsulyosabb talalata PONT ebbol jott. Nem az arany szamit, hanem a farok.")
