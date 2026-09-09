# gg-skills -- ÁTKÖLTÖZÖTT

A GG-specifikus skillek **2026-09-01 óta NEM itt vannak**, hanem a privát
`GuestGuru/gg-agent-skills` repo `skills/` mappájában.

## Miért

Ez a repo **publikus**. Tamás döntése: lehetőleg a privát repót használjuk, mert
a titok-kezelés is kevésbé problémás úgy.

A döntést egy majdnem-baleset váltotta ki: 2026-09-01-én egy árazási skill új
szakaszába élő ügyszám és két díjtétel került, és a tükör-szinkron **magától**
kivitte volna ide. **A baj forrása nem új skill volt, hanem egy MEGLÉVŐ
szerkesztése** -- vagyis amíg a skillek itt álltak, minden jövőbeli javításuk
automatikusan publikálódott.

## Mi maradt ebben a repóban

- `seed-skills/` -- **gép-független** skillek, amik friss telepítésre mennek
- `skills/` -- az upstream projekt saját skilljei

## Hova írj

| skill jellege | hova |
|---|---|
| gép-független, bárhol működik | `seed-skills/` (ITT) |
| GG-specifikus (gg-mcp, GG3, flotta, belső eljárás) | privát `gg-agent-skills/skills/` |
| hitelesítő adat | sehova -- a kulcsok a gg-mcp-n át jönnek |

A `scripts/gg-skill-tukor-sync.sh` már a privát repóra mutat; a helyét a
`GG_PRIVATE_SKILLS` környezeti változó írja felül (alap: `~/gg-agent-skills`).

⚠️ **A git-történet megmarad.** Ami korábban ide került, az publikus maradt --
ez az átköltözés a JÖVŐBELI szerkesztésekről szól, nem visszamenőleges takarításról.

## A tükör NEM terjeszt: a repo megőriz, nem oszt ki

🔴 **Ha egy skill bekerül a privát repóba, attól MÉG EGYETLEN ágensnél sem jelenik
meg.** Mérve 2026-09-09: peppa két skillje adoptálva és felküldve (`e232a0a`), bubi
mégsem látta se a globális mappában, se a sajátjában, és azt hitte, hiányzik nála
valami. Nem hiányzott: a rendszer pontosan így működik, csak ez sehol nem volt kimondva.

**A skill három helyen élhet, és csak kettő terjeszt:**

| hely | ki látja | mire való |
|---|---|---|
| `~/.claude/skills/` | a TELJES flotta, azonnal | flotta-szintű, tudatos döntés |
| `agents/<nev>/.claude/skills/` | csak az az egy ágens | a napi munkájából született tudás |
| privát `gg-agent-skills/skills/` | SENKI, amíg valaki nem másolja | verziózás, hogy újratelepítéskor ne vesszen el |
| `seed-skills/` | friss TELEPÍTÉS kapja meg | gép-független alap-készlet |

**Tehát ha egy másik ágensnek is kell egy skill, a repóba adoptálás nem elég.** Két út
van, és mindkettő döntés: vagy átkerül a GLOBÁLIS mappába (onnantól a flotta minden
tagjánál megjelenik, és mindenki szerkesztheti), vagy a másik ágens lemásolja a saját
`.claude/skills/`-ébe (onnantól két külön példány él, két külön tükör-sorral, és
külön is avulnak).

**A `gg-skill-tukor-sync.sh` egyik utat sem csinálja meg magától, és ez szándékos:**
az élő példányból a repóba visz (`--fix`, `--adopt`), nem visszafelé. Idegen ágens
mappájába a szkript nem ír.
