#!/usr/bin/env python3
"""Átemelő brain_save: csak a következő saját tétel menthető (IT-1295).

A meglévő CLI csak olvasó ellenőrzését használja, nem hoz létre új állapotot.
Nem általános adatbiztonsági kapu: más kulcsú brain_save és a shelles MCP-út
nem tartozik ide. A done saját CLI-ellenőrzése az átugró kurzort is blokkolja.
"""
import json
from pathlib import Path
import re
import subprocess
import sys


def main():
    payload = json.load(sys.stdin)
    if not isinstance(payload, dict):
        raise ValueError('hibás hook-payload')
    if not str(payload.get('tool_name', '')).endswith('brain_save'):
        return 0
    fields = payload.get('tool_input') or {}
    key = fields.get('kulcs', '')
    if not isinstance(key, str) or not re.match(r'^marveen-.+-mem-', key):
        return 0
    match = re.fullmatch(r'marveen-([a-zA-Z0-9][a-zA-Z0-9_-]{0,63})-mem-([1-9][0-9]*)(?:-[a-zA-Z0-9_-]+)?', key)
    if not match:
        raise ValueError('hibás átemelő kulcs')
    # A közös feloldó a stabil transcript_path-ot használja a módosítható cwd előtt.
    from ledger_lib import agent_id_from_payload
    agent = agent_id_from_payload(payload)
    if agent != match[1]:
        raise ValueError('más bot átemelő kulcsa')
    root = Path(__file__).resolve().parents[2]
    result = subprocess.run(
        ['node', str(root / 'dist/gg/brain-promotion-cli.js'), 'check-save',
         '--agent', agent, '--id', match[2]],
        capture_output=True, text=True, timeout=5,
    )
    if result.returncode:
        # Csak a CLI saját, tartalom nélküli hibáját adjuk tovább, runtime-dumpot nem.
        reason = next((line for line in result.stderr.splitlines()
                       if line.startswith('brain-promotion: ')), 'A sorrend nem ellenőrizhető; a mentés blokkolva.')
        print(reason, file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except ValueError as error:
        print('brain-promotion: ' + str(error), file=sys.stderr)
        sys.exit(2)
    except Exception as error:
        # A hiányzó interpreter/build/kurzor vagy sérült input nem nyithatja ki a kaput.
        print('brain-promotion: a mentés sorrendje vagy a saját botazonosság nem igazolt; blokkolva (' + type(error).__name__ + ').', file=sys.stderr)
        sys.exit(2)
