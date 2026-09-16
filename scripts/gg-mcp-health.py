#!/usr/bin/env python3
"""GG fork: fleet-wide gg-mcp (gg-access) liveness + staleness probe.

Why this exists (2026-08-10): salesninja's stdio gg-mcp server exited silently
on 2026-08-08 and nothing noticed for two days. A stdio MCP server that dies is
invisible: Claude Code does not restart it, writes no further log line, and the
agent itself cannot tell -- it just stops seeing the tools. The only reliable
signal is the process table, so that is what this probes.

Three independent failure modes, all silent:

  DEAD     -- the agent declares gg-access in .mcp.json but has no live
              `<node> <gg-mcp>/dist/index.js` child under its claude process.
  STALE    -- the server IS alive, but the claude session started before the
              current gg-mcp build, so it is running superseded code. (Restarting
              gg-mcp alone cannot fix this: the stdio child is spawned once, at
              session start, and lives as long as the session.)
  NO_TOKEN -- the proxy is alive but has no identity, so every gg_* call fails
              except the login tool. Added 2026-08-15, after the probe reported
              a clean `ok` for brokermarcsi at 14:00 on 08-14 while that agent's
              own memory recorded that it could reach no GG system at all: it
              had started at 13:51 and its token file was not written until
              13:59. A live child proved only that a process exists, and this
              probe was reporting exactly that while implying more.

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
one DEAD, STALE or NO_TOKEN agent, 2 = the probe itself could not run.
`starting`, `remote` and `unknown` are not faults and do not affect the exit
code.
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


# ---------------------------------------------------------------------------
# Service-level check: does the gg-mcp SERVICE answer at all?
#
# Why this exists (2026-09-16). At 14:00 the gg-mcp key issuance went down for
# the whole fleet: every `proxy.js exec` and every MCP-path tool call died with
# "fetch failed". This probe had run five minutes earlier and reported
# `problems: 0`, and it would have kept reporting 0 for the entire outage.
# Nothing it looks at had changed: all seven proxy.js children were alive (a
# stdio child does not exit when its upstream dies), every token file was in
# place, and the build was untouched.
#
# The gap is structural, not a missed case. Everything above this line is about
# the CLIENT side -- is there a process, is it current, does it have an
# identity. None of it touches the service that client talks to.
# `remote_reachable` is the closest thing and it never runs for this fleet: it
# only fires for an entry with a `url` (or type http|sse), while all seven
# agents here are stdio entries that carry their upstream in
# `env.GG_MCP_UPSTREAM_URL`. Measured 2026-09-16: zero of seven classified as
# remote, so that TCP check was dead code on this machine.
#
# What is checked instead: GET /health on each distinct upstream that a live
# agent actually declares. That route is the ONE unauthenticated route on the
# gg-mcp HTTP gate (src/http.ts; src/http-oauth.ts states the exemption
# explicitly) -- everything else sits behind Bearer. So this check needs no
# token, issues no credential, writes no audit entry and cannot leak an
# identity, which is what makes it safe to run fleet-wide from one place on a
# 2-hourly timer.
#
# WHAT IT STILL CANNOT SEE, stated rather than papered over: /health is a
# static handler. A service that is up but whose key issuance is broken answers
# 200, and this check goes green. It catches the failure mode we actually had
# -- the HTTP gate unreachable, which jean measured as HTTP 000 on
# 127.0.0.1:3450 at 14:05 while a healthy gate answers 200 there -- not every
# possible one. The honest check for issuance itself would be a real
# `exec --alias`, and that issues a live credential into a child process env on
# every single run. That price is not worth paying on a timer.
UPSTREAM_HEALTH_PATH = "/health"
# Longer than REMOTE_PROBE_TIMEOUT_S: that one only completes a TCP handshake,
# this one waits for the service to answer through the local forwarder.
UPSTREAM_PROBE_TIMEOUT_S = 4.0


def upstream_url_for(entry: dict | None) -> str | None:
    """The gg-mcp service URL this agent talks to, or None if it cannot be read.

    Two shapes, because the fleet has both: a remote entry states its `url`
    outright, and a stdio proxy entry carries the service URL in
    `env.GG_MCP_UPSTREAM_URL`. The env form is the one every agent here uses,
    and it is invisible to `remote_target` by design -- that function answers
    "is this entry remote", which a proxy entry is not.
    """
    if not isinstance(entry, dict):
        return None
    url = entry.get("url")
    if isinstance(url, str) and url:
        return url
    env = entry.get("env")
    if isinstance(env, dict):
        value = env.get("GG_MCP_UPSTREAM_URL")
        if isinstance(value, str) and value:
            return value
    return None


def _is_loopback(host: str) -> bool:
    return host in ("localhost", "::1", "[::1]") or host.startswith("127.")


def upstream_health(url: str) -> dict:
    """GET <url>/health -> {"state": "ok"|"fault"|"unknown", "detail": str}.

    ok      -- HTTP 200 with a JSON body whose `ok` is true.
    fault   -- the service answered wrong (any other status, or a body that is
               not `ok`), refused or reset the connection, or is a LOOPBACK
               upstream that did not answer within the timeout.
    unknown -- a NON-loopback upstream timed out or failed to resolve.

    The loopback/remote split is the one place this deliberately differs from
    `remote_reachable` above. That function refuses to call a timeout a fault
    because the cause may be this box's own network, and a monitor that turns
    its own blind spot into an alarm is worse than one that admits it cannot
    see. That reasoning holds for a host across the tailnet. It does not hold
    for 127.0.0.1: there is no network in between, so a local forwarder that
    cannot answer in four seconds IS the fault being looked for, and calling it
    "cannot tell" would reintroduce exactly the silence this check was added to
    end.
    """
    import socket
    import urllib.error
    import urllib.request
    from urllib.parse import urlsplit, urlunsplit

    parts = urlsplit(url)
    host = parts.hostname or ""
    target = urlunsplit((parts.scheme, parts.netloc, UPSTREAM_HEALTH_PATH, "", ""))
    loopback = _is_loopback(host)
    try:
        with urllib.request.urlopen(target, timeout=UPSTREAM_PROBE_TIMEOUT_S) as resp:
            status = resp.status
            body = resp.read(4096).decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        # The service DID answer, with the wrong thing. /health is the one route
        # that must never need a token, so a 401 here is as much a fault as a 500.
        return {"state": "fault", "detail": f"/health HTTP {exc.code}"}
    except urllib.error.URLError as exc:
        reason = exc.reason
        if isinstance(reason, socket.gaierror):
            # A name that does not resolve is a configuration fault wherever it
            # points, but only the caller can judge intent, so it is reported
            # with the reason attached and left out of the alarm for a remote
            # host, exactly as a timeout is.
            detail = f"a nev nem oldhato fel ({host})"
            return {"state": "fault" if loopback else "unknown", "detail": detail}
        if isinstance(reason, socket.timeout) or isinstance(exc, TimeoutError):
            return {
                "state": "fault" if loopback else "unknown",
                "detail": f"nincs valasz {UPSTREAM_PROBE_TIMEOUT_S:g}s alatt",
            }
        return {"state": "fault", "detail": f"kapcsolodasi hiba: {reason}"}
    except (TimeoutError, socket.timeout):
        return {
            "state": "fault" if loopback else "unknown",
            "detail": f"nincs valasz {UPSTREAM_PROBE_TIMEOUT_S:g}s alatt",
        }
    except OSError as exc:
        return {"state": "fault", "detail": f"kapcsolodasi hiba: {exc}"}

    if status != 200:
        return {"state": "fault", "detail": f"/health HTTP {status}"}
    try:
        payload = json.loads(body)
    except ValueError:
        return {"state": "fault", "detail": "/health valasza nem JSON"}
    if not (isinstance(payload, dict) and payload.get("ok") is True):
        return {"state": "fault", "detail": f"/health nem ok: {body[:120]}"}
    return {"state": "ok", "detail": f"HTTP 200, transport={payload.get('transport')}"}


def live_upstream(mcp_pid: int) -> str | None:
    """The upstream URL the RUNNING server child actually carries, or None.

    Why this is not the same question as reading .mcp.json (measured
    2026-09-16). An MCP server child is spawned once, at session start, with the
    env the config file held AT THAT MOMENT. Edit the file afterwards and the
    two part ways silently: the process keeps working on the old value, the file
    describes a future that has not happened yet, and every check that reads
    only one of them is right about a different machine.

    That is not hypothetical. This agent's own .mcp.json was repointed at
    08:30 to a hostname that does not resolve on this box (Tailscale DNS is
    off), while the child spawned at 03:01 kept using the working loopback
    address. GG access therefore hung on a stale in-memory value for nine and a
    half hours, and would have died at the next session start or /mcp
    reconnect. Nothing reported it: `config_mtime_after` sees the edit, but
    probe() only consults it when there is no live child to observe, which is
    exactly the case where the divergence is real.

    The mtime is the weaker signal anyway -- it says the file was written, not
    that anything changed. This reads what the process is actually using.
    """
    for line in _read(f"/proc/{mcp_pid}/environ").split("\0"):
        if line.startswith("GG_MCP_UPSTREAM_URL="):
            return line.split("=", 1)[1] or None
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


def token_file_for(entry: dict | None) -> str | None:
    """The token file this gg-access entry pins its identity to, or None.

    Proxy mode carries identity in exactly one place: the file named by
    GG_MCP_TOKEN_FILE (src/proxy.ts, proxyDepsFromEnv). No env, no file, no
    identity -- and the proxy falls back to the HOME default, which on this
    multi-agent box is the ambient identity the trap check below warns about.
    """
    if not isinstance(entry, dict):
        return None
    env = entry.get("env")
    if not isinstance(env, dict):
        return None
    path = env.get("GG_MCP_TOKEN_FILE")
    return str(path) if isinstance(path, str) and path else None


def token_state(server_path: str | None, entry: dict | None) -> tuple[str | None, str | None, float | None]:
    """(state, path, mtime) of this agent's proxy identity.

    state is None for anything that is not proxy mode -- the direct server
    (index.js) takes its caller token from its own config, so a missing
    GG_MCP_TOKEN_FILE there proves nothing and must not be reported as a fault.

    Only existence and non-emptiness are measured. An expired or revoked token
    is a live file and looks identical from here; the detail text says so rather
    than letting `ok` be read as "the token still works".
    """
    if not server_path or "proxy.js" not in server_path:
        return None, None, None
    path = token_file_for(entry)
    if not path:
        return "undeclared", None, None
    try:
        st = os.stat(path)
    except OSError:
        return "missing_file", path, None
    if st.st_size == 0:
        return "missing_file", path, st.st_mtime
    return "ok", path, st.st_mtime


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
             config_changed_after_start: bool = False,
             token: str | None = None) -> tuple[str, str | None]:
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
    # A live child is a process, not an identity. The proxy reads its token file
    # ONCE, at startup, so a session that came up without one stays blind until
    # somebody logs in through it -- and the agent cannot tell, because it sees a
    # shrunken tool list rather than an error. Ranked below DEAD (no process is
    # worse than no rights) and above STALE (running old code still beats
    # reaching nothing at all).
    if token == "undeclared":
        return "NO_TOKEN", ("proxy mode with no GG_MCP_TOKEN_FILE: identity falls back to the "
                            "HOME default (~/.gg-mcp/token), which is ambient on this box")
    if token == "missing_file":
        return "NO_TOKEN", ("the declared token file is missing or empty; this agent runs in "
                            "login mode and reaches NO GG system. Fix by pairing it -- a "
                            "restart alone will not help")
    if build_ts is not None and session_start_ts < build_ts:
        return "STALE", "session predates the current gg-mcp build; restart to pick it up"
    return "ok", None


def probe() -> dict:
    procs = scan_processes()
    children: dict[int, list[int]] = {}
    for pid, info in procs.items():
        children.setdefault(info["ppid"], []).append(pid)

    findings = []
    # upstream URL -> the live agents that declare it. Collected here rather
    # than by walking agents/ so the report covers what is RUNNING, not what a
    # stale directory still contains.
    upstreams: dict[str, list[str]] = {}
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

        upstream = upstream_url_for(entry)
        if upstream:
            upstreams.setdefault(upstream, []).append(name)

        alive = [c for c in children.get(pid, []) if server_needle_in(procs[c]["cmdline"])]
        built = build_mtime(server_path)
        age = time.time() - info["start_ts"]
        target = remote_target(entry)
        # A live child settles it: the session is demonstrably on stdio, whatever
        # the file says now. Only trust the file when there is nothing to observe.
        is_remote = target is not None and not alive
        tok_state, tok_path, tok_mtime = token_state(server_path, entry)
        status, detail = classify(
            bool(alive), age, info["start_ts"], built,
            is_remote=is_remote,
            remote_ok=remote_reachable(target) if is_remote else None,
            config_changed_after_start=config_mtime_after(cwd, info["start_ts"]),
            token=None if is_remote else tok_state,
        )
        row = {
            "agent": name,
            "pid": pid,
            "session_started": time.strftime("%F %T", time.localtime(info["start_ts"])),
            "session_age_h": round(age / 3600.0, 1),
            "server_path": server_path,
            "status": status,
        }
        if upstream:
            row["upstream"] = upstream
        # The file says one thing, the running child may carry another. Stated as
        # a fact, never as a fault: both readings are legitimate (a config just
        # repaired and awaiting a restart looks identical to one just broken),
        # and the process table cannot separate them. What it must not do is stay
        # silent, because the two only diverge when something edited the file
        # under a live session.
        if alive:
            live = live_upstream(alive[0])
            if live and live != upstream:
                row["upstream_live"] = live
                row["upstream_differs_from_config"] = True
                # Probe the live one too: it is what this agent uses RIGHT NOW,
                # while the config value is what it will use after a restart.
                upstreams.setdefault(live, []).append(name)
        if is_remote and target:
            row["remote_endpoint"] = f"{target[0]}:{target[1]}"
        if alive:
            row["mcp_pid"] = alive[0]
        if built is not None:
            row["build_time"] = time.strftime("%F %T", time.localtime(built))
        if tok_path:
            row["token_file"] = tok_path
        if tok_mtime is not None:
            row["token_mtime"] = time.strftime("%F %T", time.localtime(tok_mtime))
            # Informational, never a fault. Two readings fit: the session paired
            # itself (normal onboarding -- it holds the token in memory and is
            # fine), or somebody wrote the file out of band, in which case this
            # session never loaded it. The process table cannot separate the two,
            # so the probe states the fact and declines to guess.
            if tok_mtime > info["start_ts"]:
                row["token_written_after_session_start"] = True
        if detail:
            row["detail"] = detail
        findings.append(row)

    findings.sort(key=lambda r: (r["status"] == "ok", r["agent"]))
    bad = [r for r in findings if r["status"] in ("DEAD", "STALE", "NO_TOKEN")]
    result = {
        "checked_at": time.strftime("%F %T %Z"),
        "agents_checked": len(findings),
        "problems": len(bad),
        "findings": findings,
    }

    # Service-level, once per distinct upstream: seven agents sharing one
    # forwarder must not produce seven copies of one service fault.
    if upstreams:
        rows = []
        for url in sorted(upstreams):
            health = upstream_health(url)
            rows.append({
                "url": url,
                "agents": sorted(upstreams[url]),
                "state": health["state"],
                "detail": health["detail"],
            })
        result["upstreams"] = rows
        result["problems"] += sum(1 for r in rows if r["state"] == "fault")

    trap = ambient_token_trap()
    if trap:
        result["ambient_token_trap"] = trap
        result["problems"] += 1
    return result


# The proxy's own fallback, when nobody sets GG_MCP_TOKEN_FILE. On a
# single-user client machine this is correct -- it is that user's own token,
# written there by scripts/install-proxy.mjs (CEL_DIR = ~/.gg-mcp). On THIS
# machine, where several agents share one POSIX user, it would be an ambient
# identity: every agent that invoked the bundle directly would silently become
# whoever that token belongs to.
AMBIENT_TOKEN_PATH = os.path.join(os.path.expanduser("~"), ".gg-mcp", "token")


def ambient_token_trap() -> dict | None:
    """Report the proxy's HOME-default token file if it ever appears.

    Why this check exists (2026-08-13). The identity leak fixed that day lived
    in the `gg-mcp-proxy` wrapper, which is now fail-closed. But the wrapper is
    only one of the two ways in: `node .../dist/proxy.js exec` skips it, and
    proxy.ts still falls back to this path (src/proxy.ts, proxyDepsFromEnv).

    Today that fallback is harmless ONLY because the file does not exist -- a
    direct call without GG_MCP_TOKEN_FILE gets a quiet 401 instead of someone
    else's rights. That is luck, not a defence: the day this file appears (a
    stray `gg-mcp pair` as the `gg` user, a copied client install), the hole
    reopens silently and with no error message to warn the caller.

    marlenka spotted the gap and measured it; this turns the luck into an
    alarm. Deliberately NOT a fix: removing the proxy's default would break the
    documented one-step client install, where it is the right behaviour.
    """
    if not os.path.exists(AMBIENT_TOKEN_PATH):
        return None
    return {
        "path": AMBIENT_TOKEN_PATH,
        "why": (
            "A proxy HOME-alapertelmezese. Ezen a tobb-agenses gepen ez KOZOS "
            "identitas: barmelyik agens, aki GG_MCP_TOKEN_FILE nelkul hivja "
            "kozvetlenul a dist/proxy.js-t, ennek a tokennek a nevesben es "
            "jogaval fut. A wrapper (gg-mcp-proxy) fail-closed, de a kozvetlen "
            "hivas megkeruli."
        ),
        "teendo": (
            "Ellenorizd, ki hozta letre es mire kell. Ha nem kell, toroljed. "
            "Amig letezik, minden shell-uti hivas ADJA MEG expliciten a sajat "
            "GG_MCP_TOKEN_FILE-jat."
        ),
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
