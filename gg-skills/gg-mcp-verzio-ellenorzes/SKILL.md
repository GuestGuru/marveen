---
name: gg-mcp-verzio-ellenorzes
description: Megállapítani, hogy a futó gg-mcp szerver a legfrissebb kódot futtatja-e, és miben tér el a lokális /home/gg/gg-mcp a GuestGuru/gg-mcp main ágától. Triggerelődik - "a legfrissebb gg mcp fut?", "látod a gg-mcp repót?", "melyik verzió megy", hiányzó/új tool a gg_allowed_tools-ban, gyanú hogy a szerver régi buildet futtat.
---

# gg-mcp verzió-ellenőrzés (futó build vs. repo)

## Mikor használd

- Tamás azt kérdezi, a legfrissebb gg-mcp fut-e, vagy hogy látod-e a repót.
- Egy tool eltűnt / megjelent / máshogy viselkedik, mint a doksi állítja.
- Deploy vagy build után el kell dönteni, kell-e nekem restart.

## Eljárás

1. **Melyik binárist futtatom.** A szerver a `.mcp.json`-ból indul:
   ```bash
   cat .mcp.json            # gg-access -> node /home/gg/gg-mcp/dist/index.js
   ps -eo pid,lstart,args | grep gg-mcp | grep -v grep
   ```
   Az én stdio-szerverem az a `dist/index.js` processz, aminek az indulási ideje
   egybeesik a saját session-öm indulásával. A `dist/http.js` és a
   `.gg-mcp/proxy.bundle.js` MÁS ágensek útja, azok frissülése engem nem érint.

2. **Build frissebb-e a forrásnál.** Ha `dist/index.js` mtime > a legfrissebb
   `src/**/*.ts` mtime, a build naprakész a lokális forráshoz képest:
   ```bash
   ls -l --time-style=long-iso /home/gg/gg-mcp/dist/index.js
   find /home/gg/gg-mcp/src -name '*.ts' -printf '%T+ %p\n' | sort -r | head -3
   ```
   Ha a szerver-processz indulása KORÁBBI, mint a build ideje, restart kell.

   **A restart SÜRGŐSSÉGÉT a tool-diff mondja meg, nem a STALE-jelzés.** Egy belső
   refaktor ráér reggelig; egy új tool viszont azt jelenti, hogy a képességed hiányzik,
   és erről magadtól sosem értesülnél. Mérd meg, MI változott:
   ```bash
   grep -ohE '"(gg|gg3|sales|channex|github|sentry|gcp|irnok|wiki|slack)_[a-z_]+"' \
     /home/gg/gg-mcp/dist/tools/*.js | tr -d '"' | sort -u
   ```
   és vesd össze a FUTÓ sessionöd `gg_allowed_tools` kimenetével — ami a listában van, de
   nálad nincs, az a most hiányzó képesség. 2026-08-10 20:00: a 19:34-es build három új
   toolt hozott (`gg3_read`, `gg3_write_plan`, `gg3_write_apply`), amiről egyik futó
   session sem tudott. A forrásoldali `find src -newermt '<build előtti idő>'` megmutatja
   a témát is (akkor: `gg3.ts`, `gg3-muveletek.ts`, `gg3-hasura.ts`).

   ⚠️ **A `gg-mcp-http` service ÚJRAINDUL a builddel, a stdio-kliensek NEM.** Aznap a
   HTTP-processz 4 másodperccel a build után már a friss kódon futott, miközben minden
   stdio-session a régin maradt. Ezért a HTTP oldaláról nézve „minden rendben" — ne abból
   következtess a saját állapotodra, hanem a saját processzed indulási idejéből.

3. **Lokális vs. remote (a lényeg).** A `/home/gg/gg-mcp` NEM git checkout
   (nincs `.git`), tehát `git fetch`/`git status` nem megy. Helyette blob-hash
   összevetés a GitHub tree-vel — a `hibareprodukalo` csomag elég hozzá:
   ```
   github_request(url="https://api.github.com/repos/GuestGuru/gg-mcp")           # pushed_at, default_branch
   github_request(url="https://api.github.com/repos/GuestGuru/gg-mcp/git/trees/main?recursive=1")
   ```
   A tree válaszát a rendszer fájlba menti (túl nagy), abból párosítsd:
   ```bash
   python3 - <<'EOF'
   import re, subprocess, os
   P='<a mentett tool-result fajl utja>'
   s=open(P,errors='replace').read()
   entries=re.findall(r'"path":\s*"([^"]+)".*?"type":\s*"(\w+)".*?"sha":\s*"([0-9a-f]{40})"', s, re.S)
   for p,t,sha in entries:
       if not (p.startswith('src/') and t=='blob'): continue
       lp=os.path.join('/home/gg/gg-mcp',p)
       lsha=subprocess.run(['git','hash-object',lp],capture_output=True,text=True).stdout.strip()
       if lsha!=sha: print('ELTER:', p)
   EOF
   ```
   A `git hash-object` git repo NÉLKÜL is működik, ezért jó ide.

4. **Az eltérő fájlokat nézd meg tartalmilag** (`github_read_file` + `diff`),
   és mondd meg, viselkedés-változás-e vagy csak doksi/leírás. A leírás-only
   eltérés nem indokol restartot.

5. **Kereszt-ellenőrzés futásidőben.** A `gg_allowed_tools` kimenete megmutatja,
   melyik nagy változás van már benne (pl. a 97 -> 57 toolos per-user
   kulcs-kiadás után az `elerheto` + `nincs_jogod` együtt 57, és van
   `kulcs_kiadas` szekció).

## Buktatók

- **Ha megváltoztatod egy komponens transzportját, a rá néző MONITOR is elavul
  (2026-08-12).** A `scripts/gg-mcp-health.py` „él-e" jele a stdio
  gyerekprocessz volt. Amikor a főágens HTTP-re állt, a monitor DEAD-et
  jelentett rá — miközben a toolok bizonyíthatóan éltek. A hamis riasztás
  drágább, mint amilyennek látszik: egy félóránként hazudó monitorra mindenki
  leszokik figyelni, és pont ez az a mechanizmus, ami miatt a 2026-08-08-i néma
  kiesés két napig tartott. **Architektúra-változás után kötelező kérdés: mit
  feltételez erről a monitor?**
  A javítás (PR #22, `main`-en) két új, NEM hibás státuszt vezetett be:
  `remote` (távoli végpont: TCP-vel kérdezzük, nem gyereket keresünk) és
  `unknown` (a `.mcp.json` az indítás UTÁN változott, tehát a lemezen lévő
  deklaráció nem az, amit a session betöltött). Ezek nem számítanak bele a
  `problems`-be és nem viszik el az exit-kódot.
  ⚠️ **A `remote` `ok` KEVESEBBET bizonyít, mint a stdio `ok`:** az élő socket a
  szolgáltatást igazolja, NEM azt, hogy az ágens tokenjét még elfogadják. Ha egy
  HTTP-s ágens „ok", de mégis jogot panaszol, a `gg_allowed_tools` a döntő, nem
  az egészségőr.
- **A „fut-e egyáltalán" kérdést a „friss-e" ELŐTT tedd fel — és NE csak magadra.**
  Ez a skill sokáig csak azt nézte, elavult-e a build. 2026-08-08-án a
  `salesninja` (Péter botja) stdio szervere **csendben kilépett**, és két napig
  senki nem vette észre. Ennek a hibának nincs semmilyen jele: a Claude Code nem
  indítja újra, a szerver nem ír több log-sort (az utolsó bejegyzés a
  session-startkori `gg-mcp up` marad), és **maga az ágens sem tudja** — csak
  megszűnnek látszani a `gg_*` toolok. Az egyetlen megbízható jel a
  processz-tábla. Flottaszinten egy paranccsal:
  ```bash
  python3 /home/gg/marveen/scripts/gg-mcp-health.py   # exit 0 = mind ok, 1 = van DEAD/STALE
  ```
  `DEAD` = deklarál `gg-access`-t, de nincs élő szerver-gyerekprocessze.
  `STALE` = él, de a session régebbi a buildnél. Automatikusan is fut:
  `gg-mcp-health` ütemezés, 2 óránként, heartbeat (csak baj esetén szól).
- **A `STALE`-t nem javítja az MCP újraindítása, csak a SESSION restartja.** A
  stdio gyerek egyszer, session-startkor spawnol, és a session élettartamáig él.
  Ezért elég a session indulási idejét a `dist/index.js` mtime-jához mérni — ha
  korábbi, felülírt kódot futtat, akármit csinálsz a szerverrel.
- **A dashboard/channels újraindítása MEGÖLI a fő-ágens saját `gg-access`
  gyerekét — tehát a GG-s munka ELŐBB, a restart UTÁNA.** A `scripts/stop.sh`
  leállítja a `${SLUG}-channels` szolgáltatást és kilövi a `marveen-channels`
  tmux sessiont; a stdio gyerek a sessionnel együtt hal, és a fenti szabály
  szerint nem jön vissza magától. 2026-08-12-én pont fordítva csináltam (előbb
  restart a sablon élesítéséhez, utána jött volna a GG-munka), és órákig
  eszköztelen maradtam; csak szerencse, hogy a PR-lánc már lement.
- **DEAD-nél NE a token-fájlt kezdd hibáztatni.** A tünet („nincs egy `gg_*`
  toolom sem") tokenhibának látszik, de a token-fájl ilyenkor rendben van. A
  sorrend: (1) processz-tábla / `gg-mcp-health.py`, (2) csak ha ott ok, akkor
  token. 2026-08-12: `tokens/marveen.token` végig a helyén és érvényes volt (a
  restart utáni `gg_allowed_tools` teljes csomaglistát adott vele), a hiba
  tisztán a halott gyerekprocessz volt.
- **Sub-ágens restartja `{"fresh": true}`-val menjen** (`POST
  /api/agents/<nev>/restart`). A `--channels` plugin mérten csak friss
  induláskor töltődik be megbízhatóan; `--continue` megőrzi a kontextust, de
  néma bot lehet a vége. Fresh indulásnál viszont a `taskstate-replay` hook NEM
  fut (matcher: `compact|resume`), ezért **restart ELŐTT** kérd meg az ágenst,
  hogy mentsen memóriát és írjon taskstate-et, utána pedig szólj neki, hogy
  olvassa vissza. Idegen tulajdonosú ágenst (pl. Péteré) sose indíts újra
  magadtól.
- **A nagy MCP-válasz fájlba mentve JÖN, és a fájl 60 000 karakternél VÁGVA
  van.** A `jq` és a `json.loads` ilyenkor "Invalid numeric literal" /
  "Unfinished string at EOF" / "Invalid control character" hibát ad — ez NEM a
  te parancsod hibája, hanem csonka JSON. Megoldás: regexszel szedd ki a
  kellő mezőket (`re.findall`), vagy kérj szűkebb választ. Ne pazarolj több
  kört a jq-ra.
- **A mentett fájl első két sora nem JSON**: `hasznaltFiok: GuestGuru` +
  üres sor előzi meg a tömböt. A `tail -n +3` sem elég, ha a fájl csonka —
  keresd meg az első `[{` pozíciót.
- **Ne a `/home/gg/gg-mcp`-t próbáld gitesíteni.** Nincs benne remote, és a
  húzás/build Tamás dolga; nekem csak restart jár utána.
- **Ne keverd a proxy-t a szerverrel.** A `dist/proxy.bundle.js` frissülése
  (más gép ágense használja) nem jelent elavult stdio-szervert nálam.
- Az mtime-ok CEST-ben vannak, a GitHub dátumok UTC-ben. Nyáron +2 óra a
  különbség — enélkül fordítva tűnik, melyik a frissebb.

## Ellenőrzés

- Meg tudod nevezni a szerver PID-jét, az indulási idejét és a futtatott build
  mtime-ját.
- Meg tudod nevezni, HÁNY src fájl tér el a maintől, és mindegyikről, hogy
  viselkedés vagy csak leírás.
