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

2026-08-12 -- "no child process" stopped meaning "broken". gg-mcp also runs as a
Streamable-HTTP service, and an agent pointed at it has NO child by design. The
probe reported the main agent DEAD while its tools were demonstrably working,
which is the expensive kind of wrong: a monitor that cries wolf every 30 minutes
trains everyone to ignore it, and being ignored is exactly how the 2026-08-08
outage lasted two days. Two blind spots were fixed:

  remote  -- a gg-access entry with `url` (or `type: http|sse`) is checked by
             asking whether the endpoint accepts a TCP connection, not by
             hunting for a child that will never exist. NOTE the limit: a live
             socket proves the SERVICE is up, not that this agent's token is
             still accepted. Token-level failure is invisible here, and the
             probe says so rather than implying a clean bill of health.
  unknown -- .mcp.json changed AFTER the session started, so the file on disk is
             not what the session loaded. The process table cannot settle that
             disagreement, so the probe declines to guess instead of reporting a
             death it cannot substantiate. A session restart resolves it.

Dependency-free on purpose: it must keep working when the dashboard, the
network, or the MCP layer itself is the thing that is broken. The remote check
is a stdlib TCP connect with a short timeout -- deliberately NOT an
authenticated HTTP request, because a monitoring script should not be reading
tokens out of configs and putting them on the wire.

Output: JSON on stdout. Exit 0 = every configured agent healthy, 1 = at least
one DEAD or STALE agent, 2 = the probe itself could not run. `starting`,
`remote` and `unknown` are not faults and do not affect the exit code.
"""

from __future__ import annotations

import json
import os
import sys
import time

PROJECT_ROOT = os.environ.get("MARVEEN_ROOT", "/home/gg/marveen")
AGENTS_DIR = os.path.join(PROJECT_ROOT, "agents")
# The server binaries an agent's .mcp.json may point at. Matched as substrings of
# the child's cmdline rather than parsed, so a wrapper (nvm shim, `node --flag`)
# still counts as alive.
#
# proxy.js is the third shape (2026-08-12): stdio toward Claude Code, HTTP toward
# the gg-mcp service, per-agent identity from the token FILE. It is a live server
# child in every sense that matters here, and matching only index.js would report
# every proxy-mode agent DEAD -- the same false alarm this probe was fixed for
# hours earlier, one shape further along. Whenever a new way to reach gg-mcp
# appears, it belongs in this tuple before anyone is switched onto it.
SERVER_NEEDLES = ("gg-mcp/dist/index.js", "gg-mcp/dist/proxy.js")
# Kept for callers that predate the tuple; the direct server remains the default.
SERVER_NEEDLE = SERVER_NEEDLES[0]


def server_needle_in(text: str) -> str | None:
    """The gg-mcp server binary this cmdline/arg refers to, or None."""
    return next((n for n in SERVER_NEEDLES if n in text), None)


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


def gg_access_config(cwd: str) -> dict | None:
    """The raw gg-access entry from this workdir's .mcp.json, or None.

    A malformed or missing file is deliberately not a fault: the probe reports on
    agents it can read, and an unreadable config is the operator's problem, not a
    dead server.
    """
    try:
        with open(os.path.join(cwd, ".mcp.json")) as fh:
            cfg = json.load(fh)
    except (OSError, ValueError):
        return None
    server = (cfg.get("mcpServers") or {}).get("gg-access")
    return server if isinstance(server, dict) else None


def declares_gg_access(cwd: str) -> tuple[bool, str | None]:
    """Does this workdir configure a gg-access server? -> (yes, stdio server path)

    The path is None for a remote entry (there is no local binary to stat), which
    is also why staleness cannot be computed for one.
    """
    server = gg_access_config(cwd)
    if server is None:
        return False, None
    for arg in server.get("args") or []:
        if server_needle_in(str(arg)):
            return True, str(arg)
    return True, None


def remote_target(server: dict | None) -> tuple[str, int] | None:
    """(host, port) if this gg-access entry talks to a remote endpoint, else None.

    Mirrors src/gg/mcp-identity.ts `isRemoteEntry`: a `url` is enough on its own,
    whatever `type` claims. Kept deliberately broad for the same reason -- the
    cost of misreading a remote entry as stdio is a false death report.
    """
    if not isinstance(server, dict):
        return None
    url = server.get("url")
    if not isinstance(url, str) or not url:
        return ("", 0) if server.get("type") in ("http", "sse") else None
    from urllib.parse import urlsplit
    parts = urlsplit(url)
    if not parts.hostname:
        return ("", 0)
    return parts.hostname, parts.port or (443 if parts.scheme == "https" else 80)


# A monitor must not hang on a wedged endpoint: the whole point is to report.
REMOTE_PROBE_TIMEOUT_S = 2.0


def remote_reachable(target: tuple[str, int] | None) -> bool | None:
    """True = the endpoint accepts connections, False = refused, None = can't tell.

    A refused connection is a real, actionable fault (the service is down). A
    timeout or DNS failure is NOT reported as death: the fault may be this box's
    network, and a monitor that turns its own blind spot into an alarm is worse
    than one that admits it cannot see.
    """
    import socket
    if not target or not target[0] or not target[1]:
        return None
    try:
        with socket.create_connection(target, timeout=REMOTE_PROBE_TIMEOUT_S):
            return True
    except ConnectionRefusedError:
        return False
    except OSError:
        return None


def config_mtime_after(cwd: str, session_start_ts: float) -> bool:
    """Was .mcp.json last written AFTER this session started?

    If so, the declaration on disk is not what the session loaded, and no
    conclusion about the running process can be drawn from it. A missing or
    unreadable file answers False: absence of evidence is not a config change.
    """
    try:
        return os.stat(os.path.join(cwd, ".mcp.json")).st_mtime > session_start_ts
    except OSError:
        return False


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
             build_ts: float | None, *, is_remote: bool = False,
             remote_ok: bool | None = None,
             config_changed_after_start: bool = False) -> tuple[str, str | None]:
    """Pure status decision -> (status, detail).

    Kept free of /proc, the clock and the filesystem so the failure modes that
    matter can be tested without staging a dead MCP server. Same rationale as
    src/auto-restart.ts keeping its due-decision dependency-free.

    The 2026-08-12 additions are keyword-only with safe defaults, so the original
    four-argument stdio call keeps its exact meaning.
    """
    # Remote: no child is expected, and staleness does not apply -- the service
    # is restarted independently of the session, which is the entire reason to
    # run it this way.
    if is_remote:
        if remote_ok is False:
            return "DEAD", "remote gg-access endpoint refused the connection; the service is down"
        if remote_ok is None:
            return "remote", "remote gg-access; endpoint could not be probed from here"
        return "ok", "remote gg-access; socket is up (does NOT prove the token is still accepted)"

    if not has_live_server:
        if session_age_s < STARTUP_GRACE_S:
            return "starting", None
        # The file on disk is not what this session loaded, so its declaration
        # proves nothing about the running process. Reporting death here is how
        # the probe cried wolf at itself on 2026-08-12.
        if config_changed_after_start:
            return "unknown", ".mcp.json changed after this session started; restart to settle it"
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
        entry = gg_access_config(cwd)
        declared, server_path = declares_gg_access(cwd)
        if not declared:
            continue  # agent legitimately has no gg-access -- not a fault

        alive = [c for c in children.get(pid, []) if server_needle_in(procs[c]["cmdline"])]
        built = build_mtime(server_path)
        age = time.time() - info["start_ts"]
        target = remote_target(entry)
        # A live child settles it: the session is demonstrably on stdio, whatever
        # the file says now. Only trust the file when there is nothing to observe.
        is_remote = target is not None and not alive
        status, detail = classify(
            bool(alive), age, info["start_ts"], built,
            is_remote=is_remote,
            remote_ok=remote_reachable(target) if is_remote else None,
            config_changed_after_start=config_mtime_after(cwd, info["start_ts"]),
        )
        row = {
            "agent": name,
            "pid": pid,
            "session_started": time.strftime("%F %T", time.localtime(info["start_ts"])),
            "session_age_h": round(age / 3600.0, 1),
            "server_path": server_path,
            "status": status,
        }
        if is_remote and target:
            row["remote_endpoint"] = f"{target[0]}:{target[1]}"
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
