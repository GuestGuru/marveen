#!/usr/bin/env bash
# Idempotent installer: register the skill-mirror guard as a Stop hook in the
# user-level ~/.claude/settings.json. Auto-run by scripts/sync-hooks.sh on update.
#
# What it guards: a live SKILL.md patched without writing the change back to its
# tracked mirror stays unversioned and is lost on reinstall. The rule to write it
# back is documented in several skills and still failed three times
# (2026-08-19, 2026-08-28, 2026-08-31), each for a different reason -- so the
# reminder has to be mechanical, not remembered.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$ROOT/scripts/hooks/skill-mirror-guard.py"
SETTINGS="${CLAUDE_SETTINGS:-$HOME/.claude/settings.json}"

[ -f "$HOOK" ] || { echo "  skill-mirror guard: $HOOK hianyzik, kihagyva"; exit 0; }
[ -f "$SETTINGS" ] || { echo "  skill-mirror guard: $SETTINGS nincs, kihagyva"; exit 0; }

PY="$(command -v python3 || echo /usr/bin/python3)"

"$PY" - "$SETTINGS" "$HOOK" <<'PYEOF'
import json, sys

settings_path, hook_path = sys.argv[1], sys.argv[2]
command = f"test -f {hook_path} && /usr/bin/python3 {hook_path} || true"

with open(settings_path) as f:
    data = json.load(f)

stop = data.setdefault("hooks", {}).setdefault("Stop", [])
already = any(
    "skill-mirror-guard" in (h.get("command") or "")
    for matcher in stop
    for h in matcher.get("hooks", [])
)
if already:
    print("  skill-mirror guard: mar be van kotve, kihagyva")
    sys.exit(0)

stop.append({"hooks": [{"type": "command", "command": command}]})
with open(settings_path, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("  skill-mirror guard: Stop hook bekotve")
PYEOF
