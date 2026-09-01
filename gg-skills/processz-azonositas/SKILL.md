---
name: processz-azonositas
description: Egy FUTÓ processzt kell azonosítani vagy megölni (fut-e a szerver, a friss kód fut-e, melyik ágens min fut, pkill). A pgrep/pkill/pidof mintája a saját parancssorodra és idegen programokra is illeszkedik, és a hiba a MEGNYUGTATÓ irányba téved. Triggerelődik - pgrep, pkill, pidof, "fut-e még", "melyik PID", "a friss kód fut-e", flotta-átállás ellenőrzése, "megölte a saját shelljét".
---

# Processz-azonosítás: a minta nem a program

## Mikor használd

Ha egy FUTÓ processzről akarsz állítani valamit: fut-e egyáltalán, mióta fut,
melyik binárison, a friss kódot futtatja-e -- vagy ha meg akarod ölni.

## A központi szabály

**A `pgrep -f` / `pkill -f` mintája SZÖVEGRE illeszt a teljes parancssorban.
Két külön okból ad hamis találatot, és a másodikat az elsőt megjavítva sem
veszed ki:**

1. **Önillesztés.** A minta benne van a te saját parancsodban, tehát a shelled is
   találat. Csővezetéknél KETTŐ is, mert alhéjat indít.
2. **Idegen program ugyanazzal a fájlnévvel.** Egy másik felhasználó másik
   terméke is futtathat `dist/index.js`-t vagy `run.py`-t. Valódi processz,
   valódi fájlnév -- és jellemzően FRISS indulással.

⚠️ **Mindkét hiba a MEGNYUGTATÓ irányba téved** („több processz fut, mint
gondoltam", „a friss kód fut"), és azt nem méri újra senki.

## Eljárás

**1. Ha van PORT, a portból vedd a PID-et. A port egyedi, a fájlnév nem.**
```bash
PID=$(ss -lptn 'sport = :3420' | grep -oP 'pid=\K[0-9]+' | head -1)
ps -o lstart= -p "$PID"
```

**2. Ha nincs port, HORGONYOZD a mintát a parancssor ELEJÉRE.**
```bash
pgrep -f '^node /home/gg/gg-mcp/dist'     # 7 valódi sor
pgrep -f 'gg-mcp/dist'                    # 10 sor, ebből 3 hamis
```
Mérve 2026-09-01: a három hamis sor `cwd`-bázisneve `marveen` volt, vagyis
**ÁGENS-NÉVNEK látszott a listában** -- egy flotta-átállási ellenőrzésben pont ez
a legrosszabb, mert nem tudod eldönteni, melyik a valódi.

**3. A legerősebb: ne a FÁJLNEVET nézd, hanem hogy a processz KINEK A NEVÉBEN
fut** (jean, 2026-09-01). A horgonyzott minta is fájlnév-alapú, csak abszolút
útvonallal -- ugyanabba a családba tartozik. A processz identitását a KÖRNYEZETE
mondja meg:
```bash
for p in $(pgrep -f '^node /home/gg/gg-mcp/dist'); do
  lbl=$(tr '\0' '\n' < /proc/$p/environ | grep -m1 '^GG_MCP_AGENT_LABEL=' | cut -d= -f2-)
  tok=$(tr '\0' '\n' < /proc/$p/environ | grep -m1 '^GG_MCP_TOKEN_FILE=' | cut -d= -f2- | xargs -r basename)
  echo "$p label=${lbl:-<nincs>} token=${tok:-<nincs>}"
done | sort -k2
```
Két előnye van a `cwd`-bázisnév helyett:
- **pont azt a két mezőt mutatja, ami a tét:** melyik ágens, és MELYIK
  token-fájllal. Ha valaki idegen tokennel futna (a 8. flotta-szabály esete),
  ez a lista azonnal megmutatná -- a fájlnév-alapú SOHA.
- **a label hiánya jó negatív szűrő:** a nem-ágens processzek (a saját shelled,
  a HTTP-szerver) label nélkül jönnek ki, tehát nem heurisztikával kell kizárni
  őket.
*(Mérve: mind a hét ágens a sajátjával -- `jean -> jean.token` és így tovább.)*

**4. Ölésnél soha ne `pkill -f <minta>` önmagában.** Előbb listázz `pgrep -af`-fel,
nézd meg a sorokat, és a PID-re ölj. (Ez a hiba 2026-08-28 óta le van írva az
`office-fajl-szoveg-kinyeres` skillben is: a `pkill -f valami.py` megöli a saját
shelledet, ha a `bash -c` parancssora tartalmazza a mintát.)

**5. Ha azt akarod tudni, hogy a FRISS KÓD fut-e, ne a processzt mérd, hanem a
HATÁST.** Hívd meg úgy, hogy az új viselkedés látszódjon -- egy hívás, nincs
benne PID és mtime, ami félremehet. A processz-indulás vs `dist` mtime
összehasonlítás a második legjobb, és csak a fenti 1-2. ponttal együtt jó.

## Buktatók

- **A `dist` sem a futó dolog.** A Node induláskor tölti be a modulokat; egy
  build után a lemezen már az új kód van, a processz memóriájában a régi. A
  `dist`-re grepelni ezért MINDKÉT irányban félrevezet: build előtt hamisan
  „nincs kész", build után hamisan „kész".
- **Ha két módszer két különböző PID-et ad, ÁLLJ MEG.** 2026-09-01: a `pgrep` és
  az `ss` más PID-et adott ugyanabban a körben, az eltérés látszott, és nem lett
  utánanézve -- „a lényeg úgyis stimmel" alapon. A mai összes mérési hibánk ebben
  a pillanatban keletkezett.

## Ellenőrzés

- A találatok között NINCS `/bin/bash -c` alakú sor (az a te shelled).
- Minden találat parancssorát ELOLVASTAD, nem csak megszámoltad.
- Ha a kérdés „fut-e a friss kód", akkor hatás-méréssel is igazoltad.
