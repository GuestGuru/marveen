---
name: google-drive-gmail-olvasas
description: Google Drive mappa listázása és fájlok letöltése, illetve Gmail szálak olvasása a gg-mcp proxy exec csatornáján keresztül, saját agent-identitással. Triggerelődik - "nézd át a Drive mappát", megosztott Drive link a kérésben, "mi volt az emailben", céges email-szál kontextusa kell, hiányzó gg_drive vagy gg_gmail tool.
---

# Google Drive és Gmail olvasás proxy exec-en át

## Mikor használd

- Kaptál egy Google Drive mappa- vagy fájl-linket, és a tartalmát végig kell nézned.
- Egy céges email-szál kontextusa kell (Flotta-szabály 5: válasz előtt kötelező a kapcsolódó emailek beolvasása).
- Nincs `gg_drive_*` vagy `gg_gmail_*` MCP toolod. Ez a normális állapot: a Google-hozzáférés nem toolként, hanem kiadható kulcsként jön.

## Eljárás

### 1. Ellenőrizd, mit kaphatsz meg

`gg_secret_get()` alias nélkül kilistázza az elérhető aliasokat. A Google-hoz tartozók:

| alias | mire jó | csomag |
|---|---|---|
| `google-drive` | Drive olvasás **és írás** | google-iras |
| `google-gmail` | Gmail olvasás **és küldés** | google-iras |
| `google-gmail-ro` | Gmail, csak olvasás | google-olvasas |
| `google-calendar-ro` | Naptár, csak olvasás | google-olvasas |
| `google-directory` | céges címtár | google-olvasas |

Olvasáshoz **mindig a `-ro` változatot** vedd, ha van. Az access token 1 óráig él.

### 2. Futtasd a hívást úgy, hogy a kulcs ne kerüljön a beszélgetésbe

Soha ne kérd le a kulcs értékét `gg_secret_get(alias: ...)`-szel, ha csak futtatni akarsz vele: ami egyszer bekerül a kontextusba, onnan nem hívható vissza. A proxy `exec` a gyerek-processz env-jébe teszi:

```bash
GG_MCP_UPSTREAM_URL="http://127.0.0.1:3450" \
GG_MCP_TOKEN_FILE="/home/gg/gg-mcp/tokens/<AGENT>.token" \
GG_MCP_AGENT_LABEL="marveen/<AGENT>" \
node /home/gg/gg-mcp/dist/proxy.js exec --alias google-drive --env-var TOK -- \
  bash -c 'curl -s -H "Authorization: Bearer $TOK" "https://www.googleapis.com/drive/v3/..."'
```

Az `<AGENT>` a saját agent-azonosítód, a token-fájl útját a munkakönyvtárad `.mcp.json`-jából olvasd ki, ne találgasd.

### 3. Drive: mappa listázása és letöltés

Listázás (a `supportsAllDrives` és `includeItemsFromAllDrives` nélkül a megosztott meghajtók tartalma nem jön vissza):

```
https://www.googleapis.com/drive/v3/files
  ?q=<FOLDER_ID>' in parents            (URL-kódolva: %27<FOLDER_ID>%27+in+parents)
  &fields=files(id,name,mimeType,size,modifiedTime)
  &pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true
```

Letöltés: `https://www.googleapis.com/drive/v3/files/<FILE_ID>?alt=media&supportsAllDrives=true`, `curl -L`-lel.

Sok fájlnál egy Python-ciklust futtass a proxy `exec` **belsejében**, hogy egyetlen token-kiadásból menjen minden letöltés.

### 4. Gmail: szál megkeresése és beolvasása

1. `users/me/messages?q=<kereses>&maxResults=25` visszaadja az id/threadId párokat, tartalmat nem.
2. `users/me/messages/<ID>?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date` a fejlécekhez. Ezzel derül ki a küldő címe és a szál tárgya.
3. `users/me/threads/<THREAD_ID>?format=full` a törzshöz. A szöveg base64url-kódolva ül a `payload` `parts` fájában, rekurzívan kell bejárni a `text/plain` részekért.

## Buktatók

- **A `gg-mcp-proxy` wrapper egy kivezetett identitásra mutat.** A `/home/gg/.local/bin/gg-mcp-proxy` hardkódoltan a `marveen-bot-teszt.token`-t exportálja, és felülírja, amit env-ben adsz neki. A kommentje szerint ez szándékosan ugyanaz az identitás, amit a fő-ágens az MCP-hez használ, de ez 2026-08-08 óta nem igaz: a fő-ágens `.mcp.json`-ja azóta a `marveen.token`-re állt át, a wrapper nem követte. Ezért ad `401 unauthorized`-ot a portál jogosultság-feloldásán, és ezért adja ugyanezt a `marveen-main.token` is. Nem lejárat, hanem elárvult hivatkozás. A wrapper generált fájl (forrás: a gg-mcp repo `install-proxy.ts`-e), kézzel javítani felesleges, egy újratelepítés felülírná. Amíg nincs javítva, hívd közvetlenül a `dist/proxy.js`-t a saját token-fájloddal.
- **Jogosultság-mérésnél a `packs` tömb nem a teljes kép.** A tier NEVE megjelenik a `packs` utolsó elemeként, de az általa FEDETT csomagok nevei nem. Ezért a `"fejlesztoi" in packs` kérdés hamis NINCS-et adhat egy tökéletesen jó tokenre: a `superfejleszto` tier fedi a `fejlesztoi`-t, anélkül hogy kiírná. A helyes ellenőrzés a `tokenScope.tier`, a tényleges lefedettséget pedig a saját `gg_allowed_tools` kimenete mondja meg, annak a `nincs_jogod` ága megbízható. Két különböző ok adja ugyanazt a tünetet: a hiányzás lehet látszólagos (tier-fedés) vagy valós (a tier nem fedi). Ne keverd őket, és ne írj át egy jelentést az egyik alapján, ha a másik esete áll fenn.
- **A `q` paraméter idézőjeleit URL-kódolni kell** (`%27`), különben a Drive API 400-at ad vagy üres listát.
- **Nincs PIL és nincs ImageMagick a gépen.** Képet ne akarj átméretezni: a Read tool közvetlenül megnyitja a PNG/JPG-t, és maga skálázza.
- **Bájtra azonos duplikátumok.** Kreatív-csomagoknál gyakori az elgépelt nevű másolat. `md5sum *` a letöltés után kiszűri, mielőtt feleslegesen végignézed ugyanazt kétszer.
- **A scratchpad újraindításkor elvész.** Ami eredmény, az artifactba vagy a memóriába menjen, ne a `/tmp` alá.

## Ellenőrzés

- A listázás annyi fájlt ad vissza, amennyit a Drive felületén is látni? Ha kevesebbet, hiányzik a `supportsAllDrives`.
- Letöltés után `ls -la`: a néhány száz bájtos fájl nem kép, hanem JSON hibaüzenet.
- Gmail-nél a `resultSizeEstimate` és a visszakapott `messages` hossza eltérhet, lapozáshoz `nextPageToken` kell.
