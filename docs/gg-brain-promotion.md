# Éjszakai átemelő kör: a bot-memória céges tudása a céges agyba (IT-1289)

> GG-specifikus. A botok saját memóriájában (`shared`, `warm`, `cold`) lévő céges tudást
> minden bot éjjel maga emeli át a céges agyba (brain.guest.guru), a gazdája nevében.

## Miért

Az IT-1178 óta minden bot CLAUDE.md-jében ott a generált „Céges agy” blokk, és mindegyiknek
saját gg-mcp tokenje van (`marveen/<név>`). A mentés a pillanatban mégis alig működik (mérve
2026-10-03, 09-29 óta: salesninja 2 `brain_save`, a többi bot 0). Közben a botok saját
memóriájában sok a céges tudás, nagy része a 09-29 előtti korból, amikor a `shared` polc még
„közös céges memória” volt. Ezt a pillanatnyi mentés szabálya soha nem hozza át.

**Tamás döntése (2026-10-03):** a bot maga dönti el, mit emel át, a kolléga bevonása nélkül.
Nincs jóváhagyási lista, nincs válaszvárás, és nincs tájékoztató üzenet sem.

## Hogyan

| Rész | Hol | Mit csinál |
|---|---|---|
| Ütemezett feladat botonként | `~/.claude/scheduled-tasks/brain-promotion-<agent>/` | `heartbeat` típus (a runner nem üzen a gazdának), naponta 01:05-től 7 percenként szórva, a fő agent az első |
| A feladat írója | `src/gg/brain-promotion.ts`, `src/gg/brain-promotion-fleet.ts` | boot-kor (`src/web.ts`, a hook-regisztrációs ág): a SKILL.md mindig újraíródik, a `task-config.json` `enabled`, `schedule` és `createdAt` mezője megmarad |
| Jelöltek és kurzor | `node dist/gg/brain-promotion-cli.js candidates \| done \| status --agent <név>` | a `store/claudeclaw.db`-t csak olvassa; a haladás a `store/brain-promotion/<agent>.json`-ban |
| PreCompact-prompt | `src/gg/precompact-brain-note.ts` | a „Más agent-nek is -> category=shared” sort `[GG IT-1289 BEGIN/END]` markerek közé írja át: a céges tudás a saját `warm` polcra megy, onnan éjjel átkerül |
| CLAUDE.md-blokk | `src/gg/brain-rules-section.ts` | a „háttérkörben nincs mentés” szabály kivételt kap erre a körre |

### Miért botonként, és miért nem a dream-engine

A gg-mcp token az identitás. A `brain-promotion-<agent>` feladatot a runner a bot SAJÁT
tmux-sessionjébe kézbesíti, és ott a gg-mcp proxy a gazda tokenjével fut, tehát a bejegyzés
szerzője a gazda. A dream-engine a fő agent sessionjében fut: ha ott fésülnénk össze, minden a
fő agent gazdájának nevében menne (az IT-1161 nyitott kérdése).

### Egy kör

1. A bot betölti a `brain_*` toolokat (ha nincsenek, a kör csendben véget ér).
2. `candidates --limit 40`: a saját `shared`/`warm`/`cold` tételei a kurzor után, id szerint.
   A `hot` (futó állapot) és a „céges agy: …” mutatók kimaradnak.
3. Tételenként dönt a CLAUDE.md „Hova kerül” sorrendjével. Titok, futó állapot, HR, a botok
   működése és a gazda preferenciái nem mennek át. Átemelés előtt `brain_search`-öt futtat a
   duplikátumok kiszűrésére, utána `brain_save`. A `kulcs` értéke `marveen-<agent>-mem-<id>`, így
   egy újrafutás nem duplikál. A `fogalmak` között mindig ott a `marveen-átemelés`. Döntésnél a
   `dontotte` a megnevezett ember, különben `agent`, `jovahagyta` nélkül. A bizonytalan tétel
   `megfigyeles`.
4. Minden tétel után `done --id <id> --decision <ADD|UPDATE|SUPERSEDE|NONE|DUP|SKIP>`, így egy
   megszakadt kör (pl. a 03:00-s újraindítás) ott folytatódik, ahol abbamaradt.

A kezdeti állomány (mérve 2026-10-03: a fő agent 392, jean 132, salesninja 126 stb., összesen
~900 tétel) éjszakánként legfeljebb 40 tétellel néhány éjszaka alatt fogy el.

## Kezelés

- **Kikapcsolás egy botnál:** `task-config.json` → `"enabled": false` (a boot nem írja vissza).
- **Mit vitt át:** `node dist/gg/brain-promotion-cli.js status --agent <név>`; a céges agyban
  keresés a `marveen-átemelés` fogalomra, illetve az adott gazda szerzőségére.
- **Visszavonás:** a gazda szól a botnak; a CLAUDE.md-blokk visszavonási szabálya érvényes
  (`brain_archive`, UPDATE/SUPERSEDE esetén az előd visszamentése).
- **Újra-átnézés elölről:** a `store/brain-promotion/<agent>.json` törlése. A `kulcs` miatt nem
  duplikál, csak tokent költ.
- A drift-mérő (`scripts/scheduled-task-drift.sh`) a feladatot `ephemeral` jelöléssel és
  indokkal mutatja: a sablon a kódban él, nem a repó `scheduled-tasks/` mappájában.
