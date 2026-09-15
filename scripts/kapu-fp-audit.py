#!/usr/bin/env python3
"""Read the outgoing-copy gate's false-positive ledger and report the RATIO.

Why this exists as a separate, scheduled reader (#836): a ledger nobody reads is
the same as no ledger. The gate writes store/outgoing-copy-gate-fp.jsonl on every
block and classifies what followed; this is the half that turns those rows into a
number somebody sees.

What the numbers mean, and what they do NOT:

  javitva      the flagged word came back WITH its accents. The gate was right.
  valtozatlan  the word is still there, still bare. Usually a second block on the
               same text, not a verdict either way.
  eltunt       the word is gone in BOTH forms. SUSPECTED false positive -- the
               sender worked around the gate by changing the content instead of
               fixing it. This is evidence against the GATE, not against them.

"eltunt" is suspicion, not proof: a legitimate rephrasing looks identical from
here. Every suspect line is printed in full so a human decides. The "magyarnak
latszott" flag is recorded because brokermarcsi's hypothesis is that the real
false positives are FOREIGN words -- that hypothesis is unmeasured, so the column
is data, never a filter.

Usage: python3 scripts/kapu-fp-audit.py [--napok N] [--ledger PATH]
Exit 0 always: this is a reporter, not a gate.
"""
import argparse
import json
import os
import sys
from datetime import datetime, timedelta

DEFAULT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "store", "outgoing-copy-gate-fp.jsonl")


def load(path, days):
    rows = []
    cutoff = datetime.now().astimezone() - timedelta(days=days) if days else None
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except ValueError:
                    continue
                if cutoff:
                    try:
                        if datetime.strptime(row.get("ts", ""), "%Y-%m-%dT%H:%M:%S%z") < cutoff:
                            continue
                    except ValueError:
                        continue
                rows.append(row)
    except FileNotFoundError:
        return None
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--napok", type=int, default=7, help="ablak napokban (0 = teljes naplo)")
    ap.add_argument("--ledger", default=DEFAULT)
    args = ap.parse_args()

    rows = load(args.ledger, args.napok)
    if rows is None:
        print(f"kapu-fp-audit: nincs meg naplo ({args.ledger}) -- a kapu meg egy tiltast sem irt bele.")
        return 0

    window = f"{args.napok} nap" if args.napok else "teljes naplo"
    blocks = [r for r in rows if r.get("esemeny") == "tiltas"]
    resolutions = [r for r in rows if r.get("esemeny") == "feloldas"]
    counts = {"javitva": 0, "valtozatlan": 0, "eltunt": 0}
    suspects = []
    for r in resolutions:
        for word, verdict in (r.get("kimenet") or {}).items():
            if verdict in counts:
                counts[verdict] += 1
            if verdict == "eltunt":
                suspects.append((r.get("ts", "?"), r.get("tool", "?"), word,
                                 (r.get("magyarnak_latszott") or {}).get(word)))

    # The denominator first, deliberately: a suspect count on its own says
    # nothing about the gate.
    print(f"kapu-fp-audit ({window}): {len(blocks)} tiltas, {len(resolutions)} feloldva, "
          f"{len(blocks) - len(resolutions)} meg nyitva.")
    total = sum(counts.values())
    if not total:
        print("  Feloldott szo meg nincs, tehat ARANYT MEG NEM LEHET MONDANI.")
        return 0
    print(f"  szavak: javitva={counts['javitva']}  valtozatlan={counts['valtozatlan']}  "
          f"eltunt={counts['eltunt']}  (osszesen {total})")
    print(f"  GYANUS HAMIS POZITIV ARANY: {counts['eltunt']}/{total} = "
          f"{counts['eltunt'] / total:.1%} -- gyanu, nem itelet.")
    if suspects:
        print("  Egyesevel, hogy ember dontse el:")
        for ts, tool, word, hun in suspects[:20]:
            tag = "magyarnak latszott" if hun else "NEM latszott magyarnak"
            print(f"    {ts}  {tool}  {word!r}  ({tag})")
        if len(suspects) > 20:
            print(f"    (+{len(suspects) - 20} tovabbi)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
