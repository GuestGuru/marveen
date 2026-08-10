#!/usr/bin/env python3
"""GG fork: fleet-wide gg-mcp (gg-access) liveness + staleness probe.

Why this exists (2026-08-10): salesninja's stdio gg-mcp server exited silently
on 2026-08-08 and nothing noticed for two days. A stdio MCP server that dies is
invisible: Claude Code does not restart it, writes no further log line, and the
agent itself cannot tell -- it just stops seeing the tools. The only reliable
signal is the process table, so that is what this probes.

Two independent failure modes, both silent:

  DEAD   -- the agent declares gg-access in .mcp.json but has no live
            `<node> <gg-mcp>/dist/index.js` child under its claude process.
  STALE  -- the server IS alive, but the claude session started before the
            current gg-mcp build, so it is running superseded code. (Restarting
            gg-mcp alone cannot fix this: the stdio child is spawned once, at
            session start, and lives as long as the session.)

Dependency-free on purpose: it must keep working when the dashboard, the
network, or the MCP layer itself is the thing that is broken.

Output: JSON on stdout. Exit 0 = every configured agent healthy, 1 = at least
one DEAD or STALE agent, 2 = the probe itself could not run.
"""

from __future__ import annotations

import json
import os
import sys
import time

PROJECT_ROOT = os.environ.get("MARVEEN_ROOT", "/home/gg/marveen")
AGENTS_DIR = os.path.join(PROJECT_ROOT, "agents")
# The server binary every agent's .mcp.json points at. Matched as a substring of
# the child's cmdline rather than parsed, so a wrapper (nvm shim, `node --flag`)
# still counts as alive.
SERVER_NEEDLE = "gg-mcp/dist/index.js"


def _read(path: str) -> str:
    try:
        with open(path, "rb") as fh:
            return fh.read().decode("utf-8", "replace")
    except OSError:
        return ""


def boot_time() -> float:
    """Seconds since epoch at which the kernel booted (for /proc starttime)."""
    for line in _read("/proc/stat").splitlines():
        if line.startswith("btime "):
            return float(line.split()[1])
    # Fallback: derive from uptime. Less exact, but only used for a coarse
    # "older than the build" comparison.
    up = _read("/proc/uptime").split()
    return time.time() - float(up[0]) if up else 0.0


def scan_processes() -> dict[int, dict]:
    """pid -> {ppid, cmdline, start_ts}. Skips processes that vanish mid-scan."""
    btime = boot_time()
    ticks = os.sysconf("SC_CLK_TCK")
    procs: dict[int, dict] = {}
    for entry in os.listdir("/proc"):
        if not entry.isdigit():
            continue
        pid = int(entry)
        stat = _read(f"/proc/{pid}/stat")
        if not stat:
            continue
        # The comm field is parenthesised and may contain spaces, so split on the
        # LAST ')' -- the classic /proc/stat parsing trap.
        close = stat.rfind(")")
        if close < 0:
            continue
        rest = stat[close + 2 :].split()
        if len(rest) < 20:
            continue
        try:
            ppid = int(rest[1])
            start_ts = btime + (float(rest[19]) / ticks)
        except (ValueError, ZeroDivisionError):
            continue
        procs[pid] = {
            "ppid": ppid,
            "cmdline": _read(f"/proc/{pid}/cmdline").replace("\0", " ").strip(),
            "start_ts": start_ts,
        }
    return procs


def agent_name_for(cwd: str) -> str | None:
    """Map a claude process's cwd to a fleet agent name, or None if unrelated."""
    cwd = os.path.realpath(cwd)
    if cwd == os.path.realpath(PROJECT_ROOT):
        return "main"
    parent = os.path.dirname(cwd)
    if os.path.realpath(parent) == os.path.realpath(AGENTS_DIR):
        return os.path.basename(cwd)
    return None


def declares_gg_access(cwd: str) -> tuple[bool, str | None]:
    """Does this workdir configure a gg-access stdio server? -> (yes, server path)"""
    try:
        with open(os.path.join(cwd, ".mcp.json")) as fh:
            cfg = json.load(fh)
    except (OSError, ValueError):
        return False, None
    server = (cfg.get("mcpServers") or {}).get("gg-access")
    if not isinstance(server, dict):
        return False, None
    for arg in server.get("args") or []:
        if SERVER_NEEDLE in str(arg):
            return True, str(arg)
    return True, None


def build_mtime(server_path: str | None) -> float | None:
    if not server_path:
        return None
    try:
        return os.stat(server_path).st_mtime
    except OSError:
        return None


# Grace period: a session that started seconds ago has not necessarily spawned
# its MCP children yet. Below this age a missing server is "starting", not DEAD.
STARTUP_GRACE_S = 180


def classify(has_live_server: bool, session_age_s: float, session_start_ts: float,
             build_ts: float | None) -> tuple[str, str | None]:
    """Pure status decision -> (status, detail).

    Kept free of /proc, the clock and the filesystem so the two failure modes
    that matter can be tested without staging a dead MCP server. Same rationale
    as src/auto-restart.ts keeping its due-decision dependency-free.
    """
    if not has_live_server:
        if session_age_s < STARTUP_GRACE_S:
            return "starting", None
        return "DEAD", "declares gg-access but has no live server child"
    if build_ts is not None and session_start_ts < build_ts:
        return "STALE", "session predates the current gg-mcp build; restart to pick it up"
    return "ok", None


def probe() -> dict:
    procs = scan_processes()
    children: dict[int, list[int]] = {}
    for pid, info in procs.items():
        children.setdefault(info["ppid"], []).append(pid)

    findings = []
    for pid, info in procs.items():
        cmd = info["cmdline"]
        # A fleet session is a `claude` process launched by the fleet launcher.
        # --dangerously-skip-permissions is what every launch path sets, so it
        # separates real agents from an operator's interactive `claude`.
        if "/claude " not in cmd + " " and not cmd.startswith("claude"):
            continue
        if "--dangerously-skip-permissions" not in cmd:
            continue
        cwd = os.readlink(f"/proc/{pid}/cwd") if os.path.exists(f"/proc/{pid}/cwd") else ""
        if not cwd:
            continue
        name = agent_name_for(cwd)
        if not name:
            continue
        declared, server_path = declares_gg_access(cwd)
        if not declared:
            continue  # agent legitimately has no gg-access -- not a fault

        alive = [c for c in children.get(pid, []) if SERVER_NEEDLE in procs[c]["cmdline"]]
        built = build_mtime(server_path)
        age = time.time() - info["start_ts"]
        status, detail = classify(bool(alive), age, info["start_ts"], built)
        row = {
            "agent": name,
            "pid": pid,
            "session_started": time.strftime("%F %T", time.localtime(info["start_ts"])),
            "session_age_h": round(age / 3600.0, 1),
            "server_path": server_path,
            "status": status,
        }
        if alive:
            row["mcp_pid"] = alive[0]
        if built is not None:
            row["build_time"] = time.strftime("%F %T", time.localtime(built))
        if detail:
            row["detail"] = detail
        findings.append(row)

    findings.sort(key=lambda r: (r["status"] == "ok", r["agent"]))
    bad = [r for r in findings if r["status"] in ("DEAD", "STALE")]
    return {
        "checked_at": time.strftime("%F %T %Z"),
        "agents_checked": len(findings),
        "problems": len(bad),
        "findings": findings,
    }


def main() -> int:
    if not os.path.isdir("/proc/1"):
        print(json.dumps({"error": "no /proc -- this probe is Linux-only"}))
        return 2
    result = probe()
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 1 if result["problems"] else 0


if __name__ == "__main__":
    sys.exit(main())
