#!/usr/bin/env python3
"""GG fork: tests for the gg-mcp fleet health probe.

Covers the two silent failure modes the probe exists for. They cannot be
exercised from a healthy fleet -- staging a genuinely dead MCP server would mean
breaking a live agent -- so the decision is tested through classify(), and the
process/config plumbing through the pure helpers.

Run: python3 scripts/gg-mcp-health.test.py
"""

import importlib.util
import json
import os
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("ggmcp", os.path.join(HERE, "gg-mcp-health.py"))
ggmcp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ggmcp)

failures = []


def check(name, got, want):
    if got != want:
        failures.append(f"{name}: got {got!r}, want {want!r}")


NOW = 1_786_000_000.0
HOUR = 3600.0

# --- classify: DEAD ---------------------------------------------------------
# The salesninja case: server child gone, session hours old. Must not be masked
# by the startup grace.
check("dead: no server, old session",
      ggmcp.classify(False, 38 * HOUR, NOW - 38 * HOUR, NOW - 40 * HOUR)[0], "DEAD")
check("dead: detail is set",
      ggmcp.classify(False, 38 * HOUR, NOW, None)[1] is not None, True)

# A freshly launched session has not spawned its children yet -- reporting DEAD
# here is what would make the probe cry wolf on every restart.
check("starting: no server, young session",
      ggmcp.classify(False, 30.0, NOW, NOW - HOUR)[0], "starting")
check("dead: just past the grace boundary",
      ggmcp.classify(False, ggmcp.STARTUP_GRACE_S + 1, NOW, None)[0], "DEAD")

# --- classify: STALE --------------------------------------------------------
# Server alive, but spawned from code older than the current build. A stdio
# child is spawned once at session start, so only a restart can fix this.
check("stale: session older than build",
      ggmcp.classify(True, 38 * HOUR, NOW - 38 * HOUR, NOW - 10 * HOUR)[0], "STALE")
check("ok: session newer than build",
      ggmcp.classify(True, 2 * HOUR, NOW - 2 * HOUR, NOW - 30 * HOUR)[0], "ok")
# Missing build mtime must not invent staleness.
check("ok: build time unknown",
      ggmcp.classify(True, 38 * HOUR, NOW - 38 * HOUR, None)[0], "ok")
# DEAD outranks STALE: a dead server is the more urgent read of the same box.
check("dead wins over stale",
      ggmcp.classify(False, 38 * HOUR, NOW - 38 * HOUR, NOW - HOUR)[0], "DEAD")

# --- agent_name_for ---------------------------------------------------------
root = ggmcp.PROJECT_ROOT
check("name: project root is main", ggmcp.agent_name_for(root), "main")
check("name: agents/<x> is x", ggmcp.agent_name_for(os.path.join(root, "agents", "salesninja")),
      "salesninja")
check("name: unrelated cwd ignored", ggmcp.agent_name_for("/tmp"), None)
# A worker session lives outside agents/ and must not be probed as an agent.
check("name: worker dir ignored", ggmcp.agent_name_for("/home/gg/.marveen-worker"), None)

# --- declares_gg_access -----------------------------------------------------
with tempfile.TemporaryDirectory() as d:
    check("declares: no .mcp.json", ggmcp.declares_gg_access(d), (False, None))

    with open(os.path.join(d, ".mcp.json"), "w") as fh:
        json.dump({"mcpServers": {"other": {"command": "node", "args": ["/x.js"]}}}, fh)
    check("declares: no gg-access entry", ggmcp.declares_gg_access(d), (False, None))

    path = "/home/gg/gg-mcp/dist/index.js"
    with open(os.path.join(d, ".mcp.json"), "w") as fh:
        json.dump({"mcpServers": {"gg-access": {"command": "node", "args": [path]}}}, fh)
    check("declares: gg-access found", ggmcp.declares_gg_access(d), (True, path))

    with open(os.path.join(d, ".mcp.json"), "w") as fh:
        fh.write("{ this is not json")
    check("declares: malformed json is not a fault", ggmcp.declares_gg_access(d), (False, None))

# --- build_mtime ------------------------------------------------------------
check("build_mtime: missing path", ggmcp.build_mtime(None), None)
check("build_mtime: nonexistent file", ggmcp.build_mtime("/nonexistent/index.js"), None)
with tempfile.NamedTemporaryFile(suffix=".js") as fh:
    got = ggmcp.build_mtime(fh.name)
    check("build_mtime: real file returns a timestamp", got is not None and got > 0, True)

# --- boot_time --------------------------------------------------------------
# Sanity: must land in the past but within plausible uptime, or every staleness
# comparison downstream is garbage.
bt = ggmcp.boot_time()
check("boot_time is in the past", bt < time.time(), True)
check("boot_time is not epoch-zero", bt > 1_500_000_000, True)

# --- 2026-08-12: remote transport and changed-config ------------------------
# The probe called the main agent DEAD while its tools were working. Both new
# statuses exist to stop a monitor from manufacturing alarms it cannot support.

# --- classify: remote -------------------------------------------------------
check("remote: refused socket is a real death",
      ggmcp.classify(False, 38 * HOUR, NOW - 38 * HOUR, None,
                     is_remote=True, remote_ok=False)[0], "DEAD")
check("remote: unprobeable endpoint is not a death",
      ggmcp.classify(False, 38 * HOUR, NOW - 38 * HOUR, None,
                     is_remote=True, remote_ok=None)[0], "remote")
check("remote: live socket is ok",
      ggmcp.classify(False, 38 * HOUR, NOW - 38 * HOUR, None,
                     is_remote=True, remote_ok=True)[0], "ok")
# The honest limit, asserted so nobody later reads "ok" as "the token works".
check("remote: ok says what it does NOT prove",
      "does NOT prove" in (ggmcp.classify(False, HOUR, NOW, None,
                                          is_remote=True, remote_ok=True)[1] or ""), True)
# Staleness is a stdio concept: the remote service restarts on its own, which is
# the whole point of running it that way.
check("remote: never STALE even against a newer build",
      ggmcp.classify(False, 38 * HOUR, NOW - 38 * HOUR, NOW - HOUR,
                     is_remote=True, remote_ok=True)[0], "ok")

# --- classify: config changed after session start ---------------------------
# Exactly the 2026-08-12 false positive: file says stdio, session was started
# from a different file, no child exists, tools are fine.
check("changed config: no child is 'unknown', not DEAD",
      ggmcp.classify(False, 38 * HOUR, NOW - 38 * HOUR, None,
                     config_changed_after_start=True)[0], "unknown")
check("changed config: grace period still wins",
      ggmcp.classify(False, 30.0, NOW, None, config_changed_after_start=True)[0], "starting")
# A live child is observed fact and outranks the file, so a real STALE must
# still surface rather than being excused by an unrelated config edit.
check("changed config: does not mask a genuine STALE",
      ggmcp.classify(True, 38 * HOUR, NOW - 38 * HOUR, NOW - HOUR,
                     config_changed_after_start=True)[0], "STALE")
# Default must keep the original meaning, or every existing caller shifts.
check("changed config: defaults off -> still DEAD",
      ggmcp.classify(False, 38 * HOUR, NOW - 38 * HOUR, None)[0], "DEAD")

# --- remote_target ----------------------------------------------------------
check("remote_target: stdio entry is not remote",
      ggmcp.remote_target({"command": "node", "args": ["/x/index.js"]}), None)
check("remote_target: http url",
      ggmcp.remote_target({"type": "http", "url": "http://127.0.0.1:3450/mcp"}),
      ("127.0.0.1", 3450))
check("remote_target: https default port",
      ggmcp.remote_target({"url": "https://gg.example/mcp"}), ("gg.example", 443))
check("remote_target: http default port",
      ggmcp.remote_target({"url": "http://gg.example/mcp"}), ("gg.example", 80))
# Declared remote but unusable: still remote (so no child is expected), just not
# probeable -- reported as "remote", never as DEAD.
check("remote_target: type without url", ggmcp.remote_target({"type": "sse"}), ("", 0))
check("remote_target: not a dict", ggmcp.remote_target(None), None)
check("remote_target: unprobeable target -> cannot tell",
      ggmcp.remote_reachable(("", 0)), None)
check("remote_target: None target -> cannot tell", ggmcp.remote_reachable(None), None)

# --- remote_reachable against real sockets ----------------------------------
import socket as _socket
_srv = _socket.socket()
_srv.bind(("127.0.0.1", 0))
_srv.listen(1)
_port = _srv.getsockname()[1]
check("remote_reachable: listening socket is up",
      ggmcp.remote_reachable(("127.0.0.1", _port)), True)
_srv.close()
# Same port, nothing listening now -> refused, which IS actionable.
check("remote_reachable: closed port is refused",
      ggmcp.remote_reachable(("127.0.0.1", _port)), False)

# --- proxy mode (stdio to the client, HTTP upstream) ------------------------
# The third shape. Matching only index.js would have called every proxy-mode
# agent DEAD -- the same false alarm as the remote case, one shape further along.
check("needle: direct server matches",
      ggmcp.server_needle_in("node /home/gg/gg-mcp/dist/index.js"), "gg-mcp/dist/index.js")
check("needle: proxy matches",
      ggmcp.server_needle_in("node /home/gg/gg-mcp/dist/proxy.js"), "gg-mcp/dist/proxy.js")
check("needle: unrelated node process does not match",
      ggmcp.server_needle_in("node /home/gg/marveen/dist/index.js"), None)
# The legacy name must keep pointing at the direct server, or older callers shift.
check("needle: legacy constant unchanged", ggmcp.SERVER_NEEDLE, "gg-mcp/dist/index.js")

with tempfile.TemporaryDirectory() as d:
    proxy = "/home/gg/gg-mcp/dist/proxy.js"
    with open(os.path.join(d, ".mcp.json"), "w") as fh:
        json.dump({"mcpServers": {"gg-access": {
            "command": "node", "args": [proxy],
            "env": {"GG_MCP_TOKEN_FILE": "/home/gg/gg-mcp/tokens/x.token"}}}}, fh)
    # Returning the proxy path (not None) is what keeps staleness meaningful: a
    # rebuilt proxy.js still needs a session restart, exactly like index.js.
    check("declares: proxy entry yields the proxy path",
          ggmcp.declares_gg_access(d), (True, proxy))
    # Proxy config is stdio-shaped, so it must NOT be treated as remote --
    # otherwise the probe would stop looking for the child that does exist.
    check("proxy entry is not remote", ggmcp.remote_target(ggmcp.gg_access_config(d)), None)

# --- gg_access_config / config_mtime_after ----------------------------------
with tempfile.TemporaryDirectory() as d:
    check("gg_access_config: missing file", ggmcp.gg_access_config(d), None)
    check("config_mtime_after: missing file is not a change",
          ggmcp.config_mtime_after(d, NOW), False)

    p = os.path.join(d, ".mcp.json")
    entry = {"type": "http", "url": "http://127.0.0.1:3450/mcp"}
    with open(p, "w") as fh:
        json.dump({"mcpServers": {"gg-access": entry}}, fh)
    check("gg_access_config: returns the raw entry", ggmcp.gg_access_config(d), entry)
    # A remote entry still counts as declared -- otherwise the agent would be
    # skipped entirely and a genuinely down endpoint would go unreported.
    check("declares: remote entry is declared, with no stdio path",
          ggmcp.declares_gg_access(d), (True, None))

    os.utime(p, (NOW - HOUR, NOW - HOUR))
    check("config_mtime_after: written before start", ggmcp.config_mtime_after(d, NOW), False)
    os.utime(p, (NOW + HOUR, NOW + HOUR))
    check("config_mtime_after: written after start", ggmcp.config_mtime_after(d, NOW), True)

# --- 2026-08-15: the token blind spot --------------------------------------
# The probe said `ok` for brokermarcsi at 14:00 on 08-14 while the agent could
# reach no GG system: it had started at 13:51 with no token file (written 13:59).
# A live child was all the probe ever measured.

# --- token_file_for ---------------------------------------------------------
check("token_file_for: reads the env entry",
      ggmcp.token_file_for({"env": {"GG_MCP_TOKEN_FILE": "/t/x.token"}}), "/t/x.token")
check("token_file_for: no env", ggmcp.token_file_for({"command": "node"}), None)
check("token_file_for: empty string is not a path",
      ggmcp.token_file_for({"env": {"GG_MCP_TOKEN_FILE": ""}}), None)
check("token_file_for: not a dict", ggmcp.token_file_for(None), None)

# --- token_state ------------------------------------------------------------
PROXY = "/home/gg/gg-mcp/dist/proxy.js"
DIRECT = "/home/gg/gg-mcp/dist/index.js"
# The direct server takes its caller token from its own config, so silence here
# is correct: inventing a fault for it would be the cry-wolf failure again.
check("token_state: direct server is not judged",
      ggmcp.token_state(DIRECT, {"env": {}})[0], None)
check("token_state: remote entry (no stdio path) is not judged",
      ggmcp.token_state(None, {"url": "http://127.0.0.1:3450/mcp"})[0], None)
check("token_state: proxy without the env var",
      ggmcp.token_state(PROXY, {"command": "node"})[0], "undeclared")
check("token_state: declared but absent file",
      ggmcp.token_state(PROXY, {"env": {"GG_MCP_TOKEN_FILE": "/nonexistent/x.token"}})[0],
      "missing_file")
with tempfile.TemporaryDirectory() as d:
    empty = os.path.join(d, "empty.token")
    open(empty, "w").close()
    # A zero-byte file is what a half-finished pairing leaves behind, and the
    # proxy treats it as no token at all (`.trim() || null`).
    check("token_state: empty file counts as missing",
          ggmcp.token_state(PROXY, {"env": {"GG_MCP_TOKEN_FILE": empty}})[0], "missing_file")

    good = os.path.join(d, "good.token")
    with open(good, "w") as fh:
        fh.write("gg_live_token\n")
    state, path, mtime = ggmcp.token_state(PROXY, {"env": {"GG_MCP_TOKEN_FILE": good}})
    check("token_state: non-empty file is ok", state, "ok")
    check("token_state: returns the path", path, good)
    check("token_state: returns an mtime", mtime is not None and mtime > 0, True)

# --- classify: NO_TOKEN -----------------------------------------------------
# Exactly the 08-14 brokermarcsi window: server child alive, session past the
# grace period, no identity. This is the case that used to read `ok`.
check("no_token: live child without a token is not ok",
      ggmcp.classify(True, 2 * HOUR, NOW - 2 * HOUR, NOW - 30 * HOUR,
                     token="missing_file")[0], "NO_TOKEN")
check("no_token: undeclared env is its own fault",
      ggmcp.classify(True, 2 * HOUR, NOW - 2 * HOUR, None, token="undeclared")[0], "NO_TOKEN")
check("no_token: detail names the fix",
      "pairing" in (ggmcp.classify(True, 2 * HOUR, NOW - 2 * HOUR, None,
                                   token="missing_file")[1] or ""), True)
check("no_token: undeclared detail names the ambient fallback",
      "ambient" in (ggmcp.classify(True, 2 * HOUR, NOW - 2 * HOUR, None,
                                   token="undeclared")[1] or ""), True)
check("no_token: a usable token stays ok",
      ggmcp.classify(True, 2 * HOUR, NOW - 2 * HOUR, NOW - 30 * HOUR, token="ok")[0], "ok")
# Ranking, both directions: no process beats no rights, no rights beats old code.
check("no_token: DEAD outranks it",
      ggmcp.classify(False, 38 * HOUR, NOW - 38 * HOUR, None, token="missing_file")[0], "DEAD")
check("no_token: outranks STALE",
      ggmcp.classify(True, 38 * HOUR, NOW - 38 * HOUR, NOW - HOUR, token="missing_file")[0],
      "NO_TOKEN")
# A session seconds old has not been paired yet either; the grace period covers
# the whole startup, not just the child process.
check("no_token: startup grace still wins",
      ggmcp.classify(False, 30.0, NOW, None, token="missing_file")[0], "starting")
# Remote agents are never token-judged from here (probe() passes token=None).
check("no_token: remote is unaffected",
      ggmcp.classify(False, 38 * HOUR, NOW - 38 * HOUR, None,
                     is_remote=True, remote_ok=True, token=None)[0], "ok")
# Default off, so every pre-existing caller keeps its exact meaning.
check("no_token: defaults off -> unchanged verdict",
      ggmcp.classify(True, 2 * HOUR, NOW - 2 * HOUR, NOW - 30 * HOUR)[0], "ok")

# --- the live fleet ---------------------------------------------------------
# The regression that matters in practice: every agent on this box is proxy-mode,
# so a bug in the new branch would turn the whole fleet red at once.
_live = ggmcp.probe()
_no_token = [r["agent"] for r in _live["findings"] if r["status"] == "NO_TOKEN"]
check("live fleet: probe still runs and sees agents", _live["agents_checked"] > 0, True)
check(f"live fleet: no false NO_TOKEN (got {_no_token})", _no_token, [])

if failures:
    print(f"FAIL ({len(failures)}):")
    for f in failures:
        print("  -", f)
    sys.exit(1)
print("ok -- all gg-mcp-health checks passed")
