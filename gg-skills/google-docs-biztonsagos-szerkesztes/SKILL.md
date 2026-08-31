---
name: google-docs-biztonsagos-szerkesztes
description: Google Doc létrehozása HTML-ből és meglévő szerkesztése adatvesztés nélkül a Docs API-val - számok, táblázatcellák és bekezdések cseréje, bekezdés törlése. Triggerelődik - "frissítsd a doksit", "írd át a számokat a dokumentumban", "cseréld le a táblázatot", "készíts egy doksit/tervezetet a Drive-ra", meglévő elemzés vagy brief adatfrissítése, batchUpdate, replaceAllText, deleteContentRange, 403 unregistered callers.
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

## Új doksi létrehozása HTML-ből (nem szerkesztés, hanem gyártás)

Ha nem meglévő doksit írsz át, hanem újat gyártasz (szerződéstervezet, elemzés,
brief), NE a Docs API `insertText`-jével építsd fel. Írd meg HTML-ben, és töltsd
fel a Drive-ra `mimeType: application/vnd.google-apps.document`-tel: a Drive
konvertálja, és a `<h1>`, `<b>`, `<i>`, `<p>` formázás megmarad.

```bash
python3 - <<'EOF'
import json
meta={"name":"A doksi neve","parents":["<CEL_MAPPA_ID>"],
      "mimeType":"application/vnd.google-apps.document"}
body=open("/abs/ut/tartalom.html","rb").read()
B="-----sajatboundary123"
out=(f"--{B}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+json.dumps(meta)
     +f"\r\n--{B}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n").encode()+body+f"\r\n--{B}--\r\n".encode()
open("/abs/ut/upload.bin","wb").write(out)
EOF

GG_MCP_TOKEN_FILE=<sajat.token> GG_MCP_AGENT_LABEL=marveen/<sajat_neved> \
  /home/gg/.local/bin/gg-mcp-proxy exec --alias google-drive -- \
  sh -c "curl -s -X POST 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink' \
    -H \"Authorization: Bearer \$GOOGLE_DRIVE_ACCESS_TOKEN\" \
    -H 'Content-Type: multipart/related; boundary=-----sajatboundary123' \
    --data-binary @/abs/ut/upload.bin"
```

Feltöltés után a finomításokat már a `replaceAllText`-tel csináld: így a
javításokat nem kell újra végigvinni a HTML-en, és a doksi URL-je sem változik
(Eszti/a gazda esetleg már kommentelt bele).

## Buktatók

- **Az env-változó neve `GOOGLE_DRIVE_ACCESS_TOKEN`**, nem `GOOGLE_DRIVE` és nem
  `GG_SECRET`. A Drive/Docs/Sheets API mind ezt az egy tokent használja (alias:
  `google-drive`). Ha rossz nevet adsz meg, a curl üres Authorization fejlécet
  küld, és a Google **403 "Method doesn't allow unregistered callers"**-t ad, ami
  jogosultsági hibának néz ki, pedig csak elgépelés. A proxy az első kimeneti
  sorában kiírja a helyes nevet — olvasd el.
- **A `replaceAllText` NEM fog bekezdéshatáron átívelő szöveget.** Egy egész
  bekezdés (pl. egy fölöslegessé vált szerződéspont) törléséhez kérd le a
  `documents.get`-tel a JSON-t, keresd meg a bekezdés `startIndex`/`endIndex`
  párját, és `deleteContentRange`-dzsel töröld. Ha üres stringre cserélsz,
  ottmarad egy üres bekezdés.
- **Egy `replaceAllText` MINDEN előfordulást cserél.** Ha a doksiban két
  hasonló szerkezetű rész van (pl. két melléklet ugyanazzal a záró
  formulával), a csere mindkettőt átírja. Ez lehet pont az, amit akarsz
  (egy pont beszúrása mindkét mellékletbe), de ha nem, tedd egyedivé a
  keresett szöveget egy szomszédos, eltérő mondattal.

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
