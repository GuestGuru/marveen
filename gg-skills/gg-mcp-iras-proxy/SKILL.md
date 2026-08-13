---
name: gg-mcp-iras-proxy
description: git push GG repóba (nagy vagy generált fájl - lockfile, install script, bundle -- amire a github_commit alkalmatlan), és írás olyan GG-rendszerbe, aminek a gg-mcp toolja csak olvas (pl. Linear issue a linear_query mellett). A kulcsot a gg-mcp-proxy exec adja a gyerek-processz env-jébe, a beszélgetésbe soha. Triggerelődik - "git push nem megy", nagy fájl feltöltése, package-lock vagy bundle módosítása, "hozz létre issue-t", "vegyél fel egy ticketet", "mutation not allowed", "fail-closed", 401 egy GG API-n.
---

# Írás GG-rendszerbe a gg-mcp proxyn keresztül

## Mikor használd

Amikor egy GG-rendszerbe ÍRNI kell, de a hozzá tartozó gg-mcp tool csak olvas.
Tipikus eset: `linear_query` kifejezetten fail-closed mutációra, viszont a Linear
issue-t létre kell hozni. Ugyanez a minta minden olyan aliasra, aminek van kulcsa
az 1Password `GG System` vaultjában.

Ne használd, ha van dedikált írás-tool (`sales_write_request`,
`sentry_write_request`, `gg_wiki_create`, `github_open_pr` stb.) -- azt hívd,
mert ott van a jogosultsági kapu és az audit.

Kivétel, ahol a proxy mégis jobb: **git push egy GG repóba.** A dedikált
`github_commit` a fájlok TELJES új tartalmát JSON-ban tolja át, ezért nagy vagy
sok generált fájlnál (web-bundle, lockfile) alkalmatlan -- pár sornyi változásért
is megabájtokat küldene a kontextuson át, és a commit-történetet is ellapítja.
Ilyenkor a `github` alias kulcsával nyers `git push` a helyes: git-protokoll,
tömörített delta, pontos SHA-k, teljes történet. A token `GIT_ASKPASS`-on át megy,
nem az URL-be.

## Eljárás

1. Kérd le, mi az alias és mit tud: `gg_secret_get` alias nélkül listáz.
2. A kulcsot NE kérd ki `gg_secret_get`-tel, ha csak futtatni akarsz vele.
   Amit az kiad, az bekerül a kontextusba és onnan nem hívható vissza.
   Helyette a proxy `exec` alparancsa, ami a kulcsot CSAK a gyerek-processz
   env-jébe teszi.
3. A payloadot előbb írd fájlba (python3 + json.dumps), ne a parancssorban
   idézőjelezd. Hosszú markdown leírásnál ez az egyetlen épeszű út.
4. Futtatás:

   ```bash
   GG_MCP_TOKEN_FILE=/home/gg/gg-mcp/tokens/<agent>.token \
   GG_MCP_AGENT_LABEL=<label> \
   node /home/gg/gg-mcp/dist/proxy.js exec --alias <ALIAS> -- \
     sh -c "curl -s -X POST <API_URL> \
       -H 'Content-Type: application/json' \
       -H \"Authorization: \$<ENV_NEV>\" \
       -d @/abs/ut/payload.json"
   ```

   A `GG_MCP_TOKEN_FILE` és a `GG_MCP_AGENT_LABEL` értékét a **SAJÁT ágensed**
   `.mcp.json`-jából vedd (`/home/gg/marveen/agents/<sajat_neved>/.mcp.json`;
   fő-ágensként `/home/gg/marveen/.mcp.json`). Mindkettőt ADD MEG EXPLICITEN —
   ha kihagyod, a shell-út a FŐ-ÁGENS identitásával fut, l. a Buktatók piros pontját.

5. Ellenőrizd a választ: a `data` ág megléte a siker, nem a curl exit kódja.

## Buktatók

- **Az env-változó neve NEM `GG_SECRET`.** A dokumentáció ezt említi
  alapértelmezésként, de a proxy a kulcs saját nevét használja, ha van neki
  (Linearnél `LINEAR_API_KEY`). Ha `GG_SECRET`-tel hívod, 401-et kapsz
  authentication error-ral. A proxy az első kimeneti sorában KIÍRJA a helyes
  nevet: "a(z) '<alias>' kulcs a(z) <NEV> env-változóban van". Olvasd el, ne
  találgass.
- **A `gg-mcp-proxy` nincs a PATH-on.** `command not found`. A bináris
  `/home/gg/gg-mcp/dist/proxy.js`, `node`-dal indítva.
- **A `/home/gg/.local/bin/gg-mcp-proxy` wrapper JAVÍTVA (2026-08-11), használható.**
  Előtte a `marveen-bot-teszt.token`-t hardkódolta, ami a portál `/api/me/access`-én
  **401** (`{"error":"unauthorized"}`) — ahogy a `marveen-main.token` is. Nem lejárat
  volt, hanem elhagyott identitás: a `.mcp.json` 2026-08-08 óta a `marveen.token`-re
  váltott, a wrapper nem követte. **A javítás nem az útvonal átírása, hanem a
  másolás megszüntetése**: a wrapper futásidőben olvassa ki a `.mcp.json`-ból, tehát
  a következő identitás-váltást magától követi. Tiszteletben tartja az előre
  beállított `GG_MCP_TOKEN_FILE`-t is, így sub-ágens a SAJÁT identitásával futtathatja.
  A `.dead` végű token-fájlok kivezetettek, ne nyúlj hozzájuk (l.
  `/home/gg/gg-mcp/tokens/README.md`, ott a teljes leltár).
  Ha mégis a proxyt hívnád közvetlenül (pl. más gépen), a saját tokenedet így vedd.
  ⚠️ **A `MCP_JSON` a TE ágensed `.mcp.json`-ja, NE a főágensé** — l. a következő pontot:
  ```bash
  # fő-ágens: /home/gg/marveen/.mcp.json | sub-ágens: /home/gg/marveen/agents/<sajat_neved>/.mcp.json
  MCP_JSON=/home/gg/marveen/agents/<sajat_neved>/.mcp.json
  TF=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['mcpServers']['gg-access']['env']['GG_MCP_TOKEN_FILE'])" "$MCP_JSON")
  GG_MCP_UPSTREAM_URL=http://127.0.0.1:3450 GG_MCP_TOKEN_FILE="$TF" \
    GG_MCP_AGENT_LABEL="marveen/<sajat_neved>" node /home/gg/gg-mcp/dist/proxy.js exec ...
  ```
- 🔴 **A SHELL-ÚT NEM VISZI MAGÁTÓL A TE IDENTITÁSODAT — a főágensét viszi.** Ez a
  legdrágább buktató a lapon, mert némán működik és utólag látszik. A `gg-mcp-proxy`
  wrapper, ha a `GG_MCP_TOKEN_FILE` NINCS előre beállítva a környezetben, kiolvassa a
  `/home/gg/marveen/.mcp.json`-t, ami a FŐ-ÁGENS tokenje. Az MCP-úton (sima `gg_*`
  toolok) ez nem gond, ott a saját `.mcp.json`-od visz — csak a shellben csúszik el.
  **Nem névcsere, hanem JOGCSERE**: a főágens teljes jogával írsz, és az audit is őt
  látja, nem téged.
  Mérés (2026-08-13, GG-559): jean 12:40:34Z-kor `gg_allowed_tools`-t hívott, az
  `imrenyi.eszter@guest.guru` néven ment el; **kilenc másodperccel később**, 12:40:43Z-kor
  ugyanaz az ágens `gg_secret_get — linear`-t hívott, és az már `krasser.tamas@guest.guru`
  néven. A GG-559 komment 13:25:07.220Z-kor Krasser Tamás szerzővel jött létre, 156 ms-mal
  a kulcskérés után. Egy munka, két út, két identitás.
  ⚠️ **Ezt a hibát 2026-08-13-ig ez a skill maga terjesztette**: a fenti példaparancs
  beégetve tartalmazta a `/home/gg/marveen/.mcp.json` útvonalat, tehát aki a leírást
  követte, a főágens nevében írt. Ezért lett a példa paraméteres.
  **Ellenőrzés minden shell-úti írás előtt:** hívd meg a `gg_allowed_tools`-t, és nézd
  meg az `en` mezőt. Ha nem a saját gazdád e-mail címe van ott, ÁLLJ MEG.
  **Ha választhatsz, a `gg-mcp-proxy` alakot használd, ne a csupasz `node .../dist/proxy.js`-t.**
  A wrapper 2026-08-13 óta fail-closed: identitás nélkül megáll egy magyarázó hibával.
  A közvetlen node-hívás ezt megkerüli, és a `proxy.ts` ott a `$HOME/.gg-mcp/token`-re
  esik vissza. Ma ez ártalmatlan, mert az a fájl ezen a gépen nem létezik — de ez
  szerencse, nem védelem, ezért az egészségőr riaszt, ha megjelenik
  (`ambient_token_trap`, marveen PR #32). ⚠️ Az a default NEM elhagyott maradék:
  egy KLIENS-gépen pont ott van a felhasználó saját tokenje (`install-proxy.mjs`,
  `CEL_DIR`), tehát ott helyes. A baj az, hogy ezen a gépen több ágens ül egy POSIX
  user mögött. (marlenka mérése, 2026-08-13.)
- **Halott tokent HTTP-kóddal NEM lehet detektálni.** A loopback (`127.0.0.1:3450`)
  **200**-at ad érvénytelen tokenre is; a 401 a válasz JSON body-jában jön a portál
  `/api/me/access` hívásáról. Aki `%{http_code}`-ra épít, azt fogja hinni, minden jó.
  Mindig a body-ban keress `401`-et.
- **A wrapper generált fájl** (forrás: gg-mcp `src/install-proxy.ts` `proxyExecWrapper`,
  `tokenFile` paraméter), de a marveen-en lévő példány kézi paraméterezésű: a
  `npm run install:proxy` a kliens-gépekre szánt `CEL_DIR/token`-t és a bundle-t
  tenné be, ami itt rossz. Vagyis újratelepítés felülírná a javítást — ha valaki
  mégis lefuttatja, ezt a fájlt kell újra származtatóra állítani.
- **`exec` nélkül a proxy MCP-szervert indít és ott ül.** Ha lefagyni látszik,
  lemaradt az `exec` alparancs.
- **Az env-behelyettesítés a gyerek shellben kell történjen.** A külső shell a
  még nem létező változót üres stringre cseréli. Ezért kell a lánc végére
  `sh -c '... "$NEV" ...'`, és a `$`-t escape-elni, ha a külső parancsot
  dupla idézőjelben adod meg.
- **Linear GraphQL-nél az `Authorization` fejlécben NINCS `Bearer`** személyes
  API-kulcsnál, csak a nyers kulcs.
- **Meglévő Linear issue módosításánál a `description` FELÜLÍRÓDIK, nem bővül.**
  Az `issueUpdate` a teljes mezőt cseréli, tehát ha a meglévő leírás mellé akarsz
  írni (átvétel, munkaterv, státusz), előbb KÉRD LE a jelenlegi `description`-t,
  Pythonban fűzd hozzá az új szekciót, és a teljes új szöveget küldd vissza.
  Aki csak az új szekciót küldi, kitörli az eredeti feladatszöveget, és a Linear
  nem kérdez vissza. Idempotencia: a hozzáfűzés előtt nézd meg, benne van-e már a
  szekció címe, különben minden futás duplikálja. (2026-08-12, SAL-455 átvétel.)
- **Az `issueUpdate` és a lekérdezés `id` argumentuma elfogadja az emberi
  azonosítót** (`"SAL-455"`), nem kell hozzá az UUID. A `commentCreate`
  `issueId`-je viszont már az UUID-t kéri, azt az issue-lekérdezésből vedd ki.
- **A Linear ÁTÍRJA a beküldött markdownt, és ezt nem lehet kikapcsolni.** Nem
  hiba és nem adatvesztés, de aki a hosszt hasonlítja össze, azt hiszi, elromlott
  valami. 2026-08-13, MAR-148: a 8618 karakteres leírás 10061-ként jött vissza.
  Amit a szerkesztő csinál: a `-` listajelet `*`-ra cseréli, és MINDEN csupasz
  URL-t linkké alakít `[szöveg](<url>)` alakban. A tartalom ép marad, és ezt
  ellenőrizni is lehet: fejtsd vissza a normalizálást, és úgy hasonlítsd össze.
  ```python
  n = re.sub(r'\[([^\]]*)\]\(<[^>]*>\)', r'\1', remote)
  n = re.sub(r'^\* ', '- ', n, flags=re.M)
  assert n.strip() == local.strip()
  ```
  ⚠️ **A mellékhatás az auto-linkelés.** Nem csak a valódi hivatkozásokra megy rá,
  hanem a PRÓZÁBAN említett csupasz domainekre is: a `Booking.com` szóból
  `[Booking.com](<http://Booking.com>)` lesz. MAR-148-nál **tizennyolc** ilyen
  született. Feltöltés után listázd ki őket:
  ```python
  re.findall(r'\[([^\]]+)\]\(<http://[^>]*>\)', remote)   # http, NEM https
  ```
  A `http://` előtag az árulkodó jel: https-t a szerző ír, http-t a Linear talál ki
  egy csupasz domain köré.
  🔴 **De a lista önmagában NEM hibalista, és ezt a besorolást a FORRÁSSZÖVEG dönti
  el, nem a regex.** 2026-08-13-ban ezt elrontottam: a szűk `\.com`-os mintám öt
  találatot adott, és abból hármat versenytársnak minősítettem. Valójában csak
  EGY volt a szerző negatív listáján (`immocto.com`); a `phocuswire.com` és a
  `rentalscaleup.com` a szerző saját, megnevezett szakmai FORRÁSA, ahol a link
  hasznos. A javaslatommal majdnem kiszedettem két jó linket. A helyes sorrend:
  (1) listázd a `http://`-s találatokat, (2) mindegyiket keresd vissza a
  forrásszövegben, és nézd meg, MILYEN szerepben szerepel ott (forrás vagy tiltott),
  (3) csak azokat ajánld javításra, amiket a szöveg maga tilt. Idegen anyagnál
  jelezd a szerzőnek, ne javítsd magadtól — de a besorolást előbb mérd meg, mert a
  téves besorolás rosszabb, mint a hallgatás.
  A javítás módja (a szerző választása): a domaint kód-formátumba (backtick) tenni,
  a Linear azt nem linkeli.
- **Workflow state-hez `stateId` (UUID) kell, a státusz NEVE nem elég.** A team
  state-jei: `query { team(id: "<teamId>") { states { nodes { id name type } } } }`.
- **Linear issue-hoz `teamId` KELL, a `projectId` önmagában nem elég.** A projekt
  URL-jében lévő hash a projekt azonosítója: a
  `query { project(id: "<hash>") { id teams { nodes { id key } } } }` egy körben
  megadja mindkettőt.
- **A „read-only" NÉV nem bizonyíték — a tényleges jogot mérd meg.** Egy `*-ro` alias,
  egy `readonly_user` név vagy egy „csak olvasás" leírás mind a SZÁNDÉKOT mondja el, nem
  azt, mit enged a szerver. A mérés olcsó és veszélytelen, ha **nulla sort érintő** írást
  próbálsz, tranzakcióban:
  ```bash
  ... psql "$CONN" -c "BEGIN; UPDATE <tabla> SET <oszlop>=<oszlop> WHERE false; ROLLBACK;"
  ```
  `permission denied` = a védelem a szerveren van (jó). Ha átmegy, a védelem csak abban
  volt, hogy te betartod — az más kockázat, és jelezni kell.
  2026-08-11, GG3 (`gg3` alias -> `NHOST_READONLY_CONNECTION_STRING`, `readonly_user`,
  111 tábla a `public` sémán): az `accommodations` UPDATE és a `bookings` DELETE is
  `permission denied`. ⚠️ **De a `CREATE TEMP TABLE` ÁTMENT** — vagyis a role nem
  „semmit nem írhat", csak az éles táblákat védi. Ha valaki a temp-tábla sikeréből arra
  következtet, hogy a kapcsolat írásképes, téved; ha a nevéből arra, hogy semmit nem
  tud írni, szintén. **Mindkét irányban mérj.**
- **Mindkét GitHub-alias tokenje FINE-GRAINED: idegen repóba nem ír.** A `github`
  (GuestGuru org) és a `github-personal` (kratam) csak a saját repókra ad írást;
  egy külső repo (pl. az upstream `Szotasz/marveen`) csak publikus olvasásként
  látszik, tehát **issue és PR sem nyitható** ott. Ezt **művelet nélkül** eldöntheted
  a válasz-fejlécekből:
  ```bash
  curl -s -D - -o /dev/null -H "Authorization: Bearer $GITHUB_TOKEN" \
    https://api.github.com/repos/<owner>/<repo> | grep -i "^x-oauth-scopes\|^github-authentication-token-expiration"
  ```
  `x-oauth-scopes` **csak klasszikus PAT-nél** jelenik meg. Ha csak a
  `github-authentication-token-expiration` jön (2026-08-10-i mérés: `github` →
  2027-07-30, `github-personal` → 2027-07-28), akkor fine-grained a token.
  ⚠️ A `GET /repos/...` `permissions` ága (`pull: true`) NE tévesszen meg: az minden
  publikus repóra igaz, és nem jelent írási jogot.
- **Az env-változó neve az aliasból NEM vezethető le.** `github-personal` →
  `GITHUB_TOKEN_PERSONAL` (nem `GITHUB_PERSONAL_TOKEN`), `google-calendar-ro` →
  `GOOGLE_CALENDAR_RO_ACCESS_TOKEN`. Rossz néven a fejléc üres lesz, és a szolgáltató
  jog-hibát ad (Google: `403 unregistered callers`), ami tévútra visz. A proxy az
  első kimeneti sorában KIÍRJA a helyes nevet -- olvasd el, ne találgass.
- **git push: a token `GIT_ASKPASS`-on át, sose az URL-be.** A `https://user:TOKEN@host`
  alak beszivárogtatja a tokent a git hibaüzeneteibe és a `ps`-be. Helyette egy
  askpass-szkript (`#!/bin/sh` + `printf '%s\n' "$GITHUB_TOKEN"`), a usernév az
  URL-ben (`https://x-access-token@github.com/...`), és `GIT_TERMINAL_PROMPT=0`.
  A `github` alias env-neve `GITHUB_TOKEN`. Csak `feat/`, `fix/` stb. előtagú
  ágra pusholj, védettre (main/develop) soha -- a git nem őrzi ezt, neked kell.

## Ellenőrzés

- A válasz `data` ága kitöltött, `errors` nincs benne.
- A kulcs sehol nem jelent meg: sem a parancsban, sem a kimenetben, sem a
  válaszodban. Ha véletlenül mégis, azt jelentsd, mert a kontextusból nem
  törölhető.
- Minden kiadás naplózva van aliasszal a gg-mcp audit logjában.

## Példa

2026-08-02, IT-461 felvitele a GG Access MCP projektbe: `linear_query` mutációt
nem enged, ezért payload fájlba, majd `proxy.js exec --alias linear` +
`LINEAR_API_KEY`. Elsőre `GG_SECRET`-tel ment és 401-et adott, a proxy
kimenetéből derült ki a helyes név.

2026-08-02, `feat/gg-per-agent-owner` push a GuestGuru/marveen-re. Nem volt gh
login és a `github_commit` 1.35 MB web-bundle-t tolt volna át pár tucat sornyi
változásért. Megoldás: askpass-szkript a scratchpadben, majd
`proxy.js exec --alias github -- sh -c 'GIT_ASKPASS=... GIT_TERMINAL_PROMPT=0 git -C <repo> push https://x-access-token@github.com/GuestGuru/marveen.git feat/...:refs/heads/feat/...'`.
Mivel az origin/main már ismerte az alapot (04ee524), csak a 2 új commit ment
fel, pontos SHA-val, teljes történettel. A token sehol nem szivárgott.
