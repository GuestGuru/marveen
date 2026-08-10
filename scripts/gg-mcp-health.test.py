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

if failures:
    print(f"FAIL ({len(failures)}):")
    for f in failures:
        print("  -", f)
    sys.exit(1)
print("ok -- all gg-mcp-health checks passed")
