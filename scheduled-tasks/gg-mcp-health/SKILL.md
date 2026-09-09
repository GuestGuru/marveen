---
name: gg-mcp-health
description: Flotta gg-mcp liveness es staleness ellenorzes (csendes MCP-halal detektalas)
---

Futtasd le a flotta gg-mcp egészségellenőrzését:

python3 scripts/gg-mcp-health.py

⚠️ **A kimenet JSON, és a döntő mezők a GYÖKÉRBEN vannak** (`problems`,
`ambient_token_trap`), nem a `findings` sorok végén. Ezért ne `tail`-lel nézd:
2026-09-07-én a `| tail -40` csak az utolsó ágens-sorokat mutatta, és egy plusz
kört vitt el, amíg a `problems`-hez jutottam. Egy sorral kiolvasható:

```bash
python3 scripts/gg-mcp-health.py | python3 -c "import json,sys; d=json.load(sys.stdin); print('problems:', d.get('problems'), '| ambient:', d.get('ambient_token_trap')); [print(f['agent'], f['status']) for f in d.get('findings',[])]"
```

A script minden futó ágenst megnéz, aki a .mcp.json-jában deklarál gg-access szervert, és az alábbi állapotokat adja:

- "ok": él a szerver-gyerekprocessz, van betölthető token, és a session frissebb a gg-mcp buildnél. Nincs teendő.
- "starting": friss session, még nem indult el az MCP gyereke. NEM hiba, hagyd békén.
- "DEAD": deklarál gg-access-t, de nincs élő szerver-gyerekprocessze. Az ágens ilyenkor egyetlen gg_* toolt sem tud hívni, és erről ő maga nem tud. Ez a 2026-08-08-i salesninja-eset.
- "STALE": él a szerver, de a session régebbi a gg-mcp buildnél, tehát felülírt kódot futtat. Csak session-restart javítja, az MCP önmagában nem újraindítható.
- "NO_TOKEN" (2026-08-15 óta): él a proxy, de nincs identitása -- a `GG_MCP_TOKEN_FILE`
  nincs deklarálva, vagy a fájl hiányzik/üres. Az ágens ilyenkor login-módban fut:
  a login toolon kívül MINDEN gg_* hívása elszáll, és ő ezt nem hibaüzenetként
  látja, hanem egy megkurtított tool-listaként. **A javítás párosítás, nem restart.**
  Miért került be: 08-14-én 14:00-kor a szonda `ok`-ot írt brokermarcsira, miközben
  az ágens saját memóriája szerint egyetlen GG-rendszert sem ért el (13:51-kor indult,
  a token-fájlja 13:59-kor jött létre). Élő gyerekprocessz = processz, nem jogosultság.

**Amit a NO_TOKEN sem mér:** a token LÉTEZÉSÉT nézi, nem az érvényességét. Egy lejárt
vagy visszavont token ugyanígy `ok`. Ha egy ágens azt jelzi, hogy 401-et kap, a zöld
szonda nem cáfolja őt.

Két tájékoztató mező a sorokban, ezek NEM hibák: `token_file` (melyik fájl adja az
identitást) és `token_written_after_session_start` (a token a session indulása UTÁN
íródott). Az utóbbi kétféleképp olvasható -- vagy maga a session párosított be
(normál onboarding, rendben van), vagy valaki kívülről írta a fájlt, és akkor ez a
session sosem töltötte be. A processztáblából a kettő nem különböztethető meg, ezért
a szonda kimondja a tényt és nem tippel.

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

Ha van NO_TOKEN: ne restartot javasolj, hanem párosítást. Írd meg Tamásnak, melyik
ágens az, mióta fut identitás nélkül, és hogy addig egyetlen GG-rendszert sem ér el.
Ha az ágensnek van tulajdonosa (agent-config.json -> owner), a párosítást ő tudja
elvégezni a saját belépésével -- a restart ezen nem segít, mert nem a processz hiányzik.

Ha van DEAD vagy STALE:
0. 🔴 **STALE-nél ELŐSZÖR mérd meg, MI változott a buildben. Ne írd azt, hogy nem tudod.**
   2026-09-06 10:00: 7/7 STALE után azt jelentettem Tamásnak, hogy „a telepített mappa nem
   git-checkout, tehát nem tudom megmondani, mi változott" -- holott a
   `gg-mcp-verzio-ellenorzes` skill 2. és 3. pontja pontosan erre való, és a skill MAGA
   mondja ki, hogy nincs `.git`. Külön üzenetben kellett pontosítanom. Ez ugyanaz a
   hibaosztály, mint egy megírt dologról „ez hiányzik"-ot állítani: munkát és bizalmat
   is visz, mert a gazda egy megválaszolható kérdést lát megválaszolatlanul.
   **A lokális mérés két sor, és a legtöbb esetben ELÉG** (a build a lokális forrásból
   készül, tehát ami változott, annak az mtime-ja a build ideje):
   ```bash
   GGMCP="${GGMCP:-$HOME/gg-mcp}"   # a gg-mcp telepites gyokere
   find "$GGMCP/src" -name '*.ts' -newermt '<a build napja> 00:00' -printf '%TH:%TM %p\n' | sort
   grep -ohE '"(gg|gg3|sales|channex|github|sentry|gcp|irnok|wiki|slack)_[a-z_]+"' \
     "$GGMCP/dist/tools/<a valtozott fajl>.js" | tr -d '"' | sort -u
   ```
   Az első megmondja, MELYIK forrásfájl változott, a második, hogy jött-e ÚJ tool.
   **A kettő együtt dönti el a sürgősséget:** új tool nélkül a kollégák semmit nem
   vesznek észre a régi kódon, tehát a hajnali auto-restart bőven elég. Ha a lokális
   mérés nem elég (pl. a forrás mtime-ja sem mozdult), akkor jön a skill 3. pontja,
   a blob-hash összevetés a GitHub tree-vel.
1. NE indítsd újra magadtól az ágenst. Egy restart munkát szakít meg, és sub-ágensnél idegen tulajdonos (pl. Péter) munkáját viszi el.
2. Írj Tamásnak Telegramon (reply tool, chat_id 0): melyik ágens, milyen állapot, mióta (session_started), és mit jelent gyakorlatilag. DEAD-nél mondd ki, hogy az ágens most nem éri el a GG-rendszereket.
3. Javasold a javítást: POST /api/agents/<nev>/restart {"fresh": true}. A fresh azért kell, mert a --channels plugin csak friss induláskor töltődik be megbízhatóan, continue-nál néma maradhat a bot.
4. Ha az ágensnek van tulajdonosa (agent-config.json -> owner), írd oda, hogy az ő munkáját érinti.
5. Restart előtt az érintett ágenst inter-agent üzenetben kérd meg, hogy mentse a memóriáját és írjon taskstate-et, mert fresh indulásnál a taskstate-replay hook nem fut.
   ✅ **És ez nem formaság: a mentés-kérés AZ A PILLANAT, amikor az ágens felfedezi, mit felejtett el rögzíteni.** 2026-09-01, brokermarcsi kérésre indított mentése két olyan állapotot pótolt, ami sehol nem volt felírva -- köztük egy „ezt még fel kell vetnem a gazdámnál" bejegyzést, amit MÁR felvetett. Fresh indulás után a friss példány másodszor is megkérdezte volna ugyanazt a gazdától.
   **Kérd konkrétan**, ne általánosságban: (a) a nyitott ügyeit, (b) amit a mai körben megtudott, és (c) azt, ami épp a te köröd miatt változott meg (új szabály, új skill, aktuális rendszerállapot) -- ezt ő nem tudja kitalálni, és fresh indulás után nem lesz meg neki.
   **Várd meg a visszajelzését**, de adj határidőt, és ha letelik, indítsd -- a késleltetés is kár.
6. Írd fel kanban kártyára, ha a probléma két egymást követő futáson át fennáll.
   ⚠️ **KIVÉTEL, ha az ügy MÁR EL VAN DÖNTVE és a megoldás automatikus.**
   2026-08-24: a 15:13-as gg-mcp deploy után a 16:00 ÉS a 18:00 szonda is 7/7 STALE-t
   adott, tehát a fenti szabály kártyát írt volna elő. Nem vettem fel, mert 16:05-kor
   már megkérdeztem Tamást, ő a várakozást választotta („ráér, nem is tudnak a kollégák
   az új toolokról"), a hajnali 3-as auto-restart pedig magától megoldja. Egy kártya,
   ami éjjel magától lezáródik, csak hosszabbítja a listát -- a CLAUDE.md kifejezetten
   rövidebb listát kér.
   **A kártya akkor kell, ha fennáll a FELEJTÉS kockázata:** nincs döntés, vagy a
   megoldás emberi lépést igényel (párosítás, jogosultság, külső rendszer). Ha a
   javítás magától lefut egy ismert időpontban, elég egy `warm` memória a teendővel.
   És ugyanígy: a MÁSODIK azonos jelzésnél NE írj újra Telegramra -- a jelzési
   kötelezettséget az első kör teljesítette, a folytatás nem új esemény.
