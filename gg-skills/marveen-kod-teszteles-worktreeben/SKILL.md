---
name: marveen-kod-teszteles-worktreeben
description: A marveen saját kódbázisán futtatnál tesztet vagy typecheck-et, de a vitest megtagadja az éles installon (REFUSING TO RUN TESTS ... LIVE install). Triggerelődik - "npm test", "npx vitest", "futtasd a teszteket", saját fork-javítás mérése commit előtt, "ez a bukás az én hibám?".
---

# A marveen kódjának tesztelése élő installon (worktree + baseline)

## Mikor használd

Bármikor, amikor a `/home/gg/marveen` checkoutban módosítottad a kódot, és a
`docs/gg-fork-konvenciok.md` szabályát kell teljesíteni: *„`npm run typecheck`,
`npm run build`, `npm test` — mérés nélkül ne állítsd, hogy kész."*

A naiv `npx vitest run` itt NEM fut le:

```
REFUSING TO RUN TESTS: /home/gg/marveen looks like a LIVE install
(found: store/.dashboard-token, store/claudeclaw.db).
```

Ez szándékos guard (`src/__tests__/setup/assert-not-live-install.ts`): a suite
mutálja a `store/`-t, az `.env`-et és a `.claude/skills/`-t abban a checkoutban,
amiben fut — vagyis a saját éles memóriádat és kanban-adatbázisodat írná át.

## Eljárás

1. **Munka-worktree a scratchpadben, a HEAD-ről:**
   ```bash
   W="$SCRATCHPAD/wt-<tema>"
   git worktree add -d "$W" HEAD
   ln -sfn /home/gg/marveen/node_modules "$W/node_modules"   # a fuggosegek ujratelepitese felesleges
   ```
2. **A még nem commitolt fájlokat kézzel másold át** — a worktree a HEAD-et
   kapja, a working tree módosításait nem:
   ```bash
   mkdir -p "$W/src/gg" "$W/src/__tests__"
   cp src/gg/uj-modul.ts "$W/src/gg/"; cp src/__tests__/uj.test.ts "$W/src/__tests__/"
   cp src/web/erintett-upstream-fajl.ts "$W/src/web/"
   ```
3. **Mérés a worktree-ben** (cwd-t a parancsban add meg, a shell visszaáll):
   ```bash
   cd "$W" && npx vitest run src/__tests__/uj.test.ts   # eloszor csak a sajat teszt
   cd "$W" && npx tsc --noEmit                          # 0 = tiszta
   cd "$W" && npx vitest run                            # teljes suite
   ```
4. **BASELINE, ha a teljes suite bukik** — második, ÉRINTETLEN worktree ugyanarról
   a HEAD-ről, és futtasd rajta pontosan a bukó fájlokat:
   ```bash
   git worktree add -d "$B" HEAD; ln -sfn /home/gg/marveen/node_modules "$B/node_modules"
   cd "$B" && npx vitest run <a bukó tesztfájlok>
   ```
   Azonos bukásszám = preexistáló, nem a te változtatásod. Ezt a *számot* írd le a
   jelentésbe, ne azt, hogy „minden zöld".
5. **Takarítás** (kötelező, különben a `git worktree list` megtelik):
   ```bash
   git worktree remove --force "$W"; git worktree remove --force "$B"
   git worktree prune   # elarvult bejegyzesekre, ha a /tmp konyvtar mar eltunt
   ```

## Buktatók

- **A guard nem kerülhető meg env-változóval.** Ne keress kapcsolót; a worktree a
  megoldás. A `store/.dashboard-token` és a `store/claudeclaw.db` jelenléte a
  detektálás alapja, ezeket pedig nem szabad elmozdítani egy teszt kedvéért.
- **`npm install` a worktree-ben felesleges és lassú** — a `node_modules` symlink
  elég, a vitest és a tsc a linken keresztül is megtalálja a bináriskat.
- **A worktree-t a HEAD kapja, nem a working tree-t.** Ha elfelejted átmásolni a
  módosított fájlt, a suite a RÉGI kódot méri és hamis zöldet ad. Ez a leggyakoribb
  csendes hiba ebben az eljárásban.
- **Baseline nélkül a preexistáló bukás a te számládra íródik.** 2026-08-05: a
  teljes suite 20 tesztet bukott (email-send-gate, governance-gates,
  hook-command-quoting, hook-path-guard, installer-start-and-fallback), és pontosan
  ugyanaz a 20 bukott az érintetlen HEAD-en is — enélkül a mérés használhatatlan
  lett volna.
- 🔴 **De a baseline nem felmentés: egy ÚJ fájl a bukó listában a TE dolgod, akkor
  is, ha a baseline-on is bukik.** A baseline azt méri, „ehhez képest rontottam-e",
  nem azt, hogy „ez rendben van". A kettő különbözik, ha a hibát egy KORÁBBI, már
  mergelt köröd vitte be — akkor a baseline is bukik rá, tehát „preexistáló"-nak
  látszik, közben a saját tegnapi regressziód. 2026-08-14: a fenti öt fájl mellett
  hatodikként a `template-identity-hygiene` is bukott, `/home/gg/gg-mcp` beégetett
  útvonalakra a `scheduled-tasks/reggeli-napindito/SKILL.md`-ben — amit az előző
  napi PR \#34/\#35-ben én vittem fel. Nulla új bukás volt, és mégis javítanom
  kellett.
  **Ezért a bukó fájlok listáját HASONLÍTSD ÖSSZE a fenti ismert ötössel**, és
  minden újonnan belépő fájlnál nézd meg, mióta bukik:
  ```bash
  git log --oneline -3 -- <a bukast okozo fajl>   # az en mult heti commitom?
  ```
  Ami az ötösön kívül van, azt vagy javítsd ugyanabban a PR-ban, vagy nevezd meg a
  jelentésben. A puszta „a baseline is bukik rá" mondat itt elfedte volna egy
  gépfüggetlenségi szabály megsértését, amit pont egy teszt őriz.
- 🔴 **A módosított fát és a baseline-t NE futtasd EGYSZERRE, mert a baseline lesz
  rosszabb, és az összehasonlítás értelmetlenné válik.** 2026-08-29: időt akartam
  spórolni, ezért párhuzamosan indítottam a kettőt. Eredmény: módosított fa
  **20 bukás / 5 fájl**, baseline **21 bukás / 6 fájl** -- vagyis az érintetlen
  HEAD bukott TÖBBET. A hatodik a `memory-performance.test.ts` volt, ami időzítést
  mér, és a két párhuzamos suite erőforrás-versenyétől esett el; egyedül futtatva
  11/11 zöld.
  **Miért veszélyes, pedig „javamra" tévedett:** a fenti ellenőrzés úgy szól, hogy
  „a bukásszám MEGEGYEZIK a baseline-éval". Itt nem egyezett, és aki csak a számot
  nézi, vagy fals riasztást kap, vagy -- rosszabb -- megtanulja, hogy az eltérés
  normális, és legközelebb egy VALÓDI regressziót is ezzel magyaráz.
  **Eljárás:** a két futás legyen egymás UTÁN, vagy ha mégis párhuzamos volt, minden
  olyan fájlt, ami CSAK az egyik oldalon bukik, futtass le EGYEDÜL, mielőtt
  bármelyik irányban következtetsz:
  ```bash
  cd "$B" && npx vitest run <a csak-egyik-oldalon buko fajl>
  ```
  Zöld egyedül = a párhuzamosság flake-je, nem lelet. A jelentésbe a MINDKÉT
  számot írd bele, és nevezd meg a különbséget -- ne kerekítsd „nulla új bukás"-ra
  magyarázat nélkül.

- **A `git worktree list` idegen worktree-ket is mutathat** korábbi sessionök
  scratchpadjéből. Csak azt takarítsd, amit te hoztál létre; a `prune` viszont
  biztonságos, ha a könyvtár már nem létezik.
- **A lokális checkout maradjon tiszta.** A mérés után a javítás commitolása
  lokális `fix/...` ágra megy, majd `git checkout main` — el nem kommitolt
  változás mellett a `src/update-preflight.ts` dirty-tree ága megtagadja a
  frissítést (lásd [[gg-fork-push-lanc]]).

## Ellenőrzés

- `npx tsc --noEmit` exit 0 a worktree-ben.
- A saját tesztfájl minden esete zöld.
- A teljes suite bukásszáma MEGEGYEZIK a baseline-éval (különben a te dolgod).
- `git worktree list` a futás után csak a `/home/gg/marveen` sort tartalmazza (a
  sajátjaid közül).
- `git status --porcelain` üres a fő checkoutban.
