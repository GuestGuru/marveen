#!/usr/bin/env python3
"""GG fork -- the ledger-live-drain pre-check contract.

WHY THIS EXISTS (measured 2026-09-02): the drain fired every 2 minutes as a full
LLM turn and virtually every round was empty. With zero work done all day the
agent's pane still accumulated ~270 kB of transcript per hour (08h-20h measured:
255-290 kB/h, not one user message in the window), which saturated the 1M context
window in ~22 h and forced a context-guard restart on two consecutive days. The
pre-check moves the deterministic half of the decision out of the model.

The dangerous failure mode is NOT "failed to skip" -- that only costs a round.
It is a FALSE "SKIP": the drain consumes its dedup marker the moment it prints a
question, so a pre-check that swallows the output (or reports "nothing
actionable" when it could not actually check) loses the message FOREVER, and the
lost-message rescue path is the only reason the task exists. Hence the last two
cases: on any failure the script must produce EMPTY stdout (the runner then
fails open and invokes the LLM, which re-runs the drain itself) and never SKIP.

Run: python3 <thisfile>   Exit 0 = all pass.
"""
import os
import shutil
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
INSTALL = os.path.dirname(os.path.dirname(HERE))
SEED = os.path.join(INSTALL, "scheduled-tasks", "ledger-live-drain")
AGENT = "testagent"
CHAT = "424242"

sys.path.insert(0, os.path.join(INSTALL, "scripts", "hooks"))
import ledger_lib  # noqa: E402

failed = []


def check(name, cond, detail=""):
    if cond:
        print(f"  ok   {name}")
    else:
        print(f"  FAIL {name}  {detail}")
        failed.append(name)


def render_precheck(dest_dir):
    """The seed carries {{PROJECT_ROOT}}; the seeder resolves it at install time."""
    src = os.path.join(SEED, "pre-check.sh")
    with open(src) as f:
        body = f.read()
    check("the seed ships pre-check.sh with the resolvable placeholder",
          "{{PROJECT_ROOT}}" in body)
    out = os.path.join(dest_dir, "pre-check.sh")
    with open(out, "w") as f:
        f.write(body.replace("{{PROJECT_ROOT}}", INSTALL))
    return out


BASH = shutil.which("bash") or "/bin/bash"


def run(script, db, path_override=None):
    # Absolute bash on purpose: the "no interpreter" case blanks PATH, and a
    # bare "bash" would then fail to LAUNCH -- testing the harness, not the
    # script (this bit the first run of exactly this case).
    env = dict(os.environ)
    env["LEDGER_DB_PATH"] = db
    env["MAIN_AGENT_ID"] = AGENT
    if path_override is not None:
        env["PATH"] = path_override
    r = subprocess.run([BASH, script], capture_output=True, text=True, env=env, timeout=60)
    return r.returncode, r.stdout.strip(), r.stderr


def seed_inbound(db, message_id, text, age_seconds):
    os.environ["LEDGER_DB_PATH"] = db
    ledger_lib.log_inbound(AGENT, CHAT, message_id, text, "2026-09-02T19:00:00Z")
    con = ledger_lib.connect()
    try:
        con.execute(
            "UPDATE conversation_log SET created_at=? WHERE agent_id=? AND message_id=?",
            (int(time.time()) - age_seconds, AGENT, str(message_id)),
        )
        con.commit()
    finally:
        con.close()


def main():
    tmp = tempfile.mkdtemp(prefix="drain-precheck-")
    try:
        script = render_precheck(tmp)

        # 1. Config wiring: an unwired pre-check is a silent no-op.
        import json
        cfg = json.load(open(os.path.join(SEED, "task-config.json")))
        check("the task config declares the pre-check", cfg.get("preCheck") == "pre-check.sh",
              f"preCheck={cfg.get('preCheck')!r}")

        # 2. Quiet round -> SKIP, so the runner spends no model turn at all.
        db = os.path.join(tmp, "quiet.db")
        os.environ["LEDGER_DB_PATH"] = db   # set BEFORE any connect(): a stray
        ledger_lib.connect().close()        # connect would touch the LIVE ledger
        rc, out, _ = run(script, db)
        check("empty ledger -> SKIP", (rc, out) == (0, "SKIP"), f"rc={rc} out={out!r}")

        # 3. A real unanswered question must reach the model VERBATIM.
        db = os.path.join(tmp, "open.db")
        seed_inbound(db, "9001", "Teszt kerdes a drain pre-checkhez", age_seconds=300)
        rc, out, _ = run(script, db)
        check("open question -> the OPEN_QUESTION block is forwarded, not swallowed",
              rc == 0 and out.startswith("OPEN_QUESTION ") and "Teszt kerdes" in out,
              f"rc={rc} out={out!r}")
        check("the forwarded block names the chat to answer on", f"chat_id={CHAT}" in out,
              f"out={out!r}")

        # 4. Dedup: the drain surfaces a given id once, so the next tick is quiet.
        rc, out, _ = run(script, db)
        check("already surfaced -> SKIP on the next tick", (rc, out) == (0, "SKIP"),
              f"rc={rc} out={out!r}")

        # 5. Grace: a question younger than 60s belongs to the reply in flight.
        db = os.path.join(tmp, "fresh.db")
        seed_inbound(db, "9002", "Epp most erkezett", age_seconds=5)
        rc, out, _ = run(script, db)
        check("inside the 60s grace window -> SKIP", (rc, out) == (0, "SKIP"),
              f"rc={rc} out={out!r}")

        # 6. THE TRAP. The checker itself cannot run -> it must fail OPEN with
        #    empty stdout, never claim "nothing actionable".
        db = os.path.join(tmp, "open2.db")
        seed_inbound(db, "9003", "Ezt nem szabad elveszteni", age_seconds=300)
        rc, out, _ = run(script, db, path_override="/nonexistent")
        check("no interpreter -> exit 0 and EMPTY stdout (fail open, never a false SKIP)",
              rc == 0 and out == "", f"rc={rc} out={out!r}")

        # 7. Same rule for an unreachable install dir.
        broken = os.path.join(tmp, "broken.sh")
        with open(os.path.join(SEED, "pre-check.sh")) as f:
            body = f.read()
        with open(broken, "w") as f:
            f.write(body.replace("{{PROJECT_ROOT}}", os.path.join(tmp, "does-not-exist")))
        rc, out, _ = run(broken, db)
        check("missing install dir -> exit 0 and EMPTY stdout (fail open)",
              rc == 0 and out == "", f"rc={rc} out={out!r}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if failed:
        print(f"\n{len(failed)} FAILED: {failed}")
        return 1
    print("\nall pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
