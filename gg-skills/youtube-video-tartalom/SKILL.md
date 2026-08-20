---
name: youtube-video-tartalom
description: YouTube-videó tartalmának kinyerése (cím, csatorna, dátum, teljes leírás, fejezet-időbélyegek) a szerverről, ahol a YouTube bot-ellenőrzést kér. Triggerelődik - "írj cikket erről a videóról", "miről szól ez a podcast", YouTube-link feldolgozása, "Sign in to confirm you're not a bot", yt-dlp hiba, üres WebFetch YouTube-oldalon.
---

# YouTube-videó tartalmának kinyerése

## Mikor használd

Ha egy YouTube-linkről kell tudni, mi van benne: blogposzt, összefoglaló,
hírlevél, közösségi poszt készítéséhez.

## Eljárás

1. **Egress**: a `youtube.com` és a `youtu.be` fel van véve a
   `store/egress-allowlist.json`-ba (2026-08-19). Ha mégis tiltás jön, egészítsd
   ki a `domains` tömböt (ne írd felül).

2. **Alapadatok (cím, csatorna) — oEmbed, mindig működik:**
   ```
   WebFetch https://www.youtube.com/oembed?url=<urlencoded_watch_url>&format=json
   ```

3. **Teljes leírás + fejezetek + dátum — a watch-oldal `ytInitialData`-ja:**
   ```bash
   curl -s -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" \
     -H "Accept-Language: hu-HU,hu;q=0.9" "https://www.youtube.com/watch?v=<ID>" -o w.html
   ```
   majd Pythonból:
   ```python
   import re, json
   h = open('w.html', encoding='utf-8', errors='replace').read()
   d = json.loads(re.search(r'var ytInitialData\s*=\s*(\{.*?\});</script>', h, re.S).group(1))
   # rekurzív kereses: attributedDescription -> .content  = TELJES leiras + idobelyegek
   # videoPrimaryInfoRenderer -> title / dateText / viewCount
   ```
   A leírásban a fejezet-időbélyegek fejezetcímei önmagukban is jó vázat adnak
   egy cikkhez.

## Buktatók

- **A `ytInitialPlayerResponse` bot-ellenőrzés miatt üres**, de az `ytInitialData`
  ugyanabban a HTML-ben TELJES: cím, dátum, megtekintés, teljes leírás. Ne a
  `shortDescription`-t keresd (az a player-válaszban van, és hiányzik), hanem az
  `attributedDescription.content`-et.
- **A WebFetch a watch-oldalon csak a footert adja vissza** (JS-es oldal), ezért
  kell a nyers curl + parse. Az oEmbed viszont WebFetch-csel is jó.
- **A yt-dlp ezen a gépen nem jut át a bot-ellenőrzésen** ("Sign in to confirm
  you're not a bot"), semelyik `player_client` alternatívával sem, és nincs JS
  runtime (deno) sem. Telepítve van (`pipx install yt-dlp`, 2026-08-19), de
  feliratot csak cookie-val tudna letölteni. Ne ezzel kezdd.
- **Átirat (felirat) nincs**, tehát szó szerinti idézetet ne írj a videóból. A
  leírás + fejezetcímek alapján dolgozz, és ezt jelezd is a gazdádnak.

## Ellenőrzés

- Megvan a pontos cím, a csatorna neve, a megjelenés dátuma és a leírás
  utolsó sora is (nem csonkolt)?
- Ha fejezet-időbélyegek vannak, mind megvan az elejétől a végéig?
