#!/usr/bin/env python3
"""Spawn a gg-mcp entry point over stdio and report how many tools it exposes.

Used to verify a fleet agent's gg-access config independently of the agent's own
session: same server binary, same token file, same label -- a separate process.
"""
import json
import os
import select
import subprocess
import sys
import time


def probe(server: str, token_file: str, label: str, upstream: str | None) -> dict:
    env = dict(os.environ)
    env["GG_MCP_TOKEN_FILE"] = token_file
    env["GG_MCP_AGENT_LABEL"] = label
    if upstream:
        env["GG_MCP_UPSTREAM_URL"] = upstream
    else:
        env.pop("GG_MCP_UPSTREAM_URL", None)

    p = subprocess.Popen(
        ["node", server],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=env, text=True,
    )
    req = (
        json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
            "protocolVersion": "2024-11-05", "capabilities": {},
            "clientInfo": {"name": "fleet-probe", "version": "1"}}}) + "\n"
        + json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n"
        + json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}) + "\n"
    )
    # stdin stays OPEN until the answer is in: proxy.js exits on stdin-EOF
    # (exitOnStdinEnd), so communicate() would kill it before it replies.
    p.stdin.write(req)
    p.stdin.flush()

    tools, server_name = None, None
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if not select.select([p.stdout], [], [], deadline - time.monotonic())[0]:
            break
        line = p.stdout.readline()
        if not line:
            break
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            m = json.loads(line)
        except ValueError:
            continue
        r = m.get("result") or {}
        if m.get("id") == 1:
            server_name = (r.get("serverInfo") or {}).get("name")
        if m.get("id") == 2 and "tools" in r:
            tools = [t["name"] for t in r["tools"]]
            break
    p.kill()
    err = p.stderr.read() or ""
    return {
        "ok": tools is not None,
        "server_info": server_name,
        "tool_count": len(tools) if tools is not None else 0,
        "has_gg_allowed_tools": bool(tools and "gg_allowed_tools" in tools),
        "stderr": err.strip()[-300:],
    }


if __name__ == "__main__":
    server, token_file, label = sys.argv[1], sys.argv[2], sys.argv[3]
    upstream = sys.argv[4] if len(sys.argv) > 4 else None
    print(json.dumps(probe(server, token_file, label, upstream), ensure_ascii=False))
