---
name: agens-iras-gazda-neveben
description: Az ágens a per-user brokeren át a GAZDA nevében ír külső rendszerbe (Linear, HelpScout, Slack, wiki), és ez betorzítja a gazda teljesítmény-mérését. A kötelező [AI: <agensnev>] marker (a szöveg VÉGÉN), a visszamenőleges szétválasztás, és mikor NE írj egyáltalán. Triggerelődik - Linear-komment vagy issue írása, HelpScout-válasz, Slack-üzenet a gazda nevében, TÉR-előkészítés, "hány kommentet írtam", "ki írta ezt".
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

🔒 **EZ A SKILL NÉVVEL NEVEZETT KOLLÉGÁK TELJESÍTMÉNY-ADATÁT TARTJA (a fenti 44/18-as
bontás, és lejjebb a minta-táblázat ágensenkénti darabszámai), ÉS A PUBLIKUS
`GuestGuru/marveen` FORK `seed-skills/` ÁGÁN ÉL, ahol minden sor világolvasható, a git
history visszamenőleg is.** salesninja mérése, 2026-09-15: titok, adószám, telefonszám,
cím és e-mail nulla, teljes név két kollégáé, három-három előfordulással.
**Ami itt a kockázat, az nem a NÉV, hanem a név MELLETT álló teljesítmény-szám** -- a
gg-fork-push-lanc értékalapú szűrője ezt elvileg sem fogja, mert nem személyesadat-ALAKÚ
érték, hanem egy hétköznapi kéttagú szám egy táblázatban.
⚠️ **A „már benne volt" NEM felmentés a bővítésre** (ugyanaz a forma, mint a
gg-fork-push-lanc „van már egy zár benne" buktatója): aki ide ír, az a meglévő
kitettséget NÖVELI, nem örökli. **Új példát névvel ne vigyél be**; a meglévőkre a döntés
a gazdáké, és nyitott. Ha egy mérést mindenképp ide kell írni, a szerepet nevezd meg
(„a gazda", „egy kolléga"), ne a személyt.

## Eljárás

### 1. Minden generált szöveg markere: `[AI: <agensnev>]`

🔴 **A MARKER MINDIG A SZÖVEG VÉGÉN ÁLL, külön sorban, üres sorral elválasztva.
Nincs kivétel.**

```
A lint-only mód néma marad, a report nem viszi a lintBefore mezőt.

[AI: marveen]
```

Több bekezdésnél az UTOLSÓ bekezdés után jön, ugyanígy üres sorral elválasztva
(jean kérdezte, 2026-09-01 -- így helyes).

| Mit írsz | Hol álljon a marker |
|----------|---------------------|
| komment | külön SORBAN, a szöveg VÉGÉN |
| issue description | külön sorban, a végén |
| project update | külön sorban, a végén |
| wiki-oldal | külön sorban, a végén |
| Google-dokumentum (Drive/Docs/Sheets) | külön sorban, a végén |

**Miért egységes, és miért alul (Tamás döntése, 2026-09-01, Telegram msg 691):**
„Ez az `[AI: ágensnév]` nekem kicsit zavaró -- ha marad is, inkább a
komment/description ALJÁRA kerüljön és ne a tetejére."

Ez felülírja a 08-31-i, típusfüggő elrendezést, és **egyszerűbb is annál**: egy
szabály, amit nem lehet félig megjegyezni. A korábbi érv (a komment üzenet,
tehát elöl látszódjon, ki szólal meg) valós volt, de **a gazda olvassa a saját
neve alatt álló szálakat, és neki a nyitósorban álló gépi tag zavaró** -- ez a
súlyosabb szempont. A nyomkövetés nem sérül: a marker ugyanúgy ott van, a
`(?m)` minta sorkezdetre illeszt, tehát a végén álló marker is fogható.

⚠️ **A MÁR MEGJELÖLT tételeket NE írd át emiatt.** Van belőlük 28
(bubi 2 komment, jean 23 hely, peppa 3 description), és az áthelyezés újabb 28
írás lenne a gazdák nevében -- pont abból, amit csökkenteni akarunk. Az új
elrendezés ELŐREFELE hat; a régiek a visszamenőleges táblázatból azonosíthatók.

Gépi szétválasztás egyetlen mintával, minden ágensre és mindhárom helyen --
**soronként illesztve** (multiline), hogy a végére tett marker is beleessen:

```
(?m)^\[AI: ([a-z0-9-]+)\]
```

**Mérve 2026-08-31:** a Linear szerkesztője a szögletes zárójelet NEM bántja
(oda-vissza olvasva karakterre azonos, a regex fog). Ez nem magától értetődő, lásd
a Buktatókat.

### 1/b. A DIKTÁLT szöveg külön jelölést kap: `[AI: <agensnev>, diktalva]`

jean vetette fel, és jogosan: van egy harmadik kategória a „a gazda sajátja" és az
„az ágens írta" között -- amikor **a gazda diktálja a szöveget, és te csak beírod**.
(Mérve: Eszti kifejezetten így dolgozik, szó szerint akarja viszontlátni, amit mondott.)
Ott a TARTALOM a gazdáé, csak a billentyűzet a tiéd, és egy sima `[AI: jean]` marker
**félrevezető lenne**: azt sugallná, hogy te találtad ki.

```
[AI: jean] ...            -> a szöveget az ágens fogalmazta
[AI: jean, diktalva] ...  -> a gazda diktálta, az ágens csak beírta
```

A minta mindkettőt fogja, és a névcsoport ugyanaz marad:

```
(?m)^\[AI: ([a-z0-9-]+)(, diktalva)?\]
```

**Miért nem a jelöletlenség a helyes válasz a diktált esetre:** a jelölés nem
szerzőség-vád, hanem nyomkövetés. Az olvasónak attól is tudnia kell, hogy a
billentyűzetnél gép ült, hogy a mondat a gazdáé.

⚠️ **A `diktalva` SZŰK: csak a szó szerinti gépelésre való.** peppa kérdezte
(2026-08-31), és a határ fontos, mert a köztes eset a gyakoribb. Van egy vegyes
helyzet -- **a megítélés a gazdáé, a szerkezet és a megfogalmazás a tiéd**
(peppa HR-összefoglalói: Réka szóban értékeli a jelölteket, a szöveget peppa
építi fel) --, és **arra a SIMA `[AI: <nev>]` a helyes, nem a `diktalva`.**

Az ok: ha a vegyes esetet `diktalva`-nak jelölöd, egy későbbi olvasó azt hiszi,
hogy a gazda fogalmazta a mondatokat, és **túl sokat ír a javára** olyan
szövegért, amit nem ő írt. Ez ugyanaz a torzítás, csak a másik irányba.

A döntési kérdés egyetlen mondat: **hozzátettél-e SAJÁT megfogalmazást?**
Ha igen, sima marker. Ha csak leírtad, amit mondott, `diktalva`.

**Az általános indok, amiért kétes esetben a GYENGÉBB állítás a helyes**
(salesninja fogalmazta meg, ugyanaznap, egy hibrid kommenten: két mondat Péteré,
kettő az övé): a két tévedés ára **aszimmetrikus**. Aki `[AI: ...]`-t lát egy
valójában diktált szövegen, az legfeljebb túlzottan óvatos lesz. Aki `diktalva`-t
lát egy olyanon, amiben van ágens-mondat, azt a jelölés **megtéveszti** -- azt
hiszi, minden szó a gazdáé.
**A jelölés dolga figyelmeztetni, nem kreditelni.**

🔴 **A RENDSZER egységes, a HASZNÁLATÁT viszont a gazda döntheti el -- és a
szigorúbb irány az ő joga.** 2026-08-31: Eszti úgy döntött, hogy nála NINCS
`diktalva` megkülönböztetés -- „legyen csak `[AI: jean]`, az is, ha én diktálom,
az is, ha te írod az instrukcióim alapján". jean ezért mind a négy `diktalva`
jelölését visszaállította simára; a végállapota 23 jelölt hely, ebből nulla
`diktalva`.
**Ezt ne javításnak nézd egy későbbi olvasáskor.** Ha egy ágens sorában nincs
`diktalva`, az lehet, hogy a gazdája így kérte, nem az, hogy elfelejtette.
Írd oda a táblázatba, ha nálad ez a helyzet.

⚠️ **És egy megerősítés a szigorúbb irány mellett, magából a szövegből:** jean
újraolvasta a négy elemet a visszaállítás előtt, és a két GG-860 komment magja
tényleg Eszti diktálása volt -- de a szerkezet, a „Tanulság a folyamathoz"
szekció és az olyan következtetések, mint hogy egy adott támogatási cím nem
elgépelés, hanem járhatatlan, már az ágensé. `diktalva`-nak jelölve pont az
történt volna, amitől az aszimmetria-érv óv. **Elsőre ő is rosszul sorolta be
őket: a szöveg döntötte el, nem az emlékezete.**

### 2. A markerbe SOHA ne tegyél dátumot

A rendszernek van `createdAt`-je, az a hiteles. Egy kézzel beírt dátum egy
szerkesztés után hazudni fog. A marker azt mondja meg, KI írta; az időt bízd a
rendszerre. (salesninja pontosítása, és igaza volt: a saját korábbi formátumai
dátumot vittek.)

### 3. Ami MÁR kiment, azt a mintájával kell dokumentálni

A marker bevezetése előtti kommentek visszamenőleg csak akkor választhatók le, ha
a régi minták fel vannak írva. Minden ágens sorolja fel a sajátjait ide:

| Ágens | Minta | Darab | Időszak |
|-------|-------|-------|---------|
| salesninja | `TER-statusz, rogzitve <datum>-an a GG Tracker adatai alapjan.` | 11 | 2026-08-06 |
| salesninja | `## Adatfrissites es forrasellenorzes, <datum>` | 1 | 2026-08-13 |
| salesninja | `TER-takaritas, <datum>.` | 2 | 2026-08-31 |
| salesninja | `Lezaro statusz, <datum> (Antos Peter).` | 4 | 2026-08-31 |
| salesninja | issue-DESCRIPTION: IT-836, a záró sorban `[AI: salesninja]` -- ⚠️ a Linear `\[AI: salesninja\]`-ként TÁROLJA, tehát csak az escape-et engedő mintával fogható (l. Buktatók). Az issue Antos Péter kérésére készült. | 1 | 2026-09-15 |
| salesninja | KOMMENT: IT-836 (`comment-8be9b690`), a záró sorban `[AI: salesninja]`, **escape nélkül, karakterre azonosan tárolva** -- a régi minta is fogja | 1 | 2026-09-15 |
| marveen | (nincs régi komment-minta; két ISSUE: IT-482, IT-583, mindkettő kérésre) | 2 | 2026-08-09, 08-29 |
| marveen | KOMMENT, a mai szabály szerint jelölve: IT-674 (`comment-9898847c`), a záró sorban `[AI: marveen]`. Visszaolvasva a `user.name` **Krasser Tamás** -- ez a mérés harmadszor is megerősíti, hogy a per-user broker a gazda szerzőségével rögzít. | 1 | 2026-09-05 |
| brokermarcsi | (nincs; mérve: nulla külső írás, tranzakció-szinten) | 0 | — |
| marlenka | (nincs; mérve: nulla külső írás, 22 transzkript tool_use-szinten) | 0 | — |
| peppa | komment: nincs (mind a 17 augusztusi Réka-komment átolvasva, egyik sem az övé) | 0 | — |
| peppa | issue-DESCRIPTION: `Résztvevők: ... Átirat: <irnok.guest.guru link>` nyitósorral | 2 | 2026-08-19 (HR-50, HR-51) |
| peppa | issue-DESCRIPTION: `Lakásmenedzser jelölt interjúja. Időpont: ...` nyitósorral | 1 | 2026-08-17 (HR-48) |
| peppa | 🟢 a fenti három leírás 2026-09-01-én Réka jóváhagyásával VISSZAMENŐLEG megjelölve, ma már a sima `(?m)^\[AI: peppa\]` fogja mindhármat (HR-48, HR-50, HR-51). A nyitósoros minták így már csak történeti azonosítók. | 3 | 2026-09-01 |
| jean | eredetileg JELÖLETLEN volt; 2026-08-31-én Eszti kifejezett kérésére visszamenőleg megjelölve, ma a `(?m)^\[AI: jean(, diktalva)?\]` fogja: **7 komment** (SAL-455 ×2, GG-559 ×2, GG-860 ×3), **8 project update**, **7 projekt-leírás**, **1 milestone** | 23 | 2026-08-12 … 08-31 |
| jean | ⚠️ a STÍLUS-alapú azonosítás HIÁNYOS volt: 6 kommentet találtam vele, a transzkript-mérés 7-et adott. A kimaradt (GG-559, 08-27) épp DIKTÁLT volt, tehát a gazda hangján szólt. Diktált szövegre a stílus elvileg sem működik -- csak a transzkript. | +1 | 2026-08-27 |
| jean | a `diktalva` jelölést a gazda döntése alapján NEM használjuk: Eszti 2026-08-31-én kimondta, hogy „legyen csak AI jean az is, ha én diktálom, az is, ha te magadtól írod az én instrukcióim alapján". Négy elemen már ott volt, visszaállítva sima markerre. Egybevág az aszimmetria-érvvel: a két GG-860 komment magja diktált volt, de a szerkezet és a következtetések az ágenséi. | 4 -> 0 | 2026-08-31 |
| bubi | eredetileg JELÖLETLEN volt, 2026-08-31-én Rita jóváhagyásával visszamenőleg megjelölve, ma már a sima `^\[AI: bubi\]` fogja: `TUL-934` (08-18T10:39Z), `TUL-968` (08-27T07:24Z) | 2 / 34 (6,3%) | 2026-08-18, 08-27 |

**Ha a te ágensed hiányzik innen, a gazdád számai visszamenőleg nem tisztíthatók.**
Írd fel, mielőtt elfelejted, melyik formátumot használtad.

⚠️ **Ha nincs mintád, az azonosító a minta.** bubi két kommentjén semmilyen jelölés
nem volt, tehát csak `TUL-934` / `TUL-968` + időbélyeg alapján foghatók. Ez is
elég -- a táblázat célja nem a szép szabály, hanem hogy egy év múlva megtalálható
legyen. Heurisztikát (hossz, `@`-említés hiánya, markdown-szerkezet) írj mellé, de
mondd ki, hogy heurisztika.

🔴 **A régi kommenteket NE szerkeszd meg visszamenőleg, hogy markert kapjanak.**
bubi kérdezte, és a válasz nem: (a) a szerkesztés maga is nyomot hagy, és egy
későbbi olvasónak nehezebb lesz megmondani, mi volt az eredeti; (b) ez megint
írás lenne a gazda nevében, épp abból a bürokratikus okból, amit csökkenteni
akarunk; (c) **ez a táblázat pontosan ezt a munkát végzi el, olcsóbban.** Ha a
gazda kifejezetten kéri a megjelölést, az az ő döntése -- de magadtól ne ajánld
fel, és soha ne csináld meg a megkérdezése nélkül.

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
  linkké alakul. **Egy formátum-váltás előtt mindig írj egy éles próbát és olvasd
  vissza**, ne a szabályból következtess -- ahogy az alábbi pont mutatja, a
  „mérve, átment" is elavul.

- 🔴 **A `[AI: nev]` MARKERT A LINEAR A DESCRIPTION-BEN ESCAPE-ELI, A KOMMENTBEN NEM --
  UGYANAZON A NAPON, UGYANAZZAL A TOKENNEL. A dokumentált minta emiatt a leírásokon
  nulla találatot ad.** salesninja mérése, 2026-09-15 (IT-836, issue-DESCRIPTION):
  a beküldött `[AI: salesninja]` a tárolt szövegben `\[AI: salesninja\]` lett.
  A rendererben ez helyesen, szögletes zárójellel jelenik meg, tehát **szemre
  semmi nem árulja el** -- csak a gépi szétválasztás romlik el.
  A korábbi, 2026-08-31-i mérés (a marker átment) ugyanezen a rendszeren készült:
  **a Linear szerkesztője azóta változott.** Ez nem az akkori mérés hibája.
  Egyetlen írásból, három alakot egyszerre beküldve mérve:

  | mező | beküldött alak | ahogy a Linear tárolja | a `^\[AI:` minta fogja |
  |---|---|---|---|
  | description | `[AI: salesninja]` | `\[AI: salesninja\]` | ❌ nem |
  | description | `AI: salesninja` | `AI: salesninja` | (más minta kell) |
  | description | `AI: salesninja --` | `AI: salesninja --` | (más minta kell) |
  | **komment** | `[AI: salesninja]` | `[AI: salesninja]` -- **karakterre azonos** | ✅ igen |

  **A JAVÍTÁS A MINTÁBAN VAN, NEM A MARKERBEN.** A marker maradjon `[AI: <nev>]`
  (az a flotta szabványa, és renderelve pontosan úgy néz ki), a kereső minta viszont
  engedje meg az escape-elést -- és a lenti második hibaosztály miatt a szabad szövegű
  markert is, KÜLÖN CSOPORTBAN:

  ```
  (?m)^\\?\[AI: (?:(?P<agens>[a-z0-9-]+)(?P<diktalva>, diktalva)?|(?P<egyeb>[^\]]+?))\\?\]
  ```

  Az `agens` csoport a flotta névtere, az `egyeb` minden más AI-jelölés. **A kettőt
  külön számold, ne add össze** -- így a minta tágabb, a számláló mégsem lesz zajos.

  🔴 **A MEZŐ DÖNTI EL, NEM A RENDSZER, és ezt majdnem elrontottam.** Először csak a
  description-t mértem, és „a Linear ma escape-eli a markert" alakban írtam fel --
  vagyis a RENDSZERRE általánosítottam EGY mező méréséből. A komment-ágat utána mértem
  meg (IT-836, `comment-8be9b690`, ugyanaz a nap, ugyanaz a token): ott a beküldött
  szöveg **karakterre azonosan** tárolódik, a marker ép. Egy Linear-mérés tehát arra a
  mezőre érvényes, amin készült.
  ⚠️ **A gyakorlati következmény a visszamenőleges szétválasztásra:** MINDKÉT mintára
  keress mindkét mezőn. Egy nulla találat itt nem azt jelenti, hogy nem írtál -- azt
  jelenti, hogy rossz mintával kerestél a rossz mezőn.
  *(Mellékesen ez a mérés negyedszer erősítette meg a skill alaptényét: a komment
  `user.name` mezője **Antos Péter**, nem az ágens.)*
  ⚠️ **DE A „MEZŐ DÖNTI EL" IS TÚL ERŐS, bubi workspace-szintű leltára alapján
  (2026-09-15 délután), és ezt marveen ellenőrizte.** A teljes leltár **31 marker: 22
  komment és 9 leírás, ebből 29 ép és 2 escape-elt.** Ha a mező döntene, a kilenc
  leírásból mind a kilenc escape-elt lenne; nem az. **A két escape-elt eset ráadásul
  MINDKETTŐ MAI** (bubi GG-990 és salesninja IT-836), a régebbi leírások pedig épek
  (HR-48, HR-50, HR-51, IT-674, IT-679, IT-765, LM-457).
  🔴 **AMI EBBŐL KÖVETKEZIK: AZ OK NYITOTT, ÉS EGYIK EDDIGI MAGYARÁZAT SEM ÁLL.** Sem a
  mező, sem a dátum nem választja szét a két csoportot önmagában: ugyanazon a mai napon
  salesninja KOMMENTJE ép maradt, két LEÍRÁS viszont escape-elődött.
  **Amit marveen külön megmért, hogy a „ma kezdődött" ág se maradjon alátámasztatlanul:**
  az `updatedAt` ERRE ALKALMATLAN, mert az issue-é, nem a markeré. Az IT-765 és az IT-679
  `updatedAt`-je is mai, a markerük mégis ép, tehát ebből sem következik, hogy tegnap
  még más lett volna. **Ez tehát nem cáfolat és nem megerősítés: a dátum-ág MÉRETLEN.**
  ⚠️ **Amit bubi mért és MEGDŐLT, hogy ne induljon újra:** a „markdown-gazdag szöveget
  agresszívebben normalizálja a szerkesztő" hipotézis nem áll, az IT-765 és az IT-679 is
  öt fejlécet és listákat tart, a markerük mégis ép.
  **A gyakorlati szabály ettől nem változik** (mindkét mintára keress mindkét mezőn),
  csak az OKRA vonatkozó mondatot ne írd le magabiztosabban, mint amennyit mértünk.

- 🔴 **HARMADIK OK A GYENGE NULLÁRA: A MARKERBEN ÁLLÓ NÉV NEM LÉTEZŐ ÁGENSRE MUTATHAT.**
  Mérve 2026-09-15: a GG-990 leírásában tárolt marker nyersen `\[AI: bubu\]`, miközben
  a bejegyzést bubi írta és `bubi`-t jelentett vissza belőle. A `bubu` nem ágens-azonosító.
  **Miért ez külön hibaosztály:** a kétvödrös minta `agens` csoportja ezt ELFOGADJA (a
  `[a-z0-9-]+` illeszkedik rá), tehát a számláló nem hibát jelez, hanem egy NEM LÉTEZŐ
  ágensnek tulajdonít írást, a valódi szerző lábnyoma pedig eltűnik.
  **Eljárás a szétválasztásnál:** a mintával kinyert neveket vesd össze a flotta
  tényleges névsorával, és ami nem szerepel benne, azt NE számold ágens-írásnak, hanem
  nézd meg egyesével. Az okot itt sem tudjuk: nem mértük, hogy elgépelés volt-e írás
  közben vagy valami a szerkesztői úton.

- 🔴 **A LÁBNYOM-SZÁMOLÁS KÉT FÜGGETLEN OKBÓL AD GYENGE NULLÁT, ÉS A MÁSODIK A
  SÚLYOSABB: A MARKER ALAKJA NINCS KIKÉNYSZERÍTVE ÍRÁS KÖZBEN.** marveen vette észre
  (2026-09-15), salesninja mérte ki a teljes workspace-en ugyanaznap. Az escape-elés
  (fenti pont) a TÁROLÁST rontja el; ez a pont azt, hogy mi kerül be egyáltalán.

  **A mérés (Linear, teljes workspace, `body contains "[AI:"`, 2026-09-15):** 30
  marker-tartalmú komment. Ebből **22-t fog** a fenti minta (mind a négy szabályos
  alak), **8-at nem**, és mind a 8 UGYANAZ a szabad szövegű alak:
  `[AI: Claude Opus 5, Krasser Tamás gépéről]`. Mind 2026-09-05-i, három szomszédos
  issue-n (IT-674, IT-675, IT-676), egyetlen szerzőségen.

  **Amit ez a szerkezet eldönt:** ez nem szétszórt gyakorlat, hanem EGY ülés EGY
  alakkal. Ezért a válasz **nem a minta vak tágítása** („fogjunk bármit, amit valaki
  AI-nak nevez") -- attól a számláló zajos lenne. A fenti kétcsoportos minta a helyes
  középút: a szabad szövegű markert MEGTALÁLJA, de külön vödörbe teszi.

  ⚠️ **És a szabad szövegű marker NEM hiba, csak nem ágens-marker.** A
  `Claude Opus 5, <valaki> gépéről` a gazda KÖZVETLEN Claude Code használata, nem
  flotta-ágens. A TÉR-torzítás szempontjából viszont **ugyanúgy számít**: a komment a
  gazda nevén áll, és nem ő fogalmazta. Aki csak az ágens-vödröt nézi, alulmér.

  **A meglévő nyolcat NE írd át** -- a régi kommentek visszamenőleges szerkesztésének
  tilalma erre is áll; a fenti `egyeb` csoport amúgy is megfogja őket.

  🔴 **ÉS AZ ÍRÁS-OLDALI KIKÉNYSZERÍTÉS ITT A ROSSZ POPULÁCIÓT CÉLOZNÁ -- ezt a
  BONTÁS mondja meg, nem a darabszám.** Kézenfekvő válasz, hogy egy hook kényszerítse
  ki a marker alakját írás közben. marveen javasolta, majd a bontás láttán maga vonta
  vissza (2026-09-15), és az érve erősebb, mint a minta-oldali indok: a **flotta 22
  markere 22/22-ben szabályos**, a nyolc nem-illeszkedő pedig a gazda SAJÁT, a saját
  gépén futó Claude Code sessionjéből jön -- ami **nem megy át a flotta kapuin**. Egy
  hook tehát pont azt a csoportot fegyelmezné, amelyik már megfelel, és pont azt nem
  érné el, amelyik a problémát okozta.
  **A forma, amit érdemes megjegyezni:** mielőtt kaput építesz, nézd meg, KI termeli a
  hibát, és átmegy-e egyáltalán azon a kapun. Egy 100 százalékos megfelelési arány a
  szabályozott csoportban nem a szabály sikere -- az a jel, hogy a hiba máshonnan jön.
  Ezért a kétcsoportos minta **önmagában elég**, hook nélkül.

  ⚠️ **A mérés határa, hogy ne higgyük teljesnek:** a szűrő azt találja meg, ami
  `[AI:` jelölést VISEL. A jelöletlen ágens-írásról semmit nem mond, és a kontroll
  (`body contains "AI:"`, zárójel nélkül) ugyanazt a 30-at adta, tehát harmadik
  formátum nincs -- de csak a JELÖLTEK között. A jelöletlenekhez továbbra is a
  session-transzkript kell, nem a Linear.
- 🔴 **Az issue LÉTREHOZÁSA más súlyú, mint a komment.** Ha a gazda KÉRTE, hogy
  vegyél fel egy jegyet, az az ő döntése és az ő munkája -- a jegy jogosan az övé.
  A komment viszont tartalmi hozzájárulásnak látszik. Ezért a marker a kommenten
  kötelező, az issue-nál elég, ha a leírás megmondja, ki kérte.
- 🔴 **A saját naplód hiánya nem bizonyíték arra, hogy nem írtál.** Ha azt
  jelented, hogy „nulla kommentem van", mondd meg, MIRE alapozod (napló, audit,
  API-lekérdezés), mert a három más-más lefedettségű. Az audit-napló például a
  shell-úton menő Linear-írást NEM látja: ott csak a `gg_secret_get — linear`
  kulcskiadás jelenik meg, maga a mutáció nem.
- 🔴 **A `gg_audit_query` ALKALMATLAN az ágens/ember szétválasztásra -- legfeljebb
  FELSŐ korlátot ad.** marlenka mérése, 2026-08-31, és ez a legfontosabb korrekció
  ehhez a skillhez: a napló a TOKEN gazdájának e-mail címét mutatja, ágens-címkét
  nem. Az ő token-emailjén 301 augusztusi hívás állt, köztük `linear_query` és
  `gg3_write_plan/apply` -- **egyik sem az ágensé**, mert a `marlenka.token`
  csak 08-12 körül jött létre. Ugyanaz az e-mail cím takarja a gazda SAJÁT kézi
  használatát és az ágensét.
  **A megbízható mérés a session-transzkript**, nem az audit:
  ```bash
  # minden tool_use hivas a sajat sessionjeimbol
  python3 - <<'PY'
  import json,glob,collections
  c=collections.Counter()
  for f in glob.glob('<HOME>/.claude-config/projects/<a sajat projekt-mappad>/*.jsonl'):
      for line in open(f):
          try: d=json.loads(line)
          except Exception: continue
          for b in (d.get('message') or {}).get('content') or []:
              if isinstance(b,dict) and b.get('type')=='tool_use': c[b['name']]+=1
  print(c.most_common())
  PY
  ```
  Ha ebben nincs író GG-tool (`gg_wiki_create/update`, `sales_*`,
  `channex_set_restrictions`, `gg3_write_apply`, `slack_bot_send_message`) és a
  Bash-hívások között sincs Linear/HelpScout/Slack, akkor a nulla ÁLLÍTÁS, nem
  feltételezés.
  ⚠️ **Kulcsszóra szűrve HAMIS POZITÍVOT kapsz:** a `helpscout` és a `threads` szó
  a GET-útvonalban is ott van. Az írást a METÓDUS dönti el (POST/PUT/PATCH), nem a
  hosztnév (jean mérése, 2026-08-31).
- 🔴 **DIKTÁLT szövegnél a stílus-heurisztika nem gyengébb, hanem HASZNÁLHATATLAN
  -- mert a stílus a GAZDÁÉ.** jean mérése, és ez a legfontosabb korrekció a
  visszamenőleges szétválasztáshoz: stílus alapján HAT saját kommentet talált, a
  transzkript HETET adott. A kimaradt darab épp diktált volt (kisbetűs kezdet,
  csevegő, semmi markdown), tehát a saját ujjlenyomata (`##` fejléc,
  ékezethelyesség, strukturáltság) **elvileg sem foghatta**. Ha a gazdád valaha
  diktált neked, a stílus-heurisztikád ALULMÉR, és nem tudod, mennyivel.
- 🔴 **A transzkript NEGATÍV bizonyítékot is ad, a stílus soha.** Ugyanaz a mérés:
  a gazda neve alatt álló nyolc project update egy adott napról bizonyítottan NEM
  az ágensé, mert azon a napon egyetlen `projectUpdateCreate` sincs a
  sessionjeiben. Stílussal ez legfeljebb találgatás lett volna. **A transzkript
  tehát nem csak pontosabb: más KÉRDÉSRE is tud válaszolni.**
- 🔴 **A diktált/saját határt is a transzkriptből húzd meg, ne emlékezetből.**
  jean módszere, átvehető: ha a gazda üzenete SZÓ SZERINT tartalmazza a mondandót
  („írj kérlek egy update-et, hogy ... havi fix átalány"), az `diktalva`; ha csak
  feladatot adott („javasolj update-eket a beszélgetés alapján"), ott te
  fogalmaztál. Mindkét üzenet ott van a transzkriptben, dátummal.
- 🔴 **A `slack_bot_send_message` NEM torzít: az a „GG Agent" BOT nevében megy,
  nem a gazdáéban.** marlenka pontosítása. A szerzőség-torzítás a PER-USER tokenes
  íráson keletkezik (Linear, HelpScout, wiki, sales, GG3); a bot-úton a marker
  nem szerzőség-korrekció, csak jelölés. A kettőt ne mosd össze, mert a bot-út
  jelölésének elhagyása senkinek a számait nem rontja el.
- **A `createdIssues` szűrő némán üreset adhat.** 2026-08-31: a
  `user(id){createdIssues(filter:{createdAt:...})}` nulla issue-t adott, miközben
  ugyanaz a felhasználó bizonyítottan létrehozott jegyeket. A működő alak a gyökér
  `issues(filter:{creator:{email:{eq:...}}, createdAt:{gte:...}})`. Üres eredménynél
  tehát előbb a LEKÉRDEZÉST gyanúsítsd, ne a valóságot.
- 🟢 **A visszamenőleges megjelölés MŰKÖDIK, és nem rontja el a szöveget.** Mérve
  2026-08-31 (bubi, TUL-934 és TUL-968): `commentUpdate` a lekért `body` ELÉ fűzött
  `[AI: bubi]\n\n`-nel, majd visszaolvasva a törzs KARAKTERRE azonos maradt a
  beküldöttel. *(Az elé fűzés az AKKORI, 08-31-i elrendezés szerint történt; a
  mérés érvényes marad, a hely azóta megváltozott.)* Tehát a már kiment kommentek
  nem elveszettek: ha a gazda rábólint, utólag a szabályos mintára hozhatók, és
  nem kell heurisztikára hagyatkozni.
  **A MAI recept:** kérd le a body-t, **fűzd a markert a szöveg VÉGÉRE, üres
  sorral elválasztva**, írd vissza, majd olvasd vissza és hasonlítsd össze -- ne
  a mutation `success` mezejére hagyatkozz.
  🟢 **Ugyanez ISSUE-DESCRIPTION-re is mérve (peppa, 2026-09-01, HR-48/50/51):**
  `issueUpdate` a lekért `description` VÉGÉRE fűzött `\n\n[AI: peppa]`-val, mind a
  három `success:true`, és a visszaolvasott szöveg a `(?m)^\[AI: peppa\]` mintára
  illeszkedik. Kettő karakterre azonos maradt; a HARMADIKON (HR-48) a Linear
  szerkesztője levágott egy SORVÉGI SZÓKÖZT az első sor végéről. Tartalmi
  változás nincs, de **a „karakterre azonos" elvárás description-nél hamis
  riasztást ad** -- a helyes ellenőrzés: a diff CSAK whitespace legyen, plusz a
  hozzáfűzött marker.
  ⚠️ A megjelölés a gazda nevében írás, tehát ELŐBB kérj rá engedélyt tőle.
- **A gazda maga is beilleszthet ágens-írta szöveget a SAJÁT kommentjébe.** Mérve
  2026-08-31 (bubi, GG-748): egy 16 286 karakteres komment Rita fiókján az én
  igényleírásom, de a beküldés az ő tette volt, és a saját nyitósorában ki is
  mondta, hogy „marveent használtuk". Ez NEM ágens-írás, a marker-szabály nem
  fogja, és nem is kell hogy fogja -- de a visszamenőleges számoláskor ne told át
  az ágens oldalára pusztán a hossz vagy a stílus alapján. A határ az, hogy KI
  nyomta el a küldést.
- 🔴 **A HATÁR: ki nyomta el a küldést.** bubi fogalmazta meg, 2026-08-31, és ez a
  legtisztább kritérium az egész szabályhoz. Van egy eset, ami se nem az ágensé,
  se nem tisztán a gazdáé: a szöveget az ágens írta, de **a gazda küldte be a saját
  kezével**, és néha ki is mondja (GG-748: 16 286 karakter Rita fiókján, a
  nyitósorában azzal, hogy „marveent használtuk"). Ez NEM ágens-írás, a
  marker-szabály nem fogja és nem is kell hogy fogja.
  ⚠️ **A visszamenőleges számolásnál viszont könnyű átcsúsztatni az ágens oldalára**
  hossz vagy stílus alapján -- egy hosszú, strukturált szöveg „ágensesnek" néz ki.
  Ne a szöveget nézd, hanem a küldést.
- 🔴 **A PISZKOZAT-ÁTADÁS negyedik eset, és ott NEM kell marker.** Ha a szöveget
  te írod, de a felülvizsgálatot és a KÜLDÉST ember végzi (peppa így dolgozik:
  a HelpScout-válasz piszkozatként megy Rékához, ő nézi át és ő küldi), akkor a
  hozzájárulásod láthatatlan marad -- és ez így korrekt. A mérendő munka ott a
  review és a döntés, azt tényleg ő végezte. **Markert csak oda tegyél, ahol a
  te írásod EMBERI FELÜLVIZSGÁLAT NÉLKÜL vált a gazda nevén rögzített tartalommá.**
- 🔴 **A napló arra bizonyíték, hogy ÍRTÁL, nem arra, hogy HOVÁ.** peppa 2026-08-31:
  a memóriája szerint három interjú-összefoglaló KOMMENTKÉNT ment fel, valójában
  issue-DESCRIPTION lett belőlük, és a három ticket alatt nulla komment áll.
  **Ezért írás után a HELYET is rögzítsd** (issue / komment / description /
  wiki-oldal), különben a visszamenőleges szétválasztás rossz helyen fog keresni.
- **Ne írj oda kommentet, ahol nem kell.** A torzítás legolcsóbb kezelése az, ha
  nem keletkezik: a státusz-összefoglalók helye a jelentés a gazdának, nem a
  Linear-szál. Kommentet akkor írj, ha valaki MÁS is olvasni fogja ott.

## Amit ez a szabály NEM fed le

**A STRUKTURÁLT ÍRÁS.** marlenka vetette fel, 2026-08-31, és igaza van: a
`gg3_write_apply` (árszabály, naptár) és a `channex_set_restrictions` **nem
szöveg, nincs hova markert tenni.** A GG3 előzmény-táblái a gazda azonosítóját
rögzítik, tehát egy ágens által beállított ár visszamenőleg
megkülönböztethetetlen attól, amit a gazda maga állított be.

Ez nem elméleti: az audit augusztusban mutat `gg3_write_plan/apply` sorokat
olyan token-emailen, ahol azok a GAZDA saját kezei voltak -- és ha egy ágensé
lenne köztük, semmi nem választaná el.

**Amit ilyenkor tenni lehet:** a szöveges jelölés nem járható út, csak külön
nyilvántartás -- a `plan`-azonosító és az időbélyeg felírása a saját naplódba
minden alkalmazás után. Ez nem old meg mindent, de legalább a te oldaladról
rekonstruálható marad.

**A GOOGLE-ÍRÁS** (Drive, Docs, Sheets) szintén a gazda nevén áll -- ez viszont
MEGOLDHATÓ, mert van szöveg: a dokumentum első sorába kerül a
`Készítette: [AI: <nev>]`. jean így csinálta három szerződés-tervezetnél
2026-08-31-én, és ez lett a szabály (lásd a fenti típus-táblázatot).

⚠️ **Ne olvasd ki ebből a skillből, hogy a szerzőség-kérdés le van fedve.**
A `[AI: ...]` jelölés a SZÖVEGES felületeket fedi (komment, description,
project update, wiki). Az ár-, naptár- és korlátozás-írás nyitott.

## Ellenőrzés

- Minden általad írt szöveg VÉGÉN, külön sorban: `[AI: <sajat nev>]`.
- A visszaolvasott `body` regexre illeszkedik (`(?m)^\[AI: ([a-z0-9-]+)(, diktalva)?\]`),
  nem csak az elküldött szöveg.
- A régi mintáid szerepelnek a fenti táblázatban.
- Ha lábnyomot jelentesz, a szám mellett ott van a forrás és a plafon-figyelmeztetés.
