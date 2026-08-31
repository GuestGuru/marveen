---
name: agens-iras-gazda-neveben
description: Az ágens a per-user brokeren át a GAZDA nevében ír külső rendszerbe (Linear, HelpScout, Slack, wiki), és ez betorzítja a gazda teljesítmény-mérését. A kötelező [AI: <agensnev>] prefix, a visszamenőleges szétválasztás, és mikor NE írj egyáltalán. Triggerelődik - Linear-komment vagy issue írása, HelpScout-válasz, Slack-üzenet a gazda nevében, TÉR-előkészítés, "hány kommentet írtam", "ki írta ezt".
---

# Írás a gazda nevében: a torzítás és a jelölés

## Mikor használd

- Bármikor, amikor a per-user brokeren át írsz külső rendszerbe: Linear-komment vagy
  issue, HelpScout-válasz, Slack-üzenet, wiki-oldal.
- Teljesítményértékelés (TÉR) előtti adat-tisztázásnál, amikor az a kérdés, hogy
  mennyi a gazda SAJÁT munkája.

## A tény, amiből minden következik

**A per-user broker a te írásodat a GAZDA szerzőségével rögzíti.** Nem „az ágens
írta a gazda helyett" -- a rendszer szerint a gazda írta. Ez mérve van:

- Linear `commentCreate` a marveen tokenjével -> a komment `user.name` mezője
  `Krasser Tamás` (2026-08-31, IT-583).
- salesninja mérése ugyanaznap: Antos Péter augusztusi **44 Linear-kommentjéből 18
  az ágensé volt**. A nyers szám **69%-kal felfelé torzított** volna a TÉR-ben.
  Május-július tiszta -- a torzítás pontosan akkor jelent meg, amikor a flotta beindult.

Ez tehát nem elméleti kockázat, hanem mért, és MINDEN ágensre áll, aki per-user
brokeren ír. A gazdád számai akkor is érintettek, ha te keveset írsz.

## Eljárás

### 1. Minden generált komment prefixe: `[AI: <agensnev>]`

Az ELSŐ karakterektől, kötelezően, egy sorban a szöveg elején:

```
[AI: marveen] A lint-only mód néma marad, a report nem viszi a lintBefore mezőt.
```

Gépi szétválasztás egyetlen mintával, minden ágensre:

```
^\[AI: ([a-z0-9-]+)\]
```

**Mérve 2026-08-31:** a Linear szerkesztője a szögletes zárójelet NEM bántja
(oda-vissza olvasva karakterre azonos, a regex fog). Ez nem magától értetődő, lásd
a Buktatókat.

### 2. A prefixbe SOHA ne tegyél dátumot

A rendszernek van `createdAt`-je, az a hiteles. Egy kézzel beírt dátum egy
szerkesztés után hazudni fog. A prefix azt mondja meg, KI írta; az időt bízd a
rendszerre. (salesninja pontosítása, és igaza volt: a saját korábbi formátumai
dátumot vittek.)

### 3. Ami MÁR kiment, azt a mintájával kell dokumentálni

A prefix bevezetése előtti kommentek visszamenőleg csak akkor választhatók le, ha
a régi minták fel vannak írva. Minden ágens sorolja fel a sajátjait ide:

| Ágens | Minta | Darab | Időszak |
|-------|-------|-------|---------|
| salesninja | `TER-statusz, rogzitve <datum>-an a GG Tracker adatai alapjan.` | 11 | 2026-08-06 |
| salesninja | `## Adatfrissites es forrasellenorzes, <datum>` | 1 | 2026-08-13 |
| salesninja | `TER-takaritas, <datum>.` | 2 | 2026-08-31 |
| salesninja | `Lezaro statusz, <datum> (Antos Peter).` | 4 | 2026-08-31 |
| marveen | (nincs komment-minta; két ISSUE: IT-482, IT-583, mindkettő kérésre) | 2 | 2026-08-09, 08-29 |

**Ha a te ágensed hiányzik innen, a gazdád számai visszamenőleg nem tisztíthatók.**
Írd fel, mielőtt elfelejted, melyik formátumot használtad.

### 4. Mérd meg a saját lábnyomodat, ne becsüld

```graphql
{ comments(filter:{user:{email:{eq:"<gazda email>"}},
                   createdAt:{gte:"2026-08-01T00:00:00Z"}}, first:250){
    nodes{ createdAt body issue{identifier} } } }
```

⚠️ A `first` PLAFON, nem összeg: ha 250-et kapsz vissza, az alsó korlát, nem a
teljes szám. Ezt mondd is ki, különben a jelentésed egy plafont ad ki tényként.

## Buktatók

- 🔴 **A Linear szerkesztője ÁTÍRJA a beküldött markdownt, és nem lehet kikapcsolni.**
  Mérve 2026-08-13 (MAR-148): a `-` listajel `*`-ra vált, és minden csupasz URL
  linkké alakul. A `[AI: nev]` prefix átment (2026-08-31), mert a szögletes zárójelet
  nem követi `(`, tehát nem nézi linknek -- de **egy formátum-váltás előtt mindig
  írj egy éles teszt-kommentet és olvasd vissza**, ne a szabályból következtess.
  Ha egy jövőbeli verzió mégis bántaná, a zárójel nélküli `AI: <nev> --` alak
  ugyanúgy fogható.
- 🔴 **Az issue LÉTREHOZÁSA más súlyú, mint a komment.** Ha a gazda KÉRTE, hogy
  vegyél fel egy jegyet, az az ő döntése és az ő munkája -- a jegy jogosan az övé.
  A komment viszont tartalmi hozzájárulásnak látszik. Ezért a prefix a kommenten
  kötelező, az issue-nál elég, ha a leírás megmondja, ki kérte.
- 🔴 **A saját naplód hiánya nem bizonyíték arra, hogy nem írtál.** Ha azt
  jelented, hogy „nulla kommentem van", mondd meg, MIRE alapozod (napló, audit,
  API-lekérdezés), mert a három más-más lefedettségű. Az audit-napló például a
  shell-úton menő Linear-írást NEM látja: ott csak a `gg_secret_get — linear`
  kulcskiadás jelenik meg, maga a mutáció nem.
- **A `createdIssues` szűrő némán üreset adhat.** 2026-08-31: a
  `user(id){createdIssues(filter:{createdAt:...})}` nulla issue-t adott, miközben
  ugyanaz a felhasználó bizonyítottan létrehozott jegyeket. A működő alak a gyökér
  `issues(filter:{creator:{email:{eq:...}}, createdAt:{gte:...}})`. Üres eredménynél
  tehát előbb a LEKÉRDEZÉST gyanúsítsd, ne a valóságot.
- **Ne írj oda kommentet, ahol nem kell.** A torzítás legolcsóbb kezelése az, ha
  nem keletkezik: a státusz-összefoglalók helye a jelentés a gazdának, nem a
  Linear-szál. Kommentet akkor írj, ha valaki MÁS is olvasni fogja ott.

## Ellenőrzés

- Minden általad írt komment első karakterei: `[AI: <sajat nev>]`.
- A visszaolvasott `body` regexre illeszkedik (`^\[AI: ([a-z0-9-]+)\]`), nem csak
  az elküldött szöveg.
- A régi mintáid szerepelnek a fenti táblázatban.
- Ha lábnyomot jelentesz, a szám mellett ott van a forrás és a plafon-figyelmeztetés.
