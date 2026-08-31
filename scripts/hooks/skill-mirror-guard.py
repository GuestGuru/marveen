#!/usr/bin/env python3
"""Stop hook: warn when a live SKILL.md has no up-to-date tracked mirror.

Why this exists
---------------
The rule "after patching a SKILL.md, write it back to the tracked mirror in the
SAME round" is documented in several skills, and it failed three times anyway
(2026-08-19, 2026-08-28, 2026-08-31) -- each time for a different reason. A rule
that depends on the agent remembering it is not a control; this hook is.

Why a Stop hook and not PostToolUse on Write|Edit
-------------------------------------------------
Skill files are frequently patched from Bash (python heredoc, sed) rather than
the Write/Edit tools, so a tool-name matcher would miss exactly the case that
caused the 2026-08-31 miss. Checking the parity state at end-of-turn is
tool-agnostic: it sees the result, not the route.

The measurement is delegated to scripts/gg-skill-tukor-sync.sh (exit 1 == some
mirror is stale or untracked), which takes ~0.4 s for the whole fleet.

Registration (user-level ~/.claude/settings.json, Stop):
  "command": "test -f /path/to/scripts/hooks/skill-mirror-guard.py && python3 ... || true"
"""
import json
import os
import subprocess
import sys
import time

# Do not nag on every turn: at most one warning per this many seconds.
DEBOUNCE_SECONDS = 3600


def _install_dir() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.dirname(os.path.dirname(here))


def _debounce_ok(marker: str) -> bool:
    try:
        if time.time() - os.path.getmtime(marker) < DEBOUNCE_SECONDS:
            return False
    except OSError:
        pass
    return True


def main() -> None:
    try:
        json.load(sys.stdin)
    except Exception:
        pass  # the payload is not needed; a malformed one must not block the turn

    install = _install_dir()
    script = os.path.join(install, "scripts", "gg-skill-tukor-sync.sh")
    if not os.path.isfile(script):
        sys.exit(0)

    marker = os.path.join(install, "store", ".skill-mirror-guard-last")
    if not _debounce_ok(marker):
        sys.exit(0)

    try:
        proc = subprocess.run(
            ["bash", script],
            cwd=install,
            capture_output=True,
            text=True,
            timeout=20,
        )
    except Exception:
        sys.exit(0)  # never block the agent on a measurement failure

    if proc.returncode == 0:
        sys.exit(0)

    stale = [
        line.strip()
        for line in proc.stdout.splitlines()
        if line.strip().startswith(("ELTER", "VERZIOZATLAN"))
    ]
    if not stale:
        sys.exit(0)

    try:
        with open(marker, "w") as f:
            f.write(str(int(time.time())))
    except OSError:
        pass

    detail = "; ".join(stale[:5])
    print(json.dumps({
        "systemMessage": (
            "skill-tukor: " + str(len(stale)) + " elo skill elter a kovetett tukortol "
            "vagy verziozatlan (" + detail + "). A javitas: "
            "scripts/gg-skill-tukor-sync.sh --fix, majd push-lanc. "
            "Eloszor olvasd el a csak-repo sorokat, a --fix nem gondolkodik."
        )
    }))
    sys.exit(0)


if __name__ == "__main__":
    main()
