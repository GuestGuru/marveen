---
name: reggeli-napindito
description: Reggeli összefoglaló: email, naptár, AI hírek, plus Dream Engine top-of-message
---

Reggeli napindítót a CLAUDE.md formátum szerint. A beállított csatornára (chat_id: 0).

**FONTOS — Dream Engine override**: a napindító ELEJÉRE (még az email/naptár szekciók ELŐTT) tedd be a `{{INSTALL_DIR}}/DREAM.md` fájl tartalmából az 5 bucket-et — `💡 Skill-javaslatok`, `🧹 Memória-egészség`, `🎯 Top-3 holnapi javaslat`, `🌐 External opportunity`, `🛠 Skill-flotta health`. Ha a DREAM.md nem létezik vagy üres (pl. a Dream Engine valamiért nem futott le), kihagyod ezt a szekciót.

A `cat {{INSTALL_DIR}}/DREAM.md` parancs visszaadja a tartalmat, abból emeld ki a kulcs-szekciókat MarkdownV2-formátumra escape-elve.

A többi szekció (email, naptár, AI hírek) maradnak a CLAUDE.md-ben leírt formátum szerint.

**AI hírek szekció -- CSAK a fő-ágensnél (marveen)**: ha NEM a fő-ágensként futsz (azaz sub-agentként), HAGYD KI az "🤖 AI HÍREK" szekciót -- sub-agenteknek nem releváns. Az email és naptár szekció marad mindenkinél.

## Buktatók (2026-07-29-i futásból)

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
- 🔴 **ELSŐ LÉPÉS: `tail {{INSTALL_DIR}}/store/morning.log`.** 2026-08-15-én az
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
  (c) 2026-08-17-től egy HARMADIK kimenet is van: a fejléc alatt egy prózai
  bejelentés áll, hogy „nincs Gmail-, Naptár- vagy Telegram-küldő eszközöm ebben a
  sessionben", és hogy a napindító emiatt elmaradt. Ez **ugyanaz, mint a (b)**:
  semmi nem ment ki, a TELJES napindító a tiéd. Ne vedd át a diagnózisát -- a
  `.mcp.json`-ra és az `enabledPlugins`-re tett állítása a `-p` sessionre igaz,
  a tiédre nem; ugyanabban a percben nálam a `gg-napi-forras.sh` és a
  `mcp__plugin_telegram_telegram__reply` is hibátlanul ment (msg 588).
- **A "nincs reply tool" NEM session-független tény.** A DREAM.md 08-15-én azt írta,
  hogy `enabledPlugins: telegram=false`, tehát a rendes reply tool le van tiltva --
  az interaktív sessionben viszont a `mcp__plugin_telegram_telegram__reply` LÉTEZETT
  és elsőre kiment vele az üzenet. A tiltás a `-p --channels` sessionre igaz, arra,
  amelyik a Bot API fallbackre kényszerül. Mérd le a saját sessionödben
  (`ToolSearch("select:mcp__plugin_telegram_telegram__reply")`), ne a DREAM.md-ből
  vagy a naplóból vedd át.
