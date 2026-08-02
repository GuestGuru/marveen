#!/bin/bash
# Skill Index Generator
# Generates a Level 0 index of all available skills (name + description only)
# This keeps token usage low while making all skills discoverable
#
# Usage: skill-index.sh [AGENT_DIR]
#   Without arg: generates global index at ~/.claude/skills/.skill-index.md
#   With AGENT_DIR: generates merged index (global + agent-specific) at
#                   <AGENT_DIR>/.claude/skills/.skill-index.md
#                   (backward-compatible format for no-arg callers)

GLOBAL_SKILLS_DIR="$HOME/.claude/skills"

if [ $# -ge 1 ]; then
  AGENT_DIR="$1"
  AGENT_SKILLS_DIR="$AGENT_DIR/.claude/skills"
  OUTPUT="$AGENT_SKILLS_DIR/.skill-index.md"
  MERGED=1
  mkdir -p "$AGENT_SKILLS_DIR"
else
  AGENT_DIR=""
  AGENT_SKILLS_DIR=""
  OUTPUT="$GLOBAL_SKILLS_DIR/.skill-index.md"
  MERGED=0
fi

if [ ! -d "$GLOBAL_SKILLS_DIR" ]; then
  echo "No global skills directory found at $GLOBAL_SKILLS_DIR"
  exit 0
fi

echo "# Skill Index (Level 0)" > "$OUTPUT"
echo "" >> "$OUTPUT"

if [ "$MERGED" = "1" ]; then
  echo "Ez az ágensspecifikus skill index: globális (~/.claude/skills) és ágensspecifikus (.claude/skills) skilleket egyaránt tartalmaz." >> "$OUTPUT"
  echo "Ha egy skill releváns, olvasd be a teljes SKILL.md-t (Level 1)." >> "$OUTPUT"
  echo "Ha segédfájlokra is szükség van, nézd meg a scripts/ és references/ mappákat (Level 2)." >> "$OUTPUT"
  echo "" >> "$OUTPUT"
  echo "| Skill | Leírás | Scope |" >> "$OUTPUT"
  echo "|-------|--------|-------|" >> "$OUTPUT"
else
  echo "Ez az összes elérhető skill rövid indexe. Csak a nevet és leírást tartalmazza (Level 0)." >> "$OUTPUT"
  echo "Ha egy skill releváns, olvasd be a teljes SKILL.md-t (Level 1)." >> "$OUTPUT"
  echo "Ha segédfájlokra is szükség van, nézd meg a scripts/ és references/ mappákat (Level 2)." >> "$OUTPUT"
  echo "" >> "$OUTPUT"
  echo "| Skill | Leírás |" >> "$OUTPUT"
  echo "|-------|--------|" >> "$OUTPUT"
fi

SKILL_COUNT=0

# GG fork: description kinyerése a YAML frontmatterből -- kezeli az egysoros,
# a folded (`>`) és a literal (`|`) formát is, karakter-alapon vág, és escape-eli
# a markdown tábla-elválasztó pipe-ot.
extract_desc() {
  python3 - "$1" <<'PY' 2>/dev/null
import re, sys
try:
    lines = open(sys.argv[1], encoding="utf-8", errors="replace").read().splitlines()
except OSError:
    sys.exit(0)

# frontmatter blokk: az első '---' és a lezáró '---' között
if not lines or lines[0].strip() != "---":
    sys.exit(0)
try:
    end = lines.index("---", 1)
except ValueError:
    end = len(lines)
fm = lines[1:end]

parts = []
for i, line in enumerate(fm):
    m = re.match(r"^description:\s*(.*)$", line)
    if not m:
        continue
    head = m.group(1).strip()
    if head in (">", "|", ">-", "|-", ">+", "|+"):
        # blokk-scalar: a következő behúzott sorok tartoznak hozzá
        for cont in fm[i + 1:]:
            if cont.strip() and not cont.startswith((" ", "\t")):
                break
            parts.append(cont.strip())
    else:
        parts.append(head)
    break

desc = " ".join(p for p in parts if p)
desc = desc.strip().strip("\"'")
desc = re.sub(r"\s+", " ", desc).replace("|", "\\|")
print(desc[:120])
PY
}

index_skills_dir() {
  local dir="$1"
  local scope="$2"  # only used when MERGED=1
  for skill_dir in "$dir"/*/; do
    [ -d "$skill_dir" ] || continue
    local skill_md="$skill_dir/SKILL.md"
    [ -f "$skill_md" ] || continue

    local name
    name=$(grep -m1 "^name:" "$skill_md" 2>/dev/null | sed 's/^name: *//' | tr -d '"' | tr -d "'")
    if [ -z "$name" ]; then
      name=$(basename "$skill_dir")
    fi

    local desc
    # GG fork: a korábbi grep+sed+cut nem kezelte a YAML folded/literal scalart
    # (`description: >`) -- 6 skill leírása üresen maradt --, és a `cut -c` bájtban
    # vágott, ami félbevágta az UTF-8 karaktereket (a fájl bináris lett a grep-nek).
    desc=$(extract_desc "$skill_md")
    if [ -z "$desc" ]; then
      desc="(nincs leírás)"
    fi

    if [ "$MERGED" = "1" ]; then
      echo "| \`$name\` | $desc | $scope |" >> "$OUTPUT"
    else
      echo "| \`$name\` | $desc |" >> "$OUTPUT"
    fi
    SKILL_COUNT=$((SKILL_COUNT + 1))
  done
}

index_skills_dir "$GLOBAL_SKILLS_DIR" "global"

if [ "$MERGED" = "1" ] && [ -d "$AGENT_SKILLS_DIR" ]; then
  index_skills_dir "$AGENT_SKILLS_DIR" "agent"
fi

echo "" >> "$OUTPUT"
echo "_${SKILL_COUNT} skill indexelve. Generálva: $(date '+%Y-%m-%d %H:%M')_" >> "$OUTPUT"

echo "Skill index generated: $OUTPUT ($SKILL_COUNT skills)"
