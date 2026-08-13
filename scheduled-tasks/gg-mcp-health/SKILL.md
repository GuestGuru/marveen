---
name: gg-mcp-health
description: Flotta gg-mcp liveness es staleness ellenorzes (csendes MCP-halal detektalas)
---

Futtasd le a flotta gg-mcp egészségellenőrzését:

python3 scripts/gg-mcp-health.py

A script minden futó ágenst megnéz, aki a .mcp.json-jában deklarál gg-access szervert, és három állapotot ad:

- "ok": él a szerver-gyerekprocessz, és a session frissebb a gg-mcp buildnél. Nincs teendő.
- "starting": friss session, még nem indult el az MCP gyereke. NEM hiba, hagyd békén.
- "DEAD": deklarál gg-access-t, de nincs élő szerver-gyerekprocessze. Az ágens ilyenkor egyetlen gg_* toolt sem tud hívni, és erről ő maga nem tud. Ez a 2026-08-08-i salesninja-eset.
- "STALE": él a szerver, de a session régebbi a gg-mcp buildnél, tehát felülírt kódot futtat. Csak session-restart javítja, az MCP önmagában nem újraindítható.

Ha a "problems" 0, NE írj sehova, csak állj le csendben. Ez heartbeat.

⚠️ **A "problems" NEM csak ágens-státuszból jöhet.** 2026-08-13 óta a szkript egy
gép-szintű csapdát is néz, és ha megtalálja, egy külön kulcsot ad vissza a JSON
gyökerében, ÉS megnöveli a "problems"-et:

- **`ambient_token_trap`**: létrejött a `~/.gg-mcp/token`, ami a proxy
  HOME-alapértelmezése. Ezen a több-ágenses gépen ez KÖZÖS identitás: bárki, aki
  `GG_MCP_TOKEN_FILE` nélkül hívja közvetlenül a `dist/proxy.js`-t, ennek a
  tokennek a nevében ÉS JOGÁVAL fut. A `gg-mcp-proxy` wrapper fail-closed, de a
  közvetlen hívás megkerüli. Ez a 2026-08-13-i GG-559-eset visszanyílása lenne.
  **Ilyenkor NE ágenst keress** (a `findings` mind lehet `ok`): írj Tamásnak,
  hogy megjelent a fájl, mikor (`stat`), és hogy amíg ott van, minden shell-úti
  hívásnak explicit saját tokent kell adnia. A fájlt NE töröld magadtól, mert
  nem tudod, ki hozta létre és mire kell -- ez `data_delete`, Tamás döntése.

Ha van DEAD vagy STALE:
1. NE indítsd újra magadtól az ágenst. Egy restart munkát szakít meg, és sub-ágensnél idegen tulajdonos (pl. Péter) munkáját viszi el.
2. Írj Tamásnak Telegramon (reply tool, chat_id 0): melyik ágens, milyen állapot, mióta (session_started), és mit jelent gyakorlatilag. DEAD-nél mondd ki, hogy az ágens most nem éri el a GG-rendszereket.
3. Javasold a javítást: POST /api/agents/<nev>/restart {"fresh": true}. A fresh azért kell, mert a --channels plugin csak friss induláskor töltődik be megbízhatóan, continue-nál néma maradhat a bot.
4. Ha az ágensnek van tulajdonosa (agent-config.json -> owner), írd oda, hogy az ő munkáját érinti.
5. Restart előtt az érintett ágenst inter-agent üzenetben kérd meg, hogy mentse a memóriáját és írjon taskstate-et, mert fresh indulásnál a taskstate-replay hook nem fut.
6. Írd fel kanban kártyára, ha a probléma két egymást követő futáson át fennáll.
