#!/usr/bin/env python3
"""GG fork: the gg-mcp proxy bundle is not a mail script (v1.46.1 merge, 2026-11-05).

MAILGATESCRIPT1027 reads the script an interpreter runs. The proxy bundle contains
mail-sending code, so without the GG branch every `node <bundle> exec ...` call of
the main agent was denied. The branch judges the argv after `--` instead, so a
sender run THROUGH the proxy is still caught. Hermetic: a temp bundle and a temp
sender script, no network, no install state.
"""
import importlib.util
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("ocg", os.path.join(HERE, "..", "hooks", "outgoing-copy-gate.py"))
ocg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ocg)

fails = 0


def check(name, got, want):
    global fails
    ok = got == want
    fails += 0 if ok else 1
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" (got {got}, want {want})"))


with tempfile.TemporaryDirectory() as d:
    bundle = os.path.join(d, "proxy.bundle.js")
    with open(bundle, "w") as fh:
        fh.write("const nodemailer = require('nodemailer'); transporter.sendMail({to: 'a@b.c'})\n")
    sender = os.path.join(d, "send.py")
    with open(sender, "w") as fh:
        fh.write("import smtplib\nsmtplib.SMTP('x').sendmail('a@b.c', ['d@e.f'], 'x')\n")
    os.environ["GG_MCP_PROXY_BUNDLE"] = bundle

    # control: the same bundle is a sender when it is not the configured proxy
    os.environ["GG_MCP_PROXY_BUNDLE"] = os.path.join(d, "other.js")
    check("control: an unknown bundle with send code is a send",
          ocg.script_run_sends(f"node {bundle} exec --alias x -- git push", d), True)
    os.environ["GG_MCP_PROXY_BUNDLE"] = bundle

    check("proxy exec -- git push is not a send",
          ocg.script_run_sends(f"node {bundle} exec --alias github -- git push origin x", d), False)
    check("proxy exec -- sh -c psql is not a send",
          ocg.script_run_sends(f"node {bundle} exec --alias sales -- sh -c 'psql x'", d), False)
    check("proxy without exec argv is not a send",
          ocg.script_run_sends(f"node {bundle}", d), False)
    check("a sender script run THROUGH the proxy is still a send",
          ocg.script_run_sends(f"node {bundle} exec --alias x -- python3 {sender}", d), True)
    check("a sender under sh -c through the proxy is still a send",
          ocg.script_run_sends(f"node {bundle} exec --alias x -- sh -c 'python3 {sender}'", d), True)

sys.exit(1 if fails else 0)
