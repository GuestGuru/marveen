#!/usr/bin/env python3
"""
ClaudeClaw fleet helper - shared, deterministic plumbing so agents don't burn
tokens hand-rolling curl/SQL/escaping in the model.

Covers: dashboard API auth (token always read from store/.dashboard-token, never
hardcoded), memory save/search, daily log, inter-agent messages, agent list,
kanban read helpers, and Telegram MarkdownV2 escaping.

Importable as a module or used from the CLI. See README.md for usage.

Config (no hardcoded paths or secrets):
  CLAW_DIR  - project root (the dir containing `store/`). If unset, the project
              root is auto-detected by walking up from the current directory
              until a `store/.dashboard-token` is found.
  CLAW_BASE - dashboard base url (default http://localhost:3420).
"""
import json
import os
import sys
import sqlite3
import urllib.request
import urllib.error


def project_dir():
    env = os.environ.get("CLAW_DIR")
    if env and os.path.isdir(os.path.join(env, "store")):
        return env
    d = os.getcwd()
    while True:
        if os.path.isfile(os.path.join(d, "store", ".dashboard-token")):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            break
        d = parent
    raise RuntimeError("project root not found (set CLAW_DIR to the dir containing store/)")


def base_url():
    return os.environ.get("CLAW_BASE", "http://localhost:3420").rstrip("/")


def token():
    with open(os.path.join(project_dir(), "store", ".dashboard-token")) as f:
        return f.read().strip()


def db_path():
    return os.path.join(project_dir(), "store", "claudeclaw.db")


def api(method, path, payload=None, timeout=20):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(base_url() + path, data=data, method=method)
    req.add_header("Authorization", "Bearer " + token())
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"API {method} {path} -> {e.code}: {e.read().decode()[:200]}")
    try:
        return json.loads(body)
    except ValueError:
        return body



# --- ekezet-kapu -------------------------------------------------------------
# Merve 2026-09-09: egy nap alatt tiz napi naplo-bejegyzes ment be nulla
# ekezettel harom agenstol, es 12 inter-agent uzenet ugyanigy. KET kulon ok van,
# es ezt fontos szetvalasztani, mert csak az egyiket oldja meg a helper:
#   (a) AZ IRAS UTJA -- shellbe agyazott printf, `python -c`, `$(...)`: a szerzo
#       reflexbol kerul mindent, ami az idezojelezest torheti, es az ekezetek az
#       aposztrofokkal egyutt esnek ki. EZT a helper megoldja (STDIN + json.dumps).
#   (b) A MUNKAANYAG REGISZTERE -- a szoveg MAR ekezet nelkul szuletik meg (pl.
#       egy audit kozben negyven regi, ekezet nelkuli bejegyzest olvasol es
#       javitasz). Ezt a helper NEM fogja meg: a json.dumps pontosan azt viszi be,
#       amit kap. jean negy azonos uton irt bejegyzese kozul harom nulla volt,
#       a negyedik 98 -- ott az ut vegig ugyanaz volt.
# Ezert all itt ez a kapu: a (b) agra CSAK a kikuldes elotti gepi szamolas vedd.
# NEM blokkol, csak kiir a stderr-re -- a helyes szoveget sosem akarjuk megallitani.
#
# A kuszob salesninja meresebol jon (2026-09-09, n=47 naplo + n=173 uzenet):
# a romlott szovegek 0,00-0,13 ekezet/100 karakter kozott vannak, az epek
# 5,66-11,36 kozott. A 60-szoros res miatt a 2,0 sem fals riasztast, sem
# atcsuszast nem ad. A puszta "nulla ekezet" kuszob KEVES: ket romlott bejegyzes
# egyetlen ekezetet tartott meg (valoszinuleg tulajdonnevben), es atcsuszott volna.
HU_ACCENTS = set("áéíóöőúüű"
                 "ÁÉÍÓÖŐÚÜŰ")
# Ekezet nelkul is felismerheto gyakori magyar szavak: a romlott szoveget is
# magyarnak kell latnunk, kulonben pont azt engednenk at, amit meg akarunk fogni.
HU_HINTS = (" hogy ", " nem ", " egy ", " meg ", " volt ", " ami ", " mint ",
            " csak ", " ezert ", " ez a ", " az a ", " lett ", " tehat ")
ACCENT_MIN_PER_100 = 2.0
ACCENT_MIN_LEN = 200


# A figyelmeztetes melle kiszamoljuk a MAGYAR MONDATOKRA szukitett aranyt is.
# brokermarcsi merese, 2026-09-09: a ketnyelvu uzenet (magyar keret + angol level-
# fogalmazvany) higitja a teljes szovegre vett aranyt -- nala 3,04, a magyar reszen
# 6,42. Ez nala visszatero forma, nem kivetel.
# A DONTES ezert is a teljes aranyon marad: a teljes korpuszon (1416 vizsgalt sor,
# conversation_log + daily_logs + memories) a szukitett arany 3 sorban ter el, es
# ott is a vegyes -- reszben javitott -- bejegyzeseknel. Merve 2026-09-09: nulla
# fals riasztas, tehat nincs mit javitani a dontesen. A szukitett arany a
# FIGYELMEZTETESBEN all, hogy aki riasztast kap, egy pillantasbol lassa, hogy
# ketnyelvuseg-e az ok, es ne kelljen kezzel megkerdeznie.
_HU_FUNC = {"hogy", "nem", "egy", "meg", "volt", "ami", "amit", "csak", "ezert",
            "tehat", "lett", "lesz", "kell", "mert", "mar", "igy", "ezt", "azt",
            "ez", "ha", "vagy", "es", "de", "mint", "van", "nincs", "sem"}
_SENT_RE = None
_WORD_RE = None


def hungarian_ratio(text):
    """(arany, magyar_karakterszam) csak a magyarnak latszo mondatokra, vagy
    (None, n) ha keves a magyar szoveg ahhoz, hogy velemenye legyen."""
    global _SENT_RE, _WORD_RE
    import re
    if _SENT_RE is None:
        _SENT_RE = re.compile(r"[^.!?\n]+[.!?]?")
        _WORD_RE = re.compile(r"[0-9a-zA-Z\u00c0-\u017f]+")
    hu = []
    for sent in _SENT_RE.findall(text):
        words = [w.lower() for w in _WORD_RE.findall(sent)]
        if not words:
            continue
        hits = sum(1 for w in words if w in _HU_FUNC)
        if hits and hits * 100.0 / len(words) >= 4.0:
            hu.append(sent)
    joined = "".join(hu)
    if len(joined) < 120:
        return None, len(joined)
    return sum(1 for ch in joined if ch in HU_ACCENTS) * 100.0 / len(joined), len(joined)


# --- felig javitott bejegyzes: ep egesz, romlott bekezdes -------------------
# jean merese, 2026-09-09: a leggyakoribb rejtozo alak nem a teljesen ekezet
# nelkuli bejegyzes, hanem a FELIG javitott -- mai, ekezetes zaradek vagy nyitosor
# egy regi, ekezet nelkuli torzson. Az egeszre vett arany igy 2,0 FOLE kerul, es a
# kapu hallgat. Merve a teljes korpuszon (685 bejegyzes >=200 karakter): 14 ilyen
# sor, ebbol 2 a kozos polcon; mindharom kezzel ellenorzott minta valodi romlas
# volt (jean #431, #437, salesninja #630).
# A bekezdesre ugyanazt a MAGYAR-mondat szukitest hasznaljuk, mint a
# figyelmeztetesben. Nyers karakterarannyal 21 talalat jonne, es abbol legalabb
# harom fals: egy API-utvonalas es egy mezonev-listas bekezdes aranyat a
# szandekosan ekezet nelkuli karakterlancok viszik le, nem hiba (salesninja
# figyelmeztetese). A szukites ezeket kiejti.
PARAGRAPH_MIN_LEN = 200
# A BEKEZDES-detektornak SZIGORUBB kuszob kell, mint az egesz szovegnek, mert egy
# bekezdesben surubben allnak az azonositok, es azok huzzak le az aranyt. Merve
# 2026-09-09, kilenc kezzel ellenorzott talalaton: a VALODI romlasok 0,00-0,19
# kozott vannak, a FALS pozitivok 1,31-1,82 kozott (salesninja #544 API-utvonalas
# es #666 mezonev-listas bekezdese, marveen #710, ahol a bekezdes vegig ekezetes,
# csak tele van ilyennel: 05-prod-tree-guard, /home/gg/marveen, node_modules).
# Az 1,0 a res kozepe. FIGYELEM: ez kilenc megfigyelesbol allitott konstans, nem
# szaz -- ezert ad a sor `head` mezot is, hogy a talalat ranezesre ellenorizheto
# legyen. A partial JELOLTLISTA, nem itelet.
PARAGRAPH_MAX_PER_100 = 1.0
_PARA_RE = None


def worst_paragraph(text):
    """(arany, hossz, bekezdes) a legrosszabb, magyarnak latszo bekezdesre egy
    egeszkent EP szovegben, vagy (None, 0, None) ha nincs ilyen. Sosem dob."""
    global _PARA_RE
    try:
        import re
        if _PARA_RE is None:
            _PARA_RE = re.compile(r"\n\s*\n")
        worst = (None, 0, None)
        for para in _PARA_RE.split(text or ""):
            if len(para) < PARAGRAPH_MIN_LEN:
                continue
            ratio, hu_len = hungarian_ratio(para)
            if ratio is None or ratio >= PARAGRAPH_MAX_PER_100:
                continue
            if worst[0] is None or ratio < worst[0]:
                worst = (ratio, hu_len, para)
        return worst
    except Exception:
        return None, 0, None


# jean merese, 2026-09-09 este: a bekezdes-szintu vizsgalat NEM eleg, mert a
# hungarian_ratio a bekezdesen BELUL is atlagol. Ha egy bekezdesben a mai,
# ekezetes zaradek egyutt all a regi, ekezet nelkuli mondatokkal, a bekezdes
# atlaga a kuszob FOLE kerul, es a romlott mondatok elrejtoznek. Minel gondosabb
# a zaradek, annal tisztabbnak latszik a romlott torzs.
# A MONDAT-szintu ellenorzes ezt megfogja: magyarnak latszo, 120 karakternel
# hosszabb mondat NULLA ekezettel. Merve a teljes korpuszon: a ket modszer
# egymast EGESZITI KI, nem valtja -- 3 sort csak a mondat-szintu talal (jean
# #439 shared, bubi #532, marveen #762), 3 sort csak a bekezdes-szintu.
# Ezert a partial a KETTO UNIOJA, es a sor megmondja, melyik fogta meg.
SENTENCE_MIN_LEN = 120
_ZS_SENT = None
_ZS_WORD = None


def zero_accent_sentences(text):
    """Magyarnak latszo, hosszu mondatok NULLA ekezettel. Sosem dob."""
    global _ZS_SENT, _ZS_WORD
    try:
        import re
        if _ZS_SENT is None:
            _ZS_SENT = re.compile(r"[^.!?\n]+[.!?]?")
            _ZS_WORD = re.compile(r"[0-9a-zA-Z\u00c0-\u017f]+")
        out = []
        for sent in _ZS_SENT.findall(text or ""):
            if len(sent) < SENTENCE_MIN_LEN:
                continue
            words = [w.lower() for w in _ZS_WORD.findall(sent)]
            if len(words) < 5:
                continue
            if sum(1 for w in words if w in _HU_FUNC) < 2:
                continue
            if not any(ch in HU_ACCENTS for ch in sent):
                out.append(sent)
        return out
    except Exception:
        return []


def accent_warning(text):
    """Vissza egy figyelmezteto sort, ha a szoveg magyarnak latszik es gyanusan
    ekezettelen; egyebkent None. Sosem dob es sosem blokkol."""
    try:
        if not text or len(text) < ACCENT_MIN_LEN:
            return None
        low = " " + " ".join(text.lower().split()) + " "
        if sum(1 for h in HU_HINTS if h in low) < 2:
            return None
        n = sum(1 for ch in text if ch in HU_ACCENTS)
        per100 = n * 100.0 / len(text)
        if per100 >= ACCENT_MIN_PER_100:
            return None
        hu_r, hu_len = hungarian_ratio(text)
        if hu_r is None:
            hu_note = (f" A magyar mondatokra szukitett resz csak {hu_len} karakter, "
                       "ahhoz keves, hogy kulon velemenye legyen.")
        elif hu_r >= ACCENT_MIN_PER_100:
            hu_note = (f" DE a magyar mondatokra szukitve {hu_r:.2f}/100 "
                       f"({hu_len} karakter), ami rendben van: valoszinuleg "
                       "ketnyelvu szoveg (angol blokk higitja az aranyt), nem hiba.")
        else:
            hu_note = (f" A magyar mondatokra szukitve is csak {hu_r:.2f}/100 "
                       f"({hu_len} karakter), tehat nem a ketnyelvuseg az ok.")
        return (f"FIGYELEM: ekezet-gyanu -- {len(text)} karakter, {n} ekezet "
                f"({per100:.2f}/100, kuszob {ACCENT_MIN_PER_100:.1f}). "
                "A szoveg magyarnak latszik, de szinte nincs benne ekezet."
                + hu_note +
                " Az iras NEM allt meg. Ha ez hiba, ird ujra ekezettel es javitsd "
                "(az emlek PUT-tal cserelheto, a napi naplo append-only).")
    except Exception:
        return None


def _warn_accents(text):
    w = accent_warning(text)
    if w:
        print(w, file=sys.stderr)

# --- utolagos ekezet-audit ---------------------------------------------------
# brokermarcsi javaslata, 2026-09-09: a kapu a KIKULDES elott szol, de a
# kikuldott szovegre is van olcso gepi ellenorzes -- a conversation_log
# direction='out' sorai azt tartalmazzak, ami tenyleg elment a csatornan.
# Ez nem elozi meg a hibat, hanem kimutatja, es nem a szandekon mulik.
#
# Merve 2026-09-09 (n=404 kimeno uzenet, 2026-08-02 ota, hat agens): nulla
# riasztas. FONTOS kulonbseg a naplohoz kepest: a kimeno oldalon a legalacsonyabb
# EP ertek 2,61 ekezet/100 karakter (marveen id=126), nem 5,79, mert a csatorna-
# uzenet gyakran tartalmaz angol kodblokkot, parancsot, URL-t es MarkdownV2
# backslasheket. A 2,0-es kuszob tartaleka tehat itt 1,3-szoros, nem 2,9-szeres:
# a kuszobot NEM szabad feljebb vinni.
_AUDIT_SOURCES = {
    # nev: (tabla, id-oszlop, szoveg-oszlop, datum-kifejezes, extra WHERE)
    "out":  ("conversation_log", "id", "text",
             "date(created_at,'unixepoch','localtime')", "direction = 'out'"),
    "log":  ("daily_logs", "id", "content", "date", "1"),
    "mem":  ("memories", "id", "content",
             "date(created_at,'unixepoch','localtime')", "1"),
}


def accent_audit(source="out", agent=None, days=None):
    """A kaput lefuttatja mar LEIRT szovegeken. Visszaad minden vizsgalt sort,
    amelyik riaszt, plusz a vizsgalt darabszamot -- teljesseg-allitashoz DB-bol
    olvas, nem az API-bol (az nemam csonkit).

    A "flagged: 0" ONMAGABAN NEM TELJESSEG-ALLITAS. bubi merese, 2026-09-09:
    34 sajat emlekebol az audit 28-at vizsgalt meg, a hatbol ketto TENYLEG
    romlott volt (0,00 ekezet/100), es a nyelvi szuro rejtette el oket. Az ok
    szerkezeti: a ket bejegyzes jorészt TULAJDONNEVEKBOL es rendszernevekbol allt
    (lakasnev, agensnev, e-mail, EUR-osszeg), tehat keves benne a magyar
    funkcioszo -- a szuro pont ott gyengul el, ahol a szoveg adatszeru, es a
    memoriaban pont az ilyen bejegyzes a gyakori. Ket FUGGETLEN szuro (a helperé
    es bubie) ugyanott vakult meg, tehat nem kuszob-hangolas a megoldas.
    Ezert a valasz "skipped" bontast is ad (short / nonhu), es a nyelvi szuro
    altal kihagyott, de kuszob ALATTI sorokat kulon listaban (nonhu_below_rows)
    -- igy a nulla eredmeny mellett rogton latszik, hogy mihez kepest nulla."""
    if source not in _AUDIT_SOURCES:
        raise RuntimeError(f"ismeretlen forras: {source} (out|log|mem)")
    table, idcol, textcol, datexpr, extra = _AUDIT_SOURCES[source]
    sql = (f"SELECT {idcol}, agent_id, {datexpr}, {textcol} FROM {table} "
           f"WHERE {extra} AND {textcol} IS NOT NULL")
    params = []
    if agent:
        sql += " AND agent_id = ?"
        params.append(agent)
    if days:
        sql += f" AND {datexpr} >= date('now','localtime',?)"
        params.append(f"-{int(days)} days")
    con = sqlite3.connect(db_path())
    try:
        rows = con.execute(sql, params).fetchall()
    finally:
        con.close()
    def _row(rid, aid, day, text, n, per100):
        return {"id": rid, "agent": aid, "date": day, "chars": len(text),
                "accents": n, "per100": round(per100, 2),
                "head": " ".join(text.split())[:120]}

    checked, flagged, partial = 0, [], []
    skipped_short, skipped_nonhu, nonhu_below = 0, 0, []
    for rid, aid, day, text in rows:
        if not text:
            continue
        n = sum(1 for ch in text if ch in HU_ACCENTS)
        per100 = n * 100.0 / len(text)
        if len(text) < ACCENT_MIN_LEN:
            skipped_short += 1
            continue
        low = " " + " ".join(text.lower().split()) + " "
        if sum(1 for h in HU_HINTS if h in low) < 2:
            skipped_nonhu += 1
            # A nyelvi szuro a bizonyitott vakfolt: a kihagyott sorok kozul
            # KULON kigyujtjuk azokat, amik amugy a kuszob alatt allnanak.
            if per100 < ACCENT_MIN_PER_100:
                nonhu_below.append(_row(rid, aid, day, text, n, per100))
            continue
        checked += 1
        if per100 < ACCENT_MIN_PER_100:
            flagged.append(_row(rid, aid, day, text, n, per100))
        else:
            p_ratio, p_hu_len, para = worst_paragraph(text)
            zsents = zero_accent_sentences(text)
            if p_ratio is not None or zsents:
                row = _row(rid, aid, day, text, n, per100)
                row["detector"] = ("both" if (p_ratio is not None and zsents)
                                   else ("paragraph" if p_ratio is not None
                                         else "sentence"))
                if p_ratio is not None:
                    row["worst_paragraph_per100"] = round(p_ratio, 2)
                    row["worst_paragraph_hu_chars"] = p_hu_len
                row["zero_accent_sentences"] = len(zsents)
                sample = para if p_ratio is not None else zsents[0]
                row["head"] = " ".join(sample.split())[:120]
                partial.append(row)
    flagged.sort(key=lambda f: (f["date"], f["id"]))
    partial.sort(key=lambda f: (f["date"], f["id"]))
    nonhu_below.sort(key=lambda f: (f["date"], f["id"]))
    return {"source": source, "checked": checked, "flagged": len(flagged),
            "partial": len(partial),
            "skipped": {"short": skipped_short, "nonhu": skipped_nonhu,
                        "nonhu_below_threshold": len(nonhu_below)},
            "threshold": ACCENT_MIN_PER_100, "rows": flagged,
            "partial_rows": partial,
            "nonhu_below_rows": nonhu_below}


def save_memory(agent, content, category="warm", keywords=""):
    _warn_accents(content)
    return api("POST", "/api/memories", {"agent_id": agent, "content": content,
                                         "category": category, "keywords": keywords})


def update_memory(agent, mem_id, content, category=None, keywords=None):
    """Meglevo emlek TELJES tartalmanak csereje (a PUT cserel, nem fuz hozza).
    bubi kerese, 2026-09-09: a visszamenoleges javitashoz eddig modulkent kellett
    importalni a fleet-et, mert csak mem-save volt. Az `owner` mezot innen mindig
    a hivo agens adja, tehat egy elgepelt id nem irhat at mas emleket -- ez a
    szerver elgepeles-vedelme, nem jogosultsag."""
    _warn_accents(content)
    payload = {"content": content, "owner": agent}
    if category:
        payload["category"] = category
    if keywords is not None:
        payload["keywords"] = keywords
    return api("PUT", f"/api/memories/{int(mem_id)}", payload)


def search_memory(agent, q, category=None):
    from urllib.parse import quote
    path = f"/api/memories?agent={quote(agent)}&q={quote(q)}"
    if category:
        path += f"&category={quote(category)}"
    return api("GET", path)


# --- naplo-fejlec ideje ------------------------------------------------------
# jean javaslata, 2026-09-09: a `## HH:MM` fejlecet ne kezzel irjuk be. A hiba
# nem a szabaly nem-ismerese: jean mindketszer lefuttatta elotte a date-et, de a
# szoveg megirasa alatt eltelt ido, es a MAR LATOTT erteket gepelte be (+1,3 es
# +0,8 perc a jovoben). Ugyanez nagyban: peppa 25 bejegyzesebol 17 fejlece kerult
# a jovobe, a legnagyobb elteres 361 perc, mert minden fejlecet az elozo KITALALT
# fejlechez igazitott.
# Ezert a helper csereli a fejlecet a bekuldes pillanataban:
#   - a literal "HH:MM" helyorzot mindig,
#   - a JOVOBELI idopontot (1-120 perccel a szerveridonel kesobb) szinten.
# A korabbi fejlecet NEM bantja: az jelolheti a munka kezdetet, es a szabaly
# iranya egyertelmu -- a fejlec lehet korabbi, kesobbi soha. A 120 perces korlat
# az ejfel-atfordulas es a szandekosan mas napra irt bejegyzes miatt van.
_HEADER_RE = None


def fix_log_header(content, now=None):
    """(javitott_tartalom, megjegyzes_vagy_None). Sosem dob."""
    global _HEADER_RE
    try:
        import re
        import datetime
        if _HEADER_RE is None:
            _HEADER_RE = re.compile(r"^(\s*#{1,6}\s*)(HH:MM|([01]?\d|2[0-3]):([0-5]\d))")
        first_nl = content.find("\n")
        head = content if first_nl < 0 else content[:first_nl]
        m = _HEADER_RE.match(head)
        if not m:
            return content, None
        now = now or datetime.datetime.now()
        real = now.strftime("%H:%M")
        if m.group(2) == "HH:MM":
            return content.replace(m.group(0), m.group(1) + real, 1), \
                f"naplo-fejlec: HH:MM helyorzo -> {real}"
        written = int(m.group(3)) * 60 + int(m.group(4))
        current = now.hour * 60 + now.minute
        drift = written - current
        if 0 < drift <= 120:
            return content.replace(m.group(0), m.group(1) + real, 1), \
                (f"naplo-fejlec javitva: {m.group(2)} -> {real} "
                 f"({drift} perccel a JOVOBEN volt; a fejlec lehet korabbi, kesobbi soha)")
        return content, None
    except Exception:
        return content, None


def daily_log(agent, content):
    content, note = fix_log_header(content)
    if note:
        print(note, file=sys.stderr)
    _warn_accents(content)
    return api("POST", "/api/daily-log", {"agent_id": agent, "content": content})


def send_message(from_agent, to_agent, content):
    _warn_accents(content)
    return api("POST", "/api/messages", {"from": from_agent, "to": to_agent, "content": content})


def list_agents():
    return api("GET", "/api/agents")


def _kanban(where, params=()):
    con = sqlite3.connect(db_path())
    con.row_factory = sqlite3.Row
    try:
        rows = con.execute(
            "SELECT id, title, status, assignee, priority, project, due_date, "
            "updated_at FROM kanban_cards WHERE archived_at IS NULL AND " + where,
            params).fetchall()
    finally:
        con.close()
    return [dict(r) for r in rows]


def kanban_due_today():
    return _kanban(
        "due_date IS NOT NULL AND status != 'done' "
        "AND date(due_date,'unixepoch','localtime') <= date('now','localtime') "
        "ORDER BY due_date")


def kanban_stuck(idle_seconds=14400):
    return _kanban("status = 'in_progress' AND updated_at < strftime('%s','now') - ? "
                   "ORDER BY updated_at", (idle_seconds,))


def kanban_by_status(status):
    return _kanban("status = ? ORDER BY priority DESC, updated_at DESC", (status,))


_MDV2_SPECIAL = r"_*[]()~`>#+-=|{}.!\\"


def escape_mdv2(text):
    """Escape literal text for Telegram MarkdownV2. Escape your dynamic text with
    this, THEN wrap intended formatting (e.g. '*'+escape_mdv2(label)+'*' for bold)."""
    return "".join("\\" + ch if ch in _MDV2_SPECIAL else ch for ch in str(text))


def escape_mdv2_keep_bold(text):
    """Escape for MarkdownV2 but leave '*' untouched, so hand-authored '*bold*'
    markers survive. Use this for long, hand-written messages (e.g. the morning
    brief) where the formatting is inline in the prose rather than wrapped around
    programmatic labels. Only '*' is preserved: every other special is escaped,
    so pair your asterisks or Telegram rejects the message with a 400."""
    return "".join(
        ch if ch == "*" else ("\\" + ch if ch in _MDV2_SPECIAL else ch)
        for ch in str(text)
    )


def outgoing_gate_check(text):
    """Return a list of problems the outgoing-copy-gate hook would reject.
    Cheaper to run here than to have the send blocked."""
    problems = []
    if "\u2014" in text or "\u2013" in text:
        problems.append("em/en dash present (the gate rejects it)")
    if " -- " in text.replace("\\-", "-"):
        problems.append("space-hyphen-hyphen-space present (the gate rejects it)")
    stars = text.count("*") - text.count("\\*")
    if stars % 2:
        problems.append("odd number of unescaped '*' (Telegram 400: unclosed entity)")
    return problems


def _out(v):
    print(json.dumps(v, ensure_ascii=False, indent=2) if isinstance(v, (dict, list)) else v)


def _arg(value):
    """Return the argument, or the whole of stdin when it is exactly "-".

    WHY this exists: the JSON body is built with json.dumps, so the JSON side has
    no quoting pitfalls -- but the SHELL side does, and it fails SILENTLY. Inside a
    double-quoted argument the shell expands `backticks`, $VAR and $(...), and an
    unescaped double quote inside the text breaks the JSON the caller hand-built.
    Measured 2026-08-31: two /api/daily-log writes were rejected with HTTP 500
    (`SyntaxError ... in JSON at position 722`) because the content contained a
    plain `"quoted"` word, and an inter-agent message lost every backticked path
    while still reporting success.

    So for anything containing quotes, backticks, $ or code, pass "-" and pipe the
    text in from a QUOTED heredoc -- the quoted 'EOF' is what disables expansion:

        cat <<'EOF' | fleet.py daily-log marveen -
        ## 10:00 -- "idezojel", `backtick` and $var all survive
        EOF
    """
    return sys.stdin.read() if value == "-" else value


def main(argv):
    if not argv:
        print(__doc__)
        return 0
    cmd, rest = argv[0], argv[1:]
    if cmd == "mdv2":
        print(escape_mdv2(rest[0] if rest else sys.stdin.read()))
    elif cmd == "mdv2b":
        src = rest[0] if rest else sys.stdin.read()
        bad = outgoing_gate_check(src)
        if bad:
            sys.stderr.write("BLOCKED before send:\n- " + "\n- ".join(bad) + "\n")
            return 2
        print(escape_mdv2_keep_bold(src))
    elif cmd == "mem-save":
        _out(save_memory(rest[0], _arg(rest[1]), rest[2] if len(rest) > 2 else "warm",
                         rest[3] if len(rest) > 3 else ""))
    elif cmd == "mem-search":
        _out(search_memory(rest[0], rest[1], rest[2] if len(rest) > 2 else None))
    elif cmd == "mem-update":
        _out(update_memory(rest[0], rest[1], _arg(rest[2]),
                           rest[3] if len(rest) > 3 else None,
                           rest[4] if len(rest) > 4 else None))
    elif cmd == "daily-log":
        _out(daily_log(rest[0], _arg(rest[1])))
    elif cmd == "msg":
        _out(send_message(rest[0], rest[1], _arg(rest[2])))
    elif cmd == "agents":
        _out([{"name": a.get("name"), "running": a.get("running"),
               "model": a.get("model")} for a in list_agents()])
    elif cmd == "accent-audit":
        _out(accent_audit(rest[0] if rest else "out",
                          rest[1] if len(rest) > 1 and rest[1] != "-" else None,
                          rest[2] if len(rest) > 2 else None))
    elif cmd == "kanban-due":
        _out(kanban_due_today())
    elif cmd == "kanban-stuck":
        _out(kanban_stuck(int(rest[0]) if rest else 14400))
    elif cmd == "kanban-status":
        _out(kanban_by_status(rest[0]))
    else:
        sys.stderr.write(f"unknown command: {cmd}\n")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
