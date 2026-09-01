// GG-specific: the fleet-wide memory-hygiene rules, injected into every
// sub-agent's CLAUDE.md as a generated block.
//
// ── Why this file exists ────────────────────────────────────────────────────
//
// 2026-09-01: six agents spent a day measuring how their own memories go
// wrong, and the rules that came out of it were written down in a skill about
// git and deploy mechanics -- a file none of them opens before saving a
// memory. The content was right and the ENTRY POINT was wrong, which was that
// day's recurring failure: the same mistake also put a section heading behind
// its own body and a corrected description behind a stale frontmatter line.
//
// Moving the rules into the main agent's CLAUDE.md fixed it for exactly one
// reader. The six agents who save memories several times a day still had
// nothing, because their CLAUDE.md files are separate -- and a rule that lives
// only in the router's file protects only the router.
//
// So the rules go where the writing happens, through the same generated-block
// mechanism as the fleet roster: appended on spawn, replaced in place on every
// later spawn, never touching anything outside the markers.
//
// Scope note: sub-agents only. The main agent's CLAUDE.md is hand-maintained by
// the operator and already carries these rules in the memory section, where the
// save recipe sits -- a better position than an appended block, so this does not
// duplicate them there. ensureFleetRosterSection() draws the same line for the
// same reason.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const MEMORY_RULES_BEGIN = '<!-- BEGIN GENERATED: memory-rules (auto-generated, do not edit by hand) -->'
export const MEMORY_RULES_END = '<!-- END GENERATED: memory-rules -->'

// Non-greedy, so the regex stops at the FIRST end-marker rather than spanning
// to the last END in a file that holds several generated blocks.
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const MEMORY_RULES_BLOCK_RE = new RegExp(
  `${escape(MEMORY_RULES_BEGIN)}[\\s\\S]*?${escape(MEMORY_RULES_END)}`,
)

// The body is static: these are fleet rules, identical for every agent, and
// nothing in them depends on runtime state. Kept as one exported string so a
// test can assert on it and so there is a single place to edit.
export function buildMemoryRulesBody(): string {
  return [
    '## Mit szabad emlékbe írni, és mikor avul el',
    '',
    'A memóriában a valódi kockázat NEM az érzékenység, hanem az ELAVULÁS.',
    '',
    '1. **Hitelesítő adat** (token, jelszó, auth nélkül működő link) csak akkor kerülhet',
    '   emlékbe, ha kifejezetten meg is van jelölve annak.',
    '2. **Minden számhoz KÖTELEZŐ a mérési ablak.** Ablak nélkül egy szám fél év múlva',
    '   magabiztosan hazudik. Az „LTM", a „tavalyi" és a „jelenleg" ablaknak NÉZ ki, de',
    '   egyik sem köti le a mérés idejét: az ablakot a MÉRÉS dátuma rögzíti, nem az',
    '   adat típusa.',
    '',
    'A mérési ablak viszont csak az elavulás EGYIK formáját fogja meg. A többi',
    '(2026-09-01-én a flotta hat ágense mérte ki a saját emlékein):',
    '',
    '- **Van ablak, de az állapot azóta megváltozott.** A `hot` tierben ez a gyakoribb,',
    '  és a dátum megléte ELREJTI. Olcsó gyanú-jel: ha egy hot emlék néhány napnál',
    '  régebbi, az önmagában gyanús -- a korát nézd, ne az érzékenységét.',
    '- **A saját későbbi írásod érvénytelenítette.** Emlék-mentés ELŐTT kérdezd meg,',
    '  melyik korábbi bejegyzés állapotát írtad most felül, és azt ugyanabban a körben',
    '  zárd le.',
    '- **A blokkoló ok szűnt meg, a feladat bent ragadt.** Ha egy emlékben ott van, hogy',
    '  „amíg X, addig blokkolt", akkor az X-et kell MEGMÉRNI, nem az emléket újraolvasni.',
    '- **Az emlék a SZÁNDÉKOT rögzíti megtörtént tényként.** Ez rosszabb az elavulásnál:',
    '  az elavult emlék valaha igaz volt, ez sosem. A megtörtént lépést írd le, és csak',
    '  azután, hogy megtörtént; a szándék TEENDŐ-ként álljon, jövő időben.',
    '',
    '🔍 **A warm/cold tierbe bújt munkaállapot ritkán önálló bejegyzés: EGY MONDAT egy',
    'hosszú tudás-emlék belsejében** -- a kor-alapú szűrés ezt sosem fogja meg, mert a',
    'többi része valóban tartós. A jel a MONDAT IGEIDEJE: „X frissíti", „még nem történt',
    'meg", „azután majd" -- de az igeidő ÖNMAGÁBAN ZAJOS (négy ágens mérte: 7/1, 10/1,',
    '18/7, 4/0 valódi). **A döntő kérdés nem az igeidő, hanem hogy a mondat KONKRÉT,',
    'EGYSZERI függő tételt nevez-e meg, vagy ISMÉTLŐDŐ kötelezettséget** -- az elsőnek van',
    'gazdája és lezárása, a második helyesen ül warm/shared tierben. Segít, ha a mondat',
    'felsorolás-jelölésre mutat. 🔴 **De a jel után a TELJES bejegyzést olvasd el, és a',
    'találatokat rakd DÁTUM SZERINT sorba:** a lezáró mondat jellemzően NEM tartalmazza a',
    '„nyitott" mintát, tehát a mondat-szintű szűrés rendszeresen a nyitott állítást mutatja',
    'meg és a lezárót rejti el -- vagyis maga gyártja azt a hibát, ami ellen készült.',
    'Ha csak a jelölt mondatot olvasod, elveszted azt a kontextust, amiben a lezárás áll.',
    'Ugyanaz az ügy több bejegyzésben is állhat. Segít, ha a mondat',
    'felsorolás-jelölésre mutat („(a)", „NYITOTT:"). Ezt vedd ki külön `hot` bejegyzésbe --',
    'de csak ha az ügy tényleg AKTÍV; ha nem mozdul és nem vársz rá választ, írd be',
    'feltételesen („ha X-be kezdek, AKKOR hot"). A tudás-részt hagyd a',
    'helyén -- de a HELYÉN maradt mondatot írd át HIVATKOZÁSSÁ („a nyitott állapotot külön',
    'bejegyzés viszi"), különben két forrásod lesz ugyanarra, és lezáráskor csak az egyiket',
    'törlöd.',
    '',
    '**Az ÜRES vagy egyelemű hot tier nem bizonyíték a tisztaságra.** Ez két külön',
    'kérdés: (1) ami bent van, még érvényes-e; (2) van-e döntésre váró ügyed, ami',
    'egyáltalán nem szerepel benne. A második a MUNKÁDBÓL indul, nem az emléklistából.',
    '',
    '**Javításkor a TUDÁST záradékold, a MUNKAÁLLAPOTOT töröld -- BÁRMELYIK tierben.**',
    'A tudás azt rögzíti, mit hittünk a világról, és ott a tévedés útja maga is tanulság.',
    'A munkaállapot azt rögzíti, hol tart egy ügy: lezárva nincs mit tanulni belőle, a',
    'végállapotot úgyis egy másik bejegyzés őrzi.',
    'A `hot` tier azért külön említésre méltó, mert ott a munkaállapot a TIPIKUS, és ha',
    'záradékokkal töltöd fel, nem lesz ránézésre látható, mi az aktív. **A `warm` és',
    '`cold` tierben ülő munkaállapot viszont VESZÉLYESEBB, mert ott a korát senki nem',
    'nézi** -- oda azért kerül, mert konfigurációnak vagy környezeti ténynek látszik.',
    'A záradékban elöl álljon a HELYES állítás és alatta a meghaladott, mert a',
    'félig-olvasás nem a végét hagyja ki, hanem az ELEJÉT viszi el -- és ezért az',
    '**összefoglaló NYITÓ MONDATOT külön is javítsd**: az a szöveg legerősebb állítása,',
    'egy alatta álló záradék nem írja felül. Ha a régi jelentés MÁS TEENDŐT sugallna',
    '(nyitott -> lezárt), akkor a záradék kevés: új bejegyzés kell, a régire hivatkozva,',
    'mert a meglévő embedding a javítás után sem frissül.',
    '',
    '🔴 **Verzió-azonosító (commit-hash, „végleges változat") SOSE álljon a nyitó mondatban:**',
    'az a leglassabban javított hely a leggyorsabban avuló adattal. (Egy csupasz UUID viszont',
    'NEM verzió-azonosító: az egy REKORDRA mutat, ami nem változik -- az maradhat.)',
    'És minden frissítés után',
    'olvasd vissza a NYITÓSORT -- egy naponta többször szerkesztett bejegyzés ELVÁNDOROL tőle,',
    'és a félig-olvasás pont a rossz felét viszi el.',
    '',
    '🔴 **Mielőtt egy jelzett „nyitott" ügyet felveszel vagy továbbadsz, KERESD MEG a közös',
    'memóriában, dátum szerint sorba rakva** -- és számíts rá, hogy a lezárást TE magad írtad.',
    '2026-09-01: egy 08-14-én lezárt kérdést hárman kezeltünk nyitottként egymás után, miközben',
    'a lezárás a shared polcon állt. Nem az információ hiányzott, hanem a keresés a cselekvés',
    'előtt. A hot-tier-audit sem véd ettől: az azt nézi, ami BENT van.',
    '⚠️ És a forrás gyakran nem a memória, hanem a VÉGTERMÉK (egy táblázat, egy doksi), amit',
    'senki nem auditál. Ha egy ügy lezárul, nézd meg, melyik végtermékben maradt bent nyitottként.',
    '',
    '📌 **Ami EBBEN a blokkban áll, azt NE másold emlékbe -- MUTASS IDE.** Ezt a fájlt minden',
    'indulásnál betöltöd, és a blokk magától frissül; egy emlékbe másolt példány viszont a',
    'másolás pillanatától avul. Az emlékbe csak az kerüljön, ami SAJÁT: a saját méréseid, a',
    'saját állapotod, és a személyes ütközés (mi van konkrétan a te kezedben, és mit nem',
    'használsz belőle) -- az az általános szabályból nem derül ki.',
    'Ez NEM rövidítés, hanem szűrés: mérve három emléken, kettő MEGNŐTT tőle. És a másolat',
    'kétféleképp romlik: AVUL (a forrás változik alatta -- ezt észrevesszük) és LEMARAD',
    '(a forrás bővül, a másolat nem -- ezt SOHA, mert önmagában konzisztens marad).',
    'A tiszta duplikátumot se töröld, hanem mutatósítsd: a mutató útjelző annak, aki nem',
    'tudja, hogy létezik skill róla.',
    '',
    '🔗 **Törlés előtt nézd meg, ki HIVATKOZIK rá.** Ha egy másik bejegyzésed rámutat, előbb',
    'írd át azt önmagában is érthető előzmény-mondattá, különben lógó hivatkozás marad.',
    '',
    '**Emlék módosítása:** `PUT /api/memories/<id>` a teljes új tartalommal (a PUT',
    'CSERÉL, nem fűz hozzá), törlés `DELETE /api/memories/<id>`. Mindkettőhöz add meg a',
    'saját azonosítódat (`"owner": "<agens>"`, illetve `?owner=<agens>`), különben egy',
    'elgépelt id más ágens emlékét írná át. NE írd közvetlenül az SQLite-ot: az kihagyja',
    'a cache-ürítést, és a javított emlék még egy percig a régi szövegével jön vissza.',
    '',
    '⚠️ **A `?agent=` listázás MÁS ágensek `shared` emlékeit is visszaadja**, gyakran',
    'többségben. „Benne van a listámban" tehát NEM azt jelenti, hogy „az enyém" -- a',
    'tulajdont az `agent_id` MEZŐBŐL olvasd ki, írás előtt.',
  ].join('\n')
}

// Idempotently ensures the memory-rules block is present and current in a
// sub-agent's CLAUDE.md. Same five-rule contract as ensureFleetRosterSection:
// skip when there is no CLAUDE.md; replace only between the markers; append on
// first run; no write when the content is unchanged; atomic write.
//
// `agentClaudeMdDir` is injected rather than imported so this file does not
// depend on the upstream scaffold module (and so the test can point it at a
// temp dir). agent-process.ts passes agentDir(name).
export function ensureMemoryRulesSection(
  agentClaudeMdDir: string,
  atomicWrite: (path: string, data: string) => void,
): void {
  const claudeMdPath = join(agentClaudeMdDir, 'CLAUDE.md')
  if (!existsSync(claudeMdPath)) return

  const block = `${MEMORY_RULES_BEGIN}\n${buildMemoryRulesBody()}\n${MEMORY_RULES_END}`

  let existing: string
  try {
    existing = readFileSync(claudeMdPath, 'utf-8')
  } catch {
    return
  }

  const updated = MEMORY_RULES_BLOCK_RE.test(existing)
    ? existing.replace(MEMORY_RULES_BLOCK_RE, block)
    : existing.trimEnd() + '\n\n' + block + '\n'

  if (updated === existing) return
  atomicWrite(claudeMdPath, updated)
}
