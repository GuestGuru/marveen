# `gg-skills/` — GG-specifikus skillek verziózott másolata

Ez a könyvtár **nem seed**: semmi nem telepíti belőle automatikusan a
`~/.claude/skills/` alá, sem az `install-linux.sh`, sem az `update.sh`. Csak
azért van, hogy a GG-specifikus skillek ne kizárólag egyetlen gép lemezén
létezzenek.

## Miért nem a `seed-skills/` alá kerülnek

A `seed-skills/` minden telepítésre kimegy, és az `update.sh`
`refresh_untouched_seeds()`-e **verbatim** másolja — placeholder-behelyettesítés
ott nincs, ellentétben a `seed-scheduled-tasks/`-kal. Ebből két dolog következik:

1. **A `seed-skills/` GG-mentes, és ez mérhető**: 2026-08-13-án egyetlen ottani
   SKILL.md sem említette a `gg-mcp`-t vagy a `guest.guru`-t. Ez összhangban van
   azzal, hogy a GG-tudást 2026-08-02-án kivezettük a skillekből a
   `gg_knowledge_*` toolok javára (IT-451).
2. **A beégetett útvonalak nem fordíthatók le.** A `gg-mcp-iras-proxy` tizenegy
   helyen hivatkozik a `/home/gg/gg-mcp`-re, amire nincs placeholder (az
   `{{INSTALL_DIR}}` a marveen könyvtára, nem a gg-mcp-é), és egy idegen
   telepítésen az a könyvtár nem is létezik. Verbatim kimásolva tehát egy
   működésképtelen, mégis magabiztos leírás menne ki — pontosan az a hibaosztály,
   ami a 2026-08-13-i identitás-ügyet is okozta.

## Ugyanez a szétválasztás az ütemezett feladatoknál

Ott már régebb óta él, csak nem volt kimondva:

| könyvtár | kinek |
|---|---|
| `seed-scheduled-tasks/` | bármely telepítésnek, `{{...}}` placeholderekkel, template módban |
| `templates/scheduled-tasks/` | telepítéskori scaffold, csak ha a cél még nem létezik |
| `scheduled-tasks/` | **ennek** a telepítésnek a saját feladatai, verziózva |

A `gg-skills/` a `scheduled-tasks/` párja a skillek oldalán.

## Visszaállítás

Kézzel, mert szándékosan nincs automatizmus:

```bash
cp -r gg-skills/<nev> ~/.claude/skills/<nev>
bash scripts/skill-index.sh
```

## Karbantartás

Ha egy itt szereplő skillt a gépen patchelsz, **vezesd át ide is**. Az
`update.sh` a helyben módosított seed-másolatot megtartja
(`seed_copy_is_untouched()`), tehát a javítás nem vész el — de attól még csak
azon az egy gépen létezik. A részletek a `skill-management` skill Buktatói közt.
