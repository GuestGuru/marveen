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
