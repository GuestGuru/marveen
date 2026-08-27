---
name: beragadt-agens-panel
description: Egy flotta-ágens bemenete beragadt (az őr riaszt, hogy az auto-recovery nem szabadította ki, és kézi restartot javasol), vagy egy ágens "nem válaszol" pedig fut. Diagnózis a panelből és a naplóból, majd a legkisebb beavatkozás -- szinte soha nem restart.
---

# Beragadt ágens-panel: mit csinálj a riasztás után

## Mikor használd

- `⚠️ A(z) <nev> agens bemenete beragadt es az auto-recovery ... nem szabaditotta ki.
  Valoszinuleg kezi restart kell` típusú riasztás.
- Egy ágens fut (tmux session él, processz megvan), de "nem válaszol" egy elküldött
  inter-agent üzenetre vagy csatorna-üzenetre.
- Egy `agent_messages` sor `delivered`, de a címzett viselkedéséből látszik, hogy sosem
  dolgozta fel.

## Eljárás

1. **Nézd meg a panelt, mielőtt bármit teszel.** A riasztás javaslata (restart) a
   LEGDRASZTIKUSABB lépés, és általában szükségtelen:
   ```bash
   tmux capture-pane -p -t agent-<nev> -S -60 | tail -40
   ```
   Amit keresel: a `❯` promptsorban parkoló szöveg. Ha ott ül egy üzenet, a Claude nem
   halott, csak a submit maradt el.
2. **Azonosítsd, MI parkol ott.** Ha inter-agent üzenet (`</untrusted>`, `[Uzenet @...`),
   keresd meg a sort, hogy tudd, mi veszne el:
   ```bash
   python3 -c "
   import sqlite3
   db=sqlite3.connect('/home/gg/marveen/store/claudeclaw.db'); db.row_factory=sqlite3.Row
   for r in db.execute(\"SELECT id,from_agent,to_agent,status,datetime(delivered_at,'unixepoch','localtime') t,length(content) n FROM agent_messages WHERE to_agent=? ORDER BY id DESC LIMIT 5\", ('<nev>',)):
       print(dict(r))"
   ```
3. **Egyetlen Enter.** Ez a helyes első lépés, nem a restart:
   ```bash
   tmux send-keys -t agent-<nev> Enter
   sleep 4; tmux capture-pane -p -t agent-<nev> -S -25 | tail -25
   ```
   Sikeres, ha a promptsor kiürül és a panel dolgozni kezd (`✽ ...`). Az üzenet
   HIÁNYTALANUL megy el: a doboz a teljes szöveget tartalmazza akkor is, ha a képernyőn
   csak a vége látszik.
4. **Ha az Enter nem vitte el**, nézd meg, mit gondolt az őr, mielőtt feladta:
   ```bash
   grep -iE "stuck-input|parked|Stuck input" /home/gg/marveen/store/dashboard.log | tail -20
   ```
   A napló megmondja, melyik ágon állt meg (`hold`, `reinject-plain`, `clear-scheduled`),
   és ez adja a valódi hibát -- nem a riasztás szövege.
5. **Restart csak akkor**, ha a panel tényleg halott (nincs `claude` processz, vagy a
   promptsor nem reagál semmire). Ilyenkor `POST /api/agents/<nev>/restart`. A restart
   folytatja a beszélgetést, de a parkoló üzenet elveszik -- ezért van a 2. lépés.

## Buktatók
- 🔴 **A `possibly a human draft` védelem a FŐ-ÁGENSNÉL fogva tarthat.** Az őr, ha
  parkolt inputot lát, ezt naplózza: *„Stuck-input restart deferred, parked input
  still recoverable or possibly a human draft"* -- vagyis LÁTJA a beragadást, de nem
  állít helyre, nehogy elvegye a gazda félig gépelt üzenetét. Sub-ágensnél ez helyes.
  A fő-ágensnél viszont azt jelenti, hogy **a helyreállítás emberi jelenlétet
  feltételez**, és ha a gazda alszik, a beragadás órákig tart.
  2026-08-25: a 03:00-s auto-restart lefutott, a session utána beragadt, és az őr
  hajnali háromtól **06:50-ig halogatta** a helyreállítást. Tamás Ctrl-C-je oldotta
  fel (`KEYS INJECTION ACCEPTED`), a rendes restart 06:58-kor jött, második
  nekifutásra. **A javítás iránya:** a parkolt szöveg EREDETÉT kell nézni. Ha a saját
  routertől jött (inter-agent üzenet, ütemezett prompt), az nem emberi piszkozat,
  tehát helyreállítható; csak a valóban kívülről gépelt szöveget kell kímélni.
- 🔴 **A beragadás bizonyítékát NE a beavatkozás UTÁN gyűjtsd.** Ugyanaznap ebbe is
  belefutottam: a `tmux capture-pane`-t azután néztem meg, hogy a gazda már
  kiszabadított, üres input-boxot láttam, és ebből azt következtettem, hogy sosem
  volt parkolt szöveg. Ráadásul a napló `pane is busy` sorait „épp dolgozom"-nak
  olvastam, holott „be vagyok ragadva" volt. **Az élő pane állapota csak arról szól,
  ami MOST van; ami VOLT, azt a napló időrendje mondja meg.** Ha egy jelenség már
  megszűnt, a diagnózis kizárólag napló-alapú lehet, és mondd is ki, hogy utólagos
  rekonstrukció.

- **A riasztás "kézi restart kell" javaslata félrevezető.** 2026-08-12: jean panelébe egy
  911 karakteres átadás ragadt be, az őr ötször eszkalált, majd restartot javasolt.
  EGYETLEN Enter megoldotta, az üzenet hiánytalanul elment, jean 53 mp alatt megválaszolta.
  A restart itt kontextust dobott volna el a semmiért.
- **A csonka LÁTVÁNY nem csonka TARTALOM.** A TUI a túl magas input-doboznak csak a
  VÉGÉT rajzolja ki. Aki a képernyőt olvassa (ember és recovery-kód egyaránt), azt hiszi,
  az üzenet fele elveszett -- pedig a bufferben ott a teljes szöveg. Ezért volt helyes az
  Enter, és ezért lett volna HIBÁS a látott töredék újraküldése.
- **Emiatt a `hold` ág 2026-08-12 előtt zsákutca volt.** A `decideStuckInputAction` a
  multi-row + csonkának hitt dobozra `hold`-ot adott, aminek nincs saját lépése: kézi
  billentyűre vár, ami felügyelet nélkül soha nem jön. A javítás
  (`src/gg/stuck-input-queue-reinject.ts`) a `hold` előtt megkeresi a queue-ban a
  ténylegesen kikézbesített sort, és AZT injektálja újra a router saját wrapperén át.
  Ha ilyen riasztást látsz mostantól, előbb nézd meg, hogy a queue-mentés lefutott-e:
  `grep "reinject-queued\|head-lost inter-agent frame" store/dashboard.log`.
- **`delivered` státusz nem jelenti, hogy az ágens LÁTTA.** A router akkor is
  `delivered`-re állítja a sort, ha a szöveg a promptsorban parkol. Néma hibaosztály:
  két ágens várhat egymásra örökké, és a queue szerint minden rendben.
- **Ne írj a promptsorba diagnózis közben.** Ha te hagysz ott parkolt szöveget, a router
  `busy`-nak látja a sessiont, és a következő üzenet kézbesítése is elakad -- pont azt a
  hibát gyártod, amit javítani jöttél.

## Ellenőrzés

- `tmux capture-pane -p -t agent-<nev> -S -5` -> a `❯` sor üres.
- A panel dolgozik vagy kész választ mutat, és a válasz az elakadt üzenetre szól.
- `agent_messages` sor sorsa látszik: vagy `done`, vagy a címzett érdemben válaszolt.
- Restart esetén: `tmux ls` mutatja az új session-időt, és a beszélgetés folytatódott.
