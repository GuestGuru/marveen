#!/usr/bin/env python3
"""Push elotti szures: van-e VALOS lakas-azonosito a publikusba keszulo fajlokban.

Miert nem eleg egy kezzel irt grep (ketszer bukott meg, 2026-08-29):
  1. `grep -i "Példa"` NEM fogja a `Pelda 12`-t: a grep -i a kis- es
     nagybetut egyesiti, az EKEZETET nem. Ezert itt Unicode NFD-vel foldolunk.
  2. Az ekezet-fuggetlen grep is vak marad, ha a terminusokat KEZZEL irod:
     a `Példa körút 12` nem tartalmazza a `pelda-krt-12` slugot, es forditva.
     Ezert a terminusok NEM kezzel jonnek, hanem a helyi (gitignorált) forrasokbol:
     slugok a photos.local.json-bol es az assets/photos konyvtarbol, megjeleno
     nevek a content.py-bol. A kettő uniója kell, egyik sem fedi le a masikat.
A szkript maga NEM tartalmaz valos adatot -- a terminusok futasidoben allnak elo.

Hasznalat (nem-nulla exit = talalat, tehat NEM mehet push):
    python3 sanitycheck.py scripts/photos.local.json assets/photos <fajlok...>
"""
import io, json, os, re, sys, unicodedata

def norm(s):
    s = ''.join(c for c in unicodedata.normalize('NFD', s)
                if unicodedata.category(c) != 'Mn').lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

def terms_from(cfg, photos_dir, content_py=None):
    t = set()
    # A megjelenő NEVEK (pl. "Példa körút 12") a content.py-ban vannak, a
    # SLUGOK (pl. "pelda-krt-12") a configban. A kettő NEM fedi le egymást:
    # egy rövidített slug nem tartalmazza a teljes utcanevet. Mindkettő kell.
    if content_py and os.path.exists(content_py):
        src = io.open(content_py, encoding='utf-8').read()
        t |= set(re.findall(r'["\']([A-ZÁÉÍÓÖŐÚÜŰ][^"\']{2,40}?\s+\d{1,4}[/a-z]?)["\']', src))
    if os.path.exists(cfg):
        d = json.load(io.open(cfg, encoding='utf-8'))
        t |= set(d.get('photo_order', {}))
        t |= set(d.get('photo_blocklist', []))
        t |= {v[0] for v in d.get('photo_set', {}).values()}
    if os.path.isdir(photos_dir):
        t |= set(os.listdir(photos_dir))
    return {norm(x) for x in t if norm(x)}

def main():
    cfg, photos_dir, files = sys.argv[1], sys.argv[2], sys.argv[3:]
    terms = terms_from(cfg, photos_dir, os.path.join(os.path.dirname(cfg), 'content.py'))
    if not terms:
        sys.exit("nincs egyetlen terminus sem -- rossz config-utvonal?")
    print("terminusok (%d): %s\n" % (len(terms), ', '.join(sorted(terms))))
    hits = 0
    for f in files:
        for i, line in enumerate(io.open(f, encoding='utf-8', errors='replace'), 1):
            n = norm(line)
            for t in sorted(terms):
                if t in n:
                    print("%s:%d: [%s] %s" % (f, i, t, line.strip()[:100]))
                    hits += 1
                    break
    print("\n%d talalat" % hits)
    sys.exit(1 if hits else 0)

main()
