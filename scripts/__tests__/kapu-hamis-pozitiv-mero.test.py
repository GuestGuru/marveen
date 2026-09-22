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


def run_check_file(store, text):
    """The CLI route (--check-file), the morning briefing's path. (exit, stderr)."""
    env = dict(os.environ)
    env["OUTGOING_COPY_GATE_RULES"] = os.path.join(store, "outgoing-copy-gate-rules.json")
    path = os.path.join(store, "szoveg.txt")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    p = subprocess.run([sys.executable, GATE, "--check-file", path], env=env,
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
# Helyes ekezetes szoveg, ami MAS okbol bukik: gondolatjel. A szolista igy URES marad.
NO_WORDS = "A hétfői egyeztetésen a kolléga elmondta \u2014 és ezt kérték \u2014 hogy a számla késik."

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

print("6. a CLI-ut (--check-file) NAPLOSORT ir, de pending-et NEM nyit")
# 2026-09-21: eddig egyik felet sem irta, tehat minden CLI-tiltas lathatatlan volt
# a naplonak -- a sajat DREAM.md-emen kapott hamis pozitiv sem hagyott nyomot.
# A ket fel kulon itelet ala esik: a naplosor (a NEVEZO) hianyzott, az utokovetes
# viszont ezen az uton szerkezetileg ertelmetlen -- nincs "kovetkezo szoveg
# ugyanazon a toolon", a folyamat kilep.
with tempfile.TemporaryDirectory() as store:
    code, err = run_check_file(store, BAD)
    rows = ledger(store)
    blocks = [r for r in rows if r.get("esemeny") == "tiltas"]
    check("a CLI-ut tiltott", code == 1, f"(exit={code})")
    check("egy tiltas-sor keletkezett a CLI-uton", len(blocks) == 1, f"(sorok={rows})")
    check("a sor megnevezi a CLI-utat",
          bool(blocks) and blocks[0].get("tool") == "cli-check-file",
          f"(tool={blocks[0].get('tool') if blocks else None})")
    check("a sor kimondja, hogy nem feloldhato",
          bool(blocks) and blocks[0].get("feloldhato") is False,
          f"(feloldhato={blocks[0].get('feloldhato') if blocks else None})")
    check("a sor nevesiti a megjelolt szavakat", bool(blocks and blocks[0].get("szavak")),
          f"(szavak={blocks[0].get('szavak') if blocks else None})")
    check("NEM nyilt pending bejegyzes",
          not os.path.exists(os.path.join(store, "outgoing-copy-gate-pending.json")))

print("7. az osszesito a CLI-sort NEM szamolja nyitott hatraleknak")
with tempfile.TemporaryDirectory() as store:
    run_telegram(store, BAD)        # hook-ut: ez valoban nyitva marad
    run_check_file(store, BAD)      # CLI-ut: ez soha nem zarhato le
    p = subprocess.run([sys.executable, AUDIT, "--napok", "0",
                        "--ledger", os.path.join(store, "outgoing-copy-gate-fp.jsonl")],
                       capture_output=True, text=True)
    check("az osszesito lefut", p.returncode == 0, p.stderr[:200])
    check("ket tiltast lat", "2 tiltas" in p.stdout, p.stdout[:200])
    check("egyet szamol nyitottnak", "1 meg nyitva" in p.stdout, p.stdout[:200])
    check("egyet utokovethetetlennek", "1 utokovethetetlen" in p.stdout, p.stdout[:200])

print("8. visszafele kompatibilitas: a mezo NELKULI regi sor hook-sor, tehat nyitott")
with tempfile.TemporaryDirectory() as store:
    path = os.path.join(store, "regi.jsonl")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(json.dumps({"esemeny": "tiltas", "tool": "send_email",
                             "szavak": ["dontes"], "problema_tipusok": ["HIANYZO EKEZETEK"],
                             "ts": "2026-09-18T11:11:00+0200"}, ensure_ascii=False) + "\n")
    p = subprocess.run([sys.executable, AUDIT, "--napok", "0", "--ledger", path],
                       capture_output=True, text=True)
    check("a regi sor nyitottnak szamit", "1 meg nyitva" in p.stdout, p.stdout[:200])
    check("es nem utokovethetetlennek", "0 utokovethetetlen" in p.stdout, p.stdout[:200])

print("9. a szolista NELKULI tiltas nem allithatja magarol, hogy feloldhato")
# 2026-09-22: a `feloldhato` mezo eddig az UTVONALAT kodolta, nem azt, hogy nyilt-e
# pending. Egy gondolatjel- vagy nev-szabaly tiltas nem jelol meg egyetlen szot sem,
# tehat pending sem nyilik ra -- megis `true`-t hordozott, es az osszesito nyitott
# hatraleknak szamolta. Ugyanaz a felrecimkezes, amit a CLI-ut kapcsan javitottunk,
# csak egy masik ajton. Az elo naplon merve: nyolc tiltasbol HAT ilyen.
with tempfile.TemporaryDirectory() as store:
    code, err = run_telegram(store, NO_WORDS)
    rows = ledger(store)
    blocks = [r for r in rows if r.get("esemeny") == "tiltas"]
    check("a kapu tiltott (nem ekezet miatt)", code == 2, f"(exit={code})")
    check("egy tiltas-sor keletkezett", len(blocks) == 1, f"(sorok={rows})")
    check("a szolista URES", blocks and blocks[0].get("szavak") == [],
          f"(szavak={blocks[0].get('szavak') if blocks else None})")
    check("a sor NEM allitja, hogy feloldhato",
          bool(blocks) and blocks[0].get("feloldhato") is False,
          f"(feloldhato={blocks[0].get('feloldhato') if blocks else None})")
    check("es tenyleg nem nyilt pending",
          not os.path.exists(os.path.join(store, "outgoing-copy-gate-pending.json")))
    p = subprocess.run([sys.executable, AUDIT, "--napok", "0",
                        "--ledger", os.path.join(store, "outgoing-copy-gate-fp.jsonl")],
                       capture_output=True, text=True)
    check("az osszesito NEM szamolja nyitottnak", "0 meg nyitva" in p.stdout, p.stdout[:200])
    check("hanem utokovethetetlennek", "1 utokovethetetlen" in p.stdout, p.stdout[:200])

print()
if failures:
    print(f"BUKOTT: {len(failures)} -- {', '.join(failures)}")
    sys.exit(1)
print("Minden teszt zold.")
