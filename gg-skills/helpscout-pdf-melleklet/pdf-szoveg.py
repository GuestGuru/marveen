#!/usr/bin/env python3
"""Extract text from a PDF using only re + zlib (no poppler, no pypdf).

Handles embedded subset fonts via /ToUnicode CMaps, and reads text from
/Subtype /Form XObjects, where official Hungarian documents keep their body text.

Usage: python3 pdf-szoveg.py file.pdf
"""
import re
import sys
import zlib


def load(path):
    data = open(path, 'rb').read()
    objs = {}
    for m in re.finditer(rb'(\d+)\s+(\d+)\s+obj\b(.*?)\bendobj', data, re.S):
        objs[int(m.group(1))] = m.group(3)
    return objs


def getstream(body):
    m = re.search(rb'stream\r?\n(.*?)\s*endstream', body, re.S)
    if not m:
        return None
    raw = m.group(1)
    if b'/FlateDecode' in body[:m.start()]:
        try:
            return zlib.decompress(raw)
        except Exception:
            try:
                return zlib.decompressobj().decompress(raw)
            except Exception:
                return None
    return raw


def parse_tounicode(cmap):
    mp = {}
    for m in re.finditer(rb'beginbfchar(.*?)endbfchar', cmap, re.S):
        for a, b in re.findall(rb'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>', m.group(1)):
            mp[int(a, 16)] = bytes.fromhex(b.decode()).decode('utf-16-be', 'replace')
    for m in re.finditer(rb'beginbfrange(.*?)endbfrange', cmap, re.S):
        for a, b, c in re.findall(rb'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>', m.group(1)):
            lo, hi, base = int(a, 16), int(b, 16), int(c, 16)
            for i in range(hi - lo + 1):
                mp[lo + i] = chr(base + i)
    return mp


def fontmaps(objs):
    out = {}
    for num, body in objs.items():
        m = re.search(rb'/ToUnicode\s+(\d+)\s+\d+\s+R', body)
        if not m:
            continue
        tu = getstream(objs.get(int(m.group(1)), b''))
        if not tu:
            continue
        nbytes = 2 if re.search(rb'begincodespacerange\s*<[0-9A-Fa-f]{4}>', tu) else 1
        out[num] = (parse_tounicode(tu), nbytes)
    return out


def resources(objs, body):
    m = re.search(rb'/Resources\s+(\d+)\s+\d+\s+R', body)
    if m:
        return objs.get(int(m.group(1)), b'')
    m = re.search(rb'/Resources\s*<<(.*)', body, re.S)
    return m.group(1) if m else b''


def fonts_of(objs, res):
    found = {}
    m = re.search(rb'/Font\s*<<(.*?)>>', res, re.S)
    if not m:
        ref = re.search(rb'/Font\s+(\d+)\s+\d+\s+R', res)
        if ref:
            m = re.search(rb'<<(.*?)>>', objs.get(int(ref.group(1)), b''), re.S)
    if m:
        for name, num in re.findall(rb'/([A-Za-z0-9#+.-]+)\s+(\d+)\s+\d+\s+R', m.group(1)):
            found[name] = int(num)
    return found


def decode_hex(h, mp, nbytes):
    h = re.sub(rb'\s', b'', h)
    if len(h) % 2:
        h += b'0'
    raw = bytes.fromhex(h.decode())
    return ''.join(mp.get(int.from_bytes(raw[i:i + nbytes], 'big'), '')
                   for i in range(0, len(raw), nbytes))


TOKENS = (rb'/([A-Za-z0-9#+.-]+)\s+[-\d.]+\s+Tf'
          rb'|<([0-9A-Fa-f\s]*)>\s*Tj'
          rb'|\[([^\]]*)\]\s*TJ'
          rb'|\((?P<lit>(?:\\.|[^\\()])*)\)\s*Tj'
          rb'|(T\*|Td|TD|ET)')


def emit(objs, maps, num, body, label):
    content = getstream(body)
    if not content or (b'Tj' not in content and b'TJ' not in content):
        return
    fonts = fonts_of(objs, resources(objs, body))
    cur, line = ({}, 1), []
    print('\n===== %s %d =====' % (label, num))
    for m in re.finditer(TOKENS, content, re.S):
        if m.group(1):
            cur = maps.get(fonts.get(m.group(1)), ({}, 1))
        elif m.group(2) is not None:
            line.append(decode_hex(m.group(2), *cur))
        elif m.group(3) is not None:
            for h in re.findall(rb'<([0-9A-Fa-f\s]*)>', m.group(3)):
                line.append(decode_hex(h, *cur))
        elif m.group('lit') is not None:
            line.append(m.group('lit').decode('latin-1'))
        elif line:
            print(''.join(line))
            line = []
    if line:
        print(''.join(line))


def main(path):
    objs = load(path)
    maps = fontmaps(objs)
    # Official documents keep their body text in Form XObjects; pages may hold only the seal.
    for num, body in sorted(objs.items()):
        if re.search(rb'/Subtype\s*/Form', body):
            emit(objs, maps, num, body, 'FORM')
    for num, body in sorted(objs.items()):
        if re.search(rb'/Type\s*/Page\b', body):
            m = re.search(rb'/Contents\s+(\d+)\s+\d+\s+R', body)
            if m:
                emit(objs, maps, int(m.group(1)), objs.get(int(m.group(1)), b''), 'PAGE')


if __name__ == '__main__':
    main(sys.argv[1])
