import glob, re, pymupdf
bad = {
 "em dash": r"—",
 "szenvedo/terpeszkedo": r"(kerül [a-záéíóöőúüű]+sra|kerül [a-záéíóöőúüű]+sre|lett [a-záéíóöőúüű]+va\b|döntést hoz|változtatást hajt|vizsgálatot folytat)",
 "anglicizmus": r"(szolgáltatott apartman|expat|midterm|lokáció|fiókkezelő|munkaállomás|shortlist|per diem-|check-in\b|\bPO\b)",
 "osszehasonlitas": r"(hotel|szálloda|albérlet|versenytárs|nem tudja|kifizethetetlen|unlike|cannot do that|than a hotel)",
 "reklamszo": r"(büszkélked|páratlan|egyedülálló|lenyűgöző|professzionális|teljesen felszerelt|azonnal költözhető|tágas|város szívében)",
 "toltelek": r"(Fontos megjegyezni|Érdemes kiemelni|A nap végén|Emellett|Továbbá|Ezen túlmenően)",
}
warn = 0
for f in sorted(glob.glob("out/*.pdf")):
    doc = pymupdf.open(f)
    txt = "\n".join(p.get_text() for p in doc)
    for name, pat in bad.items():
        for m in set(re.findall(pat, txt, re.I)):
            print("SZOVEG", f.split("/")[-1], name, repr(m)); warn += 1
    for p in doc:
        for b in p.get_text("blocks"):
            x0, y0, x1, y1 = b[:4]
            if y1 > 842-8 or x1 > 595-20 or x0 < 14:
                print("GEOM", f.split("/")[-1], round(x0), round(y1), b[4][:45].replace("\n"," ")); warn += 1
print("warnings:", warn)
