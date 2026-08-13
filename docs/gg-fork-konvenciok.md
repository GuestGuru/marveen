# GG fork — kódmódosítási és kiadási konvenciók

Ez a checkout a `Szotasz/marveen` **forkja**: `GuestGuru/marveen`. Az upstream aktívan
fejlődik (naponta több release), és mi rendszeresen átvesszük a változásait. Minden
szabály alább ebből az egy célból következik: **az upstream átvétele maradjon olcsó.**

Ha te (az itt futó ágens) a saját kódodba nyúlsz egy javítás miatt, ezeket kövesd.

---

## 1. Saját kiegészítés → saját fájlba, ne meglévő upstream fájlba

Ez a legfontosabb szabály. Minden upstream fájl, amit módosítunk, egy jövőbeli
merge-konfliktus — az általunk **létrehozott** fájlok viszont soha nem ütköznek.

**Így csináld:**

- Új logika → új modul a **`src/gg/`** alatt. Ez a könyvtár az upstreamben nem létezik,
  tehát teljes egészében a miénk (első lakója: `src/gg/access-merge.ts`).
- Új teszt → **saját tesztfájl**, ne bővítsd az upstream tesztfájlját.
- Új dokumentáció → saját fájl a `docs/` alatt (mint ez itt).

**Ha mégis elkerülhetetlen upstream fájlt módosítani** (mert egy hívási pontot be kell
kötni), akkor:

1. a lehető **legkisebb felület** — ideálisan egyetlen sor, ami egy `src/gg/` modult hív,
   miközben az érdemi logika a mi fájlunkban van;
2. **jelöld meg kommenttel**, hogy ez fork-változtatás és miért, hogy egy konfliktusnál
   három hónap múlva is eldönthető legyen, melyik oldal kell:

   ```ts
   // GG fork: az access.json-t MERGE-eljük, nem írjuk felül (lásd src/gg/access-merge.ts)
   ```
3. a commit üzenete mondja ki, hogy fork-specifikus.

Jelenleg módosított upstream fájljaink (ezekre számíts konfliktusra): `install-linux.sh`,
`src/web/routes/agents.ts`, `src/web/update-checker.ts`, `scripts/hooks/ledger*.py`.

---

## 2. Ágstruktúra: `develop`-ra dolgozunk, `main`-ről frissül a szerver

Ez a fork két különböző konvenció metszéspontjában él:

- az **upstream default ága a `develop`** — ott folyik a fejlesztés, a `chore(release)`
  commit is oda megy, a `main` azt fast-forwardolja, a tag a `main`-en ül;
- a **futó telepítés viszont a `main` ágon áll**. Az `update.sh` nem hardcode-ol ágat:
  a checkout **aktuális** ágát húzza (`git pull --ff-only origin/$CURRENT_BRANCH`),
  és a `/home/gg/marveen` checkout `main`-en van.

**Következmény, amin könnyű elcsúszni:** a `develop`-ra mergelt munka **önmagában nem jut
ki élesbe**. Aki csak a `develop`-ot mergeli, majd frissít, azt látja, hogy „nem történt
semmi" — mert a szerver a `main`-t húzza, ami közben nem mozdult.

A teljes lánc tehát:

```
feature branch → develop → main → (szerveren) update.sh
```

---

## 3. Upstream átvétele

```bash
git fetch upstream --tags
git rev-list --left-right --count develop...upstream/develop   # ahead / behind
git merge-tree --write-tree --name-only develop upstream/develop | head -20  # próba-merge
git checkout -b chore/merge-upstream-<verzio> develop
git merge --no-ff upstream/develop
```

A visszatérő — és tipikusan **egyetlen** — konfliktus a `package.json` és a
`package-lock.json` verziósora. Ez nem valódi ütközés: a mi verziónkat kell ráemelni az
új upstream verzióra (lásd a következő pontot). Merge után `npm install`, `npm run
typecheck`, `npm run build`, `npm test` — mérés nélkül ne állítsd, hogy kész.

---

## 4. Verziószám: `-gg.N` az upstream verzió tetején

A fork verziója mindig az átvett upstream verzió + `-gg.N` semver prerelease suffix:
`1.25.1-gg.1`, `1.28.0-gg.1`. Ugyanaz az upstream verzió több GG-kiadást is kaphat
(`-gg.2`, `-gg.3`).

Ez nem kozmetika: a dashboard release-parsere (`src/web/update-checker.ts`) **kifejezetten
erre az alakra van felkészítve** — nélküle a verzió a csupasz upstream számnak látszott,
a `-gg.1` pedig beszivárgott a release összefoglalójába.

---

## 4b. Skillek és ütemezett feladatok: hova kerül a repóban

Ez 2026-08-13-ig kimondatlan volt, és emiatt két skill meg egy feladat **sehol nem
létezett a lemezen kívül**. A szétválasztás elve: *kimehet-e egy idegen
telepítésre anélkül, hogy hazudna?*

| könyvtár | kinek | mód |
|---|---|---|
| `seed-skills/` | minden telepítésnek | **verbatim** (nincs placeholder!) |
| `seed-scheduled-tasks/` | minden telepítésnek | template (`{{INSTALL_DIR}}`, `{{MAIN_AGENT_ID}}`, …) |
| `templates/scheduled-tasks/` | telepítéskori scaffold, csak ha a cél még nem létezik | template |
| `scheduled-tasks/` | **ennek** a telepítésnek a saját feladatai | template, de nem seedeli semmi |
| `gg-skills/` | **ennek** a telepítésnek a GG-specifikus skilljei | verzió, nem seed |

Két buktató, mindkettő mérve:

1. **A `seed-skills/` verbatim másol**, tehát oda `{{...}}` placeholdert TENNI
   ÉRTELMETLEN — literálisan menne ki. Ezért oda csak olyan skill kerülhet,
   amiben nincs gép-specifikus útvonal. 2026-08-13-i mérés: egyetlen ottani
   SKILL.md sem említi a `gg-mcp`-t vagy a `guest.guru`-t, és ez szándékos
   (IT-451: a GG-tudás a `gg_knowledge_*` toolokba került, nem skillbe).
   A `gg-mcp-iras-proxy` tizenegy helyen hivatkozik a `/home/gg/gg-mcp`-re,
   amire nincs is placeholder — ezért `gg-skills/`, nem `seed-skills/`.
2. **A helyben patchelt seed nem vész el, de elszakad.** Az `update.sh`
   `seed_copy_is_untouched()`-e megnézi, hogy a telepített fájl egyezik-e a repo
   utolsó 25 revíziójának valamelyikével; ha nem, MEGTARTJA a helyi változatot.
   Vagyis a kézi javítás túléli a frissítést, de **csak azon az egy gépen
   létezik**, amíg valaki át nem vezeti ide. Skill-patch után ezért ellenőrizd:

   ```bash
   diff seed-skills/<nev>/SKILL.md ~/.claude/skills/<nev>/SKILL.md
   ```

---

## 5. GitHub-műveletek

- A `gh` CLI ebben a checkoutban **az upstreamet (`Szotasz/marveen`) tekinti alapnak**,
  ezért minden parancshoz kell a `--repo GuestGuru/marveen`. Enélkül a `gh pr create`
  idegen repóba nyitna PR-t, és félrevezető hibával hasal el.
- **A boxon futó ágensnek nincs és ne is legyen `gh`-ja.** A botok GitHub-hozzáférése
  kizárólag a gg-mcp `github_*` tooljain át mehet, mert a jogosultsági kapu ott van.
  Ha GitHub-műveletre van szükséged, azt kérd, ne CLI-t telepíts.
- ✅ **A saját javításodat MA már fel tudod tolni** (IT-461, 2026-08-02). Eddig a lánc
  első lépése hiányzott: a `github_open_pr` csak LÉTEZŐ remote ághoz tud PR-t nyitni,
  `git push` pedig nincs (nincs credential helper). A `github_commit` egy hívásból
  létrehozza az ágat és feltolja a commitot:

  ```
  github_commit(repo: "GuestGuru/marveen", ag: "fix/valami",
                uzenet: "fix: …",
                fajlok: [{ path: "src/x.ts", content: "<a TELJES új tartalom>" }])
  → { ag, commit, url }   majd:  github_open_pr(repo: …, head: "fix/valami", …)
  ```

  ⚠️ A fájl **teljes új tartalmát** kell megadni, nem diffet. Az ágnév kötelező
  előtaggal indul (`fix/`, `feat/`, `chore/`, …), a `main` és a többi védett ág soha
  nem írható közvetlenül, force push pedig nincs — a meglévő ágra ráfűz.
  ⚠️ Futtatható fájlnál (szkript) `futtathato: true` kell, különben elveszti a
  futtatási jogát.

  Ez azt is jelenti, hogy **nem kell lokálisan foltozni**: a `src/update-preflight.ts`
  dirty-tree ága megtagadná a frissítést, ha el nem kommitolt változás marad a
  checkoutban.
