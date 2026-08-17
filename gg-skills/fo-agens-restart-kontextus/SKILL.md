---
name: fo-agens-restart-kontextus
description: A fő-ágens (MAIN_AGENT_ID) újraindítása és a kontextus túlélése. Triggerelődik - "restartoljalak?", "elveszik a kontextus?", "continue vagy fresh", auto-restart.json mode mező, taskstate vs ledger, "a dashboard continue-t mutat".
---

# Fő-ágens restart és kontextus-megőrzés (Marveen fork)

## Mikor használd
- Tamás azt kérdezi, restartolhat-e, vagy hogy elveszik-e a beszélgetés.
- Az `store/auto-restart.json` `mode` mezőjéről kell nyilatkozni a fő-ágensnél.
- Restart után hiányzik a kontextus, és el kell dönteni, melyik réteg hibázott.

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

## Buktatók
- **Ne ígérd, hogy "continue módban indulsz újra".** 2026-08-14: ezt állítottam a
  config alapján, aztán a kódolvasás cáfolta. A config a fő-ágensnél nem forrás.
- **Ne írj taskstate-et magadnak.** Ugyanaznap megírtam, majd törölnöm kellett:
  a hook szándékosan kilép a fő-ágensnél. Hamis biztonságérzet.
- **Restart után a `chat_id: 0` NEM működik proaktív üzenetnél.** 2026-08-15: az
  update.sh utáni friss sessionben a beígért jelentést `chat_id: "0"`-val küldtem
  volna (ezt írja a CLAUDE.md napindító-szekciója), a plugin viszont elutasította:
  `chat 0 is not allowlisted`. A `0` csak akkor él, ha van inbound `<channel>`
  blokk a kontextusban; friss sessionben nincs. A valódi chat-id az allowlistából
  jön:
  `python3 -c "import json;print(json.load(open('$HOME/.claude/channels/telegram/access.json'))['allowFrom'])"`
- **A tartós javítás nem a kijelzés elrejtése.** Két opció van: (a) a
  `respawnMainSessionFresh` kapjon `continueSession` paramétert és a
  `performRestart` adja át a mode-ot; (b) a dashboard ne mutasson continue-t a
  fő-ágensnél. Az (a) a helyes -- a (b) a valódi képességet dobja el a hazug
  kijelzés helyett. Ha (b) mellett döntenek, mondd ki, hogy tapasz.

## Ellenőrzés
- `grep -n "continueSession" src/web/channel-monitor.ts` -> ha még mindig fix
  `false` a respawn-helperben, a fenti tény érvényes.
- `grep -n "not a sub-agent" scripts/hooks/taskstate-replay.py` -> ha megvan, a
  taskstate továbbra sem véd engem.
