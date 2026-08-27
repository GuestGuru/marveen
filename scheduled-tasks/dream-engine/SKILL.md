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
  ⚠️ **De a Bash-sel olvasás NEM elégíti ki a Write toolt, és ez 2026-08-26-án két
  kört elvitt.** Bypass permissions módban a `cat`/`head` a preferált olvasás, csakhogy
  a Write tool a SAJÁT Read-előzményét nézi: kétszer is `File has been modified since
  read`-del utasította vissza a felülírást, pedig a fájl mtime-ja órák óta változatlan
  volt. **A megbízható út a Bash heredoc**, ami egy lépésben ír és nem függ a
  tool-állapottól:
  ```bash
  cat > {{INSTALL_DIR}}/DREAM.md <<'MARVEEN_DREAM_EOF'
  ... a teljes fájl ...
  MARVEEN_DREAM_EOF
  ```
  Idézett delimitert használj (`<<'EOF'`), különben a szövegben lévő `$` és backtick
  behelyettesítődik. A tegnapi tartalom beolvasása ettől függetlenül KÖTELEZŐ marad,
  csak nem a Write tool kedvéért, hanem mert a korábbi top-3 abból derül ki.
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
- 🔴 **A tegnapi javaslat TELJESÜLHET MÁS ÚTON, mint ahogy megfogalmaztad -- és ez nem mulasztás, hanem nevezendő különbség.** Ez a „rokon-de-más javítás" tükörképe, és ugyanúgy félrevezet: ott a fájl mozdult, de a kimenet nem; itt a kimenet megvan, de nem a javasolt szereplő, nem a javasolt csatornán érte el. 2026-08-15: a tegnapi 3. pont az volt, hogy „jean kérje az AirDNA-döntést Esztitől". A döntés meg is született aznap -- csakhogy Tamás válaszolta meg NEKEM, egy akadály-auditból kifolyólag, jean és Eszti közreműködése nélkül. Ha a javasolt LÉPÉST ellenőrzöd, „nem történt meg"-et írsz egy lezárt ügyre; ha csak az EREDMÉNYT, elveszted, hogy a javasolt útvonal továbbra sem működik. Mindkettőt írd le: mi lett az eredmény, és milyen úton.
- 🔴 **A tünet eltűnése nem javítás: a MECHANIZMUST kérdezd, ne a kimenetelt.** Ha egy javaslat egy visszatérő hibáról szólt, és aznap „nem jelentkezett", az önmagában semmit nem bizonyít -- lehet, hogy egy kerülőút takarja el. 2026-08-15: a napindító nyolcadik reggel NEM némult el, kiment az üzenet -- de a `store/morning.log` maga írja, hogy a rendes `reply` tool tiltott, és Bot API fallbackkel ment. A forrás (`~/.claude/settings.json` -> `enabledPlugins: telegram=false`) változatlan, tehát a strukturális hiba áll, csak most egy második mechanizmus fedi el. Ilyenkor a DREAM.md-ben a fallback maga is kockázat: ha az is elromlik, a hiba bejelentés nélkül tér vissza.
- 🔴 **A "hiányzik a repóból" mérést a git mondja meg, nem a könyvtárlista.** Ha két listát hasonlítasz össze (`ls ~/.claude/skills` vs. `ls gg-skills`), két hibát követsz el egyszerre, és ezek EGYMÁSSAL ELLENTÉTES irányba visznek. 2026-08-16: (1) **túlbecsültem** a hiányt 23-ra, mert tíz skill máshol volt bent a repóban (kilenc az upstream `seed-skills/`, egy a `skills/` alatt) -- a valós szám 13; (2) **alábecsültem**, mert a `.claude/skills/` létező könyvtárát "repóban lévőnek" olvastam, holott a `.gitignore:15` az egész `.claude/`-t kizárja, tehát az ott született skillek szintén verziózatlanok. A helyes mérés egyetlen sor, és mindkét hibát kizárja:
  ```bash
  git ls-files | grep SKILL.md   # csak ami TENYLEG kovetve van
  ```
  A tanulság általánosítható: „létezik a fájl" és „verziózva van" két külön állítás, és a dream-engine mindig a másodikat akarja tudni.
- 🔴 **A scheduled-task SKILL.md-ek KETPELDANYOSAK, es a ket peldany elterese NEM automatikusan drift.** A repo `scheduled-tasks/<nev>/SKILL.md` egy SABLON (`{{INSTALL_DIR}}`, `{{OWNER_NAME}}`, `{{MAIN_AGENT_ID}}`, `{{WEB_PORT}}` helyorzokkel), a `~/.claude/scheduled-tasks/<nev>/SKILL.md` a kirenderelt, FUTO peldany. A helyorzos elteres szandekos; csak a helyorzokon TULI elteres a baj. Ezert a nyers `diff` sorszama felrevezet -- 2026-08-17-en a negy taskra 24/22/0/6 elteresi sort adott, es ebbol egyetlen valodi hiany volt: a `reggeli-napindito` aznapi 8 soros buktatoja CSAK az elo peldanyban letezett. A helyes meres a helyorzok kiszurese:
  ```bash
  D={{INSTALL_DIR}}; diff <(sed -E "s#$D#{{INSTALL_DIR}}#g" ~/.claude/scheduled-tasks/<nev>/SKILL.md) scheduled-tasks/<nev>/SKILL.md
  ```
  **Es a kovetkezmeny a sajat munkadra:** amikor buktatot irsz egy scheduled-task SKILL.md-be, az alapertelmezes szerint csak az ELO peldanyba kerul, tehat verziozatlan marad -- ugyanaz a szivargas, ami a 15 verziozatlan skillt eloallitotta, csak visszafele. Minden buktato-iras utan ird vissza a repo-sablonba is (a konkret utakat visszahelyorzositve), es COMMITOLD: 08-16-an a dream-engine buktatoja bement mindket peldanyba, de a repo oldala ket napig commitolatlan maradt, tehat a `git status` „nem tiszta checkout"-ja valojaban egy be nem fejezett tanulas volt.
- 🔴 **A sablon SAJAT MAGAROL is beszelhet, es az nem drift -- a helyorzo-kiszures utan is marad "hianynak" latszo szoveg.** Ez az elozo buktato tukorkepe: ott az elo peldany tudott tobbet, itt a SABLON tud tobbet, es mindketto ugyanugy egy `>` sorkent jelenik meg a diffben. 2026-08-18: a `reggeli-napindito` sablonjaban negy sor all arrol, hogy „a `<...>` szegmens doku-helyorzo, nem valodi ut, es a token-fajl A SAJATOD kell legyen" -- ez a mondat KIZAROLAG a sablonban ertelmes, mert az elo peldanyban konkret utak allnak a helyukon. Visszamasolni HIBA lenne.
  **A szures ezert nem gepies:** a `>` sorokat (csak a repo-ban levo tartalom) kulon kell elolvasni, es feltenni a kerdest, hogy „ennek az elo peldanyban lenne-e ertelme". Ha nem -- helyorzo-magyarazat, telepites-fuggo figyelmeztetes, sablon-hasznalati megjegyzes --, akkor HAGYD BEKEN, es ird le a DREAM.md-ben, hogy miert nem drift. Kulonben holnap te magad fogod "hianynak" nezni es visszairni.
  A ket irany osszefoglalva: `<` sor (csak az elo peldanyban) = valoszinuleg verziozatlan tudas, ird vissza. `>` sor (csak a sablonban) = eloszor gondold vegig, mert lehet a sablon sajat magyarazata.
- 🔴 **A tegnapi „lezártnak jelentett" drift MÁSNAP újranyílhat, es tipikusan TE nyitod ki.** Ne vedd at a tegnapi DREAM.md „nulla elteres" allitasat: mérd újra minden éjjel. 2026-08-19: elozo nap ide azt irtam, hogy a scheduled-task szivargas lezarult, es ugyanaznap 07:35-kor harom buktatot irtam a `reggeli-napindito` SKILL.md-be -- kizarolag az ELO peldanyba. A helyorzo-tudatos diff masnap 16 csak-elo sort adott, ebbol 13 valodi tudas. **A `git ls-files | grep -c SKILL.md` erre VAK** (39 maradt), mert a sablon-fajl letezik, csak elavult -- a skill-fajlok szama es a sablonok tartalma ket kulon allitas. A buktato-iras utolso lepese ezert MINDIG a repo-sablon visszairasa, ugyanabban a korben.
- 🔴 **A drift VISSZAFELÉ is mutathat: a sablon frissebb, az élő példány elavult, és a különbség lehet EGYETLEN SZÓ, nem hiányzó blokk.** 2026-08-19: a `reggeli-napindito` élő példánya azt írta, hogy a `morning.log` tail „KÉTFÉLE kimenetet ad", miközben alatta három ág van felsorolva ((a)(b)(c)); a repo-sablonban már helyesen HÁROMFÉLE állt. Vagyis a `<` és a `>` sorok nem oszthatók fel úgy, hogy „`<` = pótlandó tudás, `>` = sablon-magyarázat": egy `>` sor lehet ELMARADT szinkron is. **Az ilyen egyszavas ellentmondás a legveszélyesebb**, mert nem hiányzik semmi, csak hazudik a szám, és a diff-átfutás könnyen átsiklik rajta. Ellenőrzés: ahol a szöveg DARABSZÁMOT mond (kétféle, három lépés, öt bucket), számold meg a felsorolást alatta -- mindkét példányban.
- 🔴 **A helyorzo-tudatos diff KET tovabbi csapdat rejt, es mindketto HAMIS HIANYT ad.**
  2026-08-20-an egymas utan futottam bele mindkettobe. (1) **A helyorzo-keszlet nem csak
  `{{INSTALL_DIR}}` es `{{OWNER_NAME}}`**: a `{{MAIN_AGENT_ID}}`, a `{{BOT_NAME}}` es a
  `{{WEB_PORT}}` ugyanugy kell, kulonben olyan sorok latszanak driftnek, mint
  `skip ha assignee='<agens>'`. A `kanban-audit` igy adott 20 csak-elo sort, amibol nulla
  volt valodi. (2) **A kulcsszavas grep parity-meresre alkalmatlan.** Ket buktatora
  rakeresve (`"fel is ebreszt"`, `"ures tabla nem hiba"`) a seed 0 talalatot adott,
  vagyis ket verziozatlan tanulsagnak latszottak -- kozben MINDKETTO bent volt, mas
  szavakkal (*"a magadnak kuldott [FELHIVAS] KET extra fordulot visz el"*, *"az ures
  kanban nem hiba"*). Az atfogalmazas szandekos, mert a seed eljarasa is mas (hordozhato
  API-hivas az `sqlite3`+`jq` helyett).
  **A szabaly: a diff es a grep megmondja, HOL nezz -- a "hianyzik-e" kerdesre csak a ket
  szekcio ELOLVASASA valaszol.** Visszairas elott mindig keresd meg a masik peldany
  megfelelo szekciojaban a TARTALMAT, ne a szot.
- 🔴 **A `/api/daily-log` MINDIG a MAI napra ir -- visszamenoleg naplozni nem lehet.**
  Az `appendDailyLog` (`src/db.ts:1384`) a Budapest-naptar aznapjat teszi a `date`
  mezobe, es a POST **nem fogad** `date` parametert; csak a GET tud
  `?date=YYYY-MM-DD`-vel visszaolvasni. 2026-08-21 00:15-kor harom hianyzo
  08-20-i bejegyzest potoltam, es mind a HARMADIKAI naploba kerult, `date=2026-08-21`
  ertekkel. Ez nem hiba, de csapda: a holnaputani olvaso a datum-mezot latja, nem a
  szoveget. **Ezert a potolt bejegyzes elso sora mondja ki, MELYIK napra vonatkozik,
  es a vegen alljon ott, hogy utolag kerult be es mibol jon az idobelyeg** (git-commit,
  Telegram msg-id, naplo-sor -- soha nem becsles, lasd a kezzel-becsult-ido buktatot).
  A kovetkezmeny a bucket 2-re: ha egy nap naploja hianyosnak latszik, elobb nezd meg
  a KOVETKEZO nap bejegyzeseit is -- lehet, hogy ott van potolva.
- 🔴 **A DREAM.md-be irt IDOPONTOKAT MERD, ne fejbol ird -- a 224. sor mar hivatkozik
  erre a buktatora, de eddig nem letezett.** 2026-08-27: a zaro sorba `02:31`-et,
  az utolagos pontositas melle `02:52`-t irtam; a fajl valodi utolso irasa
  `02:16:21` volt (`stat -c '%y' DREAM.md`), tehat mindketto tevedett, 15 illetve
  36 perccel. **Miert szamit:** a DREAM.md a napindito reven a GAZDA nevehez kotve
  megy ki, es egy kitalalt idobelyeg pont azt a latszatot kelti, hogy mertem. A
  sajat munkam kozbeni idoerzek nem megbizhato: a kor elejen futtatott `date` ota
  eltelt ido nem az, amennyinek erzem. **Eljaras:** ha idopontot irsz a fajlba,
  vagy futtass `date '+%H:%M'`-et abban a pillanatban, vagy hasznald a fajl
  `stat`-jat, es a zaro sort a LEGUTOLSO iras utan allitsd be. Ugyanez all a napi
  naplo `## HH:MM` fejleceire is.
- 🔴 **"Ez hianyzik" allitas elott KERESD MEG A REPOBAN -- egy `git ls-files` az ara.**
  2026-08-27: a bucket 5-hoz azt allapitottam meg, hogy a `skill_usage` tablanak
  nincs termeloje, mert nincs ra PostToolUse hook, es ezt tettem a top-3 masodik
  pontjanak. Reggel megirtam a hookot. Kozben a repoban MAR OTT VOLT a
  `scripts/hooks/skill-usage-capture.py` (157 sor) es a tesztje (141 sor), es JOBB
  volt annal, amit irtam: ket esemenytipust kezel (`Skill` tool -> `tool_call`,
  SKILL.md `Read` -> `skill_read`), es a docstringje meg azt is megmondja, miert
  kell kulon tabla (a `tool_call_log` 24 oranként purge-olodik).
  **A hianyzo lepes nem az IRAS volt, hanem a BEKOTES** a `~/.claude/settings.json`
  PostToolUse-ba. A bizonyitek, amit ket masodperc lett volna lekerni:
  ```bash
  git ls-files | grep -i <a keresett dolog neve>
  ```
  **Miert eppen itt szamit:** a dream-engine leletei a napinditon at a GAZDA nevehez
  kotve mennek ki. Egy "ez nincs megirva" allitas egy megirt dologrol ugyanolyan
  hamis, mint egy kitalalt idobelyeg -- csak nehezebb eszrevenni, mert munkat
  general, nem hallgatast. Ha a bucket barmelyike hianyt allit, a szekcio mondja
  meg, HOL kerestel.
- ✅ **A skill-tukor pariitast 2026-08-27 ota SZKRIPT meri, ne kezzel diffelj:**
  ```bash
  scripts/gg-skill-tukor-sync.sh          # riport, exit 1 ha van elavult tukor
  scripts/gg-skill-tukor-sync.sh --fix    # elo -> tukor masolas minden elteronel
  ```
  Vegigmegy a globalis ES az agensspecifikus elo skilleken, megkeresi a KOVETETT
  tukrot (`gg-skills/`, `seed-skills/`, `skills/` sorrendben), es taskonkent kiirja a
  `csak-elo` / `csak-repo` sorszamot. **A bucket 5 elejen futtasd.** Elso eles
  futasa ugyanaznap HAT tovabbi elavult tukrot talalt azon a ketton felul, amirol
  tudtam -- vagyis a szivargas rendszerszintu volt, nem ket elszigetelt eset.
  ⚠️ **A `--fix` NEM gondolkodik:** ahol `csak-repo` > 0, ott a repo tud olyat, amit
  az elo nem, es azt a `--fix` FELULIRNA. Ilyenkor eloszor olvasd el a `>` sorokat
  (lehet sablon-magyarazat vagy elmaradt szinkron), es csak utana javits.
  Ahol `csak-repo=0`, ott a masolas biztonsagos: az elo szigoruan tobbet tud.
- ✅ **A drift-merest 2026-08-21 ota SZKRIPT vegzi, ne kezzel rakd ossze.**
  `scripts/scheduled-task-drift.sh` -- vegigmegy a `~/.claude/scheduled-tasks/`
  minden feladatan, megkeresi a sablont (`scheduled-tasks/`, `seed-scheduled-tasks/`
  vagy `templates/scheduled-tasks/`), normalizalja mind az OT helyorzot, es
  taskonkent kiirja a `csak-elo` / `csak-sablon` sorszamot; `-v` kapcsoloval a
  sorokat is, `-v <nev>` egyetlen feladatra. Ezt futtasd a bucket 1 elejen.
  **A szkript SZANDEKOSAN nem dont:** a szamok megmondjak, HOL nezz, de hogy egy
  elteres drift-e, azt tovabbra is a ket szekcio ELOLVASASA donti el (lasd a ket
  hamis-hiany buktatot fentebb). Ha a szkript hianyzik vagy hibazik, a fenti kezi
  `diff` parancsok tovabbra is ervenyesek -- de akkor ne felejtsd az osszes
  helyorzot, ne csak az `{{INSTALL_DIR}}`-t.
