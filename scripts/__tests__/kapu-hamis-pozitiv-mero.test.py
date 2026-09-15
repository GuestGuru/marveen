#!/usr/bin/env python3
"""The gate's own false positives have to be measurable (#836).

The signal is NOT "a similar text came back": the correct response to a block is
also a near-identical resend, so similarity would fire on every accent fix. The
discriminating condition is what happened to the FLAGGED WORD: accents added is a
real catch, the word gone in both forms is a suspected false positive.

Run: python3 <thisfile>   Exit 0 = all pass.
"""
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
GATE = os.path.join(ROOT, "scripts", "hooks", "outgoing-copy-gate.py")
AUDIT = os.path.join(ROOT, "scripts", "kapu-fp-audit.py")

failures = []


def check(name, cond, detail=""):
    if cond:
        print(f"  ok   {name}")
    else:
        print(f"  FAIL {name} {detail}")
        failures.append(name)


def run_telegram(store, text):
    """One Telegram reply through the gate. Returns (exit_code, stderr)."""
    env = dict(os.environ)
    # The gate derives every store path from the rules file's directory.
    env["OUTGOING_COPY_GATE_RULES"] = os.path.join(store, "outgoing-copy-gate-rules.json")
    payload = json.dumps({
        "tool_name": "mcp__plugin_telegram_telegram__reply",
        "tool_input": {"chat_id": "1", "text": text},
    })
    p = subprocess.run([sys.executable, GATE], input=payload, env=env,
                       capture_output=True, text=True)
    return p.returncode, p.stderr


def ledger(store):
    path = os.path.join(store, "outgoing-copy-gate-fp.jsonl")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as fh:
        return [json.loads(l) for l in fh if l.strip()]


# Synthetic texts. Long enough and Hungarian enough to trip the accent check, and
# deliberately NOT taken from any real message.
BAD = "A hetfoi egyeztetesen a kollega elmondta, hogy a szamla kesik, es kertek turelmet."
FIXED = "A hétfői egyeztetésen a kolléga elmondta, hogy a számla késik, és kértek türelmet."
REPHRASED = "A hétfői megbeszélésen elhangzott, hogy a bizonylat késik, és türelmet kértek."

print("1. a tiltas bekerul a naploba, a szavakkal egyutt")
with tempfile.TemporaryDirectory() as store:
    code, err = run_telegram(store, BAD)
    rows = ledger(store)
    blocks = [r for r in rows if r.get("esemeny") == "tiltas"]
    check("a kapu tiltott", code == 2, f"(exit={code})")
    check("egy tiltas-sor keletkezett", len(blocks) == 1, f"(sorok={rows})")
    check("a sor nevesiti a megjelolt szavakat", bool(blocks and blocks[0].get("szavak")),
          f"(szavak={blocks[0].get('szavak') if blocks else None})")

print("2. ekezet-potlas utan a kimenet 'javitva' -- ez VALODI talalat, nem hamis pozitiv")
with tempfile.TemporaryDirectory() as store:
    run_telegram(store, BAD)
    code, _ = run_telegram(store, FIXED)
    res = [r for r in ledger(store) if r.get("esemeny") == "feloldas"]
    verdicts = set()
    for r in res:
        verdicts |= set((r.get("kimenet") or {}).values())
    check("a javitott szoveg atment", code == 0, f"(exit={code})")
    check("keletkezett feloldas-sor", len(res) == 1, f"(res={res})")
    check("minden szo 'javitva'", verdicts == {"javitva"}, f"(verdiktek={verdicts})")

print("3. ha a szo ELTUNIK mindket alakban, az HAMIS POZITIV GYANU")
with tempfile.TemporaryDirectory() as store:
    run_telegram(store, BAD)
    run_telegram(store, REPHRASED)
    res = [r for r in ledger(store) if r.get("esemeny") == "feloldas"]
    out = res[0].get("kimenet") if res else {}
    check("van 'eltunt' verdikt", "eltunt" in set(out.values()), f"(kimenet={out})")
    check("a magyarnak-latszas TENYKENT szerepel, nem szurokent",
          isinstance((res[0].get("magyarnak_latszott") if res else None), dict))

print("4. a nevezo is megvan: az osszesito a tiltasok szamat is kiirja")
with tempfile.TemporaryDirectory() as store:
    run_telegram(store, BAD)
    run_telegram(store, REPHRASED)
    p = subprocess.run([sys.executable, AUDIT, "--napok", "0",
                        "--ledger", os.path.join(store, "outgoing-copy-gate-fp.jsonl")],
                       capture_output=True, text=True)
    check("az osszesito lefut", p.returncode == 0, p.stderr[:200])
    check("kiirja a tiltasok szamat (nevezo)", "tiltas" in p.stdout, p.stdout[:200])
    check("kiirja az aranyot", "ARANY" in p.stdout, p.stdout[:200])
    check("kimondja, hogy gyanu es nem itelet", "gyanu, nem itelet" in p.stdout, p.stdout[:200])

print("5. negativ kontroll: tiltas nelkul nem keletkezik feloldas-sor")
with tempfile.TemporaryDirectory() as store:
    code, _ = run_telegram(store, FIXED)
    rows = ledger(store)
    check("a tiszta szoveg atment", code == 0, f"(exit={code})")
    check("nincs egyetlen sor sem", rows == [], f"(sorok={rows})")

print()
if failures:
    print(f"BUKOTT: {len(failures)} -- {', '.join(failures)}")
    sys.exit(1)
print("Minden teszt zold.")
