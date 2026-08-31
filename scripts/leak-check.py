#!/usr/bin/env python3
"""Pre-publish leak check: do files heading somewhere public still name local, private data?

This is the general form of gg-skills/b2b-onepager-gyartas/scripts/sanitycheck.py
(jean, 2026-08-29), which was written for one skill and proved useful far beyond it.
The two lessons it encodes are the whole point, and both were learned the hard way:

  1. `grep -i` folds case but NOT accents. Searching for "Példa körút" misses
     "Pelda korut 12", and on 2026-08-29 that produced a clean report for a file
     that did contain the addresses. Everything here is compared NFD-folded.

  2. An accent-blind grep is still blind when the TERMS are typed by hand: a full
     street name does not contain its own slug ("pelda-krt-12"), and a slug does
     not contain the street name. Whatever you forget to type, you do not search
     for. So the terms are collected AT RUNTIME from the local, gitignored sources
     -- which also means this script contains no real data of its own.

Separators are normalised too, so "pelda-krt-12", "pelda_krt_12" and
"Pelda krt 12" all reduce to the same needle.

Exit status: 0 = clean, 1 = at least one hit (do not publish), 2 = usage problem.

Example:
    python3 scripts/leak-check.py \
        --terms-from-json config.local.json \
        --terms-from-dir assets/photos \
        --terms-from-quoted content.py \
        --term "Kovacs Janos" \
        -- README.md docs/*.md

By default the terms themselves are NOT printed: they are the private data. Pass
--show-terms when you are debugging on a machine where that is acceptable.
"""
import argparse
import io
import json
import os
import re
import sys
import unicodedata

DEFAULT_MIN_LEN = 4

# Quoted string literals in source code. Deliberately loose: over-collecting
# terms costs a false positive you can eyeball, under-collecting costs a leak.
_QUOTED = re.compile(r"""["']([^"'\n]{2,80})["']""")


def norm(s: str) -> str:
    """NFD-fold accents away, lowercase, and reduce every separator run to one space."""
    stripped = ''.join(
        c for c in unicodedata.normalize('NFD', s)
        if unicodedata.category(c) != 'Mn'
    ).lower()
    return re.sub(r'[^a-z0-9]+', ' ', stripped).strip()


def _walk_json(node):
    if isinstance(node, dict):
        for k, v in node.items():
            if isinstance(k, str):
                yield k
            yield from _walk_json(v)
    elif isinstance(node, list):
        for v in node:
            yield from _walk_json(v)
    elif isinstance(node, str):
        yield node


def terms_from_json(path):
    with io.open(path, encoding='utf-8') as f:
        return list(_walk_json(json.load(f)))


def terms_from_dir(path):
    """Every entry name under the directory, with the extension dropped."""
    out = []
    for root, dirs, files in os.walk(path):
        for name in list(dirs) + list(files):
            out.append(name)
            stem = os.path.splitext(name)[0]
            if stem != name:
                out.append(stem)
    return out


def terms_from_lines(path):
    with io.open(path, encoding='utf-8') as f:
        return [
            line.strip() for line in f
            if line.strip() and not line.lstrip().startswith('#')
        ]


def terms_from_quoted(path):
    with io.open(path, encoding='utf-8', errors='replace') as f:
        return _QUOTED.findall(f.read())


def collect(args):
    raw = []
    for p in args.terms_from_json:
        raw += terms_from_json(p)
    for p in args.terms_from_dir:
        raw += terms_from_dir(p)
    for p in args.terms_from_lines:
        raw += terms_from_lines(p)
    for p in args.terms_from_quoted:
        raw += terms_from_quoted(p)
    raw += args.term

    terms, dropped = set(), 0
    for item in raw:
        n = norm(item)
        if not n:
            continue
        if len(n) < args.min_len:
            dropped += 1
            continue
        terms.add(n)
    return terms, dropped


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Fail if files about to be published contain local private terms.",
    )
    ap.add_argument('--terms-from-json', action='append', default=[], metavar='FILE',
                    help='every string key and value in this JSON, recursively')
    ap.add_argument('--terms-from-dir', action='append', default=[], metavar='DIR',
                    help='every file and directory name under DIR (extension also dropped)')
    ap.add_argument('--terms-from-lines', action='append', default=[], metavar='FILE',
                    help='one term per line; blank lines and # comments ignored')
    ap.add_argument('--terms-from-quoted', action='append', default=[], metavar='FILE',
                    help='every quoted string literal in this source file')
    ap.add_argument('--term', action='append', default=[], metavar='TEXT',
                    help='a literal term (repeatable)')
    ap.add_argument('--min-len', type=int, default=DEFAULT_MIN_LEN, metavar='N',
                    help='drop normalised terms shorter than N chars (default %d); '
                         'short terms match everything and drown the real hits'
                         % DEFAULT_MIN_LEN)
    ap.add_argument('--show-terms', action='store_true',
                    help='print the collected terms -- they ARE the private data, so off by default')
    ap.add_argument('files', nargs='+', metavar='FILE', help='files to scan')
    args = ap.parse_args()

    for path in (args.terms_from_json + args.terms_from_dir
                 + args.terms_from_lines + args.terms_from_quoted):
        if not os.path.exists(path):
            print("leak-check: term source not found: %s" % path, file=sys.stderr)
            return 2

    terms, dropped = collect(args)
    if not terms:
        print("leak-check: no terms collected -- wrong source paths? "
              "A check with nothing to look for is not a clean check.", file=sys.stderr)
        return 2

    print("leak-check: %d terms (%d dropped as shorter than %d chars)"
          % (len(terms), dropped, args.min_len))
    if args.show_terms:
        print("terms: %s" % ', '.join(sorted(terms)))

    ordered = sorted(terms, key=len, reverse=True)  # report the most specific match
    hits = 0
    for path in args.files:
        if not os.path.isfile(path):
            print("leak-check: not a file, skipped: %s" % path, file=sys.stderr)
            continue
        with io.open(path, encoding='utf-8', errors='replace') as f:
            for lineno, line in enumerate(f, 1):
                folded = norm(line)
                for t in ordered:
                    if t in folded:
                        print("%s:%d: [%s] %s" % (path, lineno, t, line.strip()[:100]))
                        hits += 1
                        break

    print("\nleak-check: %d hit(s)" % hits)
    return 1 if hits else 0


if __name__ == '__main__':
    sys.exit(main())
