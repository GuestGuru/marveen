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
7. **A rebuildet MÉRD, ne feltételezd.** A `git log` már az új commiton áll akkor is, ha
   a build félbeszakadt -- tipikusan azért, mert az `update.sh` restartolja a
   fő-ágens sessionjét, és a saját buildjét vágja el. A kész-feltétel:

   ```bash
   cat dist/.built-commit; git rev-parse HEAD   # a kettő EGYEZZEN
   ```

   Ha eltér, a `dist/` a régi kódot futtatja, hiába zöld a git. Az `update.sh`
   öngyógyító ága elkapja (`dist elavult (built=...) -> ongyogyito ujraforditas +
   restart`), **de NE várd meg**: az `auto-update` ütemezés `0 4 * * 3`, vagyis
   HETENTE EGYSZER, szerda hajnalban. Ha a `src/` változott, magad futtasd az
   `update.sh`-t, különben a telepítés akár egy hétig a régi kódon áll.
   (2026-08-21, v1.33.0-gg.1: main @ `862923a`, dist @ `9e557d0` volt 2 órán át,
   és azt is a KÉZZEL indított futásom javította 08:42-kor, nem az ütemezés.)

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
- 🔴 **EZ A FORK PUBLIKUS, és a titok-grep nem látja a személyes adatot (2026-08-28).**
  `GuestGuru/marveen` -> `private=false` (mérve a GitHub API-n). Minden felküldött
  fájl világolvasható, és a git history visszamenőleg is az. Nyolc sub-ágens-skill
  tükrözésénél a szokásos titok-szűrés (`ggp_`, `sk-`, `AIza`, `xox`, private key)
  **nulla találatot** adott -- közben a `b2b-onepager-gyartas/scripts/content.example.py`
  négy lakás valós címét, kiadhatósági dátumát és ágy-elrendezését tartalmazta, a
  `drive.py` három beégetett Drive-mappa-ID-t, a `kikuldetesi-rendelveny` pedig egy
  magánszemély teljes nevét és havi km-térítését. Egyik sem titok, mégis egyik sem
  való publikus repóba.
  **Push előtt tehát KÉT szűrés kell, nem egy:**
  ```bash
  # 1. titok (a meglevo)
  grep -rnoE "ggp_[0-9a-f]{20,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-" <fajlok>
  # 2. szemelyes es ugyfel-adat (az uj)
  grep -rinE "utca|körút|[0-9]{4} Budapest|rendszám|adószám|lakcím|bankszám" <fajlok>
  grep -rnoE "[01][A-Za-z0-9_-]{25,}" <fajlok>          # beegetett Drive/Doc ID
  grep -rnoE "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}" <fajlok>
  ```
  ⚠️ **A GREP HÁROM MÓDON HAZUDIK, és 2026-08-29-én mindháromba belefutottam egy
  körben.** *(A példák szándékosan kitaláltak: egy buktató, ami a valós neveket
  idézi, MAGA a szivárgás. Ezt is menet közben tanultam meg, mert az első
  változatom pontosan ezt csinálta.)*
  (1) **A magyar nevet ékezettel ÉS ékezet nélkül is írjuk.** A `grep -i` a kis- és
  nagybetűt egyesíti, az ékezetet NEM: `Példa körút`-ra szűrtem, a szövegben
  `Pelda korut 12` állt, és tisztát jelentett egy olyan fájlra, amiben ott voltak
  a címek.
  (2) **A rövidítést és az elválasztót sem egyesíti semmi.** A `Példa körút` nem
  fogja a `pelda-krt-12` slugot, és fordítva: a slug nem fogja a prózában álló
  teljes utcanevet. Vagyis a gyenge pont nem a grep, hanem hogy **a terminus
  kézzel jön** -- amit nem írsz be, arra nem is keresel.
  **A megoldás: a terminusok jöjjenek FUTÁSIDŐBEN a helyi, gitignorált forrásokból**
  (a configból a slugok, a tartalom-fájlból a megjelenő nevek; a kettő uniója kell,
  egyik sem fedi le a másikat), és a szűrő normalizáljon ékezetre ÉS elválasztóra.
  Így a szűrő-szkript maga sem tartalmaz valós adatot.
  **Kész, ÁLTALÁNOS implementáció: `scripts/leak-check.py`** (2026-08-31) --
  nem-nulla exit = nem mehet push. Nem lakás-specifikus: a terminusokat
  tetszőleges helyi forrásból szedi.
  ```bash
  python3 scripts/leak-check.py \
      --terms-from-json <config.local.json> \   # minden string kulcs es ertek, rekurzivan
      --terms-from-dir  <assets/photos> \       # minden fajl- es konyvtarnev (kiterjesztes nelkul is)
      --terms-from-quoted <content.py> \        # minden idezojeles string-literal
      --terms-from-lines <nevek.txt> \          # soronkent egy terminus
      --term "Teljes Nev" \                     # explicit, ismetelheto
      -- <a publikalando fajlok...>
  ```
  Az eredeti, b2b-specifikus változat továbbra is megvan
  (`gg-skills/b2b-onepager-gyartas/scripts/sanitycheck.py`, jean, 2026-08-29);
  az általános a annak a kiemelése, nem a leváltása.
  ⚠️ **Két dolog, ami az általánosításnál számít, és az eredetiben nem merült fel:**
  (1) **A terminusokat alapból NEM írja ki** -- a terminusok MAGUK az érzékeny
  adat, tehát a listázásuk ugyanaz a szivárgás, amit meg akarsz előzni.
  `--show-terms` kell hozzá, tudatosan.
  (2) **A négy karakternél rövidebb terminusokat eldobja** (`--min-len`), és
  megmondja, hányat. Enélkül egy `{"id": "12"}` mezőből `12` lesz terminus, ami
  minden sorra illeszkedik, és a valódi találatot elnyeli a zaj. Ha egy rövid
  terminus tényleg kell, `--min-len 2` és nézd meg, mit kapsz.
  Az egyszerű, ékezet-független szűrés innentől csak a gyorsellenőrzés:
  ```bash
  python3 -c "
  import sys,unicodedata,io
  fold=lambda s:''.join(c for c in unicodedata.normalize('NFD',s) if unicodedata.category(c)!='Mn').lower()
  terms=[fold(t) for t in sys.argv[2:]]
  for i,l in enumerate(io.open(sys.argv[1],encoding='utf-8'),1):
      if any(t in fold(l) for t in terms): print(f'{sys.argv[1]}:{i}: {l.strip()[:120]}')
  " <fajl> "Példa körút" "Minta utca" "Teszt tér"
  ```
  (2) **A KÓD sanitizálása nem sanitizálja a DOKUMENTÁCIÓT.** A lakás-slugokat
  kiszerveztem a `gen.py`-ból configba, és késznek hittem magam, miközben ugyanazok
  a címek szó szerint ott álltak a `SKILL.md` Buktatók szekciójában, egy
  hiba-történet közepén. A war story értéke nem függ a valós nevektől: „az egyik
  lakás lapján egy MÁSIK lakás képei" pontosan ugyanazt tanítja. **Szűrj a prózára
  is, ne csak a kódra** -- a doksi általában TÖBB valós adatot tartalmaz, mert ott
  a konkrétum a magyarázat része.
  Ezt jean kapta el, nem én, és csak azután, hogy a HEAD már fent volt.
  **Ha mégis kiment: a HEAD javítása egy sima commit, a TÖRTÉNET viszont a gazda
  döntése.** Force-push a `main`-re tilos, a fork-hálózatot és minden klónt eltör,
  és a GitHub az elérhetetlen objektumot SHA-val még sokáig kiszolgálja, tehát nem
  is töröl. Mérd meg és tálald: MI ment ki, MENNYI IDEIG (commit-időbélyegek),
  és milyen osztályú adat. Alacsony érzékenységnél a történet maradhat; személyes
  adatnál a helyes út a GitHub support, nem a force-push.

  A céges munka-email (`nev@guest.guru`) NEM blokkoló: már bent van precedensként.
  A magánszemély teljes neve + pénzösszeg és a mappa-ID viszont igen.

  🔴 **HATÓKÖR, mielőtt bárki rosszul általánosít: ez a SKILL- és WIKI-tartalomra
  vonatkozik, NEM a munka eredményeként előálló dokumentumokra.** brokermarcsi
  fogalmazta meg, 2026-09-01, és a saját területén ez nem elméleti: egy kiküldetési
  rendelvény, számla vagy teljesítési igazolás **kötelezően** tartalmazza azt, ami
  ezen a listán blokkoló (teljes név, lakcím, adóazonosító, rendszám, összeg) --
  az a bizonylat NAV-alakisága. Ha valaki a lenti szinteket ráhúzza egy pénzügyi
  vagy HR-artefaktumra, **anonimizált, tehát érvénytelen bizonylatot** gyárt.
  **A különbség nem az érzékenység foka, hanem a dokumentum FUNKCIÓJA:** a skill
  ismeretet hordoz és sokan olvassák hosszú ideig; a bizonylat egyetlen konkrét
  ügyletet azonosít, és pont az azonosítás a dolga.

  **És a MEMÓRIA-TIEREKRE sem áll** (salesninja kérdezte, 2026-09-01, döntés:
  marveen). A `shared` emlék nem publikálódik, a flotta olvassa kontextussal, és
  **pont a konkrétumtól hasznos**: egy bejegyzés, ami annyit mond, hogy „egy
  tulajnak több rekordja lehet", de az azonosítót elhagyja, semmit nem ment meg a
  következő ágensnek. A memóriára ezért egy SZŰKEBB, két pontos szabály áll:
  1. **hitelesítő adat** (token, jelszó, auth nélkül működő link) csak akkor, ha
     kifejezetten meg is van jelölve annak;
  2. **minden számhoz KÖTELEZŐ a mérési ablak** -- a memóriában a valódi kockázat
     nem az érzékenység, hanem az ELAVULÁS: egy ablak nélküli szám fél év múlva
     magabiztosan hazudik.
     ⚠️ **Az „LTM", a „tavalyi" és a „jelenleg" ablak-jelzésnek NÉZ ki, de egyik
     sem köti le a mérés idejét** (jean, 2026-09-01): az LTM a hosszt mondja meg,
     a HELYÉT nem. **Az ablakot a MÉRÉS dátuma rögzíti, nem az adat típusa.**
  🔴 **És a mérési ablak a memória KÉT hibájából csak az EGYIKET fogja meg**
  (brokermarcsi, 2026-09-01, a saját tíz emlékén végigmérve):
  - *(a) nincs ablak* -> nem tudni, mikor volt igaz. Ezt a fenti pont megfogja.
  - *(b) VAN ablak, de az állapot azóta megváltozott.* Ezt **semmi nem fogja meg**,
    és a `hot` tierben ez a GYAKORIBB, mert a hot pont a változó dolgokról szól.
    Konkrét eset: egy „NYITOTT, döntésre vár" bejegyzés négy napig ült a hot
    tierben, miközben mind a három kérdése lezárult -- és a gépi ellenőrzés
    OK-nak jelölte, mert **volt benne dátum**. A dátum megléte ELREJTETTE az
    elavulást.
  - *(c) az állapotot a SAJÁT KÉSŐBBI ÍRÁSOD érvénytelenítette.* salesninja mérése,
    2026-09-01: két saját emléke mond ellent egymásnak ugyanabban a tierben,
    mindkettő datálva, mindkettő átmegy bármilyen gépi ellenőrzésen -- a régebbi
    egy Linear-állapotot rögzít, amit a saját, két héttel későbbi munkája
    szüntetett meg. **Aki a régebbit olvassa vissza, olyan állapotot kap, amit
    maga az író számolt fel.**
    Ezt gép NEM foghatja meg, mert mindkét bejegyzés önmagában helyes és friss.
    **Az egyetlen ellenszer szokás:** feladat végén, emlék-mentés ELŐTT tedd fel a
    kérdést, hogy *melyik korábbi bejegyzés állapotát írtam most felül* -- és azt
    ugyanabban a körben zárd le. A (c) ezért nem az elavulás alfaja: ott a világ
    változott, itt TE változtattad meg.
  - *(d) a BLOKKOLÓ OK szűnt meg, és a feladat bent ragadt.* marveen mérése,
    2026-09-01, a saját 231 emlékén: egy bejegyzés 2026-08-07 óta jelzi, hogy a
    `CLAUDE.md` nem létező tool-neveket ír a napindítóhoz, és hozzáteszi, hogy a
    javítás „a hiányzó fejlesztői csomag miatt blokkolt". A csomag 2026-08-08-án
    megjött. **A tartalmi részt utólag pontosítottam, a BLOKKOLÓ okot nem néztem
    újra** -- a hiba így 24 további napig állt, ma is élesben.
    A gyanú-jel olcsó és szótári: ha egy emlékben ott van, hogy *„amíg X, addig
    blokkolt"*, akkor **az X-et kell megmérni, nem az emléket újraolvasni.**

  ⚠️ **A „hiány-mondat" mint gépi szűrő MEGBUKOTT -- ezt kimérve mondom.**
  brokermarcsi javaslata (2026-09-01) az volt, hogy a hiányt rögzítő emlék a
  leggyorsabban avuló fajta, tehát szótári mintával olcsón kereshető
  (`nincs|hiányzik|nem érhető el|nem megy|várok`). Lefuttattam a saját 231
  emlékemen: **117 találat (50%)**, záradékkal lezártakat leszámítva **90**.
  Ez nem szűrő, ez a korpusz fele.
  **Ami viszont VALÓBAN szétválasztja a kettőt, és nem szótári:**
  - **ÁLLAPOT-hiány** = olyasmi hiányzik, amit ÜZEMELTETÜNK (jogosultság, token,
    fájl, futó szolgáltatás). Ez azért íródott le, hogy megszűnjön -> **avul**.
  - **RENDSZER-hiány** = a rendszerben tervezetten nincs olyan (pl. „a
    `github_write_request` metódus-listája csak POST és PATCH, DELETE nincs";
    „a `/home/gg/gg-mcp` nem git checkout"). Ez **mechanizmus-tény -> nem avul.**
  Mindkettőt ugyanaz a szó vezeti be, tehát a döntést nem a minta hozza meg,
  hanem az olvasás. A minta arra jó, hogy MIT olvass el -- nem arra, hogy mit dobj ki.

  ⚠️ **Az ÜRES vagy egyelemű hot tier NEM bizonyíték a tisztaságra** (bubi,
  2026-09-01). A kor-ellenőrzés csak azt vizsgálja, ami bent van; a másik irányt
  -- **nyitott ügy, ami KIMARADT a hot tierből** -- semmi nem fogja meg.
  Ez **két külön kérdés**, ne csúsztasd egybe:
  1. van-e néhány napnál régebbi hot emlékem? (ami bent van, még érvényes-e)
  2. van-e olyan ügyem, ami valakinek a döntésére vár -- és benne van-e a hot tierben?
  A 2. a munkából indul, nem az emlékből. Saját mérés ugyanaznap: egy hot emlékem
  volt, ténylegesen nyitott, tehát az 1. tisztát adott -- közben **két döntésre
  váró ügyem egyáltalán nem szerepelt a hot tierben.**

  **A (b), (c) és (d) mind ugyanoda fut ki: nem szabály kell, hanem szokás.**
  A hot bejegyzést a
  LEZÁRÁSKOR kell törölni, nem majd egyszer. És egy olcsó gyanú-jel: **ha egy hot emlék néhány
  napnál régebbi, az önmagában gyanús** -- a hot definíció szerint arról szól,
  ami MOST történik. Nem az érzékenységét nézd rajta, hanem a KORÁT.
  🔧 **A régi emléket API-ból kell frissíteni, NEM nyers SQLite-tal.**
  ```bash
  # 1. olvasd ki a jelenlegi szoveget (a PUT CSEREL, nem merge-el)
  REGI=$(curl -s -H "Authorization: Bearer $(cat store/.dashboard-token)" \
    "http://localhost:3420/api/memories?agent=<sajat>&q=<kulcsszo>" | ...)
  # 2. fuzd hozza a zaradekot, es ird vissza
  curl -s -X PUT http://localhost:3420/api/memories/<id> \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $(cat store/.dashboard-token)" \
    -d "{\"content\":\"$REGI [FELOLDVA <datum>: ...]\"}"
  ```
  A body-ban a `content` kötelező, a `category`/`tier`, `agent_id`, `keywords`
  opcionális. **A `PUT` a content-et CSERÉLI, nem fűzi hozzá** -- záradékoláshoz
  előbb olvasd ki a régit. `DELETE /api/memories/<id>` is létezik.
  ⚠️ **Ellenőrizd VISSZAOLVASSAL, ne a HTTP 200-zal:** a `{"ok":true}` csak azt
  mondja, hogy a sor létezett -- ez ugyanaz a no-op csapda, mint a push előtti
  `git diff --stat`.

  🔴 **És egy hiba, amit én követtem el ugyanebben a körben** (bubi mérte ki és
  javított, 2026-09-01): ide eredetileg azt írtam, hogy nincs `PUT` és `DELETE`,
  és nyers `sqlite3 update`-et javasoltam a flottának. **Egy grep alapján
  állítottam hiányt.** A `grep "'/api/memories"` csak a szó szerinti út-egyezést
  találja meg; a paraméteres útvonal viszont regexszel illeszt
  (`path.match(/^\/api\/memories\/(\d+)$/)`), ezért nem jött elő.
  **A grep NULLA találata nem a funkció hiányát méri, hanem a mintádét.**
  Ha egy végpontról azt akarod állítani, hogy nincs, akkor HÍVD MEG -- egy
  `curl -X PUT` olcsóbb, mint egy téves broadcast hat kollégának.
  Ez ugyanaz az osztály, mint a fenti (d): hiányt állítottam a hiány mérése nélkül.

  📌 **A NAP ÖSSZEGZÉSE, ÉS KÉT KÜLÖN JAVÍTÁSSAL** (bubi választotta szét,
  2026-09-01, és igaza van: egy kalap alatt a könnyebb felét jegyeznénk meg).
  Aznap négyszer állítottunk hiányt anélkül, hogy megmértük volna -- cím-minta a
  lakás-slugra, terminus-lista az ismeretlen azonosítóra, út-grep a paraméteres
  route-ra, `"id":57` az azonosság-egyezésre. A gyökér közös (*nem a dolgot
  mértük, hanem valamit, ami hasonlít rá*), a JAVÍTÁS viszont kettő:

  1. **SZOKÁS -- futtasd le az olcsó ellenpróbát, mielőtt hiányt állítasz.**
     Mind a négy esetben ott volt kézügyben (egy másik alakra kereső grep, egy
     `curl -X PUT`), és egyszer sem futott le, mert **a nulla találat magabiztosan
     néz ki.** A hiányt nem nehéz megmérni, csak nem jut eszünkbe, hogy kellene.
     Végpontnál hívd meg, jogosultságnál kérd le, fájlnál nyisd meg.
  2. **ESZKÖZ -- és a helyes eszközt a KORPUSZ MÉRETE dönti el, nem a hiba fajtája**
     (brokermarcsi rakta sorrendbe, miután jean kettéválasztotta). Három ág,
     ebben a sorrendben próbálva:
     - **elfér egy olvasásban** (egy 188 soros skill, egy `CLAUDE.md`, tíz-egynéhány
       saját emlék) -> **OLVASD EL, ne keress.** Itt a keresés nem gyorsítás, hanem
       kockázat, és cserébe nem is spórol semmit. **A mai négy hibánkból HÁROM ilyen
       korpuszon történt.** Ráadásul a végigolvasás olyat is talál, amiről nem
       tudtad, hogy keresed: brokermarcsi két legjobb mai találata (egy másik nyitott
       ügy bizonyítéka, és két saját emléke egymásnak ellentmondó SZÁMÍTÁSI RECEPTTEL)
       így jött elő. Egyik sem parser- és nem index-kérdés volt: az egyik korpusz
       szabad szöveg, a másik tíz képernyő, és a hiba két bejegyzés EGYMÁSHOZ képesti
       ellentmondása -- arra semmilyen minta nincs.
     - **nem fér el, de a kezedben van és van szerkezete** -> **PARSER**, lásd lent.
     - **nem is a kezedben van** -> **SZEREZD MEG A FORRÁST**, és utána az előző kettő.

  3. **ESZKÖZ (a) -- ne keress szövegben strukturált adatot** (brokermarcsi
     általánosítása). A JSON-nak és a forráskódnak is van SZERKEZETE, és amint
     szövegként grepelünk bele, önként lemondunk róla. A `grep '"id":57'` az
     `"id":570`-re is illeszkedik, egy `"id": 57` formázásra viszont némán nem
     talál; az út-grep pedig nem látja, hogy a route regexszel illeszt.
     **Ahol van parser, ott parsert használj** (JSON-nál `python3 -c`,
     azonosságnál egész számra hasonlíts), útvonalnál pedig tényleges hívást.
  4. **ESZKÖZ (b) -- ne az INDEXET kérdezd a KORPUSZ helyett** (jean választotta
     el a 2-estől, és a különbség nem árnyalat: ott rossz mintával kérdeztük a
     forrást, itt **meg se kérdeztük a forrást**). Egy Drive `fullText` keresés
     kihagyott egy PDF-et, amiben egy TELJES SZEKCIÓ szólt a keresett
     kifejezésről, miközben ugyanabból a mappából kettő mást megtalált. Itt nincs
     mit parseolni: a `fullText` nem szerkezet, hanem egy KÜLÖN RENDSZER, ami
     késhet, és sosem ígér teljességet.
     **Javítás: szerezd meg a forrást** -- töltsd le a fájlt, listázd a mappát,
     olvasd el a route-táblát -- és azon ellenőrizz.
     ⚠️ **Ez a legtágabb ág, mert amivel dolgozunk, az MIND index:** a Drive
     fullText, a Linear-, a HelpScout-, a Slack- és a wiki-kereső. Mindegyik
     alkalmas arra, hogy MIT olvass el; egyik sem arra, hogy kijelentsd, valami
     nincs.

  🔎 **Ellenőrzésnél a KIÍRÁS jobb, mint az igen/nem** (brokermarcsi öngólja,
  ugyanaznap): a `'bármelyik' in blokk` vizsgálata `False`-t adott, holott a szöveg
  tartalmazta -- csak nagybetűvel. **A boolean a mintádat méri, a kiírás a
  valóságot mutatja.** Ő azért nem hitt a `False`-nak, mert mellé kiíratta a teljes
  bekezdést. Egy `grep -c` vagy egy `in` teszt ezért gyanús zárás; írasd ki, amit
  találtál.

  ⚠️ **És ez a teszteidre is áll, nem csak a diagnózisra.** Ugyanaznap egy általam
  írt teszt bukott el azon, hogy `not.toContain('régi')`-t állított egy szövegre,
  amiben ott állt, hogy „a **régi**re hivatkozva". **Negatív állításhoz egyedi
  őrszemet használj** (`ZZ_ELAVULT_BLOKK_ZZ`), ne olyan szót, ami résznek is
  beleférhet a valódi tartalomba.
  ⚠️ **NE ÍRD KÖZVETLENÜL az SQLite-ot** (peppa és brokermarcsi mérése,
  2026-09-01): a `memories_au` trigger csak az FTS-indexet tartja szinkronban, az
  in-process TTL cache-t (`MEMORY_CACHE_TTL_MS = 60_000`) nem. A nyers `UPDATE`
  után a lekérdezés **egy percig még a RÉGI szöveget adhatja vissza** -- vagyis
  egy percig hazudik pont az az emlék, amit azért javítottál, hogy ne hazudjon.
  Az `updateMemory` és a `DELETE` route ezt elvégzi helyetted.

  🔴 **A ZÁRADÉK FÉLIG LÁTSZIK, és ezt tudni kell róla** (brokermarcsi mérése,
  2026-09-01): a `memories` táblán van `embedding` oszlop, és az csak
  MENTÉSKOR generálódik -- az `updateMemory` NEM nyúl hozzá. A záradékolt emlék
  embeddingje a záradék ELŐTTI szövegé marad, tehát **kulcsszavas kereséssel
  megtalálod a javítást, szemantikussal a régi jelentést kapod vissza.**
  Következmény: ha egy emlék annyira félrevezető, hogy a régi jelentése a
  szemantikus találatban sem jelenhet meg, ott a záradék KEVÉS -- új bejegyzés
  kell, a régire hivatkozva.

  - *(e) az emlék a SZÁNDÉKOT rögzíti megtörtént tényként.* jean mérése, 2026-09-01,
    a saját hibájából: egy hot bejegyzésbe beírta, hogy „X jelezve", MIELŐTT
    ténylegesen szólt volna. A jelzés aznap elmaradt, az emlék öt órán át azt
    állította, hogy megtörtént. **Ez rosszabb az elavulásnál: az elavult emlék
    valaha igaz volt, ez sosem.** És minden mai szűrőn átmegy -- friss, van benne
    dátum, és bent van a hot tierben.
    **Szabály:** a memóriába a MEGTÖRTÉNT lépést írd, és csak azután, hogy
    megtörtént. A szándék TEENDŐ-ként álljon, jövő időben -- akkor a hiánya LÁTSZIK.

  - *(f) két saját emléked ugyanarról a RECEPTRŐL mást mond.* brokermarcsi mérése,
    2026-09-01. Nem a (c) alfaja: ott az állapotot írta felül a későbbi munka, itt
    egy javítás ÚJ bejegyzésbe került, és a régiben bent maradt a hatályon kívüli
    ELJÁRÁS. Aki a régit kapja vissza elsőnek, rossz recepttel számol -- az ő
    esetében egy adóügyi bizonylaton. **A kínos rész, és ezért érdemes felírni:
    ugyanaznap reggel ő maga PUT-olta azt a bejegyzést, csak egy másik
    bekezdését.** A javítás közben az ember a javítandó bekezdést nézi, nem az
    egészet.
    **Szabály:** ha egy emléket javítasz, olvasd el az EGÉSZET, ne csak a javítandó
    bekezdést -- és a CSELEKVÉST leíró mondatokat nézd meg külön, mert azok a
    kockázatosak, nem a tény-mondatok.

  📐 **A ZÁRADÉK SORRENDJE SZÁMÍT** (bubi, 2026-09-01): elöl a HELYES állítás,
  alatta külön szakaszban a meghaladott („amit korábban hittem"). Ha a hatályon
  kívüli mondat áll a szöveg elején, a félig-olvasás -- ember és szemantikus
  találat egyaránt -- a rosszat viszi el.

  📐 **Mikor NEM elég a záradék** (peppa és marlenka egybehangzó mérése, 2026-09-01).
  A vízválasztó nem a szállítás, hanem hogy a régi JELENTÉS mire venné rá a
  következő olvasást:
  - a régi jelentés csak HIÁNYOS lesz -> a záradék elég;
  - a régi jelentés MÁS TEENDŐT sugall (nyitott -> lezárt, „pótlás kérve" ->
    „új kérdés áll") -> **ÚJ bejegyzés kell**, a régire hivatkozva, mert az új
    bejegyzés kap saját embeddinget. peppa nyolc záradékából ez egynél állt fenn,
    tehát ez nem az alapeset -- ne írj mindent újra.

  **Záradékolj, ne törölj -- de nem mindenre** (brokermarcsi pontosítása, elfogadva):
  - **TUDÁST záradékolj.** Ami azt rögzíti, MIT HITTÜNK a világról, ott a törlés a
    tanulságot is elviszi: eltűnik, hogy miért hittük korábban mást.
  - **MUNKAÁLLAPOTOT törölj.** A `hot` tier definíció szerint azt tartja, ami MOST
    történik. Ha záradékokkal töltöd fel, elveszti a funkcióját, mert nem lesz
    ránézésre látható, mi az aktív. A végállapot úgyis a lezáró bejegyzésben van.

  ⚠️ **Amit az API NEM véd, és amit ezért NEKED kell:** a `PUT` és a `DELETE`
  `WHERE id = ?`-re megy, gazda-szűrő nélkül; az `agent_id` mező a `PUT`-ban NEM
  szűrő, hanem **átsorolás másik gazdára**. Egy elgépelt id tehát MÁS ÁGENS
  emlékét írja át vagy törli. *Pontosítás (marveen mérése, 2026-09-01): ez nem
  jogosultsági rés, mert a flotta EGYETLEN közös dashboard-tokent használ (egy
  `.dashboard-token` van a gépen), tehát a szerver amúgy sem tudja, ki hív -- egy
  gazda-szűrő itt elgépelés elleni korlát lenne, nem hozzáférés-védelem.*
  🔴 **A rosszabbik fele, amit könnyű nem észrevenni** (brokermarcsi, 2026-09-01):
  ha az elgépelt `PUT`-ban `agent_id` is van, az a sort MAGÁRA IS SOROLJA a
  hibázóra. A károsult onnantól a SAJÁT listájában sem találja -- nem sérült
  emlék lesz belőle, hanem ELTŰNT. **Ha nem átsorolni akarsz, NE küldj `agent_id`-t.**
  És a visszaolvasás önmagában nem fogja meg: ugyanazzal az elgépelt id-vel
  olvasol vissza, a `GET` szépen visszaadja a másik sorát. **A visszaolvasásnál a
  megjelenő `agent_id`-t kell nézni, nem azt, hogy létezik-e a sor.**

  **Két olcsóbb szokás, mint bármelyik ellenőrzés** (jean és peppa mérése):
  1. **Az id-t soha ne gépeld be.** Vagy egy `?agent=<sajat>` szűrős `GET`
     válaszából jöjjön, vagy a saját `POST`-od visszakapott id-jéből. Ha a forrás
     már szűrt, nincs mit ellenőrizni utólag.
  2. ⚠️ **De a `?agent=` listázás MÁS ágensek `shared` emlékeit is visszaadja**, és
     nem kevesebbségben: 2026-09-01-én mérve a `?agent=bubi` listában **135 sorból
     112 volt idegen (83%)**, a `?agent=marveen`-ben 200-ból 98 -- utóbbi alsó
     korlát, mert a végpont 200-nál levág. Egy kevés emléket tartó ágensnél tehát
     a saját listája TÖBBSÉGÉBEN nem az övé.
     „Benne van a listámban" ezért NEM azt jelenti, hogy „az enyém" -- és pont a
     shared bejegyzések a legértékesebbek, mert azokat többen olvassák.
     **A tulajdont az `agent_id` MEZŐBŐL olvasd ki, ne abból, hogy a sor előjött.**
  ⚠️ **És ne `grep`-pel ellenőrizd az id-t** (jean fogta meg a saját javaslatomon):
  a `grep '"id":57'` illeszkedik az `"id":570`-re is, egy `"id": 57` alakú
  formázásra viszont némán nem talál. **Azonosságot egész számra hasonlíts,
  ne szövegrészletre** -- ez ugyanaz a hibaosztály, mint a fenti út-grep.
  A NÉGY hatókör tehát: **publikus repo** (a lenti szintek) > **wiki** (ugyanaz)
  > **memória** (a fenti két pont) > **munka-artefaktum** (semmi ebből).
  *(Számold meg a felsorolást: négy elem. 2026-09-01-én itt „három" állt, mert a
  számnév nem frissült, amikor a negyedik hatókör bekerült -- salesninja fogta meg.)*

  🟢 **A LAKÁS RÖVID NEVE NEM BLOKKOLÓ -- Tamás döntése, 2026-09-01 (msg 695).**
  Szó szerint: *„Mint például Király33? Vagy NagyDiófa14? Ez nem túl egyedi
  azonosító, nem probléma."* Az `<Utcanév><házszám>` alak egy ÉPÜLETET nevez meg,
  nem egy embert, és a hirdetéseinkben amúgy is nyilvános. **Én ezt túlbecsültem**
  és eszkaláltam is vele; a helyes szint a következő:
  - **rendben:** a lakás rövid neve épület szinten (`Király33`, `NagyDiófa14`)
  - **kerüld:** emelet/ajtó szintű azonosítás (`Példa12-2em3`), mert az már
    lakást azonosít, nem házat
  - **változatlanul blokkoló:** magánszemély teljes neve + pénzösszeg, beégetett
    Drive/Doc-ID, élő ügyfél-ügyszám, és a konkrét díjtételek (utóbbi nem
    érzékenységi, hanem elavulási okból -- lásd a „szám helyett hivatkozás" pontot)

  ⚠️ **A tanulság a MÉRÉSRŐL viszont áll, és nem évül el ezzel:** a slug-alakot
  sem a cím-grep, sem a kézi terminus-lista nem fogja. Attól, hogy ez a konkrét
  találat nem volt baj, a VAKFOLT megmarad -- a következő ugyanilyen alakú
  találat lehet emelet/ajtó szintű vagy egy ügyszám.
  **Ha ilyet találsz, ne dönts helyette:** a többit vidd fel, az érintettet tartsd
  vissza, és kérdezd a gazdát ajánlással. A hosszútávú megoldás nem a kihagyás,
  hanem a sanitizálás (a név a kérésből, az ID configból jöjjön), mert a
  verziózatlan fájl csak addig létezik, amíg a lemez.

- 🔴 **A LAKÁS-AZONOSÍTÓ SLUG-ALAKBAN átcsúszik a cím-grepen, és a saját
  `leak-check.py` sem fogja, ha KÉZZEL adod meg a terminusokat.** 2026-09-01:
  egy árazási skill új szakasza ötször tartalmazott egy `<Utcanev><hazszam>-<emelet><ajto>`
  alakú azonosítót. A cím-minta (`utca|körút|<irsz> Budapest`) NEM fogta, mert a
  slugban nincs se szóköz, se az „utca" szó; a `leak-check.py` pedig nullát adott,
  mert kézzel beírt terminusokat kapott -- **pont az a hiba, ami ellen készült.**
  SZEMMEL találtam meg, nem méréssel.
  **Következmény:** publikálandó ÁRAZÁSI vagy LAKÁS-témájú szövegnél a
  `leak-check.py` terminusait a futásidejű forrásból kell szedni
  (`--terms-from-json` a lakás-configra, `--terms-from-dir` az assets-re) --
  a `--term` kézi felsorolás csak kiegészítés. Ha nincs ilyen forrás kéznél,
  akkor a szakaszt EL KELL OLVASNI, és ezt mondd is ki a jelentésben:
  „szemrevételezés, nem mérés".
  Ugyanez áll az élő ügyfél-ügyszámra (HelpScout-jegy) és a konkrét összegekre:
  egyik sem titok, mindhárom blokkoló egy publikus repóban.
  ✅ **A MŰKÖDŐ MEGOLDÁS: ne TERMINUST keress, hanem ALAKOT** (bubi, 2026-09-01).
  A terminus-lista csak azt fogja, amit már ismersz; az alak-minta az ISMERETLEN
  új azonosítót is:
  ```bash
  # lakas-slug: Nagybetu + betuk + szamjegyek (Pelda12, Pelda12-3em4)
  grep -noE '\b[A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüűa-z]{2,}[0-9]+[a-z0-9-]*' <fajl>
  # elo ugyszam: 4-6 jegyu szam, az evszamok kiszurve
  grep -noE '\b[0-9]{4,6}\b' <fajl> | grep -vE ':(19|20)[0-9]{2}$'
  ```
  **Mérve ugyanaznap, és többet talált, mint amiért indult:** egyetlen futásra
  kifogta a frissen írt szakasz azonosítóját ÉS egy MÁSIK szerző 15 napja bent
  álló lakás-nevét ugyanabban a fájlban (a `116e06a` commit óta, 2026-08-17).
  Azt a kört a szokásos titok- és cím-szűrés tisztának minősítette.
  **Ez a kettő nem alternatíva, hanem sorrend:** előbb az alak-minta (ismeretlen
  azonosítók), utána a `leak-check.py` futásidejű terminusokkal (ismert nevek).
  A kézi `--term` felsorolás a leggyengébb, és önmagában NEM elég.
  🔴 **De a MINTA SZŰR, NEM DÖNT** (bubi fogalmazta meg, 2026-09-01). A találat
  annyit mond, hogy *nézz rá* -- nem azt, hogy ki kell venni. Ha a kettőt
  összemosod, TÚLSZIGORÍTASZ, és a szűrés a skilleket szegényíti: aznap két
  sanitizálás közül csak az egyik volt indokolt (az emelet/ajtó szintű), a másik
  (épület szintű lakásnév) az én túl szigorú olvasatom miatt ment ki.
  A találatra a fenti szint-lista dönt, nem a minta.
- 🔴 **TÜKRÖZÖTT fájlnál az ÉLŐ példányt sanitizáld, ne a forkot -- különben a
  következő szinkron visszateszi.** 2026-08-31, peppa érve, és jobb volt az enyémnél:
  ha csak a `gg-skills/` alatti másolatból veszed ki az érzékeny részt, az élő skill
  változatlan marad, és a legközelebbi `--fix` újratermeli a szivárgást. Az eltérés
  tehát nem maradhat fork-only. A helyes sorrend: (1) a szerző javítja az ÉLŐ
  példányt, (2) `gg-skill-tukor-sync.sh --fix` az élőből, (3) push-lánc, (4) és a
  bizonyíték a REMOTE oldalon: `git show origin/main:<útvonal> | grep -c <minta>`
  legyen 0. A `--fix` iránya itt nem opcionális: élő -> tükör, sosem fordítva.

- 🔴 **Egy publikus repóban a KONKRÉT SZÁM elavul, a HIVATKOZÁS nem -- és az elavult
  nyilvános szám rosszabb, mint a semmi.** Ugyanaznap, ugyanattól: a felmondási
  folyamat két díjtétele nem titok (a tulajnak levélben pont ezt írjuk), mégis
  kikerült a publikus változatból, mert egy repóban megáll az időben, és később
  valaki egy elavult összeget fog belőle idézni. Helyette a wiki-oldalra mutató
  figyelmeztetés került be, hogy az összeget minden alkalommal onnan kell kiolvasni
  -- ettől a skill pontosabb is lett, nem szegényebb.
  **A szabály általánosítva:** ami kifelé megy és IDŐBEN VÁLTOZIK (ár, díj, kvóta,
  határidő, verziószám, létszám), oda a forrás kerüljön, ne az érték. Ez akkor is
  áll, ha a szám ma helyes -- épp az a baj, hogy ma helyes.
  ⚠️ **De hogy céges kereskedelmi feltétel EGYÁLTALÁN mehet-e publikus repóba, az
  nem a te döntésed, és nem is a szerzőé.** Ez a gazdáé. Addig a szűkebb (szám
  nélküli) változat álljon, és a kérdést jelezd -- egy visszatétel egy sor, egy
  kikerült ár visszavonása nem az.

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
- 🔴 **A szkript 3. lepesenek `--stat` kimenete NEM azt mutatja, mi kerul a `main`-re.**
  A `gg-push-lanc.sh` az agat az `origin/develop`-hoz meri, es ha a `develop` a `main`
  MOGOTT all (mert az elozo kor a `develop -> main` PR-rel zarult, de a develop azota
  nem kapott ujabb merget), akkor ez a diff a te fajljaid MELLE beveszi mindazt, ami a
  main-en mar bent van, a developen viszont meg nincs. 2026-08-27: negy SKILL.md-t
  vittem fel, a verifikacio megis **12 fajlt** listazott (`morning-briefing.sh`,
  `onellenorzes.sh`, `update.sh` es tarsai) -- egy pillanatra ugy nezett ki, mintha az
  agam idegen valtozasokat vinne. Nem vitt.
  **A helyes meres a lanc UTAN fut, es a MAIN ket allapotat hasonlitja:**
  ```bash
  git fetch origin --quiet
  git diff --stat <a lanc ELOTTI main sha> HEAD    # pontosan a sajat fajljaid
  git rev-parse HEAD origin/main                   # a ketto egyezzen
  ```
  Ezert jegyezd fel a lanc INDITASA elott a `git rev-parse HEAD`-et -- utolag mar
  nehezebb megmondani, honnan indultal.
- 🔴 **A `git fetch origin <ag>` AUTH-ot ker, a sima `git fetch origin` NEM -- es ez
  a lanc 3. lepeset allitja meg.** 2026-08-31 13:00: ugyanaz a szkript, ami reggel
  otszor vegigment, a verifikacional elhasalt:
  `fatal: could not read Username for 'https://github.com'`. A push (proxyn at) es a
  `git fetch origin` / `git pull --ff-only origin main` (anonim, alap refspec)
  tovabbra is ment; kizarolag az EXPLICIT ag-nevre valo fetch kert hitelesitest.
  **Az ag ilyenkor MAR FENT VAN, tehat a munka nem veszett el** -- csak a PR-lanc
  maradt el. A `--resume` sem segit, mert ugyanazon a lepesen bukik.
  **A kezi befejezes, ami mukodott:**
  ```bash
  git fetch origin --quiet                       # alap refspec: ez megy
  git rev-parse --short origin/<ag>              # a mar lehuzott remote ref
  git diff --stat origin/main origin/<ag>        # pontosan a sajat fajljaid?
  ```
  majd a PR-lanc a MCP-toolokkal (`github_open_pr` -> `github_merge_pr` ketszer),
  mert azok a proxyn at hitelesitenek, nem a git credential helperen.
  ⚠️ **Ugyanaznap 13:30-ra a sima `git fetch origin` IS elzarodott** (valoszinuleg
  anonim rate limit), tehat a fenti kezi recept sem volt hasznalhato: nem volt
  `origin/<ag>` ref. **Ilyenkor a verifikacio is MCP-n megy:**
  ```
  github_read_file(repo: "marveen", path: "<utvonal>", ref: "<ag>")
  ```
  Ez a remote tartalmat adja vissza, tehat pontosan azt bizonyitja, amit a
  `git show origin/<ag>:<utvonal>` bizonyitana -- csak hitelesitett uton.
  A sorrend altalanosan: git (olcso) -> ha elzarodik, MCP (mindig megy).
  Fel ora mulva az anonim fetch magatol visszajott, tehat ez atmeneti allapot;
  ne kezdj credential helpert allitani miatta.
  ⚠️ **Es egy csapda a vegen: a `gg-skill-tukor-sync.sh` ilyenkor ZOLDET mutat,
  miközben az origin meg nem tud a fajlrol.** A meroje `git ls-files`, ami a LOKALIS
  commitot latja -- a szkript lokalisan mar commitolt, mielott a lanc elszallt.
  A tukor-paritas tehat a lanc befejezese elott NEM bizonyitek; a bizonyitek
  `git rev-parse HEAD origin/main` egyezese.
- 🔴 **AZ ELHASALT PATCH IS FELMEGY, ha a shell nem áll meg -- és a commit-üzenet
  ilyenkor HAZUDIK.** 2026-09-01, kétszer egy nap: a `python3 - <<'EOF'` blokkom
  `SyntaxError`-ral elszállt (idézőjel-keverés), a fájl változatlan maradt, a
  következő sorban induló `gg-push-lanc.sh` viszont lefutott, és felvitt egy
  NO-OP commitot „fix: a számnév javítása" üzenettel. A hiba a képernyőn ott
  volt, csak nem állította meg a láncot.
  **Eljárás:** a patch és a push között legyen kapu, ne újsor:
  ```bash
  python3 - <<'PY' && echo "PATCH OK" || { echo "PATCH FAILED"; exit 1; }
  ... assert-ekkel ...
  PY
  grep -c "<az UJ szoveg>" <fajl>    # 1 legyen
  grep -c "<a REGI szoveg>" <fajl>   # 0 legyen
  git diff --stat <fajl>             # van-e egyaltalan valtozas
  ```
  A `git diff --stat` a legolcsóbb: ha üres, nincs mit pusholni, és a commit
  üzenete máris hamis lenne.
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
