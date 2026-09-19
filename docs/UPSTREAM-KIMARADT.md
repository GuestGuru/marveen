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
lefuttatja a `vitest`-et es a `tsc`-t. ~~**NEM sikerult felvinni.**~~

🟢 **MEGOLDVA 2026-09-19, es a megoldas nem emberi lepes volt: a fal maga szunt meg.**
A fajl a sajat tokenunkkel, a szokasos proxy-push uton felment (PR 592/593), es
mind a ket belso PR elsore mergelodott. Vagyis a lenti ket "emberi lepes" kozul
EGYIKRE SEM volt szukseg. **A blokkolo ok elavult, es errol semmi nem szolt** --
18 napig allt a fajl verziozatlanul a munkafaban, mert 2026-09-01 ota senki nem
probalta ujra.

**Amit NEM mertunk, es ezert nem allitjuk:** hogy MIERT szunt meg. A token
scope-jait innen nem olvassuk ki, tehat a legkezenfekvobb magyarazat (a token
azota kapott `workflow` scope-ot) megmeretlen. A mert teny a kimenetel.

**A tanulsag, ami fontosabb ennel az egy fajlnal:** ebben a doksiban minden tetel
egy BLOKKOLO OKRA hivatkozik, es egy blokkolo ok ugyanugy elavul, mint egy
merooszam -- csak nem szol rola senki. **Egy kimaradt hunk ujraprobalasa olcsobb,
mint a felirasa.** Aki ezt a fajlt olvassa, eloszor probalja meg ujra a muveletet,
es csak utana keressen emberi lepest.

**Es amit a bekapcsolas azonnal megmutatott:** a suite PIROS volt, es ELOZETESEN az
(a bekapcsolas elotti commiten, a42d6a4, ugyanaz a ket teszt bukik). Negy sertes,
mind a mienk: ket sablonban beegetett abszolut utvonal es ketszer egy `{{CHAT_ID}}`
helyorzo, amit a seed nem helyettesit. Javitva a PR 594/595-ben. Ez pontosan az,
amiert a CI kell: a piros alapvonal addig lathatatlan volt.

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

**A javitas ket lehetseges utja, mindketto emberi lepes** (tortenetileg, 2026-09-01-en
-- egyikre sem volt szukseg, lasd a fenti zold bekezdest)**:**
1. a gazda hozza letre a fajlt egy commitban (a tartalma az upstream
   `Szotasz/marveen` `main` againak `.github/workflows/test.yml`-je), VAGY
2. a gg-mcp GitHub-tokenje kapjon `workflow` scope-ot, es akkor a kovetkezo
   atvetel maga viszi.

**A fajl tartalma nem veszett el:** `git show upstream/main:.github/workflows/test.yml`.

⚠️ Ez a doksi azert letezik, mert egy kimaradt hunk csendben nem letezove valik.
A 2026-08-09-i atvetelnel ket hunk maradt ki (install-linux.sh, package-lock.json)
es csak azert derult ki, mert bekerult a PR leirasaba.
