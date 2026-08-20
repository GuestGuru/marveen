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

## Mi van itt

**19 skill, 2026-08-17 óta a teljes GG-készlet.** Addig csak az első négy volt itt,
a többi tizenöt kizárólag egyetlen gép lemezén létezett.

### Gép- vagy GG-specifikus (verbatim seedként működésképtelen lenne)

| skill | eredeti helye a gépen | miért nem seed |
|---|---|---|
| `gg-mcp-iras-proxy` | `~/.claude/skills/` (globális) | 11 hivatkozás a `/home/gg/gg-mcp`-re |
| `gg-fork-push-lanc` | `.claude/skills/` (marveen ágens-specifikus) | a fork push-lánca, 9 gép-specifikus útvonal |
| `marveen-kod-teszteles-worktreeben` | `.claude/skills/` | ennek a checkoutnak a teszt-guardja |
| `fo-agens-modell-valtas` | `.claude/skills/` | ennek a telepítésnek a modell-konfigja |
| `gg-mcp-verzio-ellenorzes` | `~/.claude/skills/` | 25 GG-hivatkozás, a gg-mcp checkout útvonala |
| `uj-agent-onboarding` | `~/.claude/skills/` | 22 GG-hivatkozás, per-user gg-mcp token-kiosztás |
| `gg-mcp-transport-atallitas` | `~/.claude/skills/` | 14 GG-hivatkozás, `.mcp.json` a flottán |
| `gg3-inspections-lekerdezes` | `~/.claude/skills/` | GG3 éles adatbázis-séma |
| `tulaj-arazasi-kerdes-kivizsgalas` | `~/.claude/skills/` | GG árazási és HelpScout folyamat |
| `vip-tulaj-adatreview` | `~/.claude/skills/` | GG piaci és takarítási adatforrások |
| `flotta-hasznalat-riport` | `.claude/skills/` (ágens-specifikus) | ennek a flottának az ágens-nevei |
| `fo-agens-restart-kontextus` | `.claude/skills/` (ágens-specifikus) | ennek a telepítésnek a restart-konfigja |

### Általános, de még nem seed (promóció-jelöltek)

Ezek elvben kimehetnének a `seed-skills/` alá, mert nincs bennük beégetett
GG-útvonal — de a seed-készlet bővítése minden telepítést érint, tehát külön
döntés. Addig itt vannak, hogy legalább verziózva legyenek.

| skill | mit tud |
|---|---|
| `ai-szoveg-audit-hu` | magyar szöveg AI-fordulat-auditja |
| `beragadt-agens-panel` | beragadt ágens-bemenet diagnózisa |
| `channel-access-audit` | csatorna-allowlist auditálása |
| `channel-ledger-provider` | a ledger bővítése új csatorna-szolgáltatóra |
| `google-docs-biztonsagos-szerkesztes` | Docs API adatvesztés nélkül |
| `google-sheets-biztonsagos-iras` | Sheets append adatvesztés nélkül |
| `telegram-hang-atirat` | hangüzenet átirat, ha a csatorna nem adott |
| `youtube-video-tartalom` | YouTube-videó címe, leírása, fejezetei bot-ellenőrzés mellett |

Az ágens-specifikus skillek a `.claude/skills/` alatt élnek, amit a
`.gitignore` 15. sora kizár — tehát a repóban egyikük sem létezne enélkül.

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
