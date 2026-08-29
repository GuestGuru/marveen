# -*- coding: utf-8 -*-
"""Google Drive I/O for the GG-104 one-pagers.

The access token arrives ONLY through the environment, put there by
`gg-mcp-proxy exec --alias google-drive --env-var GG_TOKEN -- ...`.
It is never written to disk, never printed, never passed on the command line.

Subcommands:
    list      - show what is in the three folders (read-only, no downloads)
    fetch     - download the logo and a selection of apartment photos
    logo      - pull the vector logo from Marketing/Arculat and derive the
                mark-only and wordmark-only SVGs the generator needs
    upload    - upload the finished PDFs into the target folder (in place)
"""
import json
import os
import sys
import re
import urllib.parse
import urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(BASE, "assets")
PHOTOS = os.path.join(ASSETS, "photos")
OUT = os.path.join(BASE, "out")

# The three Drive folder ids used to live here, hardcoded. They moved out on
# 2026-08-29 because this repo is a PUBLIC fork: a folder id is not a secret,
# but it is an internal identifier that does not belong in a world-readable file.
# Keep the real ids in drive.folders.json next to this script (gitignored);
# drive.folders.example.json shows the shape.
_FOLDERS_FILE = os.path.join(BASE, "drive.folders.json")
try:
    with open(_FOLDERS_FILE, encoding="utf-8") as _f:
        FOLDERS = json.load(_f)
except FileNotFoundError:
    sys.exit(
        f"Hiányzik: {_FOLDERS_FILE}\n"
        "Másold le a drive.folders.example.json-t erre a névre, és töltsd ki a\n"
        "három Drive-mappa azonosítójával (target, logo, photos). Szándékosan\n"
        "NINCS alapértelmezés: egy néma fallback rossz mappába töltene fel."
    )
_missing = [k for k in ("target", "logo", "photos") if not FOLDERS.get(k)]
if _missing:
    sys.exit(f"{_FOLDERS_FILE}: hiányzó vagy üres kulcs(ok): {', '.join(_missing)}")

API = "https://www.googleapis.com/drive/v3"
UPLOAD = "https://www.googleapis.com/upload/drive/v3"


def token():
    t = os.environ.get("GG_TOKEN")
    if not t:
        sys.exit("GG_TOKEN missing - run through: gg-mcp-proxy exec "
                 "--alias google-drive --env-var GG_TOKEN -- <cmd>")
    return t.strip()


def call(url, method="GET", data=None, ctype=None, raw=False, extra=None):
    req = urllib.request.Request(url, method=method, data=data)
    req.add_header("Authorization", "Bearer " + token())
    if ctype:
        req.add_header("Content-Type", ctype)
    for k, v in (extra or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req) as r:
            body = r.read()
            hdrs = dict(r.headers)
            return (body if raw else json.loads(body or b"{}")), hdrs
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", "replace")[:400]
        # never echo the Authorization header back
        sys.exit(f"HTTP {e.code} on {url.split('?')[0]}\n{msg}")


def meta(fid):
    q = urllib.parse.urlencode({
        "fields": "id,name,mimeType,driveId,parents",
        "supportsAllDrives": "true",
    })
    return call(f"{API}/files/{fid}?{q}")[0]


def children(fid):
    """List a folder's children across My Drive and all shared drives."""
    out, page = [], None
    while True:
        p = {
            "q": f"'{fid}' in parents and trashed = false",
            "corpora": "allDrives",
            "includeItemsFromAllDrives": "true",
            "supportsAllDrives": "true",
            "fields": "nextPageToken,files(id,name,mimeType,size,imageMediaMetadata/width,imageMediaMetadata/height)",
            "pageSize": "200",
            "orderBy": "name",
        }
        if page:
            p["pageToken"] = page
        d = call(f"{API}/files?{urllib.parse.urlencode(p)}")[0]
        out.extend(d.get("files", []))
        page = d.get("nextPageToken")
        if not page:
            break
    return out


def download(fid, dest):
    body, _ = call(f"{API}/files/{fid}?alt=media&supportsAllDrives=true",
                   raw=True)
    with open(dest, "wb") as f:
        f.write(body)
    return len(body)


def upload(path, parent, existing_id=None):
    """Resumable upload. With existing_id it REPLACES that file's content
    instead of creating a second file with the same name."""
    name = os.path.basename(path)
    size = os.path.getsize(path)
    if existing_id:
        url = (f"{UPLOAD}/files/{existing_id}"
               f"?uploadType=resumable&supportsAllDrives=true")
        body = json.dumps({}).encode()
        method = "PATCH"
    else:
        url = f"{UPLOAD}/files?uploadType=resumable&supportsAllDrives=true"
        body = json.dumps({"name": name, "parents": [parent]}).encode()
        method = "POST"
    _, hdrs = call(url, method=method, data=body,
                   ctype="application/json; charset=UTF-8",
                   extra={"X-Upload-Content-Type": "application/pdf",
                          "X-Upload-Content-Length": str(size)})
    loc = hdrs.get("Location") or hdrs.get("location")
    if not loc:
        sys.exit("no resumable session Location header")
    with open(path, "rb") as f:
        data = f.read()
    req = urllib.request.Request(loc, method="PUT", data=data)
    req.add_header("Content-Type", "application/pdf")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def show(f, pad):
    im = f.get("imageMediaMetadata") or {}
    dim = f"{im.get('width')}x{im.get('height')}" if im else ""
    kb = int(f.get("size", 0)) // 1024 if f.get("size") else 0
    print(f"{pad}{f['name'][:54]:56s} {f['mimeType'][:26]:28s} "
          f"{kb:>6d} kB {dim}")


def cmd_list():
    for label, fid in FOLDERS.items():
        m = meta(fid)
        print(f"\n=== {label}: {m.get('name')} "
              f"(driveId={m.get('driveId') or 'MyDrive'})")
        for f in children(fid):
            show(f, "  ")
            if f["mimeType"].endswith("apps.folder"):
                for g in children(f["id"]):
                    show(g, "      ")


def cmd_fetch(_names):
    """Logo + every apartment photo, into assets/photos/<apartment>/."""
    os.makedirs(ASSETS, exist_ok=True)
    for f in children(FOLDERS["logo"]):
        if f["mimeType"].startswith("image/"):
            ext = ".png" if "png" in f["mimeType"] else ".jpg"
            d = os.path.join(ASSETS, "logo-src" + ext)
            print("logo:", f["name"], download(f["id"], d), "bytes")

    for sub in children(FOLDERS["photos"]):
        if not sub["mimeType"].endswith("apps.folder"):
            continue
        slug = sub["name"].strip().lower().replace(" ", "-")
        dest = os.path.join(PHOTOS, slug)
        os.makedirs(dest, exist_ok=True)
        imgs = [g for g in children(sub["id"])
                if g["mimeType"].startswith("image/")]
        if not imgs:
            print(f"{sub['name']}: NINCS FOTO")
            continue
        for i, g in enumerate(imgs):
            ext = os.path.splitext(g["name"])[1] or ".jpg"
            out = os.path.join(dest, f"{i:02d}{ext}")
            n = download(g["id"], out)
            print(f"{sub['name']}: {g['name']} -> {slug}/{os.path.basename(out)} "
                  f"({n // 1024} kB)")


def cmd_logo():
    """A vektoros logo beszerzese es szetbontasa.

    A Drive Marketing/Arculat mappajaban a gglogo_v2_text.svg a TELJES lockup
    (jel + felirat), a feliratban a betuk utvonalakka alakitva - ezert Poppins
    nelkul is markahu. A generator viszont kulon kezeli a ket reszt, mert a
    fekvo fejlecben egymas MELLETT kellenek.

    CSAPDA: az fpdf2 NEM vag a viewBox-hoz. Ha a feliratot ugy probalod
    kivagni, hogy csak a viewBox-ot szukited, a jel NEMAN kilog a lapra.
    Ezert a felirat-csoportot tenylegesen kiemeljuk egy uj SVG-be.
    """
    os.makedirs(ASSETS, exist_ok=True)
    q = ("(name = 'gglogo_v2_text.svg' or name = 'gglogo_v2.svg') "
         "and trashed = false")
    p = {"q": q, "corpora": "allDrives", "includeItemsFromAllDrives": "true",
         "supportsAllDrives": "true", "fields": "files(id,name)", "pageSize": "10"}
    got = {}
    for f in call(f"{API}/files?{urllib.parse.urlencode(p)}")[0].get("files", []):
        dest = os.path.join(ASSETS, f["name"])
        print(f["name"], download(f["id"], dest), "bytes")
        got[f["name"]] = dest
    if "gglogo_v2.svg" in got:
        os.replace(got["gglogo_v2.svg"], os.path.join(ASSETS, "gg-logo.svg"))
        print("-> assets/gg-logo.svg (csak a jel)")
    src = got.get("gglogo_v2_text.svg")
    if not src:
        print("nincs gglogo_v2_text.svg - a felirat raszterbol megy")
        return
    s = open(src, encoding="utf-8").read()
    body = s[s.index(">", s.index("<svg")) + 1:s.rindex("</svg>")]
    depth, start, last = 0, None, None
    for m in re.finditer(r"<(/?)([a-zA-Z]+)([^>]*?)(/?)>", body):
        close, _tag, _attrs, selfclose = m.groups()
        if close:
            depth -= 1
            if depth == 0:
                last = body[start:m.end()]
        elif selfclose == "/":
            if depth == 0:
                last = m.group(0)
        else:
            if depth == 0:
                start = m.start()
            depth += 1
    if not last or len(last) < 1000:
        print("nem talaltam a felirat-csoportot, ellenorizd kezzel")
        return
    out = ('<?xml version="1.0" encoding="utf-8"?>\n'
           '<svg xmlns="http://www.w3.org/2000/svg" viewBox="8 293 284 39">\n'
           + last + "\n</svg>\n")
    with open(os.path.join(ASSETS, "logo-wordmark.svg"), "w",
              encoding="utf-8") as f:
        f.write(out)
    print("-> assets/logo-wordmark.svg (csak a felirat,", len(out), "bytes)")


def cmd_upload():
    # szulo szerint listazunk, nem nev szerint keresunk: a Drive kereso-indexe
    # kesik, es a frissen feltoltott fajlt nev szerint NEM talalna meg
    have = {f["name"]: f["id"] for f in children(FOLDERS["target"])}
    files = sorted(f for f in os.listdir(OUT) if f.endswith(".pdf"))
    for n in files:
        fid = have.get(n)
        r = upload(os.path.join(OUT, n), FOLDERS["target"], fid)
        print(("frissitve: " if fid else "uj:        ") + str(r.get("name")))


if __name__ == "__main__":
    c = sys.argv[1] if len(sys.argv) > 1 else "list"
    if c == "list":
        cmd_list()
    elif c == "fetch":
        cmd_fetch(sys.argv[2:])
    elif c == "logo":
        cmd_logo()
    elif c == "upload":
        cmd_upload()
    else:
        sys.exit("list | fetch | logo | upload")
