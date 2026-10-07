#!/usr/bin/env python3
"""GG fork: the outgoing copy gate treats U+2010/U+2011 as a hyphen when tokenizing.

Regression guard for 2026-10-04 07:28 (msg 1022): the morning brief contained
"07:27‑es" (non-breaking hyphen). The tokenizer only knew ASCII '-', so "es"
became a standalone word and the gate flagged a correct text ("es -> és").

Run: python3 <thisfile>   Exit 0 = all pass.
"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GATE = os.path.join(os.path.dirname(HERE), "hooks", "outgoing-copy-gate.py")
spec = importlib.util.spec_from_file_location("copy_gate", GATE)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

BASE = (
    "Az upstream frissítés kész és lemérve, a tesztek zöldek, a dashboard válaszol, "
    "és minden ágens fut. A reggeli üzenet a megszokott úton megy ki, mert "
)
TAIL = " időzítő leáll, és a feladat az élő munkamenetből küld."

failures = []


def check(name, cond, detail=""):
    if not cond:
        failures.append(f"{name}: {detail}")
    print(("ok   " if cond else "FAIL ") + name)


def words(text):
    return [w for w, _ in gate.accent_check_tokens(text)]


# 1. U+2011 and U+2010 after a number: no standalone "es"
for label, hyph in (("U+2011", "‑"), ("U+2010", "‐")):
    text = BASE + "a 07:27" + hyph + "es" + TAIL
    check(f"{label} digit-suffix is not a standalone word", "es" not in words(text), words(text))

# 2. U+2011 between letters behaves like ASCII '-' (one token, not two)
text = BASE + "a gg3‑inspections‑lekerdezes név"
ascii_text = BASE + "a gg3-inspections-lekerdezes név"
check("U+2011 letter-hyphen tokenizes like ASCII",
      words(text) == words(ascii_text), (words(text), words(ascii_text)))

# 3. Positions still index the ORIGINAL prose (length-preserving swap)
text = BASE + "a Drive‑ra feltöltve" + TAIL
for w, p in gate.accent_check_tokens(text):
    if "-" not in w:
        check(f"position of {w!r} indexes the original text",
              text[p:p + len(w)].lower() == w, (p, text[p:p + len(w)]))

# 4. Negative control: a REAL standalone "es" is still a token
text = BASE + "a 07:27 es" + TAIL
check("negative control: standalone 'es' still tokenized", "es" in words(text), words(text))

# 5. ASCII hyphen unchanged (existing behaviour)
text = BASE + "a 07:27-es" + TAIL
check("ASCII digit-suffix unchanged", "es" not in words(text), words(text))

if failures:
    print("\n".join(failures))
    sys.exit(1)
print("all pass")
