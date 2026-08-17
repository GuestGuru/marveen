---
name: google-docs-biztonsagos-szerkesztes
description: Meglévő Google Doc szerkesztése adatvesztés nélkül a Docs API-val - számok, táblázatcellák és bekezdések cseréje. Triggerelődik - "frissítsd a doksit", "írd át a számokat a dokumentumban", "cseréld le a táblázatot", meglévő elemzés vagy brief adatfrissítése, batchUpdate, replaceAllText.
---

# Google Doc biztonságos szerkesztése

## Mikor használd

Meglévő Google Docot kell frissíteni (adatfrissítés, számcsere, táblázat átírása),
és a formázást, a táblákat, a listákat meg kell tartani. Ne írd újra a doksit:
a teljes törlés + beszúrás elveszti a táblákat és a stílusokat.

## Eljárás

1. **Mentsd le a kiindulást.** Exportáld szövegként ÉS kérd le a JSON-t. Ez a
   visszaállítás alapja, ha valami félremegy.

   ```bash
   # A token-fájlt MINDIG add meg expliciten, a SAJÁT .mcp.json-odból (l. Buktatók).
   TF=$(python3 -c "import json;print(json.load(open('$(pwd)/.mcp.json'))['mcpServers']['gg-access']['env']['GG_MCP_TOKEN_FILE'])")
   GG_MCP_TOKEN_FILE="$TF" GG_MCP_AGENT_LABEL="marveen/<sajat_agent_neved>" GG_MCP_UPSTREAM_URL=http://127.0.0.1:3450 \
   node /home/gg/gg-mcp/dist/proxy.js exec --alias google-drive --env-var TOK -- bash -c '
     curl -sL -H "Authorization: Bearer $TOK" ".../drive/v3/files/<ID>/export?mimeType=text/plain" -o be.txt
     curl -sS  -H "Authorization: Bearer $TOK" "https://docs.googleapis.com/v1/documents/<ID>" -o be.json'
   ```

2. **Két külön kör, soha ne keverd őket egy batchUpdate-be.**
   - **1. kör, táblázatcellák: INDEX alapján.** Járd be a JSON `body.content` fáját,
     gyűjtsd ki a cellák bekezdéseinek `startIndex`/`endIndex` értékét, és állítsd
     elő a kéréseket **csökkenő index szerint**, cellánként `deleteContentRange` +
     `insertText` ugyanarra az indexre. Így a korábbi módosítás nem tolja el a
     későbbi indexeket.
   - **2. kör, folyó szöveg: `replaceAllText`.** Ez indexfüggetlen, egy batchben
     akárhány mehet.

3. **Minden cserénél ellenőrizd a találatszámot MIELŐTT elküldöd.** A
   `replaceAllText` GLOBÁLIS: ha a keresett szöveg kétszer szerepel, mindkettőt
   átírja. Számold meg az exportált szövegben, és csak akkor küldd, ha pontosan 1.
   Rövid számokra (`306`, `111`) soha ne cserélj, mert azok több cellában is ott
   vannak; azokat az 1. kör intézi index alapján.

4. **Exportáld újra és ellenőrizd.** Grepelj rá a RÉGI értékekre: ha bármelyik
   megmaradt, a csere nem talált. A HTTP 200 önmagában nem bizonyíték, mert a
   `replaceAllText` nulla találattal is 200-at ad.

## Buktatók

- **A `proxy exec`-nek MINDIG add meg a saját `GG_MCP_TOKEN_FILE`-odat.** A
  shell-út nem viszi magától az identitásodat, az MCP-út (a sima `gg_*` toolok)
  viszont igen. Idegen token nem névcsere, hanem JOGCSERE: a másik ember teljes
  jogával írsz, és az audit is őt látja. Ezért van a fenti példában a `TF=...`
  sor: a SAJÁT munkakönyvtárad `.mcp.json`-jából olvasd ki, ne a főágenséből, és
  ne találgasd. Ellenőrzés: `gg_allowed_tools`, az `en` mező a te gazdád e-mail
  címe legyen.
  **2026-08-13 óta ez fail-closed**, mérve: token-fájl nélkül a wrapper ÉS a
  közvetlen `node dist/proxy.js` hívás is megáll hibaüzenettel, nem esik vissza a
  főágens tokenjére. A proxy alapértelmezett `$HOME/.gg-mcp/token` útvonala ezen a
  gépen nem létezik. Ez nem elhagyott maradék: az a kliens-telepítés helye, és
  laptopon helyes. A flotta közös gépén viszont KÖZÖS identitás lenne, ezért ha
  ott mégis megjelenik, az egészségőr riaszt rá. Ha ilyen hibát kapsz, az a
  védelem, nem regresszió: add meg a
  sajátodat. Előtte viszont csendben a főágens nevében ment ki az írás, ezért
  minden ennél régebbi példaparancsot gyanakvással nézz.
- **A számozott lista sorszáma NINCS benne a dokumentum szövegében.** A
  `text/plain` export kiírja a `1. `, `2. ` előtagot, a Docs API viszont
  stílusként tárolja. Ha az exportból másolod ki a keresett szöveget a
  sorszámmal együtt, a `replaceAllText` NEM talál rá, és némán, 200-zal
  tér vissza. A sorszám nélkül keress. (Mérve 2026-08-13: három csere közül
  ez az egy futott üresre, és csak az újra-exportnál derült ki.)
- **A `replaceAllText` nulla találatnál is sikeres.** Egyetlen ellenőrzés az
  újra-export és a régi értékek grepelése.
- **Sortörés a cellában és a bekezdésben.** A cella bekezdésének szövege `\n`-re
  végződik, a `deleteContentRange` végét ezért `startIndex + len(szöveg_\n_nélkül)`
  adja, különben elnyeled a bekezdéshatárt és összecsúsznak a cellák.
- **Puha sortörés (`\x0b`) a fejlécekben.** A „Készült: … \x0b Felelős: …" egyetlen
  bekezdés. Ha az egész sorra cserélsz, a `\x0b`-t is bele kell venni; egyszerűbb
  csak az elejét cserélni.
- **A táblázat celláiban lehet ugyanaz a szám, mint amire cserélnél.** Ha a régi
  VI. kerületi érték `306`, és az új XIII. kerületi érték is `306`, akkor
  szövegcserével körkörös hibát csinálsz. Index alapú csere, kötelezően.

## Ellenőrzés

- Régi értékek grepelése az újra-exportált szövegben: nulla találat?
- A táblák sor- és oszlopszáma változatlan?
- Magyar szövegnél: `grep -c '—'` a végén nulla? (l. `humanizer-hu`)
- A doksi linkje ugyanaz maradt? (helyben szerkesztettél, nem új fájlt hoztál létre)
