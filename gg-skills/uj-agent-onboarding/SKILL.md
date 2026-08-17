---
name: uj-agent-onboarding
description: Új kolléga-agent beüzemelése a Marveen flottában (saját Telegram/Discord bot + gg-mcp per-user hozzáférés). Triggerelődik - "csináljunk egy agentet X-nek", "új asszisztens kollégának", "telegram bot + gg-mcp", "meg tudod csinálni mobilról".
---
# Új agent onboarding (bot + gg-mcp)

## Mikor használd
Tamás új agentet akar egy kollégának: saját Telegram (később Discord) bottal, és
a kolléga saját GG-jogaival a gg-access MCP-n át. Akkor is, ha csak azt kérdezi,
mi a menet, vagy hogy megoldható-e mobilról.

## Bekérő a kollégától (0. lépés)

A `POST /api/agents` `description` mezője az 5. és 6. pontból áll össze.

1. Telegram `@username` (Discord később, opcionális)
2. Bot neve, 2-3 javaslattal (a Telegram username egyedi, a jók elfogynak)
3. Profilkép: négyzetes PNG/JPG, min. 512px
4. Tegeződés/magázódás + egy mondat a hangnemről
5. Mit csinál a cégnél 3-5 mondatban: milyen rendszerek, mi viszi a legtöbb időt
6. Három KONKRÉT helyzet, amiben segítséget vár (szituáció, nem funkciólista)
7. Mit NE csináljon

## Fix határ-blokk MINDEN agent CLAUDE.md-jébe

A kolléga leírására NE bízd a határokat, mert nem tudja hol vannak. Szó szerint
tedd be (2026-07-30, Tamás kérése — előzmény: egy chatbottal beszélgetve
Python/AWS megoldást javasoltak a fejlesztőnek, miközben a stack TypeScript és
nincs AWS):

> Fejlesztési ötleteknél a te dolgod a MIT és a MIÉRT: milyen problémára ad
> megoldást, kinek, ma hogyan oldják meg, mibe kerül ez így, melyik appban
> képzelik el, és hogyan nézne ki a végeredmény a felhasználó szemszögéből.
> A HOGYAN nem a te dolgod: programnyelvet, keretrendszert, architektúrát,
> felhő-szolgáltatót NE javasolj, akkor sem, ha kérik. A GG stack adott
> (TypeScript, Vercel, Neon, GCP Cloud Run, Hasura/Postgres), és a technikai
> tervezés a fejlesztőé. Ha a beszélgetés implementációba fordul, tereld vissza
> a use-case-re: kinek fáj, mennyire, és mi lenne a jó végeredmény.

## Eljárás

1. **Bot (@BotFather, `/newbot`)** — Tamás csinálja, telefonról is megy. A bot
   admin kézben marad, a kolléga a tokent sosem látja. Egy token = egy agent,
   providerenként külön bot.

2. **Agent felvétele** — dashboard "Felvétel", vagy `POST /api/agents`
   `{name, description, model?, profile?}`. A description-ből generálódik a
   CLAUDE.md + SOUL.md. A dashboard tailneten kint van
   (`tailscale serve status` mutatja, itt `https://marveen.pitta-cliff.ts.net`),
   tehát mobilról PWA-ként is elérhető.

3. **Bot token bekötése** — dashboard csatorna-mezőjébe
   (`/api/agents/:name/channels/:provider`). SOHA ne kérd chatbe a tokent.

4. **Párosítás** — a kolléga ír a botnak, Tamás jóváhagyja a dashboardon
   (allowlist policy, default-deny).

5. **gg-mcp per-user token — NEM a te dolgod, az agent maga intézi.**
   Token nélkül a gg-mcp *párosítás-váró* módban indul, pontosan EGY toollal:
   `gg_belepes` (`src/pairing-server.ts`). Amint a kolléga bármit kérdez a GG
   rendszereiről, az agentnek nincs más választása, mint meghívni — és a kolléga
   a SAJÁT chatjében kapja meg a linket és a kódot, amit a saját portál-fiókjával
   bevált (`https://tools.guest.guru/connect/agent`, telefonon is megy).
   A token 0600-as fájlba kerül a scaffold által beállított
   `tokens/<nev>.token` útvonalra, **és a többi tool magától megjelenik: nincs
   újraindítás** (`tools/list_changed`). Neked ebben nincs teendőd:
   ne futtasd a `pair.js`-t, ne írd át a `.mcp.json`-t.
   Utólag vedd fel a `/home/gg/gg-mcp/tokens/README.md` leltárba.
   A terminálos `node dist/pair.js --label "marveen/<nev>"` út csak akkor kell,
   ha az agenten NEM fut gg-access MCP (pl. fejlesztői gép, headless setup).

## Buktatók
- **A `.mcp.json` identitás-öröklődése MEGSZŰNT (PR #16, 2026-08-11 óta éles).**
  Korábban a scaffold átmásolta a projekt gyökér `.mcp.json`-ját a főagent
  gg-tokenjével, vagyis az új agent a FŐAGENT jogaival és nevében hívta a GG
  rendszereket. Most a scaffold a másolás után átírja a két identitás-mezőt a
  sajátjára (`src/gg/mcp-identity.ts`, hívás: `src/web/agent-scaffold.ts`):
  `GG_MCP_TOKEN_FILE` → `/home/gg/gg-mcp/tokens/<nev>.token`,
  `GG_MCP_AGENT_LABEL` → `marveen/<nev>`. A név ékezet nélküli, kisbetűs alak
  (`sanitizeAgentName`: "Réka" → `reka`), tehát a token-fájlt is így nevezd el.
  A mező helyesen mutat, de a FÁJL addig nem létezik, amíg a kolléga be nem lép
  (5. lépés, `gg_belepes` -- ezt az agent maga kezdeményezi, nem te). Addig az
  agent párosítás-váró módban fut: elindul, beszélget, GG-rendszert nem ér el.
  Ez a szándékolt fail-closed viselkedés, NEM hiba, és nem kell "megjavítani".
- **A védelem CSAK a stdio alakra érvényes: HTTP `.mcp.json`-nál újra szivárog az
  identitás (2026-08-12).** A `withOwnGgIdentity` a gg-access szerver `env`
  mezőit írja át. A remote HTTP alakban (`"type":"http"`, `url`,
  `headers.Authorization: Bearer ggp_...`) nincs `env` — a függvény odaír egy
  üres `env`-et, a fejlécben ülő tokent viszont ÉRINTETLENÜL hagyja. Vagyis a
  következő scaffoldolt agent a FŐAGENT tokenjével, teljes `superfejleszto`
  joggal és a főagent nevében indul: pontosan a PR #16 előtti hiba, csak más
  transzporton. Aznap élesben elő is állt, mert a főagent HTTP-re állította a
  saját `.mcp.json`-ját — ami EGYBEN a scaffold sablonja.
  Következmények, tartsd be:
  1. **A projekt-gyökér `/home/gg/marveen/.mcp.json` nem privát beállítás, hanem
     SABLON.** Ne írd át kísérletezéshez. Ha mégis, állítsd vissza stdio-ra,
     MIELŐTT bárki agentet hoz létre. Visszaállításnál a sorrend:
     **(a)** `store/mcp-stdio-backup.json` — a kísérlet ELŐTTI mentés, és
     **(b)** a saját `hot` memóriád, mert a mentés helyét oda írtad fel.
     Csak **(c)** utolsóként fejtsd vissza egy meglévő agentből
     (`agents/<nev>/.mcp.json`; a főagenté `tokens/marveen.token` + label
     `marveen/Marveen`).
     ⚠️ 2026-08-12: pont ezt rontottam el. `.mcp.json*` és `store/*.mcp*`
     mintákra kerestem, a fájl viszont `mcp-stdio-backup.json` — egyik sem
     illeszkedett, ezért „nincs mentés"-t jelentettem és rekonstruáltam.
     A rekonstrukció utólag byte-azonos lett, de az szerencse volt, nem mérés.
     **A saját hot memóriád a művelet állapotát tartja: olvasd el, mielőtt
     állapotot találgatsz.**
  2. **HTTP-re állás flottásan csak kódjavítás UTÁN.** A `withOwnGgIdentity`-nak
     kezelnie kell a http alakot is, fail-closed: vagy az új agent saját
     tokenjét írja a fejlécbe, vagy VEGYE KI a fejlécet (üres kéz > más jogai).
  3. Ellenőrzés minden scaffold után: `grep -c ggp_ agents/<nev>/.mcp.json`
     legyen `0`. Nyers token az agent configjában mindig hiba.
- A gg toolok default-deny-val válaszolnak, ha a kollégának nincs
  `tools.guest.guru` fiókja/grantje. Ez nem hiba-üzenet, csak ⛔ + "nincs
  hozzáférésed" — előfeltételként kérdezd meg, van-e már portál-hozzáférése.
  A jogokat a bot ELŐTT rendezzétek, különben az első nap csalódás. Tipikus
  szerep → minimum grant: sales `bpdb:ro`; backoffice `drive:ro` + `helpscout:ro`
  + `wikijs:ro`; finance/admin `gg3:ro` + `wikijs:ro`; árazás `gg3:ro` +
  `bpdb:ro` (+ `channex:ro` ha OTA-oldalt is néz); fejlesztő `github:ro` +
  `linear:ro` + `sentry:ro`.
- **A javított `.mcp.json` NEM jelenti azt, hogy van hozzáférés: a token FÁJLNAK is
  léteznie kell.** 2026-08-02, SalesNinja: az `agents/salesninja/.mcp.json` szépen a
  `/home/gg/gg-mcp/tokens/salesninja.token`-re mutatott, de a fájl nem létezett (a
  `tokens/` mappában akkor még csak a főagent tokenjei voltak; a mai leltár: `/home/gg/gg-mcp/tokens/README.md`). Az
  agent elindult, konfiguráltnak látszott, és NÉMÁN nem ért el egyetlen céges rendszert
  sem. Ellenőrzés egy paranccsal, ne hidd el a configot:
  `test -s "$(python3 -c "import json;print(json.load(open('agents/<NEV>/.mcp.json'))['mcpServers']['gg-access']['env']['GG_MCP_TOKEN_FILE'])")" && echo TOKEN-OK || echo TOKEN-HIANYZIK`
- **~~A generált persona a GLOBÁLIS `OWNER_NAME`-et írja gazdának~~ — MÉRVE 2026-08-14:
  MÁR NEM, ha átadod az `owner` mezőt a create-hívásban.** A `POST /api/agents`
  `owner` paramétere átmegy a generálásba: brokermarcsinál (`owner: "Anita"`)
  `grep -c -i 'tamás\|tamas'` = **0** a CLAUDE.md-ben és a SOUL.md-ben is, míg
  `grep -c -i anita` = 12 és 10. Vagyis a kézi gazda-javítás NEM automatikus
  teendő többé. **De ne hidd el, mérd le**, mert ez generálás, nem sablon-csere:
  ```bash
  grep -c -i '<a fo-agens gazdaja>' agents/<nev>/CLAUDE.md agents/<nev>/SOUL.md   # 0 kell
  grep -c -i '<az uj gazda>'        agents/<nev>/CLAUDE.md agents/<nev>/SOUL.md   # >0 kell
  ```
  Ha az `owner`-t KIHAGYOD a hívásból, a régi viselkedés visszajön. Az alábbi
  eredeti bejegyzést előzményként hagyom meg:
  A `.env` `OWNER_NAME` értékét a `src/web/agent-scaffold.ts` nyolc helyen
  beleszövi a promptba, köztük explicit "use this exact name everywhere" utasítással
  (968. és 1182. sor). A `.env` átírása NEM megoldás: az flotta-szintű, tehát csak
  a hibát tolja a következő agentre.
- Egy bot tokent nem lehet két agenten megosztani (eltűnő üzenetek, kapcsolat-
  hibák a tünet). Minden agent = külön bot.
- A gg-mcp remote (HTTP) módja is létezik (`https://marveen.pitta-cliff.ts.net:8443/`,
  `Authorization: Bearer <portál-PAT>`) — ha a kolléga a saját Claude/Codex
  appjából akar csatlakozni, nem kell hozzá flotta-agent.
- **HIBÁS VOLT, JAVÍTVA (2026-08-11): "a `pair.js`-t a főagent futtatja".**
  Nem így van kolléga-agenseknél: a `gg_belepes` tool miatt az agent MAGA kéri a
  kódot, és a kolléga a saját chatjében váltja be (l. Eljárás 5.). Jean 17:48-kor
  így szerezte meg a tokenjét, miközben a főagens azt hitte, rá várnak -- vagyis
  a téves állítás miatt majdnem egymásra vártunk. Ha a főagens azt mondja a
  tulajdonosnak, hogy "szólj, és lefuttatom", az FÉLREVEZETÉS.
- **A `pair.js` (a maradék terminálos eset) nem támogat `--help`-et:** azonnal
  indítja a device-flow-t és VÁR a beváltásra (2026-08-11: `--help`-pel is
  elindult, 120s timeout, háttérbe ment). A kód lejár, tehát csak akkor futtasd,
  amikor az ember ott ül a beváltáshoz. Ne "előkészítésként" indítsd el.
- Mobilról MINDEN megy.
- **"Legyen pontosan olyan, mint X ágense" → NE a generálásra bízd.** A
  `POST /api/agents` a `description`-ből LLM-mel generálja a personát, ami
  szerkezetileg MÁS lesz (2026-08-11, peppa: teljesen eltérő szekció-fa a
  mintaként megadott bubihoz képest). Helyes eljárás: hozd létre az agentet
  (a scaffold, a config és az identitás így is rendben lesz), majd írd FELÜL a
  `CLAUDE.md`-t és a `SOUL.md`-t a minta-agent fájljaival, szóhatáros regex-
  cserével (`\bRita\b`→`Réka`, a magyar toldalékos alakot külön: `\bRitá`→`Réká`;
  `\bbubi\b`→`\bpeppa\b`), és **diff-fel igazold**, hogy csak a név tér el:
  `diff <(grep '^#' agents/<minta>/CLAUDE.md) <(grep '^#' agents/<uj>/CLAUDE.md)`.
  A "flotta többi agense" szekciót ne javítsd kézzel: induláskor regenerálódik.
- **⚠️ A `marveen-dashboard.service` újraindítása MEGÖLI a FŐÁGENS gg-access MCP
  gyerekét.** 2026-08-12: a scaffold-javítás élesítéséhez újraindítottam a
  dashboardot (08:26:08), és ugyanabban a másodpercben eltűnt mind a 60 `gg_*`
  toolom (`MCP server disconnected`). A főágens processze ÉL, csak az MCP gyereke
  halt meg; a négy sub-ágens (saját tmux session) ÉRINTETLEN maradt. A cgroupban
  ott a magyarázat: `Found left-over process (tmux: server) in control group`.
  A `gg-mcp-health.py` ezt `main DEAD`-ként helyesen ki is mutatja.
  Következmény: az újraindítás UTÁN a főágens nem tud commitolni, PR-t nyitni,
  GG-rendszert olvasni -- és erről magától nem tud, csak a health-probe-ból.
  **Ezért a sorrend: ELŐBB minden gg-mcp-t igénylő munka (PR-lánc, commit),
  UTÁNA a dashboard-restart, és csak azután az agent-felvétel** -- az utóbbi
  kettő már nem kell hozzá. Javítás: csak a főágens session-restartja.
  ⚠️ **2026-08-14: ugyanez a restart NEM ölte meg a gyereket** (13:33:19, közvetlenül
  utána `main ok`, a `gg_*` hívások mentek tovább). Tehát ez **verseny, nem
  determinisztikus szabály**: néha túlél a gyerek, néha nem. Ebből két dolog
  következik, és mindkettő fontos: (1) a fenti sorrendre TOVÁBBRA IS szükség van,
  mert a jó kimenetelre nem lehet építeni; (2) restart után **mindig mérd le**,
  ne feltételezd egyik irányban sem:
  ```bash
  python3 scripts/gg-mcp-health.py | python3 -c "import json,sys;print([f for f in json.load(sys.stdin)['findings'] if f['agent']=='main'])"
  ```
- **✅ LEZÁRVA (2026-08-12): a 7. flotta-szabály sablonja javítva.** A szöveg
  mostantól a `src/gg/fleet-rules.ts` `ggFleetRule7()`-jéből jön, teszttel
  lezárva (PR #18 -> develop, #19 -> main). Marlenkánál élesben mérve:
  `grep -c 'A gg-mcp a kontroll, nem a Főnök'` = 1, kézi javítás nélkül.
  **Feltétel: a dashboardnak a friss `dist/`-ből kell futnia** (build + restart,
  l. az előző pont sorrend-figyelmeztetését), különben a régi sablon generál.
  Az alábbi eredeti bejegyzést előzményként hagyom meg:
- **~~⚠️ NYITOTT (2026-08-11): a 7. flotta-szabály sablonja a KÓDBAN még a régi.~~**
  GuestGuru aznap elvi döntést hozott: *"Minden agent írhat scriptet és elérhet
  mindent, amit a GG mcp megenged neki. Nem kell engedély tőled vagy tőlem. Nem
  mi vagyunk a kontroll, hanem a GG mcp."* A négy meglévő agent
  (bubi/peppa/salesninja/jean) `CLAUDE.md`-jében a szabály át van írva, **de a
  `src/web/agent-scaffold.ts:1097` sablonja még az "ELŐBB szólj a Főnöknek"
  változatot generálja** -- vagyis a KÖVETKEZŐ új agent visszakapná a régi
  szöveget. Amíg ez nincs javítva (kód, PR-lánc kell hozzá), új agent felvétele
  UTÁN nézd meg és írd át kézzel:
  `grep -c 'A gg-mcp a kontroll, nem a Főnök' agents/<nev>/CLAUDE.md` → 1 kell.
  Az új szöveg a meglévő agentek bármelyikéből másolható.
- **A fix határ-blokkot a generálás NEM teszi bele, akkor sem, ha a `description`
  tartalmazza a lényegét.** 2026-08-11-i mérés: `grep -c 'A HOGYAN nem a te dolgod'`
  → **0 mind a négy agentnél** (bubi, peppa, salesninja, jean), pedig ez a skill
  szó szerinti előírása. A generált persona ír SAJÁT megfogalmazású "nem
  fejlesztesz" pontot, ami nem ugyanaz: hiányzik belőle a konkrét stack-lista és
  a "tereld vissza a use-case-re" utasítás. Létrehozás után **mérd le és told be
  kézzel** a "Amit SOHA nem csinálsz" szekció végére.
- **A bot token bekötésének és az indításnak a SORRENDJE számít.** A
  `--channels` plugin csak friss induláskor töltődik be: ha előbb indítasz és
  utána kötöd be a tokent, az agent fut, de NÉMA. Peppánál (2026-08-11) a token
  16:32:57-kor került be, a session 16:33:01-kor indult, a `bot.pid` 16:33:04-kor
  jött létre -- ez így jó. Ellenőrzés a dashboard helyett processz-szinten:
  `ls -la agents/<nev>/.claude/channels/telegram/` (van-e `bot.pid`, és frissebb-e
  a session indulásánál) + `pgrep -P <pane_pid> -a | grep telegram`.
  ⚠️ **A szabály a SORRENDRŐL szól, nem arról, hogy ki indít. 2026-08-14: holtpont.**
  A gazda bekötötte a tokent 13:45-kor, én meg vártam rá az indítással -- ő pedig
  rám várt ("nem kéne futnia a botnak?"). Hat perc némán elveszett, és a gazdának
  kellett szólnia. **Ha a token bent van (`hasTelegram: true` VAGY létezik a
  `channels/telegram/.env`), INDÍTSD EL, ne kérdezz rá.** Az indítás a te dolgod:
  ```bash
  curl -s -X POST http://localhost:<port>/api/agents/<nev>/restart \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $(cat store/.dashboard-token)" -d '{"fresh": true}'
  ```
- **A `POST /api/agents` a `description`-t LLM-mel dolgozza fel, ezért hosszú,
  strukturált leírást adj** -- a bekérő 5., 6. és 7. pontját szó szerint, nem
  összefoglalva. Jean (GG-829) mind az öt helyzetet és mind a négy tiltást
  megkapta így, egyetlen kézi javítás nélkül (a határ-blokkot leszámítva).
- **Az `agent-config.json` négy mezőt NEM kap meg a create-hívástól** -- kézzel
  írd hozzá a minta-agent alapján: `memoryIsolation` (ez az "izolált memória"),
  `channelProvider`, az `avatar.jpg` másolása, és az auto-restart bejegyzés a
  `store/auto-restart.json`-ba (nem az agent-configba!). A `POST /api/agents`
  csak `name`/`description`/`model`/`profile`/`owner`-t vesz át.

## Ellenőrzés
- `curl -s -H "Authorization: Bearer $(cat store/.dashboard-token)" http://localhost:3420/api/agents` — ott van az új agent.
- Az új agent `agents/<nev>/.mcp.json`-ja a SAJÁT `tokens/<nev>.token`-re mutat és
  a címkéje `marveen/<nev>` -- nem a főagenté. Ezt a scaffold intézi, de mérd le:
  `python3 -c "import json;e=json.load(open('agents/<NEV>/.mcp.json'))['mcpServers']['gg-access']['env'];print(e['GG_MCP_TOKEN_FILE'],e['GG_MCP_AGENT_LABEL'])"`
- Él-e a token: a loopback HTTP-kódja NEM árulja el (200-at ad halott tokenre is),
  a 401 a válasz body-jában jön a portál `/api/me/access`-éről. L. `tokens/README.md`.
- A kolléga ír a botnak és választ kap (párosítás rendben).
- Az agent `gg_allowed_tools` hívása a KOLLÉGA jogtérképét adja vissza, nem a főagentét.
