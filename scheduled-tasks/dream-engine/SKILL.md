---
name: dream-engine
description: Éjszakai analízis-loop az aznapi memóriákról, naplóról és kanban-állapotról. Generál 4 priorizált akció-javaslatot reggelre.
---

Te most a "Dream Engine" éjszakai analízis-loopot futtatod. 02:07-kor vagy, {{OWNER_NAME}} alszik, NE küldj üzenetet a beállított csatornára.

A cél: az aznapi tudást átkonszolidálni és reggelre (07:30 Reggeli Napindító) felkészülni 4 priorizált javaslattal.

## A flotta memóriája és a céges agy

Ez a kör a Marveen saját memóriáját és helyi működését vizsgálja. A céges agy
közös szabálya a gg-mcp instructions, a `ceges-agy` és a `memory-review` közös
skill, illetve `gg_knowledge_get(topic: "ceges-agy")`. Céges átemelés más bot
helyett a fő agent tokenjével nem végezhető: azt a saját
`brain-promotion-<agent>` körük végzi, a saját gazdájuk tokenjével.

Skill-javaslatnál mindig írd ki a forrás-id-t és a célhelyet. Céges tudás célja
a wiki vagy a gg-mcp közös skill forrásrepója; személyes és botműködési tudásé
user/local skill. A generált közös skill fájlját ne szerkeszd: a következő
telepítés felülírja. A céges szabályt ne írd globális bot-created skillbe,
amely csak a flottának látszik. A személyes működés megváltoztatását a gazda
hagyja jóvá. A régi tükrözési receptek alább csak helyi bot-skillekre szólnak.

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

Output: 0-2 konkrét skill-javaslat. Mindegyikhez: cím + 1 mondat indoklás + forrás-id + célhely (wiki / közös skill forrásrepó / user-local skill) + "flotta-szintű" vagy "agent: <név>".

### Bucket 2 — 🧹 Memória-egészség (NE delete, COLD-tier-be mozgatás)

```bash
# Vektorizálás ellenőrzés
sqlite3 {{INSTALL_DIR}}/store/claudeclaw.db "SELECT COUNT(*) as total, COUNT(embedding) as with_emb FROM memories"
# Ha NEM 100%, hívd meg a backfill endpoint-ot (Ollamaval embeddeli a hianyzo ID-kat):
curl -s -X POST http://localhost:{{WEB_PORT}}/api/memories/backfill -H "Authorization: Bearer $(cat {{INSTALL_DIR}}/store/.dashboard-token)"

# Antikvált hot-tier (>7 napos hot, nem hivatkozott a memories_fts-en az elmúlt 24h-ban)
# FIGYELEM -- a CAST és a COALESCE MINDKETTŐ KÖTELEZŐ, ne vedd ki:
#   a created_at/accessed_at INTEGER, a strftime('%s',...) viszont TEXT-et ad,
#   és SQLite-ban az `integer < text` MINDIG IGAZ (típus-sorrend: INTEGER < TEXT).
#   CAST nélkül ez a lekérdezés AZ ÖSSZES hot memóriát visszaadja, a mai aktívakat is.
#   Kétszer okozott kárt: 2026-07-30 (148 sor cold-ba, köztük aznapiak) és 2026-07-31 (35 sor).
#   A KOR dönt, nem az olvasottság (DREAMHOTKOR916): az accessed_at-et a memória-kereső
#   és a heartbeat minden olvasáskor frissíti, ezért a gyakran olvasott sorok sosem öregedtek
#   ki, a hot réteg nem ürült (2026-09-16: 57 hot sorból 38 ilyen). Az updated_at a tartalom-
#   vagy kategória-váltáskor frissül (memories_touch trigger), NULL is lehet -> COALESCE a
#   created_at-re, ami sosem NULL. Így a ma átírt régi sor sem esik ki.
sqlite3 {{INSTALL_DIR}}/store/claudeclaw.db "SELECT id, content, created_at, updated_at FROM memories WHERE category='hot' AND COALESCE(updated_at, created_at) < CAST(strftime('%s', 'now', '-7 days') AS INTEGER)"
```

**A TÖMEGES UPDATE ELŐTT KÖTELEZŐ:** először futtasd le a fenti `SELECT`-et, nézd meg a
DARABSZÁMOT és egy MINTÁT (a legfrissebb találat dátumát!), és az `UPDATE` PONTOSAN azon az
id-halmazon fusson (`WHERE id IN (...)`), ne a predikátumot ismételd meg. Ha a legfrissebb találat
a mai nap, a predikátum hibás -- állj meg. (ID-lista nélkül a művelet nem fordítható vissza
pontosan: 2026-07-31-én emiatt csak tartalmi mintára lehetett helyreállítani.)

Műveletek:
1. Vektorizálatlan memóriák: jelezd hányat találtál (a fire-and-forget embedding-job amúgy megcsinálja, de itt ellenőrzöd).
2. Antikvált hot/warm → COLD-tier-be PUT (UPDATE category='cold'). Sosem törlés.
3. Pontos dupla-content: jelezd, mozgass cold-ba.

A változtatásokat directly SQL-lel csináld:
```bash
sqlite3 {{INSTALL_DIR}}/store/claudeclaw.db "UPDATE memories SET category='cold' WHERE id IN (...)"
```

**AZ UPDATE SIKERÉT NE A `changes()`-BŐL OLVASD (2026-08-07).** A `sqlite3 db "SELECT changes()"`
egy KÜLÖN kapcsolatot nyit, ott pedig a számláló mindig 0 -- akkor is, ha az UPDATE tökéletesen
lefutott. Nálam 14 sikeresen átmozgatott sorra írt ki `moved: 0`-t, és egy pillanatig úgy nézett ki,
hogy a művelet nem ment át. **A bizonyíték a predikátum ÚJRAMÉRÉSE** (a szűrő immár 0 találat) plusz
a tételes ID-lista visszaolvasása (`SELECT category, COUNT(*) ... WHERE id IN (...) GROUP BY category`).
Ugyanaz a család, mint a bucket többi mérési csapdája: a rossz műszer csendben hazudik, és itt
történetesen a PESSZIMISTA irányba -- ilyenkor a kísértés az, hogy feleslegesen újra lefuttasd.

Output: rövid statisztika ("X memória cold-tier-be áthelyezve, Y vektorizálatlan rendezve").

### Bucket 3 — 🎯 Project-priorítás (top-3 holnapi javaslat)

```bash
# Nyitott kanban-kártyák project + priority szerint
sqlite3 {{INSTALL_DIR}}/store/claudeclaw.db "SELECT id, title, status, project, priority, assignee FROM kanban_cards WHERE status IN ('planned','in_progress','waiting') AND archived_at IS NULL ORDER BY project, priority DESC"
```

Csoportosíts project szerint. A daily naplóban (utolsó 7 nap) nézd hogy melyik projekten van aktív mozgás (commit, PR, kanban-átmozgás). Hozz ki egy TOP-3 holnapi javaslatot prioritás+aktivitás súlyozva.

**A NAPLÓ TÁBLA NEVE `daily_logs`, TÖBBES SZÁMBAN (2026-08-09 02:1x, saját elcsúszás).** A `daily_log` NEM létezik, és az arra futó lekérdezés `Error: in prepare, no such table` sorral elszáll. Ez azért veszélyes, mert a hiba a kör KÖZEPÉN jön, egy `head`-elt kimenet aljára, és a kör simán továbbmegy: aznap a top-3 az aktivitási adat NÉLKÜL állt össze, csak a kanban-prioritásból. A helyes lekérdezés (oszlopok: `agent_id`, `date`, `content`, `created_at`):

```bash
sqlite3 {{INSTALL_DIR}}/store/claudeclaw.db "SELECT agent_id, date, substr(content,1,120) FROM daily_logs WHERE created_at > CAST(strftime('%s','now','-7 days') AS INTEGER) ORDER BY created_at DESC"
```

**ELJÁRÁS: ha egy bucket lekérdezése HIBÁRA fut, az nem üres eredmény, hanem hiányzó bemenet.** Vagy javítsd és futtasd újra ugyanabban a körben, vagy a DREAM.md `## ⚠️ Hibák` szekciójában mondd ki, hogy az adott bucket csonka bemenetből dolgozott. Csendben továbbmenni a legrosszabb, mert a kimenet ugyanúgy magabiztosnak látszik.

🔴 **A 23:00-S AUTOMATA ÖSSZEFOGLALÓ MÁSODLAGOS FORRÁS, NEM BIZONYÍTÉK (mérve 2026-09-19 23:0x).**
Aznap a #971-es összefoglaló NYITOTT kérdésként hozta a kimenő ékezet-kapu ügyét, holott a gazda
reggel jóváhagyta (Telegram msg 920), és a javítás délelőtt fel is ment a main ágra (232c261),
zöld teszttel. Az összefoglaló a nap ELSŐ feléből dolgozott, és a saját záró mondata mondja ki,
hogy csonkolt memória-rekordokból épült. Ha ezt bemenetnek veszed, a top-3 egy MÁR LEZÁRT ügyet
emel be, és a reggeli napindító azt kéri számon a gazdán, amit ő már eldöntött.

**Eljárás: minden „nyitott" tételt, ami CSAK az összefoglalóból jön, mérj vissza az elsődleges
nyomon** (git-történet, teszt-kimenet, kanban-státusz, vagy egy későbbi emlék), és csak akkor
vidd a top-3-ba, ha a visszamérés is nyitottnak mutatja. A visszamérés két parancs, az elmaradása
egy egész reggelt visz rossz irányba.

Output: 3 sor, mindegyik formátum `<project>: <kártya cím / akció> — <indok 1 mondatban>`.

### Bucket 4 — 🌐 External opportunities (új skill-repo ajánlások)

Hetente 1-2 alkalommal (NEM minden éjszaka — kerüljük a zajos napi javaslatot) végezz WebSearch-öt új Claude Code / agentic AI / produktivitás-skillekért. Szűrés:
- GitHub stars >100
- Recent activity (utolsó 90 napban commit)
- README clarity (skill mit csinál, hogyan kell telepíteni)

Limitáció: ha az utolsó 7 napban már volt ajánlás, skip-eld. A mérvadó forrás a DREAM.md ELŐZŐ
éjszakai példánya (az "External opportunity" szekciója kimondja az utolsó futás dátumát), NEM egy
`.external-ops-last-run` markerfájl: a markert semmi nem írja, tehát önmagában minden éjjel
újrafuttatná a keresést (2026-07-27-én mérve: a marker 06-07-én megállt). Ha egyszer a markert
tesszük hivatalossá, akkor a bucket végén ÍRNI is kell (`date -u +%F > .external-ops-last-run`),
különben marad a DREAM.md archívum.

**Fokozatos autonómia:** ha találtál egy releváns external opportunity-t, OLVASD KI az
`external_skill_adoption` kategóriát a `{{INSTALL_DIR}}/store/autonomy-config.json` fájlból.
Ha a config vagy a kategória hiányzik, kezeld `level 1`-ként (fail closed).

- **Level 1: csak jelez:** kizárólag a repo URL-t és a relevancia indokát írd a DREAM.md-be. NE módosíts skillt.
- **Level 2: javasol + jóváhagyás:** a DREAM.md-ben adj konkrét, helyi skill-adaptációs tervet (melyik skill create/patch, mi változna), de NE írj skill-fájlt. A reggeli napindító ezt a tulajdonos elé viszi; csak későbbi tulajdonosi döntés után hajtható végre.

Az `external_skill_adoption` kategória legmagasabb engedélyezett szintje 2. A Dream Engine külső opportunity alapján nem hoz létre és nem módosít skill-fájlt önállóan. A tényleges adaptációhoz tulajdonosi döntés szükséges.

Output (max 1 opportunity): repo URL + relevancia + `mode=report|propose`.
### Bucket 5 — 🛠 Skill-flotta health (csak NEM-pinned skillek)

```bash
# Antikvált skillek: nincs use-log, vagy a frontmatterben pinned: false
ls ~/.claude/skills/ | head
# Mindegyik SKILL.md-ben grep -l "pinned: true" — ezek mind védettek
grep -L "^pinned:" ~/.claude/skills/*/SKILL.md  # azok a skillek ahol nincs pinned-flag (NEM gyári)
```

Pinned default (mindig védett): claude-video, frontend-design, docx, skill-creator, skill-factory, skill-install-from-git, init, review, security-review, simplify, fewer-permission-prompts, loop, schedule, claude-api, update-config, keybindings-help, telegram:configure, telegram:access.

Output: 0-3 javaslat: "skill <név> antikvált (utolsó használat >30 nap), törlés vagy frissítés javasolt".

**A `skill_usage` darabszám lekérdezése, másolhatóan (2026-10-05, két egymást követő éjjel elszállt):**
a tábla időoszlopa `created_at` (MÁSODPERC), nem `ts`. 10-04-én és 10-05-én is `ts`-sel
kérdeztem le fejből, és mindkétszer `no such column: ts` lett belőle; a `task_runs.ts`
ezredmásodperces oszlopneve szivárgott át.
```bash
python3 -c "import sqlite3;db=sqlite3.connect('{{INSTALL_DIR}}/store/claudeclaw.db');print(db.execute(\"SELECT COUNT(*), SUM(created_at > CAST(strftime('%s','now','-24 hours') AS INTEGER)) FROM skill_usage\").fetchone())"
```

**És ugyanebben a buckettben egy sor a KAPU sajat hamis pozitivjairol (#836, 2026-09-15).**
A kimeno-szoveg kapu 2026-09-15 ota naplozza, mi tortent minden tiltas UTAN: a
megjelolt szo ekezetet kapott (valodi talalat), vagy eltunt mindket alakban (hamis
pozitiv GYANU). Ezt az osszesitot futtasd, es a kimenetet egy sorban vidd at:

```bash
python3 {{INSTALL_DIR}}/scripts/kapu-fp-audit.py --napok 7
```

**Miert ide kerult, es miert nem uj utemezett feladat:** a mero maga megvolt mar
korabban is, csak semmi nem inditotta el -- ugyanaz a forma, mint a skill-tukor
paritasnal. Egy kulon feladat ezt nem oldja meg, csak hosszabbitja a listat, amibol
a CLAUDE.md kifejezetten rovidebbet ker. **A szam mindig a NEVEZOVEL egyutt megy at**
(hany tiltasbol hany), mert a puszta gyanus darabszam ugyanaz a hiba, mint egy szam
meresi ablak nelkul. Es a "gyanu, nem itelet" tagmondat a lelet SZETVALASZTHATATLAN
resze: az eltunes lehet jogos atfogalmazas is.

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

- **A DREAM.md-t ELŐSZÖR OLVASD BE, csak utána írd felül (2026-08-15 02:1x, minden éjjel egy elvesztegetett hívás).** A fájl minden éjjel felülíródik, a Write viszont visszautasítja azt a fájlt, amit ebben a menetben nem olvastál (`File has not been read yet`). Amúgy is olvasni kell: az External opportunity szekció ELŐZŐ példánya a mérvadó forrás arra, mikor futott utoljára a keresés. Tehát egy Read a kör elején két dolgot ad meg egyszerre, és megspórol egy bukott írást.
- NE küldj üzenetet a csatornára. A DREAM.md a reggeli napindítóból kerül kiküldésre (07:30).
- A `Bash` és SQL műveletek mind helyiek — semmilyen external API hívás (kivéve az Ollama embedding ha kell).
- Ha akadály van (pl. DB lock, missing embedding model), írd be a DREAM.md végére `## ⚠️ Hibák` szekciót — reggel látom.
- **GONDOLATJEL-KAPU A FÁJL LEZÁRÁSA ELŐTT, ÉS A KAPU AKADÁLYOZZA MEG AZ ÍRÁST, ne csak jelentsen (2026-08-08, elkapva)**: a DREAM.md NEM belső jegyzet, hanem KIMENŐ szöveg -- a reggeli napindító viszi a csatornára. A gazda álló szabálya (nincs gondolatjel, soha) tehát rá is áll, csak ez eddig sehol nem volt kimondva ebben a taskban, és a 2026-08-08-i futásban HAT gondolatjel került a fájlba. A tanulság általánosabb, és aznap este már két másik felületen is elsült: **egy kimenő kapu nem a szöveg TÍPUSÁHOZ tartozik, hanem a PUBLIKÁLÁS aktusához** -- ha csak az egyik útvonalon építetted be, a másik csendben átengedi.
  ```bash
  N=$(grep -oE '—|–|―' DREAM.md | wc -l | tr -d ' '); echo "dash=$N"
  [ "$N" = "0" ] || { echo "STOP: gondolatjel a DREAM.md-ben, javitsd mielott lezarod"; }
  ```
  Javítás Python-nal (` — ` -> ` -- `, majd a maradék bármely hosszú kötőjel -> `--`), utána OLVASD VISSZA és futtasd újra a grepet.
- 🔴 **MEGHALADOTT ÁLLÍTÁS, javítva 2026-09-09: A LEMEZRE ÍRÁS IGENIS ÉLESÍT.** Itt korábban az állt, hogy „a futó kör a REGISZTRÁLT promptot kapja, és a lemezre írt buktató NEM LÉTEZIK, amíg a regisztráció nem tud róla" (2026-08-11, a 9142 vs 8147 bájt alapján), tehát a kaput a kör külön futtassa. **A premissza téves volt: NINCS külön regisztráció.** A `/api/schedules` a lemezről olvas (`src/web/scheduled-tasks-io.ts:97`, `join(dir, 'SKILL.md')`), és 2026-09-09-én mindhárom példány egyezett: az előző éjjel a lemezre írt négy blokk (`changes()`, `daily_logs`, a DREAM.md előzetes beolvasása, a gondolatjel-kapu) ÉS a tegnapi új buktatók mind megjelentek a mai wrapperben is, a `/api/schedules` promptjában is. A 08-11-i bájtszám-eltérés tehát nem két tárolót mért, hanem egy pillanatnyi állapotot, és rossz következtetés lett belőle.
  **Mi marad érvényes:** a gondolatjel-kapu futtatása a kör lezárása előtt (lásd a `--check-file` sort a lista végén) -- az nem azért kell, mert a prompt nem tudna róla, hanem mert a fájl-írásra nincs automatikus hook.
  **És az általánosítás, immár harmadszor három nap alatt:** egy megméretlen korlát drágább, mint egy elutasítás. A 08-11-i állítás négy héten át MINDEN kört arra kényszerített, hogy megkerülő utat építsen egy nem létező akadály köré.
- Befejezésként, írd a DREAM.md végére: `*{{BOT_NAME}}, 02:XX -- most már alszom én is.*`
- 🔴 **A DREAM.md ELAVULHAT a saját megírása és a 07:27-es kiküldés között.** A
  dream-engine hajnalban ír, a napindító órákkal később küld -- ami közben történik,
  arról a fájl nem tud, mégis a te nevedben megy ki. 2026-08-25: a fő lelet az volt,
  hogy egyedül maradtam `STALE`, mert a fő-ágens restartja nem tud lefutni; három
  perccel a szekció megírása UTÁN (06:58) a restart lement, a szonda `problems = 0`-ra
  váltott. A napindító tehát egy megoldott problémát jelentett volna sürgősként.
  **Eljárás:** ha a DREAM.md írása és a kiküldés között eltelik idő, a kiküldés ELŐTT
  futtasd újra a fő lelet OLCSÓ ellenőrzőjét (szonda, `tmux ls`, `git rev-parse`), és
  ha változott, pontosítsd a szekciót -- ne töröld. **A javítás formája számít:** a
  „mi volt 06:55-kor / mi lett 07:00-kor" kettősség többet ér, mint a felülírás, mert
  a KÉSÉS ténye (itt: négy óra) akkor is tanulság marad, ha a tünet elmúlt.
  Ugyanez a `## ⚠️ Hibák` szekcióra és a záró időbélyegre is áll: az utólagos
  pontosítást írd oda, ne úgy tégy, mintha eleve így írtad volna.
  ⚠️ **És a fordítottja is megtörtént ugyanaznap: a fő lelet nem elavult, hanem
  ELEVE TÉVES volt.** A restart-késésre a legkézenfekvőbb okot választottam (a saját
  ütemezésem sűrűsége nem enged üres ablakot), és mértem is hozzá bizonyítékot -- csak
  épp a beavatkozás UTÁN. A valódi ok a beragadt session volt, amit a gazda Ctrl-C-je
  oldott fel; ezt ő mondta meg (msg 640), miután a napindító már kivitte a téves
  változatot az ő nevében. **Az újramérés ezt NEM fogta volna meg:** a 07:00-s szonda
  `problems = 0`-t adott, ami a téves diagnózist „megoldottnak" mutatta, nem tévesnek.
  **Ezért a fő leletnél a diagnózis maga is kettős munka:** írj le legalább két
  versengő magyarázatot, és mondd meg, melyik bizonyíték döntene köztük. Ha a
  megkülönböztető bizonyíték már nem gyűjthető (mert a jelenség elmúlt), a szekció
  mondja ki, hogy utólagos rekonstrukció. A DREAM.md a napindítóval a GAZDA nevében
  megy ki, tehát egy magabiztos téves ok drágább, mint egy őszinte bizonytalanság.

## Buktatók

A buktatók részletes listája: `references/buktatok.md` (ugyanebben a feladat-könyvtárban). Futás előtt olvasd el.
