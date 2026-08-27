---
name: fo-agens-restart-kontextus
description: A fő-ágens (MAIN_AGENT_ID) újraindítása és a kontextus túlélése. Triggerelődik - "restartoljalak?", "elveszik a kontextus?", "continue vagy fresh", auto-restart.json mode mező, taskstate vs ledger, "a dashboard continue-t mutat", [CONTEXT-GUARD] auto-handoff uzenet, "HANDOFF.md nem keszult el", fresh kontextussal valo ebredes utani folytatas.
---

# Fő-ágens restart és kontextus-megőrzés (Marveen fork)

## Mikor használd
- Tamás azt kérdezi, restartolhat-e, vagy hogy elveszik-e a beszélgetés.
- Az `store/auto-restart.json` `mode` mezőjéről kell nyilatkozni a fő-ágensnél.
- Restart után hiányzik a kontextus, és el kell dönteni, melyik réteg hibázott.
- `[CONTEXT-GUARD]` üzenettel ébredsz (pane saturated / auto-handoff), és el kell
  dönteni, van-e félbehagyott munka -- akkor is, ha `HANDOFF.md` nem készült el.

## A tény: a fő-ágens restartja Linuxon MINDIG fresh
Az út: `src/web/auto-restart-runner.ts` `performRestart()` -> ha `name === MAIN_AGENT_ID`,
akkor `restartMainChannelsSession()` -> nem-launchd (Linux) ágon
`respawnMainSessionFresh()` (`src/web/channel-monitor.ts:713`), és ott
`continueSession: false` fixen be van égetve.

A `mode` mezőt CSAK a sub-ágenseknél nézi meg a kód (`restartAgentProcess`,
`fresh: cfg.mode === 'fresh'`). Vagyis a dashboard/config `continue`-t mutathat a
fő-ágensnél, miközben a valóság `fresh`. **Ez néma eltérés: soha ne a configból
válaszolj, mérj.**

Ez nem elírás, hanem hiányzó plumbing: a helper neve is `...Fresh`, a mode-ot
senki nem adja át neki. (Kapcsolódó, működő védelem ugyanitt: a 2026-07-26-i
launchctl-ENOENT incidens óta a platform-ág tesztelt --
`src/__tests__/main-restart-platform.test.ts`.)

## Melyik kontextus-réteg véd ENGEM, a fő-ágenst
| Réteg | Véd? | Miért |
|---|---|---|
| ledger-replay SessionStart hook (`scripts/hooks/ledger-*.py`) | IGEN | a fő-ágensre is lefut, visszaadja a legutóbbi fordulókat |
| memória (dashboard `/api/memories`) | IGEN | amit magam beleírtam |
| taskstate-replay (`scripts/hooks/taskstate-replay.py`) | **NEM** | `_agent_id_from_cwd()` -> nem sub-ágens esetén `sys.exit(0)` (:107) |
| `store/agent-taskstate/marveen.json` | **NEM** | ezt semmi nem olvassa vissza, csak félrevezet |

Tehát restart előtt a helyes lépés: **memóriába írni a nyitott szálakat**, nem
taskstate-be.

## Eljárás restart előtt
1. `date`, majd a nyitott szálak `hot` tier memóriába (`/api/memories`).
2. Mondd ki egyenesen: fresh lesz, akkor is, ha a config continue-t ír.
3. Restart a rendes életcikluson (dashboard / `update.sh` / channels restart),
   ne ad-hoc launch -- különben árva `--channels` példány marad.
4. Restart után mérd, mi fut: `ps -eo pid,lstart,args | grep -- '--channels'`,
   az azonosítás `/proc/<pid>/cwd` alapján (lásd `fo-agens-modell-valtas`).

## Eljárás fresh ébredés UTÁN (auto-handoff / context-guard restart)

Ha `HANDOFF.md` nélkül ébredsz (a context-guard nem érte el a handoff-ot), NE kérdezz
vissza és NE kezdd elölről: **négy élő forrás** eldönti, van-e folytatandó munka.
Mind a négyet nézd meg, mert egyenként mindegyik hazudik.

```bash
sqlite3 store/claudeclaw.db "SELECT id,status,title,assignee FROM kanban_cards WHERE status IN ('in_progress','waiting');"
curl -s -H "Authorization: Bearer $(cat store/.dashboard-token)" "http://localhost:3420/api/memories?agent=marveen&category=hot&limit=30"
curl -s -H "Authorization: Bearer $(cat store/.dashboard-token)" "http://localhost:3420/api/messages?agent=marveen&status=pending&limit=20"
ls -la DREAM.md; tail -c 6000 store/context-guard-last-pane-marveen.txt
```

1. **Kanban** `in_progress`/`waiting` -- üres kimenet és nemlétező tábla egyformán
   néma, ezért `SELECT status,COUNT(*) ... GROUP BY status`-szal igazold, hogy a
   tábla ÉL, mielőtt a "nincs nyitott kártya" következtetést levonod.
2. **Saját `hot` tier** -- itt csak a SAJÁT `agent_id`-d számít; a globális hot
   listában idegen ágensek kártyái ülnek, azokhoz nem nyúlsz.
3. **Pending inter-agent üzenet** -- a szűrő `agent=`, nem `to=` (lásd `fleet-helper`
   Buktatók); rossz kulcsnál a "nincs üzenet" hamis megnyugvás.
4. **A pane-snapshot ÉS a munka kimenetének mtime-ja együtt.** A snapshot csak
   annyit mond, mi volt a képernyőn; azt, hogy a munka BEFEJEZŐDÖTT-e, a termék
   fájl-ideje mondja meg. 2026-08-24: a snapshot egy Dream Engine-jelentést
   mutatott, a `DREAM.md` mtime-ja 02:09, a restart 02:14 -- tehát a kör lezárult,
   nem szakadt félbe. Fordított sorrendnél (mtime a restart UTÁN) félbeszakadt munka.

5. **A napi napló GET-je a MAI napra szól, és a paramétereket némán ignorálja.**
   Mérve 2026-08-26: az `/api/daily-log` ugyanazt adja vissza `?agent=`, `?agent_id=`,
   `?date=`, `?limit=` és paraméter nélkül is. Következmény kettő. (a) Ha kora
   délelőtt ébredsz és a válasz `[]`, az NEM azt jelenti, hogy nem volt munka:
   a mai bejegyzés még nem született meg. A tegnapi naplóhoz ezen az úton nem
   férsz hozzá, azt a `hot` tier memória pótolja. (b) A szűrésre épített
   következtetés ("csak a saját soraimat kértem") hamis, mert nem szűrt.
   Aznap a félbehagyott feladat EGYETLEN nyoma a `hot` memória volt, a
   pane-snapshot egy lezárult kanban-auditot mutatott.

**A napi napló nem bizonyíték, hanem tanúvallomás.** Ha az előző kontextusod azt
írta, hogy valamit "szándékosan" hagyott így, mérd le újra, mielőtt továbbadod.
2026-08-24: a napló szerint a `dist/` szándékosan maradt a `main` mögött, mert az
`src/` változatlan -- ezt a `git diff <built-commit>..HEAD -- src/ package.json`
igazolta (0 változás, csak scriptek/hookok mozogtak, azok futásidőben olvasódnak).
A mérés olcsó, a téves továbbadás drága.

## Buktatók
- 🔴 **A `due but pane is busy` KETFELE dolgot jelenthet, és a kettő ellentétes
  teendőt kíván.** Vagy tényleg dolgozol (akkor a halasztás helyes, a munkád védve),
  vagy BERAGADTÁL (akkor a halasztás maga a hiba, mert a helyreállítás marad el).
  A napló ugyanazt a sort írja mindkét esetben. **A megkülönböztető nem a `busy` sor,
  hanem az, hogy van-e MELLETTE `Stuck-input restart deferred` bejegyzés** -- az
  utóbbi parkolt inputot jelent, tehát beragadást.
  2026-08-25: én az elsőre következtettem („folyamatosan dolgozom, ezért nincs
  restart-ablak"), és strukturális ütemezési problémának neveztem. Tamás javított:
  beragadt a session, és az ő Ctrl-C-je oldotta fel 06:50-kor. A 03:00-s restart
  egyébként LEFUTOTT (`auto-restart: restarted session` 03:00:55), csak utána ragadt
  be minden -- vagyis még a „a restart elmaradt" állításom is hamis volt.
  **Ellenőrzés, mielőtt bármit állítasz a restart késéséről:**
  ```bash
  grep -E "auto-restart: restarted session|Stuck-input restart deferred|KEYS INJECTION" \
    store/dashboard.log | tail -20
  ```
  A három minta együtt adja ki a történetet: lefutott-e, beragadt-e, és ki oldotta fel.
- **A `mode: continue` 2026-08-19 ÓTA ÉRVÉNYES a fő-ágensnél is** (PR #56/#57,
  `9e557d0`). Előtte nem volt az: 2026-08-14-én a config alapján ígértem
  continue-t, és a kódolvasás cáfolta. A tanulság maradjon meg: **a config
  önmagában sosem forrás, a lefordított `dist/` a forrás.** Restart-ígéret előtt
  a `dist/web/auto-restart-runner.js`-ben nézd meg a `cfg.mode === 'continue'`
  ágat, ne a `store/auto-restart.json`-t és ne a dashboard kijelzését.
- **Ne írj taskstate-et magadnak.** Ugyanaznap megírtam, majd törölnöm kellett:
  a hook szándékosan kilép a fő-ágensnél. Hamis biztonságérzet.
- **Restart után a `chat_id: 0` NEM működik proaktív üzenetnél.** 2026-08-15: az
  update.sh utáni friss sessionben a beígért jelentést `chat_id: "0"`-val küldtem
  volna (ezt írja a CLAUDE.md napindító-szekciója), a plugin viszont elutasította:
  `chat 0 is not allowlisted`. A `0` csak akkor él, ha van inbound `<channel>`
  blokk a kontextusban; friss sessionben nincs. A valódi chat-id az allowlistából
  jön:
  `python3 -c "import json;print(json.load(open('$HOME/.claude/channels/telegram/access.json'))['allowFrom'])"`
  **A gyökérok 2026-08-21-en kerult elo, es meg is szunt.** A CLAUDE.md nem
  veletlenul irt `0`-t: a `templates/CLAUDE.md.template` `{{CHAT_ID}}` helyorzoje
  rendereleskor ures/`0` erteket kapott, mert az `update.sh --regen-claudemd`
  csak a `CHAT_ID=` kulcsot olvasta a `.env`-bol, a telepiteseken viszont
  `ALLOWED_CHAT_ID=` all. A feloldas most `CHAT_ID` -> `ALLOWED_CHAT_ID` ->
  figyelmeztetes (PR #83/#84), a helyi CLAUDE.md pedig a valodi id-t viszi.
  Regi installon vagy regi CLAUDE.md-vel a bukta tovabbra is el: ha `chat_id: 0`-t
  latsz egy prompt szovegeben, az allowlistabol old fel, ne hidd el.
- **A javítás egyik tervezett opció sem lett -- és jó okból.** 2026-08-19:
  eredetileg azt terveztem, hogy a `respawnMainSessionFresh` kap egy
  `continueSession` paramétert. Ez félkész continue-t adott volna: a `--continue`
  indulásnak kell a resume-summary modal elutasítása ÉS a post-resume plugin
  guard is, amit az a helper SZÁNDÉKOSAN kihagy (le is van írva a fejlécében).
  Bare `continueSession: true` ott vagy a modalon parkol, vagy `--channels`
  plugin nélkül jön fel. A tényleges javítás: `cfg.mode === 'continue'` a
  meglévő, tesztelt `resumeMarveenSession()`-re ágazik el. Tanulság: ha egy
  helper fejlécében az áll, hogy valamit direkt nem csinál, az nem hiányosság,
  hanem a hatókör deklarációja -- ne flaggel told át a határán.
- **A macOS launchd-ág fresh-only marad.** A `kickstart` a plist parancsot
  futtatja újra, nincs mit átadni neki. Linuxon a respawn-pane-leg követi a
  mode-ot, macOS-en nem -- ezt az `effectiveMode()` log-sora mondja meg.
- 🔴 **A `store/dashboard.log` soraiban NINCS DÁTUM, csak `[HH:MM:SS.mmm]` -- egy
  időpont-grep a TEGNAPI napot adja vissza.** 2026-08-20 03:01: a `grep '^\[03:0'`
  a 08-19-i restart sorait hozta, köztük a `Main session respawned FRESH` WARN-t,
  ami akkor HELYES volt (még a régi kód futott). Pár percig úgy nézett ki, hogy a
  javítás elbukott, és majdnem így is jelentettem. **Dátumot csak három forrás ad:**
  a napló VÉGE (`tail`, a mai sorok ott vannak), a `ps -eo pid,lstart,args` (az
  `lstart` teljes dátumot ír), és a `tmux ls` `created` mezője. Általánosan:
  időpont-alapú grep csak akkor bizonyíték, ha a sor tartalmazza a dátumot is.

## Ellenőrzés
- **Az ÉLES continue négy egymástól független jele** (2026-08-20 03:02-03:04,
  az első valódi próba):
  ```bash
  ps -eo pid,lstart,args | grep -- '--channels' | grep -- '--continue'   # a flag ott van-e, DATUMMAL
  tail -40 store/dashboard.log | grep -E 'mode|--continue|Post-resume'
  ```
  Amit látnod kell: `auto-restart: restarted session  mode: "continue(main)"`,
  `Marveen session respawned with --continue`, és a záró
  `Post-resume guard: channel plugin attached after --continue -- context preserved,
  no escalation`. Ez a HARMADIK a döntő: a `--continue` indulás akkor sikeres, ha a
  csatorna-plugin utána is fent van.
- **A `due but pane is busy, deferring to next tick` NEM hiba, hanem a helyes
  viselkedés.** Ha a 03:00-s tick akkor esedékes, amikor épp dolgozol (pl. a
  dream-engine kör fut), a runner NEM szakít félbe, hanem a következő tickben
  indít. 2026-08-20-án emiatt 03:02:59-kor jött a restart 03:00 helyett -- ez
  nem csúszás, hanem a munkád megvédése.
- `grep -n "cfg.mode === 'continue'" dist/web/auto-restart-runner.js` -> ha
  MEGVAN, a `continue` mód élesben is érvényes. Ha nincs, a telepített build régi
  (`update.sh` nem futott le, vagy a lánc `develop`-nál megállt) -- a `src/`-ben
  meglévő javítás önmagában semmit nem ér.
- A friss `dist` bizonyítéka a fájl mtime-ja, nem a `git log`:
  `ls -la dist/web/auto-restart-runner.js`.
- `grep -n "not a sub-agent" scripts/hooks/taskstate-replay.py` -> ha megvan, a
  taskstate továbbra sem véd engem.
