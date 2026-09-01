---
name: skill-management
description: List, inspect, patch, or delete skills from ~/.claude/skills/. Use when the user asks about available skills, wants to modify an existing skill, or when a retrospective proposes skill changes. Trigger on "/skills" command or skill-related retrospective actions.
---

# Skill Management -- CRUD for the Skill Library

## When to use

- User asks "what skills do I have?" or "list skills"
- User wants to inspect a specific skill's content
- A `/retrospective` proposes CREATE, PATCH, or DELETE actions on skills
- User says "update skill X" or "fix skill Y"
- Periodic audit: check for stale or duplicate skills

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `action` | YES | One of: `list`, `show`, `create`, `patch`, `delete`, `audit` |
| `name` | for show/patch/delete | Skill directory name (e.g. `github-pr-rebase-merge`) |
| `scope` | no | `global` (default, ~/.claude/skills/) or `local` (./claude/skills/) |

Examples:
- `/skills action=list` -- list all skills with descriptions
- `/skills action=show name=github-pr-rebase-merge` -- show full SKILL.md
- `/skills action=create name=new-skill` -- interactive skill creation
- `/skills action=patch name=existing-skill` -- modify specific sections
- `/skills action=delete name=old-skill` -- remove with confirmation
- `/skills action=audit` -- find stale, duplicate, or oversized skills

## Procedure

### action=list

```bash
SKILL_DIR="${HOME}/.claude/skills"
if [ "$SCOPE" = "local" ]; then SKILL_DIR="./.claude/skills"; fi

echo "=== Skills in $SKILL_DIR ==="
for dir in "$SKILL_DIR"/*/; do
  skill_file="$dir/SKILL.md"
  if [ -f "$skill_file" ]; then
    name=$(basename "$dir")
    # Extract description from frontmatter
    desc=$(sed -n '/^description:/{ s/^description: *//; p; q; }' "$skill_file")
    printf "  %-35s %s\n" "$name" "$desc"
  fi
done
```

Present as a compact table. If both global and local exist, show both.

### action=show

1. Read `~/.claude/skills/{name}/SKILL.md`
2. If it has a `references/` subdirectory, list those files too
3. Present the full content

### action=create

Interactive skill creation workflow:

1. Ask for trigger context: "When should this skill activate?"
2. Ask for procedure steps: "What does it do, step by step?"
3. Generate SKILL.md with proper frontmatter:

```markdown
---
name: {name}
description: {one-line, specific about triggers}
---

# {Title}

## When to use
{Concrete triggers and contexts}

## Procedure
1. {Step}
2. {Step}
...

## Pitfalls
- {Known issues, if any}
```

4. Write to `~/.claude/skills/{name}/SKILL.md`
5. Update `.skill-index.md` if it exists

Rules:
- Keep SKILL.md under 500 lines
- Large reference material goes in `references/` subdirectory
- Description must be specific enough for L0 matching (not "does stuff")
- Procedure steps must be concrete and executable

### action=patch

Targeted modification of an existing skill:

1. Read the current SKILL.md
2. Identify the section to change based on user input or retrospective proposal
3. Apply targeted edit (old text -> new text), not full rewrite
4. If adding a pitfall from a runtime discovery, append to the Pitfalls section
5. Log the patch reason in the Pitfalls section if it came from an error recovery

Rules:
- Never rewrite the entire skill for a small change
- Preserve existing pitfalls and procedure steps unless explicitly removing
- If the patch changes triggers, update the description in frontmatter too

### action=delete

1. Show the skill content first
2. Ask for confirmation: "Delete skill '{name}'? This removes the entire directory."
3. On confirmation:
```bash
rm -rf "${HOME}/.claude/skills/${NAME}"
```
4. Update `.skill-index.md` if it exists

Rules:
- Never delete without showing content first
- Never delete without explicit user confirmation
- If the skill is referenced by other skills, warn before deleting

### action=audit

Comprehensive skill library health check:

1. **Stale detection**: Skills not referenced in any CLAUDE.md and with no git activity in 60+ days
```bash
for dir in ~/.claude/skills/*/; do
  name=$(basename "$dir")
  skill_file="$dir/SKILL.md"
  if [ -f "$skill_file" ]; then
    mod_date=$(stat -f '%Sm' -t '%Y-%m-%d' "$skill_file" 2>/dev/null || stat -c '%y' "$skill_file" 2>/dev/null | cut -d' ' -f1)
    echo "$mod_date  $name"
  fi
done | sort
```

2. **Duplicate detection**: Skills with overlapping descriptions or triggers
```bash
for dir in ~/.claude/skills/*/; do
  skill_file="$dir/SKILL.md"
  if [ -f "$skill_file" ]; then
    desc=$(sed -n '/^description:/{ s/^description: *//; p; q; }' "$skill_file")
    echo "$(basename "$dir"): $desc"
  fi
done
```
Review for semantic overlaps manually.

3. **Size check**: Skills over 500 lines that should be refactored
```bash
for dir in ~/.claude/skills/*/; do
  skill_file="$dir/SKILL.md"
  if [ -f "$skill_file" ]; then
    lines=$(wc -l < "$skill_file")
    if [ "$lines" -gt 500 ]; then
      echo "OVERSIZED ($lines lines): $(basename "$dir")"
    fi
  fi
done
```

4. **Index sync**: Check `.skill-index.md` matches actual directories
```bash
if [ -f ~/.claude/skills/.skill-index.md ]; then
  echo "Index exists, checking sync..."
  # Compare index entries vs actual directories
  indexed=$(grep -oP '(?<=\[)[^\]]+' ~/.claude/skills/.skill-index.md | sort)
  actual=$(ls -d ~/.claude/skills/*/ 2>/dev/null | xargs -I{} basename {} | sort)
  diff <(echo "$indexed") <(echo "$actual")
fi
```

Present findings as:
```
## Skill Audit Results

Total skills: {count} (global) + {count} (local)
Disk usage: {size}

### Issues Found
- [STALE] skill-name: last modified 2025-01-15 (130 days ago)
- [DUPLICATE] skill-a / skill-b: overlapping trigger "when deploying..."
- [OVERSIZED] skill-name: 720 lines (max 500)
- [UNINDEXED] skill-name: exists on disk but not in .skill-index.md

### Recommended Actions
1. DELETE skill-a (superseded by skill-b)
2. PATCH skill-c: move 300 lines to references/
3. REINDEX: regenerate .skill-index.md
```

## Skill Index Regeneration

When skills are created, patched, or deleted, regenerate the index with the
canonical generator — do NOT hand-roll a `sed`/`grep` loop (see Pitfalls):

```bash
# $INSTALL: a marveen checkout gyökere.
# Szándékosan változó: ez a skill MINDEN telepítésre kimegy, beégetett út
# egy másik gépen némán rossz parancsot adna.
INSTALL="${MARVEEN_ROOT:-$HOME/marveen}"
bash "$INSTALL/scripts/skill-index.sh"            # global index
bash "$INSTALL/scripts/skill-index.sh" "$(pwd)"   # agent-specific merged index
```

Verify afterwards — both checks must pass:

```bash
file ~/.claude/skills/.skill-index.md      # must say "UTF-8 text", not "extended-ASCII"
grep -a '| >' ~/.claude/skills/.skill-index.md   # must return nothing
```

## Pitfalls

- **A skill is a DIRECTORY, not a SKILL.md.** Anything that mirrors, diffs, or
  copies a skill must work on the whole directory. Skills ship helper files next
  to the manifest (`helpscout-pdf-melleklet/pdf-szoveg.py` is 141 lines,
  `b2b-onepager-gyartas/scripts/` is six files, `gg-mcp-transport-atallitas/mcp-probe.py`
  is executable), and a manifest-only comparison reports a confident "identical"
  while the helper drifts. 2026-08-28: the first run of a directory-level
  comparison immediately found a helper that existed only on disk and had never
  been versioned at all — the manifest beside it had been reported "identical"
  for weeks. Use `diff -rq <live> <mirror>`, and when syncing, delete mirror
  files the live skill no longer has, or the mirror accumulates dead files.
  The same applies to the executable bit: `cp -p`, and verify with
  `git ls-tree <ref> <path>` that `100755` survived the round trip.

  ⚠️ **De a `cp -p` ára: az mtime többé nem jelzés.** Egy mtime-őrző másolat után
  UGYANAZ a percbélyeg takarhat két különböző tartalmat -- reprodukálva
  2026-08-31: két `cp -p`-vel készült fájl azonos `15:42:41` mtime-mal, eltérő
  tartalommal. Ez nem zajos jel, hanem NÉMA: aki időbélyegre épít, nem
  bizonytalanságot kap, hanem téves bizonyosságot.
  **Következmény két ágens párhuzamos szerkesztésénél:** a „ki a frissebb"
  kérdésre az mtime NEM válaszol. A döntő a tartalom, három irányban, és olcsó:
  ```bash
  diff -q <elo> <tukor>
  git show origin/main:<tukor-utvonal> > /tmp/om && diff -q <tukor> /tmp/om
  ```
  (2026-08-31-én mérve, önálló reprodukcióval. **A csapda általános, de KONKRÉT
  esetet ne írj mellé példaként:** aznap két magyarázat is felmerült egy vélt
  eltérésre -- az mtime-ütközés és egy időrendi csúszás --, és VÉGÜL EGYIK SEM
  volt igaz, lásd a következő buktatót. Fájl-állapotot tartalommal ellenőrzünk,
  sosem időbélyeggel; de ettől még nem minden eltérés mtime-probléma.)

- 🔴 **NULLA TALÁLATNÁL ELŐSZÖR A MINTÁT GYANÚSÍTSD, NE A VALÓSÁGOT.** jean
  fogalmazta meg 2026-08-31-én, miután a saját hibás keresése két ágens két körét
  elvitte. A konkrét hiba: **`grep -E` módban a `\|` NEM alternáció, hanem
  LITERÁLIS pipe** -- extendedben az alternáció a csupasz `|`. Így a
  `grep -cE 'VALAMI\|valami'` azt az egy összefüggő szöveget keresi, hogy
  `VALAMI|valami`, ami természetesen nincs sehol. Mérve ugyanazon a fájlon:
  ```
  grep -cE 'HASZNÁLHATATLAN\|x'   -> 0     # literális pipe, hamis nulla
  grep -cE 'HASZNÁLHATATLAN|x'     -> 25    # helyes alternáció
  grep -c  'HASZNÁLHATATLAN\|x'   -> 25    # basic regexben a \| a helyes alak
  ```
  Három ilyen keresés adott nullát, és ettől RENDSZERnek látszott, ami elgépelés volt.
  **Olcsó ellenszer: nulla találatnál futtass KONTROLL-keresést ugyanazzal a
  mintával olyasmire, amiről tudod, hogy benne van.** Ha az is nullát ad, a minta
  a hibás:
  ```bash
  grep -cE 'name:\|barmi' <fajl>   # 0  <- pedig a "name:" biztosan benne van
  grep -cE 'name:' <fajl>          # 1  <- tehat a MINTA volt rossz
  ```
  Ez ugyanaz a hibaosztály, mint a némán üres API-szűrő: **a nulla találat nem
  adat, amíg nem igazoltad, hogy a mérőeszköz működik.**

- 🔴 **A HOOKOK KÉT settings-fájlban élhetnek, és az egyik ellenőrzése NEM
  ellenőrzés.** 2026-09-01: meg akartam írni a leletbe, hogy az
  `outgoing-copy-gate.py` „nincs bekötve", mert a `~/.claude/settings.json`-ban
  nem találtam. Valójában a PROJEKT `.claude/settings.json`-jában van, három
  matcherrel (`Bash`, `.*send_email.*`, telegram `reply`). A hiányt tehát mind a
  NÉGY helyen kell keresni, mielőtt kimondod:
  ```bash
  for f in ~/.claude/settings.json ~/.claude/settings.local.json \
           .claude/settings.json .claude/settings.local.json; do
    [ -f "$f" ] && printf '%-36s %s\n' "$f" "$(grep -c '<a hook neve>' "$f")"
  done
  git grep -ln '<a hook neve>'     # es hol hivjak meg egyaltalan
  ```
  Ez ugyanaz a család, mint a fenti kettő: **a keresés HELYE is a mérőeszköz
  része.** Egy jó minta a rossz fájlban ugyanúgy hamis nullát ad, mint egy rossz
  minta a jó fájlban.

  🔴 **És a szabály tágabb a nulla találatnál: a MEGLEPŐ EGYÖNTETŰSÉGRE általában
  áll.** jean általánosítása, ugyanaznap, két esetből: (a) három hibás `grep`
  adott nullát, (b) a Linear-kommentek stílus-alapú szétválogatása szisztematikusan
  alulmért -- és a vak folt ott is EGY volt (a diktált szöveg a gazda hangján szól),
  csak minden mérésre egyszerre hatott.
  **Ha ugyanaz az ESZKÖZ mér, az egybehangzó eredmény nem növeli a bizonyosságot,
  csak megismétli.** Nem három független megerősítés, hanem egy hiba háromszor.
  A függetlenség a MÉRŐ függetlensége, nem a mért dologé -- tehát meglepő
  egyöntetűségnél váltsd le a mérőt (grep helyett tartalom-olvasás, stílus helyett
  transzkript), ne a mintát finomítsd.

  🔴 **És a fordítottja a veszélyesebb: a HELPER fájl az ÉLŐ oldalon lehet
  ELAVULTABB, és egy `--fix` némán visszacsinálja a repo-oldali javítást.**
  2026-08-31: javítottam a `seed-skills/fleet-helper/scripts/fleet.py`-t (stdin-út
  a content argumentumokhoz), felvittem a láncon -- majd egy későbbi
  `gg-skill-tukor-sync.sh --fix` a `~/.claude/skills/fleet-helper/` **augusztus
  2-i** másolatából visszaírta a régi fájlt, 25 sor törlésével. A SKILL.md maga
  szinkronban volt; csak a mellette lakó szkript nem, és a paritás-mérő
  „szinkronizálva" sort írt, nem hibát.
  **Két dolog vezetett ide, és mindkettő elkerülhető:**
  (1) a `--fix`-et `>/dev/null 2>&1`-gyel futtattam, tehát nem láttam, MIT nyúlt meg;
  (2) egy skill helper-fájljának két példánya volt, és senki nem ellenőrizte,
  melyik a frissebb -- pedig a projekt-gyökér alatti a futtatott, az élő skill
  alatti csak árnyék.
  **Eljárás:** a `--fix` kimenetét MINDIG olvasd el, és ha egy skillnek van
  helper-fájlja, a szinkron UTÁN nézd meg a `git diff --stat`-ot: ha a mirror-írás
  TÖRÖL sorokat egy szkriptből, az majdnem biztosan visszalépés, nem szinkron.

- **Never conclude "this skill is unversioned" from a single directory.** A
  versioned copy can live in any of several places, and this install has five:
  `seed-skills/` (goes to every install), `gg-skills/` (machine/org-specific,
  never seeded), `skills/`, plus `seed-scheduled-tasks/` and
  `templates/scheduled-tasks/` on the scheduled-task side. Measure with a full
  set difference — live set minus ALL of them — never by the absence of one:
  ```bash
  for s in $(ls ~/.claude/skills/); do
    git ls-files --error-unmatch "gg-skills/$s/SKILL.md" >/dev/null 2>&1 ||
    git ls-files --error-unmatch "seed-skills/$s/SKILL.md" >/dev/null 2>&1 ||
    git ls-files --error-unmatch "skills/$s/SKILL.md" >/dev/null 2>&1 ||
    echo "MISSING: $s"
  done
  ```
  2026-08-17: two separate false alarms in one morning from the one-directory
  shortcut — "7 unversioned scheduled tasks" (all seven were in
  `seed-scheduled-tasks/` / `templates/scheduled-tasks/`) and a miscount that
  swept in `skill-factory`, which lives under `skills/`. Both were reported
  before being measured, and one reached the owner.
- Do NOT auto-delete skills without user confirmation
- Do NOT create skills for one-off tasks (check the 2+ occurrence rule)
- Audit results are advisory, not auto-executed
- The `.skill-index.md` is for L0 matching only; the full SKILL.md is L1
- **Never extract `description:` with a one-line `grep`/`sed`.** A YAML folded or
  literal scalar (`description: >` / `description: |`) puts the text on the
  *following* indented lines, so the one-liner yields a bare `>` and the skill
  becomes invisible at L0. This silently hid 6 skills (2026-08-01). The
  generator's `extract_desc()` handles all three forms.
- **The index shows only the FIRST 120 CHARACTERS of `description:` — put the
  most distinctive trigger there.** `skill-index.sh` does `print(desc[:120])`,
  so anything past that is invisible at L0 matching, even though it is in the
  SKILL.md. 2026-08-09: `gg-mcp-iras-proxy` carried "git push GG repóba" late in
  its description; at L0 it read as a Linear-issue skill, so a 97 KB file was
  pushed the expensive way through `github_commit` and two fork hunks were
  reported as "cannot be uploaded" — the right tool was one index row away.
  Rule of thumb: first clause = what it does + the rarest keyword someone would
  type; the "Triggerelődik" list comes after.
- **Truncate by character, not by byte.** `cut -c` cuts bytes, which splits
  multi-byte UTF-8 mid-character; the index then reads as a binary file and
  `grep` returns *nothing at all* — looking exactly like "no such skill exists"
  rather than an error. Check with `file` after every regeneration.
- On macOS, `stat` syntax differs from Linux; the audit commands handle both
- If a skill references external APIs or tokens, never include the actual values
- **A helyben patchelt skill NEM vész el, de elszakad a repótól — és ez a
  csendesebb baj.** 2026-08-13-án négy SKILL.md-t írtam (`fleet-helper`,
  `gg-mcp-iras-proxy`, plusz a `reggeli-napindito` és a `gg-mcp-health`
  ütemezett feladat), és utólag mértem le, mi történik velük egy frissítéskor.
  A jó hír: az `update.sh` `refresh_untouched_seeds()`-e a
  `seed_copy_is_untouched()`-csel megnézi, hogy a telepített fájl hash-e
  megegyezik-e a repo utolsó 25 revíziójának valamelyikével; ha nem, **KEPT** —
  tehát a kézi javítást nem írja felül. A rossz hír: attól még csak ITT létezik.
  Konkrétan aznap: a `seed-skills/fleet-helper` és a
  `scheduled-tasks/reggeli-napindito` repo-másolata már ELTÉRT az élőtől, a
  `gg-mcp-iras-proxy` skillnek és a `gg-mcp-health` feladatnak pedig
  **egyáltalán nincs repo-másolata**. Egy friss telepítés tehát egyik mai
  tanulságot sem kapná meg.
  **Ezért patch után KÉRDEZD MEG magadtól: van-e ennek repo-párja?** ⚠️ KÉT helye
  lehet, és a választás nem ízlés kérdése: a `seed-skills/` **verbatim** megy ki
  minden telepítésre, tehát oda csak gép-független skill kerülhet; a gép- vagy
  GG-specifikus a `gg-skills/` alá való (verziózva, de nem seedelve). A teljes
  táblázat: `docs/gg-fork-konvenciok.md` 4b. szakasz.
  ```bash
  cd "${MARVEEN_ROOT:-$HOME/marveen}"
  N=<nev>
  for R in "seed-skills/$N/SKILL.md" "gg-skills/$N/SKILL.md"; do
    [ -f "$R" ] && { diff -q "$R" ~/.claude/skills/$N/SKILL.md >/dev/null \
      && echo "szinkronban: $R" || echo "ELTER -> felvinni: $R"; }
  done
  ```
  ⚠️ **És NE a `git status`-ra vagy a követett fájlok számára hagyatkozz: ebben az
  esetben MINDKETTŐ tisztát mutat.** 2026-08-26: két skillt patcheltem, egyiknek a
  tükörmásolatát sem frissítettem, és a `git status` üres volt (a követett fájlhoz
  hozzá se nyúltam), a `git ls-files | grep -c SKILL.md` pedig változatlan 41-et
  adott (a fájl létezik, csak elavult). A szivárgás egyetlen látható nyoma a fenti
  `diff` volt: 31, illetve 10 csak-élő sor. **A `skill-index.sh` lefuttatása sem
  bizonyíték**: az az indexet regenerálja, a tükröt nem érinti, tehát a „lefuttattam
  az indexelőt" érzés pont a hiányzó lépést fedi el. Aznap ugyanezt a mulasztást két
  külön körben ismételtem meg, mindkétszer indexeléssel a végén.
  Ha egyik sem létezik, a skill SEHOL nincs a repóban. 2026-08-13-án három
  ágens-specifikus skill volt pont ilyen (a `.gitignore` 15. sora zárta ki a
  `.claude/skills/`-t), és egyikük sem létezett egyetlen lemezen kívül.
  A felvitel a `gg-fork-push-lanc` szerint megy. Ha a gazda nem kéri, legalább
  **JELEZD** — a hallgatás azt üzeni, hogy a javítás a repóban van, pedig nincs.

- ✅ **2026-08-31 óta ez a szivárgás GÉPESÍTVE van, ne írj rá negyedik bekezdést.**
  A „patch után írd vissza a tükörbe" szabály háromszor bukott meg (08-19, 08-28,
  08-31), mindháromszor MÁS okból — vagyis nem figyelmetlenség volt, hanem hiányzó
  automatizmus. A mérő eddig is megvolt (`scripts/gg-skill-tukor-sync.sh`), a
  kiváltó hiányzott. Most `scripts/hooks/skill-mirror-guard.py` **Stop hookként**
  fut, és a kör végén jelzi, ha egy élő skill eltér a követett tükrétől; a
  bekötést a `scripts/install-skill-mirror-hook.sh` végzi, amit a `sync-hooks.sh`
  minden `update.sh`-nál lefuttat.
  🔴 **A tervezési tanulság általánosítható, és ez a lényeg: az EREDMÉNYRE illessz,
  ne a TOOL NEVÉRE.** A kézenfekvő megoldás egy `PostToolUse` hook lett volna a
  `Write|Edit`-re — és pont a hibát okozó esetet hagyta volna ki, mert a skill-fájlt
  aznap Bash-heredocból patcheltem. Ugyanez áll a `sed`-re és minden szkriptelt
  szerkesztésre. Ha egy szabály betartását automatizálod, kérdezd meg, hány úton
  lehet megszegni; ha többön, akkor az állapotot mérd, ne az utat.
  A hook szándékosan sosem blokkol (hibás payloadon és mérési hibán is exit 0), és
  egy órán belül nem ismétel — egy nagáló őr az első napon ki lenne kapcsolva.

## Relation to other mechanisms

| Mechanism | Skill-management's role |
|-----------|------------------------|
| retrospective | Retrospective proposes changes; skill-management executes them |
| CLAUDE.md | CLAUDE.md references skills; skill-management maintains the library |
| .skill-index.md | Skill-management regenerates this after mutations |
| seed-skills/ | Seed skills are templates; once installed they become regular skills managed here |
