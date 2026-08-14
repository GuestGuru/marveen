---
name: dream-engine
description: Éjszakai analízis-loop az aznapi memóriákról, naplóról és kanban-állapotról. Generál 4 priorizált akció-javaslatot reggelre.
---

Te most a "Dream Engine" éjszakai analízis-loopot futtatod. 02:07-kor vagy, {{OWNER_NAME}} alszik, NE küldj üzenetet a beállított csatornára.

A cél: az aznapi tudást átkonszolidálni és reggelre (07:30 Reggeli Napindító) felkészülni 4 priorizált javaslattal.

## Mit kell csinálnod

Generálj egy `{{INSTALL_DIR}}/DREAM.md` fájlt az alábbi 5 bucket alapján. A formátum a fájl alján van.

### Bucket 1 — 💡 Skill-javaslatok (flotta-szintű)

Nézz végig MINDEN agent (a fő-ágens és az összes sub-agent) tegnapi (24h) memóriáit és napi naplóját. Kerítsd ki:
- Volt-e 3+ szor visszatérő, manuálisan ismételt művelet ami skill-be illeszthető?
- Új, NEM lefedett pattern amit érdemes lenne skillbe önteni?

SQL minta:
```bash
sqlite3 {{INSTALL_DIR}}/store/claudeclaw.db "SELECT agent_id, content, keywords FROM memories WHERE created_at > strftime('%s', 'now', '-24 hours') AND category IN ('hot','warm') ORDER BY agent_id, created_at"
```

Output: 0-2 konkrét skill-javaslat. Mindegyikhez: cím + 1 mondat indoklás + "flotta-szintű" vagy "agent: <név>".

### Bucket 2 — 🧹 Memória-egészség (NE delete, COLD-tier-be mozgatás)

```bash
# Vektorizálás ellenőrzés
sqlite3 {{INSTALL_DIR}}/store/claudeclaw.db "SELECT COUNT(*) as total, COUNT(embedding) as with_emb FROM memories"
# Ha NEM 100%, hívd meg a backfill endpoint-ot (Ollamaval embeddeli a hianyzo ID-kat):
curl -s -X POST http://localhost:{{WEB_PORT}}/api/memories/backfill -H "Authorization: Bearer $(cat {{INSTALL_DIR}}/store/.dashboard-token)"

# Antikvált hot-tier (>7 napos hot, nem hivatkozott a memories_fts-en az elmúlt 24h-ban)
sqlite3 {{INSTALL_DIR}}/store/claudeclaw.db "SELECT id, content, accessed_at FROM memories WHERE category='hot' AND accessed_at < strftime('%s', 'now', '-7 days')"
```

Műveletek:
1. Vektorizálatlan memóriák: jelezd hányat találtál (a fire-and-forget embedding-job amúgy megcsinálja, de itt ellenőrzöd).
2. Antikvált hot/warm → COLD-tier-be PUT (UPDATE category='cold'). Sosem törlés.
3. Pontos dupla-content: jelezd, mozgass cold-ba.

A változtatásokat directly SQL-lel csináld:
```bash
sqlite3 {{INSTALL_DIR}}/store/claudeclaw.db "UPDATE memories SET category='cold' WHERE id IN (...)"
```

Output: rövid statisztika ("X memória cold-tier-be áthelyezve, Y vektorizálatlan rendezve").

### Bucket 3 — 🎯 Project-priorítás (top-3 holnapi javaslat)

```bash
# Nyitott kanban-kártyák project + priority szerint
sqlite3 {{INSTALL_DIR}}/store/claudeclaw.db "SELECT id, title, status, project, priority, assignee FROM kanban_cards WHERE status IN ('planned','in_progress','waiting') AND archived_at IS NULL ORDER BY project, priority DESC"
```

Csoportosíts project szerint. A daily naplóban (utolsó 7 nap) nézd hogy melyik projekten van aktív mozgás (commit, PR, kanban-átmozgás). Hozz ki egy TOP-3 holnapi javaslatot prioritás+aktivitás súlyozva.

Output: 3 sor, mindegyik formátum `<project>: <kártya cím / akció> — <indok 1 mondatban>`.

### Bucket 4 — 🌐 External opportunities (új skill-repo ajánlások)

Hetente 1-2 alkalommal (NEM minden éjszaka — kerüljük a zajos napi javaslatot) végezz WebSearch-öt új Claude Code / agentic AI / produktivitás-skillekért. Szűrés:
- GitHub stars >100
- Recent activity (utolsó 90 napban commit)
- README clarity (skill mit csinál, hogyan kell telepíteni)

Limitáció: ha az utolsó 7 napban már volt ajánlás (nézd a DREAM.md utolsó 7 napos archívumát vagy egy `external-ops-last-run` markerfile-t), skip-eld.

Output (max 1 ajánlás): repo URL + 1 mondat indok hogy MIÉRT releváns {{OWNER_NAME}}nak (figyelembe véve: AI tartalomgyártás, magyar piac, fejlesztési flotta menedzsment, marketing).

### Bucket 5 — 🛠 Skill-flotta health (csak NEM-pinned skillek)

```bash
# Antikvált skillek: nincs use-log, vagy a frontmatterben pinned: false
ls ~/.claude/skills/ | head
# Mindegyik SKILL.md-ben grep -l "pinned: true" — ezek mind védettek
grep -L "^pinned:" ~/.claude/skills/*/SKILL.md  # azok a skillek ahol nincs pinned-flag (NEM gyári)
```

Pinned default (mindig védett): claude-video, frontend-design, docx, skill-creator, skill-factory, skill-install-from-git, init, review, security-review, simplify, fewer-permission-prompts, loop, schedule, claude-api, update-config, keybindings-help, telegram:configure, telegram:access.

Output: 0-3 javaslat: "skill <név> antikvált (utolsó használat >30 nap), törlés vagy frissítés javasolt".

## Output formátum (DREAM.md)

```markdown
# 💭 Dream Engine — 2026-05-12 02:07

## 💡 Skill-javaslatok
- (vagy "Nincs új javaslat")

## 🧹 Memória-egészség
346 / 346 vektorizált, 5 hot→cold mozgatva, 0 duplikátum.

## 🎯 Top-3 holnapi javaslat
1. <project>: <akció> — <indok>
2. ...
3. ...

## 🌐 External opportunity
- (vagy "Skip — heti limit elérte" / "Nincs releváns új repo")

## 🛠 Skill-flotta health
- (vagy "Minden skill aktív vagy pinned")
```

## Szabályok

- NE küldj üzenetet a csatornára. A DREAM.md a reggeli napindítóból kerül kiküldésre (07:30).
- A `Bash` és SQL műveletek mind helyiek — semmilyen external API hívás (kivéve az Ollama embedding ha kell).
- Ha akadály van (pl. DB lock, missing embedding model), írd be a DREAM.md végére `## ⚠️ Hibák` szekciót — reggel látom.
- Befejezésként, írd a DREAM.md végére: `*{{BOT_NAME}}, 02:XX -- most már alszom én is.*`

## Buktatók

- **A `sqlite3` CLI idokozben feltelepult** (2026-07-29: `command not found`; 2026-07-31: /usr/bin/sqlite3 3.45.1, merve). A fenti SQL-snippetek tehat mar futnanak, de a python3-as ut maradjon az alapertelmezes: ha a CLI eltunik, a shell-es SQL NEMAN ures kezzel ter vissza. Mindet a python3 `sqlite3` moduljaval futtasd:
  ```bash
  python3 -c "
  import sqlite3
  db = sqlite3.connect('{{INSTALL_DIR}}/store/claudeclaw.db')
  for r in db.execute(\"SELECT id, category, content FROM memories WHERE category='hot'\"): print(r)
  "
  ```
  Íráshoz (cold-ba mozgatás) kötelező a `db.commit()`, különben a művelet elveszik.
- **Bucket 4 ellentmond a "semmilyen external API hívás" szabálynak.** A WebSearch bucket 4-nél megengedett, de csak akkor, ha a heti limit engedi: a `store/external-ops-last-run` marker dátuma 7 napnál régebbi. Ha nem, skip, és ezt írd is ki.
- **A wrapper kérhet Telegram-küldést, a törzs viszont tiltja.** A törzs nyer: hajnali kettőkor nincs csatorna-üzenet, a DREAM.md a 07:30-as napindítóból megy ki. Ha a scheduler fejléce mást mond, azt a DREAM.md `## ⚠️ Hibák` szekciójában jelezd, ne az üzenetküldéssel oldd meg.
- **A DREAM.md-t felülírás előtt be kell olvasni** (a Write tool megköveteli), és a tegnapi tartalom hasznos: abból derül ki, mi volt a korábbi top-3 és teljesült-e. Ne vakon írd felül, előbb vesd össze a mai állapottal.
- **A tegnapi top-3 teljesülését BIZONYÍTÉKKAL ellenőrizd, ne feltételezéssel.** Minden pontnak van olcsó, konkrét ellenőrzője: fájl-tartalom (`grep -n` a javítandó sorra), fájl-mtime (`ls -lt` a patchelendő SKILL.md-n), config-állapot (`access.json` `allowFrom`), kanban-státusz. 2026-08-04: a három javaslatból kettő NEM készült el, és ez csak a `grep`/`ls`/`access.json` triádból derült ki -- a napló és a memória alapján mindkettő „folyamatban"-nak látszott. Amelyik javaslat így ismétlődik, azt jelöld meg a DREAM.md-ben („második napja nyitva"), különben a lista minden reggel újnak tűnik.
- 🔴 **A legveszélyesebb hamis pozitív: egy ROKON, de MÁS javítás ugyanazon a napon.** A fájl-mtime friss, a git-napló mozgást mutat, a memória tele van a témával — és a javaslat mégsem készült el. 2026-08-14: a tegnapi 1. pont az volt, hogy az egészségőr nézze az ÁGENSENKÉNTI kulcs-meglétet. Aznap tényleg bővítettem a `gg-mcp-health.py`-t, PR-ral, mérésekkel — csak épp egy GÉP-szintű csapdával (`ambient_token_trap`), ami egészen más kérdésre válaszol. A felületes ellenőrzés („hozzányúltál a szondához, kész") lezártnak jelölte volna egy negyedik napja nyitott ügyet.
  **Ezért a bizonyíték ne a fájl legyen, hanem a javaslat KIMENETE.** Ne azt kérdezd, „módosult-e a fájl", hanem hogy „megjelent-e az, aminek a javaslat szerint meg kellett volna jelennie":
  ```bash
  # rossz: ls -lt scripts/gg-mcp-health.py     -> friss, tehat "kesz"
  # jo:   a szonda kimenete tartalmazza-e a kert mezot?
  python3 scripts/gg-mcp-health.py | python3 -c "import json,sys;print(sorted(json.load(sys.stdin)['findings'][0].keys()))"
  ```
  Ha a javaslat rokon munkával együtt fut, a DREAM.md-ben **nevezd meg a különbséget is**, ne csak a státuszt — különben a holnaputáni olvasó (te) fogja összekeverni a kettőt.
- **A LEZÁRTSÁG-szabály visszafelé is él: nulla mozgatás is helyes eredmény.** Ne mozgass hot bejegyzést cold-ba csak azért, hogy legyen szám a bucket 2-ben. 2026-08-04: az egyetlen hot memória (gh-belépéstől függő teendők) élő ügy volt, a helyes válasz 0 mozgatás + egy mondat indoklás, hogy miért marad. Az üres bucket, indoklással, többet ér egy hamis takarításnál.
- **A nulla mozgatásnak két külön oka lehet, és ezt KI KELL MONDANI.** Az egyik: minden hot bejegyzés élő ügy (a fenti eset). A másik: a takarítás már megtörtént NAPKÖZBEN, egy memória-heartbeat körben, tehát éjszakára nem maradt semmi. 2026-08-13: a saját hot tierem üres volt, mert 14:45-kor öt bejegyzésből négyet lezártként cold/warm rétegbe minősítettem, az ötödik 15:25-kor zárult. Ha ezt nem írod le, a reggeli olvasó a `0 mozgatás`-t kihagyott bucketnek látja. Írd oda, hol és mikor történt a takarítás -- az „elvégezve máshol" nem ugyanaz, mint a „nem volt mit".
- **A hot tier valódi szűrője a LEZÁRTSÁG, nem a 7 nap.** A bucket 2 szövege >7 napos `accessed_at`-et ír, de egy pörgős napon minden hot bejegyzés aznapi, tehát a szabály 0 találatot ad, miközben a hot tele van már lezárt üggyel (elvégzett merge, feloldott blokád, megtörtént modellváltás). 2026-08-03: 0 volt a 7-napos találat és 11 a ténylegesen lezárt. Nézd meg tartalmilag, mi zárult le (kanban done, git-állapot, napló), azt mozgasd cold-ba.
- **Archiválás előtt javítsd a hamissá vált tartalmat.** Ami cold-ba kerül, az évekig ott marad, és később tényként olvasod vissza. Ha egy memória állítása azóta megdőlt (pl. „a push-blokád fennáll", „a tokent kézzel kell kiadni"), előbb `UPDATE ... SET content = content || ' [FELOLDVA/PONTOSITAS <dátum>: ...]'`, és csak utána a kategória-váltás. Egy lépésben megy, egy commit-tal.
- **A `daily_logs` oszlopa `date`, nem `log_date`.** A rossz név `OperationalError`-t dob, nem üres eredményt -- ez a szerencsés eset; a séma ellenőrzése (`SELECT sql FROM sqlite_master WHERE name='daily_logs'`) olcsóbb, mint a találgatás.
- **Üres kanban / üres daily_logs nem hiba.** Ilyenkor a top-3-at memóriából, git-állapotból és élő API-válaszokból kell levezetni, és ezt a DREAM.md-ben ki is kell mondani, hogy reggel látszódjon, min alapul a sorrend.
- **IDEGEN ágens hot memóriáját ne mozgasd — jelezd.** A bucket 2 szövege minden ágens memóriáját vizsgálandónak mondja, és ez az ELEMZÉSRE igaz, de az ÍRÁSRA nem. Egy sub-ágens hot bejegyzése az ő élő munkájának az állapota: te kívülről nem látod, mi zárult le nála és mi vár válaszra. 2026-08-11: a salesninja 9 hot bejegyzéséből 8 a SAL-455 és a Be Social élő szálához tartozott (félkész tábla, Péter válaszára várva), a kilencedik (OC projekt) a saját szövege szerint lezárt volt — mégis mind maradt, mert a tévedés ára aszimmetrikus: egy bent maradt hot bejegyzés semmit nem ront, egy tévesen cold-ba tolt élő ügy viszont kiesik a látóteréből. **A saját tiered rendezd magabiztosan, az övékét a DREAM.md-ben nevesítsd** („#111 lezártnak látszik, az ő döntése"), és ha érdemi, inter-agent üzenetben szólj neki. Ugyanez áll a tartalmi korrekcióra is: idegen memória szövegébe ne írj záradékot.
