---
name: gg-fork-push-lanc
description: Kód kijuttatása a GuestGuru/marveen forkból élesbe gh belépés nélkül, a github_commit MCP toollal - ág, PR develop, merge, PR main, merge, lokális ff. Triggerelődik - "pusholj", "vidd fel a láncon", "git push nem megy", "nincs credential helper", régi lokális ág felküldése.
---

# GG fork push-lánc (gh nélkül)

## Mikor használd
- Kész munkát kell kijuttatni a `GuestGuru/marveen` forkból, de a boxon **nincs** `gh` belépés és nincs git credential helper (`git push` elhasal).
- Egy régóta pihenő lokális ágat kellene végre felküldeni.

## ELŐSZÖR: melyik út kell?

- **Nagy vagy generált fájl** (>~20 KB: lockfile, web-bundle, install script), **vagy több
  commit egyben** -> **git push a proxyval**, NE `github_commit`:
  ```bash
  printf '#!/bin/sh\nprintf "%%s\\n" "$GITHUB_TOKEN"\n' > "$SP/askpass.sh"; chmod 700 "$SP/askpass.sh"
  GG_MCP_TOKEN_FILE=/home/gg/gg-mcp/tokens/marveen.token GG_MCP_AGENT_LABEL=marveen/Marveen \
  node /home/gg/gg-mcp/dist/proxy.js exec --alias github -- \
    sh -c "GIT_ASKPASS=$SP/askpass.sh GIT_TERMINAL_PROMPT=0 git -C <repo> push https://x-access-token@github.com/GuestGuru/marveen.git <ag>:refs/heads/<ag>"
  ```
  Részletek és a token-higiénia: [[gg-mcp-iras-proxy]]. Csak `fix/`, `feat/`, `chore/`
  előtagú ágra, védettre (main/develop) SOHA -- a git ezt nem őrzi, neked kell.
- **Néhány kis fájl** -> `github_commit` (lásd lent). Innentől a lánc ugyanaz: PR develop,
  merge, PR main, merge, lokális ff.

⚠️ **2026-08-09: ezt a döntést elrontottam.** Az upstream v1.31.0 merge-nél a
`github_commit` méretkorlátja miatt két fork-hunk (97 KB-os `install-linux.sh`,
137 KB-os `package-lock.json`) kimaradt, és „nem felvihető"-nek jelentettem -- pedig a
proxy push-út ott volt a saját skill-indexemben. Utólag egy `fix/` ágon ment fel, egy
kör helyett kettőből. **Nagy fájlnál a proxy az ELSŐ gondolat, ne a fallback.**
A tool-oldali hiányosságok külön issue-ban: IT-482.

## Eljárás

⚠️ **2026-08-17 óta a lánc szkriptben van, ne csináld kézzel:**

```bash
scripts/gg-push-lanc.sh <ag> "<commit uzenet>" [fajl ...]   # ag, push, PR develop, merge, PR main, merge, lokalis ff
scripts/gg-push-lanc.sh --resume <ag>                       # az ag mar fent van, csak a PR-lanc kell
DRY_RUN=1 scripts/gg-push-lanc.sh ...                       # semmit nem nyul, csak megmutatja
```

A szkript az identitást a checkout **saját `.mcp.json`-jából** olvassa (felülírható
`GG_MCP_TOKEN_FILE`-lal), push előtt megnézi, nincs-e élő token-prefix a stagelt
fájlokban, feltöltés után a **remote** oldalon is ellenőrzi, és csak `fix/ feat/
chore/ docs/` előtagú ágat enged. Első éles futása: 2026-08-17, PR #50 és #51,
20 fájl -- elsőre végigment.

A lenti kézi lépések akkor kellenek, ha a szkript elhasal, vagy ha a munka nem fér
bele (upstream-merge, >100 KB fájl -- lásd a következő szekciót).

1. **Előbb auditáld a felküldendő commiteket, ne vakon push.** Egy régi ág premisszái elavulhattak (lásd Buktatók). `git log --oneline main..<ag>` + `git show <sha>` minden commitra.
2. Ág + commit egy hívásból (a fájl **teljes új tartalmával**, nem diffel):
   ```
   github_commit(repo: "marveen", ag: "fix/valami", alap: "develop",
                 uzenet: "...", fajlok: [{path, content, futtathato}])
   ```
3. **Verifikáld a feltöltöttet**, mielőtt PR-t nyitsz:
   ```bash
   git fetch origin <ag> --quiet && git show FETCH_HEAD:<path> > /tmp/remote && diff /tmp/local /tmp/remote
   git ls-tree FETCH_HEAD <path>          # 100755 maradt-e a szkript
   git diff --stat origin/develop FETCH_HEAD   # tényleg csak az érintett fájl?
   ```
4. `github_open_pr(head: "<ag>", base: "develop")` -> `github_merge_pr(number, method: "merge")`
5. `github_open_pr(head: "develop", base: "main")` -> `github_merge_pr(...)`
6. Lokális zárás: `git pull --ff-only origin main`. Ha `src/` változott, **rebuild kell** (`update.sh` vagy build), mert a futó szolgáltatás a `dist/`-ből megy. Sima `scripts/*.sh` vagy doksi esetén nem.

## Upstream-merge push nélkül (64 commit, 112 fájl -- 2026-08-09, v1.31.0)

A `github_commit` csak fájl-tartalmat tud feltölteni, merge-commitot nem. Egy egész
upstream-behúzást mégis fel lehet vinni, mert a **`github_write_request` a Git Data
API-t engedi** (`git/blobs`, `git/trees`, `git/commits`, `git/refs`), és a **fork
network miatt az UPSTREAM objektumai is elérhetők a fork repóban** -- tehát tree-t
építhetsz meglévő blob SHA-kkal, nulla feltöltéssel.

Az eljárás (a lokális merge-et ELŐBB csináld meg worktree-ben és mérd le,
lásd [[marveen-kod-teszteles-worktreeben]]):

1. Ág + prep-commit: a **konfliktusos fájlokat az UPSTREAM blobjára** állítod.
   ```
   github_write_request POST git/trees   {base_tree: <ág tree>, tree: [{path, mode, type:"blob", sha:<upstream blob>}]}
   github_write_request POST git/commits {message, tree, parents:[<ág feje>]}
   github_write_request PATCH git/refs/heads/<ág>  {sha}
   ```
   A blob SHA-kat lokálisan kapod: `git ls-tree upstream/develop <path>`.
2. Az upstream behúzása **cross-fork PR-rel**: `github_open_pr(head: "Szotasz:develop",
   base: "<ág>")` -> ellenőrizd `mergeable_state: "clean"` -> `github_merge_pr`.
   A GitHub számolja ki az auto-merge blobokat, amiket te nem tudnál feltölteni.
3. A GG-specifikus részek **visszatétele külön commitban**, `github_commit`-tal
   (csak kis fájlokon).
4. Verifikáció: `git fetch origin <ág>` + `git diff <lokális merge commit> FETCH_HEAD`
   -- az eltérés PONTOSAN a tudatosan kihagyott hunk legyen, semmi más.

⚠️ **A prep-commitba NE a végleges (feloldott) tartalom kerüljön.** A 3-way merge
akkor is konfliktál, ha mindkét oldal *máshogy* változtatta ugyanazt a sort -- a
feloldott tartalom pont ilyen. Csak az „a mi oldalunk PONTOSAN az upstream
tartalomra változott" eset trivális.

⚠️ **~100 KB feletti fájl nem módosítható ezen az úton.** Minden új blob az én
kontextusomon folyik át. 2026-08-09-en emiatt maradt ki az `install-linux.sh`
(97 KB) GG sqlite3-hunkja és a `package-lock.json` (137 KB) `-gg.N` verziósora.
Ezt **írd bele a PR leírásába és jelentsd**, ne csendben menjen.

## Buktatók
- **ÉLŐ hitelesítő adat a teszt-fixture-ben (2026-08-12, majdnem kiment).** A remote
  gg-access javításához írtam egy tesztet, aminek kellett egy bearer token — és a
  legkézenfekvőbb helyről vettem: a saját `.mcp.json`-omból, vagyis az ÉLŐ tokenemet
  másoltam bele. A `.mcp.json` gitignored, a tesztfájl viszont **trackelt**: a commit
  a fork nyilvános history-jába vitte volna. Feltöltés előtt kaptam el.
  A szabály: fixtúra-hitelesítő MINDIG szintetikus (`ggp_${'0'.repeat(64)}`), és a
  push előtt ez a két mérés kötelező, nem szemrevételezés:
  ```bash
  grep -rn "$(cut -c1-12 /home/gg/gg-mcp/tokens/marveen.token)" <a felkuldendo fajlok>   # ures = tiszta
  git show FETCH_HEAD:<path> | grep -c "ggp_[0-9a-f]\{20,\}"                             # 0 a remote oldalon is
  ```
  Ugyanez vonatkozik a memóriára és a napi naplóra: a hibát *írd le*, a titkot ne.
  Ha egy élő token mégis megjelent a transzkriptben, az nem "majdnem baj": jelezd a
  gazdának, hogy cserélheti (https://tools.guest.guru), és a döntést hagyd rá.
- **A `git pull --ff-only` ELHASAL a lánc végén, ha az új fájl untracked-ként ott van a lemezen.**
  Ez nem ritka él-eset, hanem a NORMÁL munkamenet: megírod a fájlt lokálisan, felküldöd
  `github_commit`-tal, majd a záró ff a saját fájlodba ütközik --
  `error: untracked working tree files would be overwritten by merge ... Aborting`,
  és a HEAD ott marad, ahol volt (2026-08-10, `gg-mcp-health.py`). A helyes feloldás:
  ```bash
  cp -p <fajlok> "$SP/pre-pull/"      # masolat ELOSZOR
  rm <fajlok> && git pull --ff-only origin main
  diff "$SP/pre-pull/<f>" <f>         # a behuzott = ami itt futott
  ```
  A tartalom-azonosságot a 3. lépés push-verifikációja már bizonyította, ezért a törlés
  biztonságos -- de a másolat + utólagos `diff` nélkül ez csak hit, nem mérés.
  ⚠️ NE `git checkout -f`, NE vak `git stash -u`: mindkettő olyan lokális változást is
  elvisz, ami nem ebbe a körbe tartozik.
- **Az elhasalt pull kimenete ÚGY néz ki, mintha sikerült volna.** A `git pull` a hibát és
  az `Updating <old>..<new>` sort külön streamre írja, ezért egy `| tail -5`-ben a sorrend
  összekeveredik, és a legutolsó sor az `Updating ...` lesz -- közvetlenül az `Aborting`
  UTÁN (2026-08-10). Aki a záró sort olvassa, sikert lát ott, ahol a HEAD meg sem mozdult.
  A pull kimenete SOSEM bizonyíték: a záró ellenőrzés mindig
  `git rev-parse HEAD origin/main` egyezés legyen.
- 🔴 **A GitHub 5xx NEM bizonyíték — egyik irányban sem.** 2026-08-13-án egyetlen
  körben mindhárom variáció előjött:
  - `git push` -> `! [remote rejected] ... (Internal Server Error)`, **másodikra ment**;
  - `github_merge_pr` -> **502**, de a merge VALÓJÁBAN LEMENT (`merged=true`,
    `state=closed`) — egy vak újrapróbálás itt zavart okozott volna;
  - `github_open_pr` -> **502**, és a PR tényleg NEM jött létre.

  Vagyis ugyanaz a hibakód jelentett „megtörtént" és „nem történt meg" állapotot is,
  öt percen belül. **Minden 5xx után ELŐBB kérdezd le az állapotot, csak utána
  ismételj:**
  ```bash
  # merge/PR allapot
  curl -s -H "Authorization: Bearer $GITHUB_TOKEN" .../pulls/<n> | jq '.merged, .state'
  # letrejott-e egyaltalan a PR
  curl -s -H "Authorization: Bearer $GITHUB_TOKEN" '.../pulls?state=open&base=main' | jq length
  ```
  Ez ugyanaz a hibaosztály, mint a `curl` exit-kódja, csak a válasz oldalán:
  a hívás EREDMÉNYE nem a hívás VISSZATÉRÉSI ÉRTÉKE. (A `githubstatus.com` közben
  végig „All Systems Operational" volt, tehát arra sem lehet alapozni.)
- 🔴 **A `FETCH_HEAD` NEM stabil hivatkozás — a következő `git fetch` átírja.**
  A fenti verifikációs lépések `FETCH_HEAD`-et használnak, és ez csak addig helyes,
  amíg NEM fetchelsz újra. 2026-08-13: a `git fetch origin <ag>` utáni ellenőrzés jó
  volt, majd egy sima `git fetch origin` átírta a `FETCH_HEAD`-et, és a megismételt
  `git diff --stat origin/develop FETCH_HEAD` **36 KB-nyi idegen változást** mutatott
  (tucatnyi doksi törlésével) — másodpercekig úgy nézett ki, mintha a saját ágam
  törölte volna a fél repót. Nem az volt, csak már mást hasonlítottam össze.
  Használd a remote-követő refet, az nem mozdul a lábad alatt:
  ```bash
  git fetch origin --quiet
  git diff --stat origin/develop origin/<ag>      # NEM FETCH_HEAD
  git rev-parse HEAD origin/<ag>                  # egyeznie kell
  ```
- **`gh auth status` = not logged in, ez normális.** Ne kezdj el `gh auth login`-t szervezni, a push-út a `github_commit` MCP tool (IT-461 óta él).
- **A `github_*` toolok a `fejlesztoi` csomaghoz kötöttek, és a csomag ELTŰNHET a token alól.** 2026-08-05: kész, tesztelt javítást nem lehetett felküldeni, mert `gg_allowed_tools` szerint mind a 12 `github_*` tool a `nincs_jogod` ágon volt (`kell: fejlesztoi`), és a `gg_secret_get` sem adta ki a `github` kulcsot. Mindkét token ugyanaz (`/home/gg/gg-mcp/tokens/*.token` -> ugyanaz a userId), tehát token-cserével sem kerülhető meg:
  ⚠️ **A régi mérő-parancs 2026-08-10-re KÉTSZERESEN félrevezet — ne ezt használd:**
  a `marveen-main` és a `marveen-bot-teszt` token azóta **401** (`{"error":"unauthorized"}`),
  ÉS a `packs` tömbben **nincs `fejlesztoi` bejegyzés** — azt a `tokenScope.tier`
  (`superfejleszto`) fedi. Aki a `packs`-ben keresi, hamis „NINCS fejlesztoi"-t kap egy
  tökéletesen jó tokennel. A helyes mérés az ÉLŐ tokenre, tier-rel együtt:
  ```bash
  curl -s -H "Authorization: Bearer $(cat /home/gg/gg-mcp/tokens/marveen.token)" \
    https://tools.guest.guru/api/me/access \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('email'),'| tier=',d.get('tokenScope',{}).get('tier'),'| packs=',len(d.get('packs',[])))"
  ```
  Melyik token az élő, azt SOHA ne emlékezetből vedd, hanem a `.mcp.json`-ból:
  `python3 -c "import json;print(json.load(open('/home/gg/marveen/.mcp.json'))['mcpServers']['gg-access']['env']['GG_MCP_TOKEN_FILE'])"`
  **Ezt mérd meg a MUNKA ELŐTT** (`gg_allowed_tools`), ne a kész commit után -- különben a javítás lokálisan reked.
  **Ha zárva van, a helyes lezárás:** a munkát ne hagyd uncommitted (a `src/update-preflight.ts` dirty-tree ága megtagadná a frissítést), hanem commitold LOKÁLIS `fix/...` ágra, majd `git checkout main` -- így a checkout tiszta, a main érintetlen (`git pull --ff-only` később is megy), és a commit push-ra készen áll. Utána kérd a `fejlesztoi` csomagot a gazdától (https://tools.guest.guru/csomagok), és jelezd, hogy a lánc addig áll.
- **Nem diff, hanem teljes tartalom.** A `fajlok[].content` a fájl teljes új szövege. Szkriptnél `futtathato: true`, különben elveszti a 100755 módot.
- **Védett ágra sosem ír** (main/master/develop/production), force push nincs, meglévő ágra ráfűz. Ezért kell a `fix/`, `feat/`, `chore/` előtag.
- **A régi lokális ág tartalma elavulhat, és csendben visszaír egy azóta meghozott döntést.** Konkrét eset (2026-08-02): a `fix/skill-index-desc-es-lokalis-config` ág egyik commitja a **trackelt** `.claude/settings.json`-ba írta a modellt (`claude-opus-5`, `[1m]` nélkül), miközben aznap az lett a döntés, hogy a modell a gitignored `.env`-ből jön (`claude-opus-5[1m]`). Felküldve némán rossz fallbackot csinált volna. -> Az ilyen commitot bontsd szét, csak a valóban kívánt részt küldd fel.
- **Egy commit-üzenet állítása nem bizonyíték.** Ugyanaz a commit "nem használt channel pluginok" indokkal kapcsolta volna ki a Discordot, holott a `~/.claude/channels/discord/` alatt bot-token, egy párosított DM és két csoport volt. Config-kikapcsolás előtt KÖTELEZŐ ellenőrizni az adott csatorna `access.json`-ját és a futó `--channels` processzeket.
- Az egész-fájlos újraformázás (pl. JSON pretty-print) fölösleges merge-konfliktus-felület az upstream felé. Csak a tartalmilag szükséges sorokat vidd.

- 🔴 **A `.github/workflows/` ALATTI FAJL MINDKET UTAT ELZARJA -- a proxy-pusht ES a
  cross-fork PR merge-et is.** 2026-08-21, az upstream v1.33.0 behuzasanal: az upstream
  egy uj `secret-gate.yml` workflow-t hozott, es a push ezzel szallt el:
  `! [remote rejected] ... (refusing to allow a Personal Access Token to create or
  update workflow .github/workflows/secret-gate.yml without `workflow` scope)`.
  **A cross-fork PR merge-e sem megy:** a PR `mergeable: true` / `clean` allapotba
  kerult, de a `github_merge_pr` 403-at adott
  (`Resource not accessible by personal access token`) -- ugyanaz a kapu, masik
  hibaszoveggel.
  ⚠️ **DE a fal CSAK az ELSO atvetelnel van, amikor a workflow-fajl UJONNAN kerul a
  repoba.** Miutan a gazda egyszer atengedte, a BELSO PR-ek (ag -> develop -> main)
  mar simán mennek a sajat tokennel: 2026-08-21-en a #79 es a #80 elsore mergelodott,
  pedig mindketto vitte ugyanazt a `secret-gate.yml`-t. A kulonbseg: ott a fajl mar
  LETEZIK a celon, tehat a muvelet nem "create or update workflow". Vagyis egy
  kattintast kell kerni, nem az egesz lancot.
  **Ellenorzes ELOTTE, ne utana** (egy sor, es megsporol egy fel orat):
  ```bash
  git diff --name-only HEAD upstream/develop | grep '^.github/workflows/'
  ```
  Ha ad talalatot, a kijuttatas EMBERI dontest kivan, es ezt a merge-munka ELEJEN
  mondd meg, ne a vegen. Ket ut van, es a valasztas a gazdae:
  (a) o mergeli a PR-t a GitHubon -- egyszeri, nem terjeszkedik;
  (b) `workflow` scope a tokenre -- kenyelmesebb, de TARTOS jogkiterjesztes minden
  jovobeli futasra. Alapbol az (a)-t javasold.
  A feloldott merge-commit addig is elhet a worktree-ben; a munka NEM vesz el,
  csak a kijuttatas var.

## Ág-takarítás merge után
Törlés ELŐTT mindig két külön kérdés, mert a commit-szám félrevezet:
```bash
git merge-base --is-ancestor <ag> origin/main   # 0 = teljesen benne van
git diff --stat origin/main...<ag>              # ÜRES = tartalmilag semmi nem veszik el
git ls-remote --heads origin <ag>               # van-e remote másolat
git log --oneline --branches --not --all        # él-e commit CSAK ezen az ágon
```
Egy ág lehet "2 commit-tal előrébb" úgy, hogy a tartalmi diff nulla -- ha a plusz commitok csak
`develop`-behúzó merge-commitok (2026-08-02: `feat/ledger-multi-provider`). Ilyenkor `-d` megtagadja,
`-D` a helyes, és semmi nem vész el. A törölt ág 30 napig visszahozható: `git branch <nev> <sha>`,
ezért a törlés-visszaigazolásba MINDIG írd bele a SHA-t.

**REMOTE ág törlése: csak a proxy megy.** A `github_write_request` metódus-listája `POST` és
`PATCH` -- **`DELETE` nincs benne**, tehát a `git/refs/heads/<ag>` ref ezen az úton nem törölhető
(2026-08-10). Ne kezdj DELETE-tel próbálkozni, a `github_commit` sem tud törölni ÁGAT (a
`fajlok[].torol` FÁJLT töröl a commitban, az más). A működő út a [[gg-mcp-iras-proxy]] push-ja,
üres forrás-refspec-kel:

```bash
printf '#!/bin/sh\nprintf "%%s\\n" "$GITHUB_TOKEN"\n' > "$SP/askpass.sh"; chmod 700 "$SP/askpass.sh"
GG_MCP_TOKEN_FILE=/home/gg/gg-mcp/tokens/marveen.token GG_MCP_AGENT_LABEL=marveen/Marveen \
node /home/gg/gg-mcp/dist/proxy.js exec --alias github -- \
  sh -c "GIT_ASKPASS=$SP/askpass.sh GIT_TERMINAL_PROMPT=0 git -C /home/gg/marveen push \
         https://x-access-token@github.com/GuestGuru/marveen.git :refs/heads/<ag>"
rm -f "$SP/askpass.sh"      # a kimenet: " - [deleted]  <ag>"
```
Utána `git fetch origin --prune` + `git ls-remote --heads origin <ag>` (üres = tényleg lement),
és ellenőrizd, hogy a tartalom megvan a mainben: `git ls-tree origin/main <fajlok>`.

⚠️ **A takarítási felhatalmazás hatókörét ne tágítsd.** Egy "ami üres azt törölheted" válasz arra
az ágra szól, amit FELAJÁNLOTTÁL, nem az összes mergelt ágra. 2026-08-10-én a forkban 83 ág volt a
`main`/`develop` mellett, ebből 14 ugyanígy "üres" -- de nagy részük **upstreamből örökölt**
(`Szotasz/marveen`) fejlesztési előzmény, nem a mi munkánk, és nem a mi dolgunk takarítani benne.
A helyes lépés: az egy kért ágat töröld, a többit LISTÁZD névvel és SHA-val, és hagyd a gazdára.

## Ellenőrzés
- `git rev-parse origin/develop origin/main` -- a main a develop merge-commitján áll.
- `git status --porcelain` üres, a lokális checkout ff-elve.
- A javítás ténylegesen hat (pl. skill-index után: `grep -c "(nincs leírás)"` = 0).
