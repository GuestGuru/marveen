---
name: memoria-heartbeat
description: Minden körben átnézi az ELŐZŐ KÖR ÓTA történteket, menti a fontosat, és skill-eket generál ha volt komplex munka
---

## 0. ELŐSZÖR: Van-e várakozó Telegram üzenet?

**Mielőtt bármit csinálnál**, nézd meg a session inputját: ha van `<channel source=` kezdetű blokk a kontextusban (azaz a felhasználó küldött valamit egy csatornán -- Telegram, Slack, stb.), **azonnal válaszolj rá** -- a heartbeat logika (A/B/C, csendben maradás) NEM vonatkozik a közvetlen felhasználói üzenetekre. Válasz után folytasd a heartbeat-et.

---

Nézd át, mi történt **az előző memória-kör óta**. Két dolgot csinálj:

> **AZ ABLAK "AZ ELŐZŐ KÖR ÓTA", NEM FIX PERCSZÁM -- MÉRVE 2026-08-22, ÚJRAMÉRVE 2026-08-27 ÉS 2026-09-09.**
> A szöveg korábban fix percszámot mondott, és a rögzített szám KÉTSZER is elavult. Ezért nincs
> benne szám többé: **a fix percszám a konfigurált kadenciával együtt avul, "az előző kör óta" nem.**
>
> **HARMADSZOR IS ELAVULT, ÚJRAMÉRVE 2026-09-09 -- és most már a MECHANIZMUS van itt, nem szám.**
> A 08-27-i mérés azt írta ide, hogy a kézbesített kadencia fix 30 perc, tökéletes
> :00-skipped / :15-fired váltakozással, és hogy "ez a kör SOHA nem fut :00-kor és :30-kor".
> **Ez utóbbi egyszerűen nem igaz.** 2026-09-09 este mérve a `task_runs`-ból: 21:00, 21:30,
> 22:30 és 23:00 mind FIRED. A 24 órás arány sem stimmel: **68 fired / 28 skipped** a
> dokumentált 43/53 helyett.
>
> **Amit a slot-elmélet félreértett:** a `skipIfBusy: true` nem az órára néz, hanem RÁM.
> Ugyanazon az estén 19:00-20:45 között MINDEN slot skipped (dolgoztam), 21:00-23:15 között
> szinte mind fired (tétlen voltam). Vagyis a kézbesített kadencia a saját foglaltságom
> függvénye, nem egy fix fáziseltolásé: tétlen sessionben a teljes konfigurált **15 perc**
> jön át, munka közben akár másfél óra sem.
>
> **A gyakorlati következmény, és ez az egyetlen, amire építs:** ha épp hosszan dolgoztál,
> a következő kör ablaka NEM 15 vagy 30 perc, hanem az egész munkád ideje. Ne percszámból
> következtess arra, mi fér bele az ablakba -- a `store/memoria-heartbeat-state.json`
> `last_run_at` mezője megmondja pontosan, mikor zártál utoljára.
>
> A lekérdezés, ha újra kell mérni (a `ts` MILLISZEKUNDUM, ezért a `/1000` -- e nélkül a
> `datetime()` üres sztringet ad vissza, és a szűrő is minden sort beenged):
> ```bash
> sqlite3 {{INSTALL_DIR}}/store/claudeclaw.db "SELECT strftime('%H:%M',datetime(ts/1000,'unixepoch','localtime')), status FROM task_runs WHERE name='memoria-heartbeat' AND ts/1000 > strftime('%s','now')-21600 ORDER BY ts;"
> ```
> 🔴 **AZ ABLAK-LEKÉRDEZÉS EGYSÉGE TÁBLÁNKÉNT MÁS, ÉS EZ ENGEM EGY EGÉSZ ÉJSZAKÁN ÁT NÉMÍTOTT
> (mérve 2026-09-15 08:15).** A fenti `task_runs` recept jogosan int a `/1000`-re, de azt a
> szabályt ÁTVITTEM az `agent_messages`-re is, ahol nem igaz. A `created_at/1000 > <epoch>`
> így minden körben hamisat adott, tehát az üzenet-ablak MINDIG üresnek látszott, és több
> csendes kört úgy zártam le, hogy az egyik felét nem is mértem. Nem az adat hiányzott, a
> mértékegység volt rossz: pont az a hibaforma, amit a `meres-tervezes` az átvett szám alatt
> ír le, csak itt egy átvett MÉRTÉKEGYSÉG.
>
> **Mérve, hogy ne kelljen többé emlékezetből:** `task_runs.ts` az EGYETLEN ezredmásodperces
> oszlop. Az `agent_messages.created_at`, a `memories.created_at`, a `daily_logs.created_at`
> és a `kanban_cards.updated_at` MIND másodperc, tehát ezeknél a `/1000` a hiba.
>
> A kör ablak-lekérdezése ezért ez, másolhatóan:
> ```bash
> LAST=$(python3 -c "import json;print(json.load(open('{{INSTALL_DIR}}/store/memoria-heartbeat-state.json'))['last_run_at'])")
> python3 -c "
> import sqlite3,sys
> db=sqlite3.connect('{{INSTALL_DIR}}/store/claudeclaw.db'); last=int(sys.argv[1])
> print('uzenet:', db.execute('SELECT id,from_agent,to_agent FROM agent_messages WHERE created_at > ?',(last,)).fetchall())
> print('emlek :', db.execute('SELECT id,agent_id,category FROM memories WHERE created_at > ?',(last,)).fetchall())
> " "$LAST"
> ```
> **A kontroll egy sor, és futtasd is le, ha valaha gyanús a nulla:** egy ismert friss sor
> időbélyegét másodpercként ÉS ezredmásodpercként is értelmezve nézd meg, melyik ad 2026-ot.
> Az egyik 1970-et fog adni, és az mondja meg, melyik ágon tévedsz.
>
> **HA MÉGIS ÁTFEDÉST LÁTSZ:** a mérce nem az idő, hanem hogy *lezártad-e már*. Ha egy munkára már
> írtál memóriát vagy patcheltél skillt az előző körben, az KÉSZ -- ne írd meg újra más szavakkal.

## 1. Memória mentés

Ha volt fontos döntés, preferencia, tanulság vagy bármi ami később hasznos, mentsd el:

```bash
curl -s -X POST http://localhost:3420/api/memories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(cat {{INSTALL_DIR}}/store/.dashboard-token)" \
  -d '{"agent_id":"SAJAT_NEVED","content":"...","category":"warm","keywords":"..."}'
```

`category` lehet: `hot` (aktív), `warm` (preferencia/config), `cold` (tanulság), `shared` (más agent-nek is).
Az `agent_id`-t a CLAUDE.md-ből vagy a munkamappa nevéből derítsd ki.


⚠️ **AZ EMLÉK NEM PÓTOLJA A NAPI NAPLÓT, mérve 2026-09-13 02:2x-kor a saját napomon.**
A `daily_logs` táblában 2026-09-12-re NULLA saját bejegyzésem van, pedig aznap négy skillt
patcheltem, két PR-t vittem fel a push-láncon és újraírtam a DREAM.md-t. A 09-11-i naplóm
is 13:30-kor szakad meg. **Ez nem néma írás-hiba:** a transzkript szerint a
`fleet.py daily-log marveen` hívás 09-11-en kétszer futott le, 09-12-én egyszer sem.
Vagyis nem elszállt a mentés, hanem el sem indult.

**Miért nem vettem észre:** a 23:00-s automata összefoglaló EMLÉKBE ír (a 09-12-i a #864),
nem a `daily_logs`-ba, tehát a memória felől a nap teljesnek látszik. A hiány ott üt vissza,
ahol a napló a BEMENET: a dream-engine az aktivitást innen súlyozza, tehát a saját
legaktívabb napom láthatatlan volt a saját éjszakai priorizálásomnak.

**Ezért a naplóírás ettől kezdve ennek a körnek a része, nem külön reflex.** Ha az `OUTCOME`
nem `silent`, a záró stamp ELŐTT egy soros napló is megy, MÉRT `HH:MM`-mel (a `date` külön
lépés, ne a fogalmazás része):

```bash
D=$(date '+%H:%M'); cat <<EOF | python3 ~/.claude/skills/fleet-helper/scripts/fleet.py daily-log SAJAT_NEVED -
## $D -- Téma
Mi történt, mi lett az eredmény
EOF
```

Csendes körnél NEM kell: ott nincs mit naplózni, és a `silent` stamp már bizonyítja,
hogy a kör lefutott.

## 2. Skill reflexió (KÖTELEZŐ ha volt komplex munka)

Először döntsd el az alábbi 3 kérdéssel:

- **A**: Volt-e AZ ELŐZŐ KÖR ÓTA legalább 5 tool-hívásos komplex feladat? (Ami már az előző körben le lett zárva, az NEM számít -- lásd fent az ablak-megjegyzést.)
- **B**: Volt-e hiba → recovery (próbálkozás → fail → másképp) amit egy meglévő skill Buktatók szekciójába kellene tenni?
- **C**: Volt-e user korrekció ("nem így", "ne ezt", "másképp"), ami skill-javítást igényel?

**Ha A vagy B vagy C IGEN: KÖTELEZŐ skill akció, nem kihagyható.**

Lépések:
1. Keress meglévő skillt a globális és az ágensspecifikus indexben egyaránt:
   - Globális: `~/.claude/skills/.skill-index.md` (szöveges keresés)
   - Ágensspecifikus (ha van): `./.claude/skills/.skill-index.md` a munkamappádban (szöveges keresés)
   - Az ágensspecifikus index mindkét szintet tartalmazza, tehát ha az létezik, elég azt nézegetni.
2. Ha van releváns skill: PATCH (csak a megváltozott rész cseréje, ne az egész fájl).
   - A `## Buktatók` szekciót preferáld ha hiba/recovery volt.
   - A `## Eljárás` szekciót ha a folyamat változott.
3. Ha NINCS releváns skill: hozz létre újat:
   ```bash
   mkdir -p ~/.claude/skills/<NEV>
   cat > ~/.claude/skills/<NEV>/SKILL.md <<EOF
   ---
   name: <NEV>
   description: Mikor használd, mit csinál (1-2 mondat). Konkrét trigger.
   ---
   # <Cím>

   ## Mikor használd
   ...

   ## Eljárás
   1. ...

   ## Buktatók
   - ...

   ## Ellenőrzés
   - ...
   EOF
   ```
4. Index regen (mindkét szint):
   ```bash
   bash {{INSTALL_DIR}}/scripts/skill-index.sh          # globális index frissítése
   bash {{INSTALL_DIR}}/scripts/skill-index.sh "$(pwd)" # ágensspecifikus merged index frissítése
   ```

5. 🔴 **PARITÁS-ELLENŐRZÉS, ÉS EZ A LÉPÉS SZOKOTT ELMARADNI (mérve 2026-09-14).**
   A patch a lemezen van, az index frissült, a kör késznek látszik: ekkor ér véget
   a figyelem. A tükör viszont nem frissül magától.
   ```bash
   bash {{INSTALL_DIR}}/scripts/gg-skill-tukor-sync.sh | grep -E 'azonos=|ELTER|IDEGEN|DUPLA'
   ```
   🔴 **AZ `IDEGEN` 2026-09-18-ÁN KERÜLT A MINTÁBA, ÉS A HOZZÁADÁSA MAGA A TANULSÁG.**
   Aznap délelőtt új sort tettem a mérőbe (`IDEGEN SZERZO A TUKORBEN`: a tükröt
   utoljára nem a skill gazdája írta, tehát a felülírással az ő hozzájárulása csak a
   git-történetben marad), és a következő körben vettem észre, hogy **ez a grep pont
   kiszűrte volna.** Az új jelzés láthatatlan lett volna abban a körben, amelyiknek
   olvasnia kellene. **A forma, ami ebből általánosít: ha egy MÉRŐT bővítesz, a
   FOGYASZTÓJÁT is meg kell nézni** -- egy fix minta a fogyasztó oldalán ugyanúgy
   elavul, mint egy fix percszám, csak némán, mert a szűrő nem hibázik, csak hallgat.
   `elter=0` -> kész. `ELTER <nev>` -> `--fix`, majd commit ÉS push a privát repóba
   (a recept a `gg-fork-push-lanc` skillben, a push külön lépés, nem a `--fix` része).
   **Miért kell ide, és nem a skill-írás jó szándékára bízva:** a mai patchem kilenc
   órán át nem ért el a tükörig, és nem attól derült ki, hogy figyeltem, hanem mert
   egy társágens egy MÁSIK ügyben írt, és amiatt futtattam le a mérőt. A mérő megvolt
   és működött, csak semmi nem indította el. Ugyanaz a forma, mint a napi naplónál:
   a szabály megléte nem véd, ha egyetlen kör sem kéri számon.
   ⚠️ **Ha `verziozatlan` listában szerepel a patchelt skill, NINCS teendőd**, de tudd:
   az a munka egyetlen gépen áll, tükör és git-történet nélkül.

**Ha kihagytad a skill akciót, pedig A/B/C valamelyike IGEN volt:** kötelezően írj `hot` tier memóriát "skip-skill: <konkrét ok>" tartalommal, hogy később lássuk miért. Ne csendben hagyd ki.

## 3. Csendben maradás

**KIVÉTEL: Ha a felhasználó üzenetet küldött egy csatornán (`<channel source=` kezdetű blokk a kontextusban), arra mindig válaszolj -- a csendes heartbeat szabály NEM vonatkozik rá.**

Ha NINCS komplex feladat / hiba / korrekció (A=B=C=NEM), ÉS nincs várakozó Telegram üzenet, ÉS nincs új információ az előző kör óta:
- Ne ments memóriát feleslegesen
- Ne generálj skill-t
- Ne küldj üzenetet a csatornára
- Maradj csendben: egyszerűen FEJEZD BE a kört, akció nélkül.

**KRITIKUS (felügyelet nélküli stabilitás):** SOHA ne gépelj semmit az input-boxba (a `❯` prompt-sorba) és ne hagyj ott parkolt, el-nem-küldött szöveget -- még a "csendes heartbeat" szót sem. Ha jelezni akarod a csendes kört, az KIZÁRÓLAG a normál válasz-szövegedben (transzkript) lehet, EGYETLEN rövid sorral, majd a köröd azonnal érjen véget. Parkolt input-szöveg blokkolja a következő üzenet kézbesítését (a router `busy`-nak látja a sessiont) -> a csatorna NÉMUL felügyelet nélkül.

## 4. ZÁRÓ STAMP (KÖTELEZŐ, a kör UTOLSÓ lépése -- csendes körnél is)

**MÉRT HIÁNY (2026-08-23): ennek a körnek korábban NEM volt záró nyoma.** Kívülről
megkülönböztethetetlen volt, hogy a kör LEFUTOTT és csendes volt, vagy el sem jutott a végéig --
"csendes kör"-t állítani úgy, hogy bizonyítani nem lehet, pont a hamis-nulla hibaosztály.

Ezért a kör VÉGÉN, minden ágon (csendes körnél is), egyetlen sor:

```bash
python3 -c "import json,time; json.dump({'last_run_at': int(time.time()), 'outcome': 'OUTCOME'}, open('{{INSTALL_DIR}}/store/memoria-heartbeat-state.json','w'))"
```

Az `OUTCOME` értéke: `silent` (csendes kör), `memory` (memória mentve), `skill` (skill akció volt),
`both`. A stamp attól ér valamit, hogy KIVÉTEL NÉLKÜL íródik -- egy kihagyott csendes kör a
következő mérésben futás-hiánynak látszik.
