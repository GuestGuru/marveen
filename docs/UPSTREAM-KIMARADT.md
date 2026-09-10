# Ami az upstream-atvetelbol KIMARADT, es miert

## Piros baseline: két bukó teszt a HEAD-en (mérve 2026-09-10)

A teljes suite ezen a napon **2 failed / 393 passed** (5046 teszt zöld, 1 skipped).
Mindkettő a HEAD-en is bukik, egy érintetlen worktree-n megismételve, tehát nem az aznapi
változások okozták. Azért áll itt, mert **egy piros baseline elrejti az új törést**: aki
ezután futtatja a suite-ot, nem tudja megkülönböztetni a sajátját a régitől, és a doksi
egy szekcióval lejjebb pont azt mondja ki, hogy CI híján minden „zöld" állítás lokális
mérés marad.

1. **`template-identity-hygiene`** -- ez a MIÉNK volt, és **javítva** (1b94c54):
   a `seed-skills/fleet-helper` két fájljában élő abszolút útvonal (`/home/gg/marveen`)
   állt egy kommentben, amit a teszt tilt, mert a seed-skillek más telepítésekre mennek.
   A magyarázó példa `<install-dir>`-re cserélve, mind a négy példányban (seed és élő).

2. **`scripts/__tests__/conversation-ledger.test.sh`** -- 48/50, **NEM javítva**, mert
   upstream kód és upstream teszt (LEDGERPROV826 / #1079, illetve a provider-tudatos
   kézbesítés #1074). A két bukás:
   - `discord inbound keeps its chat_id`: a teszt `20000000002`-t vár, a kód
     `discord:20000000002`-t ad. A provider-prefix a több-provideres átállás része,
     tehát valószínűleg a TESZT az elavult, de ezt nem találgatjuk.
   - `live drain: did not surface the open question`: a formátum-illesztés bukik,
     a kérdés szövege egyébként ott van a kimenetben.

   **Miért nem javítottuk:** ha a teszt állítását igazítjuk a kódhoz, azzal elfedhetünk
   egy valódi upstream regressziót. Ez upstream döntés, nem fork-döntés. A fork-oldali
   teendő annyi, hogy a baseline ismert legyen, és ne számítson új törésnek.

## v1.36.0 (merge 2026-09-01)

**`.github/workflows/test.yml`** -- az upstream uj CI-munkafolyamata, ami PR-eken
lefuttatja a `vitest`-et es a `tsc`-t. **NEM sikerult felvinni.**

A push elszallt:

```
! [remote rejected] refusing to allow a Personal Access Token to create or
  update workflow `.github/workflows/test.yml` without `workflow` scope
```

A gg-mcp GitHub-tokenje finomhangolt, es nincs benne `workflow` scope. Ez NEM
megkerulheto a Git Data API-val sem: a korlat a tokenre vonatkozik, nem az utra.

**Amit ez jelent:** a forkban tovabbra sincs CI, ami PR-en futtatna a teszteket --
minden "N/N zold" allitas lokalis meres marad, amit a PR feje nem tud bizonyitani.
Pontosan az a hianyossag, amit az upstream ezzel a fajllal javitott.

**A javitas ket lehetseges utja, mindketto emberi lepes:**
1. a gazda hozza letre a fajlt egy commitban (a tartalma az upstream
   `Szotasz/marveen` `main` againak `.github/workflows/test.yml`-je), VAGY
2. a gg-mcp GitHub-tokenje kapjon `workflow` scope-ot, es akkor a kovetkezo
   atvetel maga viszi.

**A fajl tartalma nem veszett el:** `git show upstream/main:.github/workflows/test.yml`.

⚠️ Ez a doksi azert letezik, mert egy kimaradt hunk csendben nem letezove valik.
A 2026-08-09-i atvetelnel ket hunk maradt ki (install-linux.sh, package-lock.json)
es csak azert derult ki, mert bekerult a PR leirasaba.
