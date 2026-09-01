---
name: gg-mcp-transport-atallitas
description: A gg-mcp (gg-access) kapcsolat módjának váltása egy ágensen vagy az egész flottán - lokális (index.js), proxy (proxy.js + HTTP upstream) vagy csupasz HTTP. Triggerelődik - "álljunk át proxyra", "gg-mcp frissítés után újra kell indítani mindenkit", "elvesztek az eszközeim gg-mcp deploy után", "van-e toolja a kollégának", .mcp.json szerkesztése a flottán.
---

# gg-mcp transport átállítás és mérés

## Mikor használd

- A gg-mcp deploy után minden ágenst újra kell indítani, mert némán elvesztik az eszközeiket.
- Egy ágensről el kell dönteni, hogy VAN-E egyáltalán működő eszközkészlete (nem elég hogy fut).
- `.mcp.json`-t írnál a fő-ágensen vagy a flottán.

## A három mód

| Mód | `args` | Extra env | Tulajdonság |
|---|---|---|---|
| lokális | `dist/index.js` | -- | A gg-mcp a session gyerekprocessze. Deploy után újraindítás kell. |
| proxy | `dist/proxy.js` | `GG_MCP_UPSTREAM_URL=http://127.0.0.1:3450` | stdio lefelé, HTTP felfelé. Deploy után NEM kell újraindítás. Token a fájlban marad. |
| csupasz HTTP | `url`/`type: http` | -- | ⚠️ A token a configba kerül. Új ágens nem tud beszélgetésben párosítani. Kerülendő. |

Mindhárom módban ugyanaz az identitás: `GG_MCP_TOKEN_FILE` (`/home/gg/gg-mcp/tokens/<agent>.token`) + `GG_MCP_AGENT_LABEL` (`marveen/<agent>`).

## Eljárás

1. **Mérj ELŐBB, mindkét módon**, az ágens SAJÁT tokenjével. Ha a két szám nem egyezik, ne állíts át semmit:
   ```bash
   P=~/.claude/skills/gg-mcp-transport-atallitas/mcp-probe.py
   python3 $P /home/gg/gg-mcp/dist/index.js /home/gg/gg-mcp/tokens/<agent>.token marveen/<agent>
   python3 $P /home/gg/gg-mcp/dist/proxy.js /home/gg/gg-mcp/tokens/<agent>.token marveen/<agent> http://127.0.0.1:3450
   ```
   A `stderr` mezőben a `token=van` / `token=nincs` azonnal megmondja, van-e egyáltalán identitás.
2. **Mentsd a configot**: `cp -p agents/<a>/.mcp.json agents/<a>/.mcp.json.bak-$(date +%Y%m%d-%H%M%S)`.
3. **Írd át** az `args`-ot és tedd be az `GG_MCP_UPSTREAM_URL`-t. A meglévő env kulcsokhoz ne nyúlj.
4. **Kanári először**: egy ágenst indíts újra, mérd, és csak utána a többit.
   ```bash
   curl -s -X POST -H "Authorization: Bearer $(cat store/.dashboard-token)" \
     -H "Content-Type: application/json" -d '{}' \
     http://localhost:3420/api/agents/<agent>/restart
   ```
   Alapból `--continue`, tehát a beszélgetés megmarad. `{"fresh":true}` törli.
5. **E2E igazolás a kanárin**: inter-agent üzenetben kérd meg, hogy hívja meg a `gg_allowed_tools`-t és neked válaszoljon. Kérd ki külön, hogy a gazdájának NE szóljon róla.
6. **Visszaállás**: a `.bak` visszamásolása + újraindítás. Kettő parancs, mindig legyen kéznél.

## Buktatók

- **A probe stdin-jét NYITVA kell tartani.** A `proxy.js` stdin-EOF-ra kilép (`exitOnStdinEnd`), ezért a `subprocess.communicate()` megöli, mielőtt válaszolna -- a mérés hamisan **0 toolt** mutat, miközben a proxy tökéletesen működik. Írás után `select`-tel olvass, és csak a `tools/list` válasz után `kill`-elj. (Mérve 2026-08-12: peppa "0 tool" -> javított probe után 45.)
- **A fő-ágens `.mcp.json`-ja EGYBEN az új ágensek MINTÁJA.** Ha inline tokent teszel bele, a következő létrehozott kolléga a TE tokeneddel és a TE jogaiddal indul. Ez a csupasz HTTP mód fő veszélye, és pont ezért jobb a proxy: ott a token fájlban marad.
- **A `gg-mcp-health.py` `server_path` mezője a CONFIGBÓL jön, nem a futó processzből.** Config-írás után, újraindítás előtt `proxy.js`-t ír, miközben még `index.js` fut. Az igazság a processz: `readlink /proc/<pid>/cwd` + `ps -o args=`.
- **A health probe csak életjelet néz, tokent nem.** Egy párosítatlan ágens `status: ok`, miközben NULLA toolja van. A token fájl létezését külön ellenőrizd (`ls /home/gg/gg-mcp/tokens/<agent>.token`), vagy nézd a probe `token=nincs` jelzését.
- **A health JSON ágens-listája a `findings` kulcs alatt van, NEM `agents` alatt.** A felső szint: `checked_at`, `agents_checked`, `problems`, `findings`. A kézenfekvő `d.get('agents',[])` üres listát ad kivétel nélkül, és mellette a `problems: 0` megnyugtatóan néz ki -- így egy heartbeat-összefoglaló azt jelentheti, hogy "nulla ágenst ellenőriztem, minden rendben", pedig hatot ellenőrzött. Mindig az `agents_checked` számot is írd ki, az leleplezi a rossz kulcsot (2026-08-12).
- **A hiányzó token nem hiba.** Friss kollégánál ez a normális "párosítás-váró" állapot, a gazdájának kell párosítania a tools.guest.guru-n. Mindkét módban ugyanígy viselkedik, tehát az átállás nem rontja el az onboardingot.
- **Ne hajnalra időzíts flotta-átállást.** Ha akkor bukik, felügyelet nélkül ébred mindenki eszköztelenül.

## Ellenőrzés

- Minden ágens gyerekprocessze a várt binárison van:
  `for p in $(pgrep -f '^node /home/gg/gg-mcp/dist'); do echo "$(basename $(readlink /proc/$p/cwd)) $(ps -o args= -p $p | awk '{print $NF}')"; done | sort`
  🔴 **A minta HORGONYZOTT (`^node ...`), és ez nem stílus.** A régi,
  horgony nélküli `pgrep -f 'gg-mcp/dist'` a SAJÁT parancssorodra is illeszkedik:
  mérve 2026-09-01-én 10 sort adott, ebből HÁROM hamis volt, és a hamis sorok
  `cwd`-bázisneve **ágens-névnek látszott** -- pont egy átállási ellenőrzésben,
  ahol az a kérdés, melyik ágens min fut. A horgonyzott alak 7 valódi sort ad.
  ✅ **De az ERŐSEBB ellenőrzés nem a fájlnevet nézi, hanem a processz
  KÖRNYEZETÉT** -- az mutatja meg, melyik ágens MELYIK token-fájllal fut, tehát a
  8. szabály sérülését is (idegen token). A `cwd`-bázisnév ezt sosem mutatná meg:
  ```bash
  for p in $(pgrep -f '^node /home/gg/gg-mcp/dist'); do
    lbl=$(tr '\0' '\n' < /proc/$p/environ | grep -m1 '^GG_MCP_AGENT_LABEL=' | cut -d= -f2-)
    tok=$(tr '\0' '\n' < /proc/$p/environ | grep -m1 '^GG_MCP_TOKEN_FILE=' | cut -d= -f2- | xargs -r basename)
    echo "$p label=${lbl:-<nincs>} token=${tok:-<nincs>}"
  done | sort -k2
  ```
  A label hiánya egyben negatív szűrő: a nem-ágens processzek label nélkül jönnek.
  Részletek és a `pkill`-változat: `processz-azonositas` skill.
- `python3 scripts/gg-mcp-health.py` -> `problems: 0`.
- A probe minden ágensre ugyanannyi toolt ad, mint átállás előtt.
- A kanári a saját sessionjéből visszaigazolta az e-mail címét és a tool-számát.
