# Ami az upstream-atvetelbol KIMARADT, es miert

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
