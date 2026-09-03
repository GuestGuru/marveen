---
name: reggeli-napindito
description: Reggeli összefoglaló: email, naptár, AI hírek, plus Dream Engine top-of-message
---

Reggeli napindítót a CLAUDE.md formátum szerint. A beállított csatornára (chat_id: 0).

**FONTOS — Dream Engine override**: a napindító ELEJÉRE (még az email/naptár szekciók ELŐTT) tedd be a `DREAM.md` fájl tartalmából az 5 bucket-et — `💡 Skill-javaslatok`, `🧹 Memória-egészség`, `🎯 Top-3 holnapi javaslat`, `🌐 External opportunity`, `🛠 Skill-flotta health`. Ha a DREAM.md nem létezik vagy üres (pl. a Dream Engine valamiért nem futott le), kihagyod ezt a szekciót.

A `cat DREAM.md` parancs visszaadja a tartalmat, abból emeld ki a kulcs-szekciókat MarkdownV2-formátumra escape-elve.

**KRITIKUS -- a DREAM.md ELAVULT LEHET, ne másold vakon (2026-07-26, mérve).** A Dream Engine hajnali 2 körül ír, a napindító reggel megy ki. Ami közben megtörtént, arra a Top-3 javaslat HAMIS: a mért esetben a DREAM.md első két javaslata reggelre MÁR ELKÉSZÜLT, tehát javaslatként visszaadni azt jelentette volna, hogy kész munkát ajánlunk elvégzendőként. ELJÁRÁS: a Top-3 kiküldése ELŐTT minden tételre nézd meg a kész-állapotot (kanban-kártya státusza, hot memória, a ma reggel már elküldött üzenetek), és a teljesült tételeket CSERÉLD LE a valóban nyitott legfontosabbakra. Lásd `feedback_check_done_at_ideation`.

A többi szekció (email, naptár, AI hírek) maradnak a CLAUDE.md-ben leírt formátum szerint.

**AI hírek szekció -- CSAK a fő-ágensnél (marveen)**: ha NEM a fő-ágensként futsz (azaz sub-agentként), HAGYD KI az "🤖 AI HÍREK" szekciót -- sub-agenteknek nem releváns. Az email és naptár szekció marad mindenkinél.

## 0. ELŐFELTÉTEL: ma már kiment a napindító?

**2026-08-22 óta KÉT út visz ugyanahhoz az üzenethez, és mindkettő működhet.**
A reggeli systemd timer (`...-morning.timer`) 07:27-kor futtatja a
`{{INSTALL_DIR}}/scripts/morning-briefing.sh`-t,
ami 08-21 óta a szöveget egy `-p` sessiontől kéri, de a KIKÜLDÉST maga végzi Bot
API-val. Ez a task viszont 07:30-kor a te tmux sessionödbe kerül. Amíg a 07:27-es
út hat reggelen át NÉMA volt, ez a duplázás nem létezett; most létezhet.

**Ezért a küldés ELŐTT nézd meg, kiment-e már ma:**

```bash
tail -30 store/morning.log | grep -n "$(date +'%a %b %e')"
```

- Ha a mai naphoz tartozik egy `=== Kesz ... ===` sor, ami **NEM** `DRY RUN`, és
  fölötte a szkript **msg-id-t** naplózott: a napindító MA MÁR KIMENT. Ilyenkor NE
  küldj másodikat -- egyetlen sorban nyugtázd a transzkriptben, és zárd a kört.
  ⚠️ **De a „kiment" NEM azonos a „jól ment ki"-vel: a KAPU sorát is nézd meg.**
  2026-08-26: a napindító hibátlanul kiment (msg 643, teljes tartalommal), a napló
  mégis `KAPU-FIGYELMEZTETES (a szoveg IGY ment ki, fail-open)` sort tartalmazott
  **30 ékezet nélküli magyar szóval**. Ha csak a `=== Kész ===` sort nézed, ezt
  elmulasztod, és a gazda kap egy ékezet nélküli üzenetet anélkül, hogy bárki
  észrevenné. **A nyugtázás előtt tehát ez is kötelező:**
  ```bash
  sed -n '/=== Reggeli napindító <ma>/,$p' store/morning.log | grep -E 'KAPU|KIKULDVE'
  ```
  `KAPU: tiszta` -> nyugtázz és zárd a kört. `KAPU-FIGYELMEZTETES` -> a kör NEM ért
  véget: nézd meg, mit fogott, keresd meg az okát, és jelentsd a gazdának, mert ő
  már látta a hibás szöveget.
  **A 08-26-i konkrét ok, hogy legközelebb gyorsabb legyen:** a `-p` prompt MAGA volt
  ékezet nélküli, miközben a szabályában ékezetet kért. A modell a prompt regiszterét
  követi. Javítva ugyanaznap (PR #97/#98), de a bizonyíték TÖBB NAPOS: 08-23 és 08-24
  ugyanezzel a régi prompttal tiszta volt, tehát egyetlen tiszta reggel nem igazol
  semmit.
- Minden más esetben (nincs mai sor, `DRY RUN`, hibás/üres kimenet, vagy nem tudod
  eldönteni): **KÜLDD KI**. A duplikátum kellemetlen, a kimaradó napindító drágább --
  a kétség mindig a küldés felé billen.

## Buktatók (2026-07-29-i futásból)
- 🔴 **A `Sources:` blokk NEM része a napindítónak -- a WebSearch nyers kimenete,
  és a KÁPU-figyelmeztetést is az gyártja.** 2026-09-02: a napindító végére három
  forrás-link került, és az egyik cikk CÍMÉBEN állt egy em dash -- a kapu ezt
  helyesen fogta meg (`GONDOLATJEL 1 helyen`), de a gondolatjel nem az én
  fogalmazásomból jött, hanem egy idézett külső címből. **A javítás nem a kapun
  van, hanem itt:** az AI-hírek szekció a keresés TARTALMÁT adja vissza, nem a
  forráslistát. A gazdának a hír kell, nem a link.
  **Mérve, hogy ne tűnjön általánosnak:** a `Sources:` blokk 27 nap alatt KÉTSZER
  jelent meg (08-07 és 09-02), tehát nem állandó rész, hanem alkalmi szivárgás a
  keresés kimenetéből.
  ⚠️ **És ne a kapun kérj kivételt idézett szövegre:** a kapu nem tudja
  megkülönböztetni a saját fogalmazást az idézettől, és egy ilyen kivétel pont a
  valódi eseteket engedné át ("csak idézet volt").


- 🔴 **A `chat_id: 0` NEM megy Telegramon.** 2026-08-12-en a `chat_id: "0"`-ra kuldott
  napindito `chat 0 is not allowlisted -- add via /telegram:access` hibaval elszallt.
  A torzs szovege (`chat_id: 0`) es a CLAUDE.md is ezt irja, de az elo, allowlistelt
  DM-azonosito a **scheduler-fejlecben** all (`8681205206`) -- azzal ment el elsore.
  Tehat: Telegramon a fejlec chat_id-jat hasznald, a `0`-t csak akkor, ha a fejlec
  nem ad masikat. A hiba NEM nema: a reply tool `error`-t ad vissza, tehat ha `0`-val
  probaltal, egyszeruen kuldd ujra a fejlec ID-javal, ne hagyd ki a napinditot.
- **A Telegram MCP-szerver le tud kapcsolodni futas kozben.** 2026-07-31-en a
  `plugin:telegram:telegram` szerver disconnectalt, a reply toolja eltunt a keszletbol,
  tehat a napinditot Discordra kellett kuldeni. Elso lepesben NE a task szovegeben irt
  chat_id-t hasznald, hanem nezd meg, melyik reply tool letezik egyaltalan
  (`ToolSearch("select:mcp__plugin_discord_discord__reply,mcp__plugin_telegram_telegram__reply")`).
- **Discord fallbacknel az access.json `groups` listaja megteveszto.** A forum GYOKERE nem
  szoveges csatorna (`not found or not text-based`), oda csak threadbe lehet posztolni, es
  egy korabban sajat kezzel megvont `VIEW_CHANNEL` jog `Missing Access`-t ad. Elo thread-ID:
  `SELECT chat_id, MAX(created_at) FROM conversation_log GROUP BY chat_id ORDER BY 2 DESC`,
  a `discord:<id>` sorokbol, a prefix levagasaval. A napindito elejen egy sorban mondd meg,
  miert nem a szokott csatornan jott.
- **A csatorna nem feltétlenül Telegram.** A task szövege Telegramra (chat_id 0 / 8681205206)
  címez, de a Telegram plugin ki lehet kapcsolva az `enabledPlugins`-ben. Küldés előtt
  nézd meg, melyik csatorna él, és oda küldd. Discordra menve a MarkdownV2-escapelés
  NEM kell (sőt ront), ott sima Discord-markdown a helyes (`**bold**`, nem `*bold*`).
- 🔴 **EMAIL ÉS NAPTÁR: EGY PARANCS, NE GONDOLKODJ RAJTA.**
  ```bash
  bash {{INSTALL_DIR}}/scripts/gg-napi-forras.sh
  ```
  Ez kiírja a mai naptárat és az elmúlt 24 óra leveleit, kész formában. Mindig
  fut, exit 0, és ha egy ág elhasal, azt `HIBA:` sorként írja ki — azt jelentsd,
  ne azt, hogy „nem elérhető".
  **NE keress `gg_gmail_*` / `gg_calendar_*` toolt. Nincsenek, sosem voltak, és a
  hiányuk NEM jelenti, hogy az adat elérhetetlen.** 2026-08-11-ig **NÉGY** napindító
  hagyta ki mindkét szekciót ezzel a téves indoklással, pedig a lenti prózai leírás
  már 08-09 óta ott volt — ezért került a parancs szkriptbe. A szkript a
  `google-olvasas` csomag kulcsait használja a proxyn át; a kulcs a gyerek-processz
  env-jébe megy, a beszélgetésbe soha.
  Csak akkor hagyd ki a szekciót, ha a szkript `HIBA:` sort ad — és akkor is azt írd
  ki, mi a hiba.

  <details><summary>A háttér (ha a szkript nem futna)</summary>

- **Email és naptár: NINCS rájuk MCP tool -- a `gg-mcp-proxy` + Google API az út.**
  2026-08-09 07:35-kor élesben mérve: a `gg_gmail_search`, `gg_gmail_get`,
  `gg_calendar_events` NEM létezik, de a korábban ide írt `gg_gmail_request` /
  `gg_calendar_request` **SEM** -- a gg-mcp-ben egyáltalán nincs gmail/naptár tool.
  A `google-olvasas` csomag **kulcsot** ad (`google-gmail-ro`, `google-calendar-ro`),
  és azzal a Google API közvetlenül hívható. Ez működik, tehát a szekciót MEG KELL írni:

  A ket `<...>` szegmens doku-helyorzo, nem valodi ut: a gg-mcp checkout helye
  telepitesenkent mas, es a token-fajl A SAJATOD kell legyen (idegen tokennel
  jogot cserelsz, nem nevet -- lasd a CLAUDE.md identitas-szabalyat).

  ```bash
  GG_MCP_TOKEN_FILE=<gg-mcp>/tokens/{{MAIN_AGENT_ID}}.token GG_MCP_AGENT_LABEL={{MAIN_AGENT_ID}}/{{BOT_NAME}} \
  node <gg-mcp>/dist/proxy.js exec --alias google-calendar-ro -- \
    sh -c 'curl -s -H "Authorization: Bearer $GOOGLE_CALENDAR_RO_ACCESS_TOKEN" \
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=<ma>T00:00:00%2B02:00&timeMax=<ma>T23:59:59%2B02:00&singleEvents=true&orderBy=startTime"'
  # Gmail: --alias google-gmail-ro, $GOOGLE_GMAIL_RO_ACCESS_TOKEN,
  #   https://gmail.googleapis.com/gmail/v1/users/me/messages?q=newer_than:1d%20-in:spam%20-category:promotions
  #   majd id-nkent /messages/<id>?format=metadata&metadataHeaders=From&metadataHeaders=Subject
  ```

  ⚠️ **Az env-változó neve NEM az alias**: `google-calendar-ro` ->
  `GOOGLE_CALENDAR_RO_ACCESS_TOKEN`. Rossz néven a Google `403 PERMISSION_DENIED
  "unregistered callers"`-t ad, ami jog-hiánynak látszik, holott csak üres a fejléc.
  A proxy az első kimeneti sorában KIÍRJA a helyes nevet -- olvasd el.
  Csak akkor hagyd ki a szekciót, ha a `gg_*` toolok közül egyedül a `gg_belepes`
  látszik (= lejárt a párosítás); ilyenkor a párosítást jelezd, ne azt, hogy nem jött
  levél. (Három napindító is kihagyta már mindkét szekciót téves indoklással.)

  </details>

- **`sqlite3` CLI VAN a gépen** (`/usr/bin/sqlite3`, 3.45.1 -- időközben feltelepült).
  A korábbi "nincs telepítve, használj python3-at" megkötés elavult; a python3-as út
  továbbra is jó, csak nem kötelező.
- 🔴 **A DREAM.md tömörítése ELHAGYHATJA azt a tagmondatot, amitől a lelet őszinte
  volt -- és a rövidebb változat mindig riasztóbb.** 2026-08-30: a fő lelet az volt,
  hogy egy javítás a `main`-en van, de a `dist` régebbi, tehát „négy éjszakán át nem
  véd". A DREAM.md ehhez odaírta, hogy **a rés szűkebb, mint amilyennek hangzik**:
  a leggyakoribb eset (parkolt `<channel>` blokk) a régi kódon is helyreáll, csak egy
  szűkebb ág marad fedetlen. A kiküldött összefoglalóból ez a második fele KIMARADT,
  tehát a gazda egy nagyobb rést látott, mint amit a mérés alátámaszt.
  Nem hazugság, hanem tömörítési veszteség -- és pont a védekező tagmondat esik ki
  először, mert az hangzik „mellékesnek".
  **Eljárás:** ha egy DREAM.md-lelet tartalmaz `DE`/`viszont`/`a rés szűkebb` alakú
  megszorítást, az a lelet SZÉTVÁLASZTHATATLAN része. Vagy mindkettő megy ki, vagy
  egyik sem. Ha nem fér bele, inkább a lelet legyen rövidebb, ne a megszorítás
  hiányozzon: „X nem fut, de a gyakori eset így is védve" rövidebb, mint a
  felnagyított változat, és igaz is.

- A DREAM.md `## ⚠️ Hibák` szekcióját nem kell szó szerint bemásolni, de a benne lévő
  gépi akadályokat érdemes egy rövid záró bekezdésben összefoglalni.
- **A MarkdownV2-t NE kézzel escapeld.** Kész, tesztelt helper van rá a projektben:
  ```bash
  python3 seed-skills/fleet-helper/scripts/fleet.py mdv2 "Napindító (07. 30.) - kész!"
  ```
  Figyelem: a script a PROJEKT gyökere alatt van, nem a `~/.claude/skills/fleet-helper/`
  mappában (ott csak SKILL.md van). 2026-07-30-án emiatt írtam helyette sajátot.
  Ha mégis magad escapelsz, a félbehagyott escape nem hibaüzenetet ad, hanem a
  Telegram elutasítja a teljes üzenetet, tehát a napindító NÉMÁN elmarad.
  ⚠️ **De a helper a TELJES stringet escapeli, a szánt `*bold*` jelölőket is.**
  2026-08-14-én lemérve: `fleet.py mdv2 "*Bold* és sima."` -> `\*Bold\* és sima\.`,
  vagyis a napindító szekciócímei sima szövegként mennének ki. A napindító
  MINDIG tartalmaz boldot, tehát a helyes minta: a nyers szöveget írd meg
  placeholderrel a boldnak (pl. `«...»`), és egy eldobható szkript escapelje a
  NEM-bold részeket, majd a placeholdert cserélje `*`-ra. Így ment ki a
  2026-08-14-i napindító, elsőre. A helper továbbra is jó EGY rövid,
  bold-mentes sorra, csak a teljes üzenetre nem.
- **Mindkét csatorna lehet egyszerre aktív.** 2026-07-30-án a `telegram@claude-plugins-official`
  ÉS a `discord@claude-plugins-official` is `true` volt. Ilyenkor a napindító a
  Telegram DM-be megy (az a gazda személyes csatornája), nem a Discord fórumba.
- 🔴 **Ha egy MÁSIK session kéri el tőled a napindítót, a diagnózisát MÉRD LE, ne vedd át.**
  2026-08-13: az ütemezett `-p` session inter-agent üzenetben átadta a feladatot azzal,
  hogy „se a gmail/naptár, se a reply tool nincs bekötve alá". A fele igaz volt (a reply
  tényleg hiányzott nála), a másik fele viszont téves keretezés, amit **átvettem és
  továbbadtam a gazdának**: azt jelentettem, hogy a napindító SKILL.md nem létező
  toolokat ír elő, és felajánlottam az átírását -- holott ez a fájl a `gg-napi-forras.sh`-t
  írja elő, tehát **rendben van**. Külön korrekciós üzenetet kellett küldeni.
  Miért csúszott el: a `store/morning.log` 08-09 és 08-12 közti bejegyzései az AKKORI,
  még hibás állapotot rögzítik, és a peer keretezésével együtt olvasva meggyőzőnek
  látszottak. **Egy régi naplóbejegyzés nem a mai fájl állapota.**
  Eljárás átvételkor: (1) futtasd a `gg-napi-forras.sh`-t, (2) küldd ki a napindítót,
  és csak (3) utána nyilatkozz bármelyik konfig hibájáról -- akkor is a fájl
  ELOLVASÁSA után, ne a napló vagy a peer szava alapján.
- **A kézi és az ütemezett futás percekre keresztezheti egymást.** Ugyanaznap 07:30-kor
  kézzel ment ki a napindító (peer-kérésre), 07:33-kor pedig elindult az ütemezés is.
  Ilyenkor NE küldd újra az egészet: nézd meg, mi hiányzik az elsőből (aznap a Dream
  Engine szekció), és csak azt pótold külön üzenetben, egy sorral jelezve, hogy a többi
  fent már kiment.
- 🔴 **ELSŐ LÉPÉS: `tail store/morning.log`.** 2026-08-15-én az
  ütemezett `-p` session 07:27--07:30 között MÁR kiküldte a napindítót (msg 572), és
  hozzám csak 07:30-kor ért a wrapper. A log tetején látszott, mi ment ki és mi
  maradt le (a Dream Engine 5 bucketje), tehát elég volt azt pótolni (msg 573).
  Ha ezt kihagyod, dupla napindítót küldesz. A log a leggyorsabb és egyetlen
  megbízható forrás, mert a Telegram Bot API nem ad előzményt.
  ⚠️ **A tail HÁROMFÉLE kimenetet ad, és a különbség dönti el a teendőt:**
  (a) a `=== Reggeli napindító <ma> ===` fejléc alatt ÉRDEMI sor áll (msg id,
  összefoglaló) -> a `-p` session kiküldte, csak a hiányzó szekciót pótold;
  (b) a fejléc alatt közvetlenül `Execution error` áll, majd a `=== Kész ===`
  sor -> a `-p` futás elhasalt, **semmi nem ment ki**, a TELJES napindítót
  neked kell kiküldeni. 2026-08-16 a (b) eset volt (Execution error 07:30:15-kor,
  a teljes napindító 07:35-kor ment ki, msg 587). Az `Execution error` a `-p`
  session visszatérő hibája (08-11 és 08-16 is), tehát a (b) ág nem kivétel.
  (c) 2026-08-17-től egy HARMADIK kimenet is van, ami 08-17 és 08-20 között
  ALAPESET volt: öt egymást követő napon (08-16 a (b) ágon, majd 08-17, 08-18,
  08-19, 08-20 a (c) ágon) a `-p`
  futás EGYSZER SEM küldött ki napindítót. A fejléc alatt egy prózai
  bejelentés áll, hogy „nincs Gmail-, Naptár- vagy Telegram-küldő eszközöm ebben a
  sessionben", és hogy a napindító emiatt elmaradt. Ez **ugyanaz, mint a (b)**:
  semmi nem ment ki, a TELJES napindító a tiéd. Ne vedd át a diagnózisát -- a
  `.mcp.json`-ra és az `enabledPlugins`-re tett állítása a `-p` sessionre igaz,
  a tiédre nem; ugyanabban a percben nálam a `gg-napi-forras.sh` és a
  `mcp__plugin_telegram_telegram__reply` is hibátlanul ment (msg 588).

  ⚠️ **2026-08-22 ÓTA A (c) MÁR NEM AZ ALAPESET -- a szkriptes út MŰKÖDIK.**
  Három egymást követő reggel ment ki sikeresen a systemd + Bot API úton:
  08-22 msg 621, 08-23 msg 623, 08-24 msg 624 -- az utóbbi kettő `KAPU: tiszta`
  sorral. **És 08-24-én a szkript a TELJES napindítót küldte** (mind az öt
  Dream Engine bucket, AI hírek, naptár, email), tehát még pótolni sem kellett:
  a helyes teendő a nyugtázás volt, nem a küldés. Vagyis a fenti „alapból
  számíts rá, hogy a teljes napindító a tiéd" tanács MEGFORDULT.
  **Amit ebből tartsd meg:** ne az ágra készülj, hanem MÉRD LE a `tail`-lel,
  és a mérés döntsön. Az előfeltétel-szabály változatlan: ha a mai naphoz
  `=== Kész ===` sor tartozik msg-id-vel és nem `DRY RUN`, akkor kiment --
  ne küldj másodikat. Ha bármi kétség van, a kétség a KÜLDÉS felé billen.
- **A "nincs reply tool" NEM session-független tény.** A DREAM.md 08-15-én azt írta,
  hogy `enabledPlugins: telegram=false`, tehát a rendes reply tool le van tiltva --
  az interaktív sessionben viszont a `mcp__plugin_telegram_telegram__reply` LÉTEZETT
  és elsőre kiment vele az üzenet. A tiltás a `-p --channels` sessionre igaz, arra,
  amelyik a Bot API fallbackre kényszerül. Mérd le a saját sessionödben
  (`ToolSearch("select:mcp__plugin_telegram_telegram__reply")`), ne a DREAM.md-ből
  vagy a naplóból vedd át.
- **A napindító után a wrapper MÉG EGYSZER beeshet ugyanabban a percben.** 2026-08-18:
  a `-p` futás 07:27-kor a (c) ágon elhasalt és inter-agent üzenetben adta át az adatot,
  én 07:31-kor kiküldtem a teljes napindítót (msg 592), és 07:32-kor megérkezett hozzám
  maga az ütemezett feladat szövege is. Ilyenkor a `morning.log` SAJÁT bejegyzése a
  bizonyíték, hogy már kiment -- ne küldd újra, csak nyugtázd a transzkriptben.
- 🔴 **A naplóba SOHA ne írj kézzel becsült időpontot.** Ugyanaznap `07:37`-et írtam a
  `morning.log`-ba, miközben a `date` `07:32:38`-at adott: öt perccel a jövőbe naplóztam
  a küldést. A naplót holnap a saját buktató-eljárásom bizonyítékként olvassa, tehát egy
  találgatott időbélyeg később hamis rekonstrukciót ad. A CLAUDE.md „Időkezelés" szabálya
  (`date` az első lépés) a NAPLÓZÁSRA is vonatkozik, nem csak az elemzésre.
- **A `-p` session nyugtázását ne inter-agent üzenetben küldd vissza.** A delegáló
  `to: marveen`-t ad meg, ami a FŐ-ágens, vagyis a nyugta saját magamhoz ér vissza és
  egy fölösleges ébresztést okoz. A visszajelzés helye a `morning.log`.

- 🔴 **Ha egy küldést kiveszel a tool-útból, a toolra kötött ŐRÖK IS lehullanak vele.**
  2026-08-22, az első reggel, amikor a Bot API-s út tényleg működött (msg 621): a
  szöveg **12 ékezet nélküli magyar szóval** és négy ` -- ` gondolatjel-pótlóval ment
  ki a gazdának. Nem figyelmetlenség volt. A `scripts/hooks/outgoing-copy-gate.py`
  2026-08-10 óta pontosan ezt a két szabályt őrzi, de PreToolUse hookként: `Bash`,
  `*send_email*` és a telegram `reply` tool matcherén. A systemd-ből futó szkript
  `curl`-je egyiken sincs rajta, tehát a néma napindítót **ellenőrizetlenre**
  cseréltük. Javítva ugyanaznap (PR #91/#92): a kapunak van `--check-file` CLI-módja,
  és a `morning-briefing.sh` meghívja küldés előtt, **fail-open** (naplóz és küld),
  mert felügyeleti csatornán a némulás a drágább hiba.
  **A kérdés, amit egy ilyen átépítésnél fel kell tenni:** mi az, ami eddig a tool-út
  MELLÉ volt kötve, és most nem fut le? Hook, gate, audit-napló, rate-limit.
- **Ha a Telegram MCP-szerver lekapcsolódott, a Bot API a kézi kerülőút, DE a kaput
  magad futtasd.** 2026-08-22 07:35-kor a `plugin:telegram:telegram` disconnectált,
  tehát nem volt `reply` tool. A menet: írd fájlba a szöveget, `python3
  scripts/hooks/outgoing-copy-gate.py --check-file <fajl>`, és csak `exit 0` után
  menjen a `curl .../sendMessage`. A kapu ilyenkor nem fut magától.
  ⚠️ ~~A kapu **hamis pozitívot** ad a `07:27-es`-szerű alakokra~~ -- **JAVÍTVA
  2026-09-01 (GATENUMSUF901), ne fogalmazd át miatta a szöveget.** A tokenizáló
  mostantól a `szám-toldalék` alakot is EGY szónak veszi (`2027-es`, `08-24-i`,
  `7:27-es`), ahogy 08-19 óta a `betű-toldalék`ot (`drive-ot`). Kiváltó eset:
  09-01 07:28, msg 690 -- a kapu `es -> és`-t javasolt, holott a KIKÜLDÖTT
  szövegben `2027-es` állt szóköz nélkül (mérve); a szóköz csak a kapu saját
  hibaüzenetében volt. **Ez volt a második hamis pozitív ugyanabból a
  tokenizálás-osztályból, ezért a MÉRŐ javult, nem egy újabb kerülőút-tanács.**
  Mérés a javításhoz: a valódi hiba (`2027 es`, önálló `es` prózában) a régi ÉS
  az új kódon is bukik; a `2027-es` csak a régin.

<!-- --- upstream v1.36 (merge 2026-09-01) --- -->
_Az upstream v1.36 ugyanennek a feladatnak a SABLONJAT bovitette meresekkel. A fenti resz EZ A TELEPITES elo valtozata (valos ertekekkel); alant az upstream tanulsagai, amik nalunk is allnak._

**AI hírek szekció -- CSAK a fő-ágensnél ({{MAIN_AGENT_ID}})**: ha NEM a fő-ágensként futsz (azaz sub-agentként), HAGYD KI az "🤖 AI HÍREK" szekciót -- sub-agenteknek nem releváns. Az email és naptár szekció marad mindenkinél.

**A `WebSearch` a fő-ágensből KÖZVETLENÜL működik -- ne vezesd le, hogy nem (2026-07-31, mérve; a gazda kérdezett rá a hiányra).** A hír-szekció egyszer kimaradt azzal a levezetéssel, hogy "külső lekérdezés kellene, azt ez a munkamenet nem futtathatja" -- csak épp a `WebSearch`-öt magát senki nem próbálta ki. Kipróbálva ELSŐRE lefutott: az elkülönített-olvasó (quarantine) szabály a NYERS oldal-tartalom behúzására vonatkozik, nem a kereső-hívásra. ELJÁRÁS: a szekciót CSAK akkor hagyd ki, ha a `WebSearch` ténylegesen HIBÁRA FUTOTT, és akkor a hibaüzenetet idézd, ne a levezetést. Két szabályból levezetett tiltás nem mérés; és sose pótold találgatással (`feedback_verify_facts_live_source`).

**Email szűrés -- NE listázz PR/CI/automata-értesítő emailt a napindítóban (tulajdonosi visszajelzésből, 2026-05-31).** A `search_emails` query-be tedd bele a kizárást: `-from:notifications@github.com -from:github.com -from:netlify.com -from:vercel.com` (és minden CI/deploy-bot). A PR-eket a flotta önállóan kezeli, a tulajdonoshoz csak kész eredmény megy -- a 📧 EMAIL szekcióba csak VALÓDI, ember-küldte / üzleti / pénzügyi levelek kerüljenek.

**A SAJÁT RENDSZEREINK TESZT-LEVELEI ÚGY NÉZNEK KI, MINT VALÓDI ÜGYFÉL-ESEMÉNYEK (2026-08-17, mérve).** A bot-kizárás a HARMADIK FELEK értesítőire készült (kód-tárhely, deploy-szolgáltató, CI). Van egy másik osztály, amit egyik szűrő sem fog meg: a SAJÁT terméked tranzakciós levelei, amiket néhány órája MI MAGUNK váltottunk ki egy teszttel. A postafiókban ezek életszerűek, mert azok is: valódi jelszó-visszaállító és valódi meghívó levelek, valódi időbélyeggel, a saját domainünkről. Aznap reggel négy ilyen ült a bejövőben egy hajnali végig-mérésből, és ha bekerülnek a napindítóba, a gazda új regisztrációt és jelszó-problémát lát ott, ahol csak a saját QA-nk nyoma van.
**ELJÁRÁS:** a levelek átnézésekor tedd fel a kérdést, hogy az adott levelet KIVÁLTOTTUK-E mi az elmúlt órákban (teszt-fiók, plus-címes cím, saját `noreply@` feladó a saját domainünkről, párban érkező meghívó és jelszó-levél). Ha igen, az nem hír, hanem melléktermék, és kimarad. A gyanú olcsón ellenőrizhető: a teszt-címeket és a mérés idejét a hozzá tartozó kanban-kártya tartalmazza. Rokon: `feedback_third_party_test_residue`.

**A FORMÁTUM: a MarkdownV2 itt kockázatos, és van rá bevált harmadik út.** Ez a műfaj (hosszú, több-szekciós, tele ponttal, kötőjellel, időponttal) többször elhalt kézi escape-eléssel. Ha KÉZZEL írod a szöveget a küldő hívásba, menj plain texttel, a szekciócímeket emoji és nagybetű adja. Ha mégis MarkdownV2 kell, GÉPI escape-et használj (minden foglalt karakter kivétel nélkül, a félkövért helyettesítő karakterpárból visszacserélve), és küldés előtt VALIDÁLJ: nulla escape-eletlen foglalt karakter, páros csillagszám. Részletek: `telegram-markdownv2-escape`.

**A HÍR-KERESÉS TÖBBSÉGE AGGREGÁTOR-BLOG, ÉS AZ NEM FORRÁS (2026-08-09, mérve).** A "AI news <dátum>" keresés első oldala jellemzően SEO-blogok listája, tele konkrétnak látszó modell-nevekkel és verziószámokkal (aznap: egy állítólagos GPT-verzió és két másik "kiadás"), amik EGYETLEN aggregátorból származnak, elsődleges bejelentés nélkül. Ezeket kimondani a napindítóban pontosan az a hiba, amit a `feedback_verify_facts_live_source` tilt: a gazda ténynek olvassa, és továbbadja.
**ELJÁRÁS:** csak azt a tételt vedd be, aminél a hírhez tartozik KONKRÉT, ellenőrizhető horgony (dátum + mérhető adat + megnevezett kiadó), a többit hagyd ki. A szekció végére írj EGY sort arról, honnan jött az anyag, és hogy mit hagytál ki verifikálatlanként. Modell-nevet, verziót, árat aggregátor-blogból SOHA ne állíts.

**ÉS A PROVENIENCIA-SOR AKKOR IS KÖTELEZŐ, HA SEMMIT NEM HAGYTÁL KI (2026-08-22, saját mulasztás, mérve).** A fenti bekezdés a KIHAGYÁSRÓL szól, ezért ha a keresés három használhatónak látszó hírt ad és egyiket sem dobod el, a záró sor természetes módon elmarad -- nálam pontosan ez történt. A következmény nem az, hogy hiányzik egy sor, hanem hogy **mind a három hír EGYFORMÁN biztosnak látszik**: az olvasó nem tudja megkülönböztetni a nevesített kiadóval alátámasztott tételt az aggregátorból jött harmadiktól. Aznap az első kettő (Bloomberg/CNBC/TechCrunch, illetve a gyártó saját bejelentő oldala) utólag kiállta a próbát, a harmadik (egy iparági arányszám) NEM volt visszavezethető elsődleges forrásra -- és a gazda pont az ilyen számot adja tovább előadáson.
**ELJÁRÁS: a záró sor a szekció KÖTELEZŐ része, nem a kihagyás melléklete.** Formája: honnan jött az anyag, melyik tételnél VAN nevesített kiadó, és melyiknél NINCS. Ha egy tételnél nincs, azt a napindítóban jelöld meg olvashatóan, ne csak a záró sorban.
**ÉS A HORGONY-KERESÉS OLCSÓ, HA A KOCKÁZATOS TÉTELRE FUT:** nem kell minden hírt visszakeresni, csak azt, ami SZÁMOT vagy TERMÉK-ÁLLÍTÁST tartalmaz (bevétel, arány, verzió, dátumhoz kötött funkció). Egy célzott keresés kiadó-névvel eldönti, és mellékesen a jobb tartalmat is meghozza: nálam a gyártó saját oldala adta meg azt a mechanizmus-részletet, amitől a hírből használható videó-téma lett.

**A DREAM.md "TÉNYADAT" SZEKCIÓI SEM MIND EGYFORMÁN TARTÓSAK (2026-08-22, mérve).** A fenti Dream-szabály úgy szól, hogy a Top-3-at újra kell mérni, a memória-egészség és a skill-flotta szekció viszont "változatlanul átvehető, azok tényadatok". Ez a mondat egy különbséget elfed: a mért ARÁNYOK (vektorizáltság, duplikátum-szám) tényleg állnak reggelig, de a DARABSZÁMOK közül azok, amiket A SAJÁT ÉJSZAKAI MUNKÁNK változtat, hajnalra elavulnak. Nálam a skill-szám: a Dream 227-et írt 02:07-kor, reggelre 229 volt, mert az éjjeli körök két skillt hoztak létre.
**ELJÁRÁS: minden olyan számot, amit mi magunk tudunk elmozdítani két óra alatt (skill-szám, kártya-szám, nyitott PR), a kiküldés előtt mérd újra egy paranccsal;** a külső mérésből jövő arányokat vedd át. Egy rossz szám a "tényadat" szekcióban rosszabb, mint egy hiányzó: az olvasó pont ott bízik benne, ahol nem ellenőrzi.


🔴 **A `-p` session FONETIKUSAN ELRONTJA a technikai neveket, és a KAPU ezt nem fogja meg.**
2026-09-03, msg 742: a DREAM.md-ben kétszer, helyesen `ledger-live-drain` állt (mérve:
`grep -c` = 2, nulla torzult alak), a kiküldött napindítóban mégis `ledép- és őrhookok`
és `ledég-live-drain` ment ki. A kapu `tiszta` sort írt, teljes joggal: a torzult alak
ékezetes magyar szónak látszik, tehát sem az ékezet-, sem a gondolatjel-ellenőrzés nem
szól. Ez az összefoglaló MODELL-hibája, nem a szállítási úté.
**Miért pont itt fáj:** a napindító azért olvassa a DREAM.md-t, hogy a gazda a saját
rendszereinek NEVÉN lássa a leletet. Egy elrontott komponensnév a leletet
visszakereshetetlenné teszi -- a gazda nem tud rágrepelni arra, ami nincs.
**ELJÁRÁS a kiküldés után (a `KAPU: tiszta` NEM zárja le a kört):** vesd össze a
kiküldött szöveg technikai neveit a forrással, egy paranccsal:
```bash
grep -oE '[a-z]+-[a-z-]{3,}' store/morning.log | sort -u | while read w; do
  grep -q -- "$w" DREAM.md || echo "NINCS a forrasban: $w"
done
```
Ami a forrásban nincs meg szó szerint, az vagy torzulás, vagy új szó -- mindkettőt
nézd meg. Ha torzulás: egyetlen rövid javító sorban told utána a helyes nevet, ne az
egész napindítót küldd újra.
