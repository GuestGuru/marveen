---
name: flotta-hasznalat-riport
description: Kimutatás arról, hogy a kollégák mennyit, mire és milyen API-költséggel használták a saját ágensüket, illetve mit NEM tudott az ágens megcsinálni. Triggerelődik - "mennyit használták a botjukat", "mire használják a kollégák", "mennyibe került volna", "volt-e olyan amit nem tudott megcsinálni", flotta-aktivitás vagy adoption-riport kérése.
---

# Flotta-használat riport (ki, mennyit, mire, mennyiért, mi akadt el)

## Mikor használd
- Tamás azt kérdezi, mennyit és mire használták a kollégák az ágensüket.
- Adoption-kép kell: melyik ágens napi munkaeszköz, melyik alszik.
- Költség kell: "mennyibe került volna API-áron".
- Akadály-lista kell: "mit nem tudott megcsinálni, amit kértek".

## A három adatforrás és a szerepük
Minden a `store/claudeclaw.db`-ben van (cwd KÖTELEZŐEN `/home/gg/marveen`, lásd Buktatók).

| Tábla | Mire jó | Korlát |
|---|---|---|
| `daily_logs` (`agent_id, date, content`) | **a "MIRE"** -- ez az egyetlen forrás, ami emberi mondatban leírja a leszállított munkát | csak amit az ágens beírt; a bejegyzések száma jó proxy a munkadarabokra |
| `token_usage` (`agent, timestamp, input/output_tokens`) | **a "MENNYIT"** -- hívásszám, tokentömeg, aktív napok, utolsó aktivitás | benne van a heartbeat-zaj is |
| `conversation_log` | a nyers csatorna-átirat | **CSAK a fő-ágensre van** (a ledger-capture hook a repo gyökér `.claude/settings.json`-jában ül, az `agents/*/` alattiakban nincs) -- sub-ágens használat mérésére ALKALMATLAN |

Tulajdonos-hozzárendelés: `agents/<nev>/agent-config.json` -> `.owner`.

## Eljárás
1. Mennyiség ágensenként és naponta:
   ```bash
   cd /home/gg/marveen && python3 -c "
   import sqlite3; db=sqlite3.connect('store/claudeclaw.db')
   for r in db.execute(\"\"\"SELECT agent, date(timestamp,'unixepoch','localtime') d, COUNT(*), SUM(input_tokens+output_tokens)
     FROM token_usage WHERE timestamp > strftime('%s','now','-7 days') GROUP BY agent,d ORDER BY agent,d\"\"\"): print(r)
   "
   ```
2. Munkadarab-szám ágensenként/naponta a `daily_logs`-ból, majd a tartalom kiolvasása (200-400 karakter elég a témához).
3. Tulajdonosok: `for a in agents/*/; do jq -r '.owner' $a/agent-config.json; done`.
4. A riport ágensenként: *ágens, tulajdonos* / hívásszám + token + aktív napok / 3-5 mondat arról, MIRE ment, konkrét issue-számokkal és mért eredménnyel.
5. Zárásnak egy mintázat-sor: kinél napi munkaeszköz, kinél projektlöket, ki nem használja.

## Költség-számítás (ha "mennyibe került volna" a kérdés)
A `token_usage` négy oszlopa kell: `input_tokens`, `output_tokens`, `cache_read_tokens`,
`cache_creation_tokens`, **modellenként bontva** (`GROUP BY agent, model`).

Listaár USD / 1M token (2026-08 állapot, a `claude-api` skillből, ne fejből):

| modell | input | output | cache-olvasás (0,1x) | cache-írás (1,25x, 5 perces) |
|---|---|---|---|---|
| claude-opus-5 | 5 | 25 | 0,50 | 6,25 |
| claude-sonnet-5 | 3 (bevezető 2 / 2026-08-31-ig) | 15 (10) | 0,30 (0,20) | 3,75 (2,50) |

- **Mondd ki, hogy ez NEM valós számla.** Előfizetésen futunk; ez az, amennyit
  token-alapon fizettünk volna. E nélkül a szám félrevezet.
- **A cache-olvasás viszi a költség ~90%-át**, nem az új gondolkodás. Ezt írd le,
  mert ez adja a valódi tanulságot: a hosszú, újra nem induló sessionök drágák,
  nem a sokat dolgozó kollégák.
- Óránál hosszabb (1h TTL) cache-írás 2x, nem 1,25x. A teljes összeg pár százaléka,
  de ha pontos számot kérnek, jelezd a bizonytalanságot.

## Akadály-audit (ha "mit nem tudott megcsinálni" a kérdés)
Nem elég a `daily_logs`: a kudarcok többsége a `memories`-ben van részletesen.
Mindkettőt szűrd kulcsszóra:

```
nem tud / nem siker / blokk / tilt / hiányz / hianyz / jogosults / 401 / 403 /
nincs hozzáfér / nem lehet / elakad / akadály / AKADALY / nem megy / korlát
```

Csoportosítsd a találatokat, mert négy különböző dolog néz ki egyformán:
1. **Nincs meg az adat** (a súlyos: külső beszerzési vagy döntési kérdés).
2. **Hozzáférés hiánya induláskor** (új ágens, nincs még token -- nem hiba, a
   beléptetés része, de a kolléga kudarcként éli meg).
3. **Tartósan hiányzó jogosultság** (mérve, nem feltételezve).
4. **Amit tudott volna, de nem volt szabad** (jóváhagyásra várt, más scope-jába
   nem nyúlt) -- ez NEM kudarc, mondd is ki, különben szabálysértésnek látszik.

A végén keresd meg a KÖZÖS OKOT. Ha egy akadály két ágensnél és négy napon át
ugyanaz, az nem ágens-probléma, hanem nyitott döntés -- azt nevesítsd, és
ajánlj rá lezárást.

## Buktatók
- **A `conversation_log`-ból ne vonj le következtetést a flottára.** Ha csak a fő-ágens és egy-két véletlen sor van benne, az NEM azt jelenti, hogy a többiek nem beszélgettek: a hook nincs telepítve náluk. Ezt mérd meg (`SELECT agent_id, COUNT(*) ... GROUP BY agent_id`), mielőtt "nem használta" következtetést írnál.
- **A napi ~13:39-es token_usage sorok heartbeat-ek, nem munka.** Több ágensnél PONTOSAN egy időben jelennek meg, 1-2 hívás, pár száz token. Az "utolsó aktivitás" ezekből hamis: az utolsó VALÓDI munkát a `daily_logs` utolsó bejegyzése adja.
- **Rossz cwd = üres DB.** A `sqlite3.connect('store/claudeclaw.db')` nem hibázik rossz könyvtárból, hanem üres DB-t hoz létre, és a riport némán "senki nem használta"-t mond. Mindig `cd /home/gg/marveen` először.
- **Az `approvals` tábla időoszlopa `requested_at`, NEM `created_at`.** A memóriától
  és a többi táblától eltér; `created_at`-tal a lekérdezés `OperationalError`-ral
  hasal el. (2026-08-14-en beleszaladtam.)
- **Az árakat a `claude-api` skillből vedd, ne fejből.** A modellárak és a
  bevezető kedvezmények változnak, a fejből írt ár néma hiba a riportban.
- **Ne közölj puszta tokenszámot.** A kérdés "mire" fele a fontosabb; a szám csak keret. Minden ágenshez adj konkrétumot (issue-szám, mért eredmény), különben a riport használhatatlan.

## Ellenőrzés
- Minden élő ágens szerepel a riportban, a nulla-használatúak is, kimondva.
- A "mire" mondatok a `daily_logs`-ból származnak, nem találgatásból.
- Az utolsó valódi aktivitás a daily_logs szerint van megadva, nem a token_usage szerint.
