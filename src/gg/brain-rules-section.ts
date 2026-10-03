// GG-specific: the company-brain (gg-brain) rules for the fleet, injected into
// every agent's CLAUDE.md as a generated block. IT-1178 (M7-A2).
//
// ── Why this file exists ────────────────────────────────────────────────────
//
// 2026-09-29: the company brain (brain.guest.guru) became the shared memory of
// the whole company -- colleagues, their Claude Code and Codex, and these bots.
// The general rule reaches every client through the gg-mcp server instructions
// (IT-1177), and the full handbook is a wiki page (`tudas/ceges-agy`). What is
// NOT there is the part only a Marveen bot has: a second memory of its own, a
// `shared` shelf that four agents' hand-written CLAUDE.md files call "the common
// company memory", and an owner who sees only the Telegram/Slack reply, never
// the terminal. Without this block a bot keeps filing company knowledge on the
// fleet shelf, where no colleague can find it.
//
// Why a generated block and not a skill: the bots write the shared
// ~/.claude/skills tree themselves, without approval, so a skill is not a
// stable carrier for a company rule. The block is rewritten on every spawn.
//
// Why static text: the rule is the same for every bot. The owner's e-mail (for
// `dontotte`) comes from `gg_allowed_tools` at runtime, not from here.
//
// Scope: sub-agents via startAgentProcess (agent-process.ts), the main agent
// via the dashboard start (web.ts) -- unlike memory-rules, the main agent's
// hand-maintained CLAUDE.md carries nothing about the brain.
//
// Deliberately NOT here: templates, field lists, JSON examples. Those live in
// the handbook; a copy here would drift (see the memory-rules block's own
// "MUTASS IDE" rule). A test caps the body at 6000 characters.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const BRAIN_RULES_BEGIN = '<!-- BEGIN GENERATED: brain-rules (auto-generated, do not edit by hand) -->'
export const BRAIN_RULES_END = '<!-- END GENERATED: brain-rules -->'

// Non-greedy, so the regex stops at the FIRST end-marker rather than spanning
// to the last END in a file that holds several generated blocks.
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const BRAIN_RULES_BLOCK_RE = new RegExp(
  `${escape(BRAIN_RULES_BEGIN)}[\\s\\S]*?${escape(BRAIN_RULES_END)}`,
)

export function buildBrainRulesBody(): string {
  return [
    '## Céges agy: mi megy oda, és mi a saját memóriádba',
    '',
    'Ez a blokk minden indulásodkor újragenerálódik (IT-1178), ezért EZ a mérvadó szövege. A céges',
    'agy (brain.guest.guru) általános szabályait a gg-mcp minden session elején megadja (a szerver',
    'utasításában); a teljes kézikönyv: `gg_knowledge_get(topic: "ceges-agy")`. Ha mentés előtt',
    'bizonytalan vagy, azt olvasd el. Itt csak az áll, ami a Marveen-botokra külön érvényes.',
    '',
    '### A `shared` polc nem a céges agy',
    '',
    'A `shared` a flotta botjainak közös polca: a kollégák és az ő Claude Code-juk, Codexük nem',
    'látják. A céges agyat minden kolléga és minden agent látja és keresi. Ha a fenti, kézzel írt',
    'memória-szakaszod („Memória rendszer”) a `shared`-et közös céges memóriának nevezi, vagy azt',
    'mondja, hogy az egész cégre igaz tudás oda megy: 2026-09-29 óta EZ a blokk a mérvadó, a céges',
    'tudás a céges agyba megy.',
    '',
    '- Ne mentsd mindkét helyre. Ha a saját munkádhoz is kell, a saját memóriádba csak egy mutató',
    '  kerüljön („céges agy: <cím>”), ne a szöveg másolata.',
    '- Céges kérdésnél előbb a céges agyban keress (`brain_search`), utána a saját polcodon.',
    '- A „Mit szabad emlékbe írni” blokk személyes-adat-szabálya a `shared` polcra szól. A céges',
    '  agyba az ügyfél, a tulajdonos és a kolléga e-mailje, telefonszáma, adószáma, a szabadság és',
    '  a számlázási ügy belefér. Titok viszont ott sem: token, jelszó, és az az azonosító sem, ami',
    '  mögött auth nélküli végpont áll (tulaj- vagy lakás-UUID, `/tfh/…` link).',
    '',
    '### Hova kerül: döntsd el ebben a sorrendben',
    '',
    '1. **Titok, vagy auth nélküli végpont kulcsa?** Sehova.',
    '2. **Futó állapot** (nyitott, valakire vár, holnap folytatod)? A Linearba. A saját `hot`',
    '   tieredben követheted, a céges agyba nem kerül.',
    '3. **HR-ügy** (TÉR, teljesítményértékelés, fizetés, személyes konfliktus)? Csak a',
    '   `management` térbe, és csak ha a gazdád a tagja. Ha a mentés 403-at ad, ne mentsd máshova;',
    '   a saját, nem `shared` memóriádban maradhat, ha a munkádhoz kell.',
    '4. **Egy kollégának (embernek) is hasznos,** ha holnap ugyanebbe futna bele? A céges agyba',
    '   (`brain_save`), a pillanatban, kérés nélkül.',
    '5. **Csak a botok működéséről szól** (kapu, helper, a dashboard API, a flotta szabályai)? A',
    '   saját memóriádba; `shared`, ha minden botra igaz.',
    '6. **Csak a gazdádról szól** (hangnem, üzenet-gyakoriság, formátum, egyéni kérés)? A saját',
    '   memóriádba, `warm`.',
    '',
    'Példák a flotta saját emlékeiből:',
    '',
    '| Emlék | Hova |',
    '|---|---|',
    '| A szálláshely-szolgáltatási engedély névre szól, lakáseladásnál nem száll át a vevőre | céges agy, tény |',
    '| A GG3 `reviews.overall_score` 0–10-es skálán van, és a 0.0 hiányzó pontszám | céges agy, tanulság |',
    '| Nem vállalunk lakcímkártya-ügyintézést (egy kolléga döntése) | céges agy, döntés; `dontotte`: az ő e-mailje |',
    '| IFA-mérték kerületenként, a GG3-ból mérve | céges agy, tény; mérési dátummal és a GG3-táblára hivatkozva |',
    '| A Linear `users` név-szűrője a `name`-et nézi, a becenév a `displayName`-ben van | céges agy, tanulság |',
    '| A self-pace kapu a parancs alakját nézi; a `/api/memories` listázás plafonja | saját memória (`shared`, ha minden botra igaz) |',
    '| „Ne küldj ennyi köztes üzenetet” (a gazdád kérése) | saját memória, `warm` |',
    '| Egy számlázási hiba NYITOTT, egy kolléga válaszára vár | Linear; a hiba OKA tanulságként a céges agyba |',
    '',
    '### Kinek a nevében, és hogyan',
    '',
    '- A mentés a gazdád nevében megy: a gg-mcp tokened az övé. Ezért csak azt mentsd, ami a',
    '  gazdád munkájában született; amit egy másik bottól kaptál, azt az a bot mentse.',
    '- Döntésnél a `dontotte` a döntő ember e-mailje. A gazdádé a `gg_allowed_tools` válaszának',
    '  `en` mezőjében áll. Ha nem tudod, ki döntött: `agent`.',
    '- A tér alapból a gazdád csapatáé. Ha a hiba több teret sorol fel, a témához illőt válaszd;',
    '  ami az egész cégnek szól, az a `ceg`.',
    '- Ha a `brain_*` toolok nem látszanak, előbb a ToolSearch-csel töltsd be őket („brain”). Ha',
    '  így sincsenek, a `gg_allowed_tools` megmondja, hiányzik-e a `brain` csomag. A munka megy',
    '  tovább; a gazdádnak egy sorban szólj, hogy most nem mentettél a céges agyba.',
    '',
    '### Visszaigazolás és visszavonás',
    '',
    'A gazdád a terminált nem látja: a visszaigazolás abba az üzenetbe kerül, amit neki küldesz',
    '(Telegram- vagy Slack-válasz):',
    '',
    '> Elmentettem a céges agyba: „<cím>” (`<tér>` tér). Ha nem kéred, szólj, és visszavonom.',
    '',
    'Ha a válasz `letrejott: false`, a céges agy nem írt semmit (a tartalom már bent volt, vagy a',
    '`kulcs` foglalt): ezt mondd, ne a mentést.',
    '',
    'Heartbeatben és más háttérkörben, amit nem a gazdád üzenete indított (ütemezett feladat),',
    'ne ments a céges agyba: a mentés a gazdáddal folytatott beszélgetésben történik, látható',
    'visszaigazolással. Ha háttérkörben születik menthető tudás, a gazdádnak küldött következő',
    'üzenetben ajánld fel („Ezt elmenteném a céges agyba: …”), és a válasza után mentsd.',
    '',
    'Egy kivétel van: a `brain-promotion-<neved>` éjszakai átemelő kör (IT-1289). Abban a saját',
    'memóriád céges tudását te döntöd el és mented, felajánlás és üzenet nélkül, a feladat leírása',
    'szerint (Tamás döntése, 2026-10-03: a kollégát nem terheljük). Ezért a beszélgetésben menthető,',
    'de ott el nem mentett céges tudás a saját `warm` polcodra menjen, ne a `shared`-re: onnan éjjel',
    'átkerül.',
    '',
    'Ha a gazdád egy szóval visszavonja („ne”, „ezt ne”, „vond vissza”, „töröld”), a mentés',
    'válaszának `dontes` mezője dönt:',
    '',
    '- Nincs `dontes`, vagy `ADD`: `brain_archive` az `id`-vel, `ok`: „a gazda visszavonta”.',
    '  Válasz: „Visszavontam: „<cím>” (archiválva, visszaállítható).”',
    '- `UPDATE` vagy `SUPERSEDE`: NE archiváld. A mentés egy korábbi bejegyzést írt felül, és az',
    '  archiválás azt is kivenné a keresésből. `brain_get` az `id`-vel; a lánc előző tagjának',
    '  (`chain.older`) szövegét mentsd vissza új `kulcs`-csal és `felulirja: <id>`-vel, és mondd',
    '  meg a gazdának, hogy a korábbi változat állt vissza.',
    '',
    'Ha az `id` már nincs meg (közben újraindultál): `brain_search` a címre, `forrasok: ["agent"]`,',
    'mai `tol`-lal. Az archiválás visszaállítható: `brain_archive`, `visszaallitas: true`.',
  ].join('\n')
}

// Idempotently ensures the brain-rules block is present and current in an
// agent's CLAUDE.md. Same five-rule contract as ensureMemoryRulesSection: skip
// when there is no CLAUDE.md; replace only between the markers; append on first
// run; no write when the content is unchanged; atomic write.
//
// `agentClaudeMdDir` is injected: agent-process.ts passes agentDir(name) for a
// sub-agent, web.ts passes PROJECT_ROOT for the main agent.
export function ensureBrainRulesSection(
  agentClaudeMdDir: string,
  atomicWrite: (path: string, data: string) => void,
): void {
  const claudeMdPath = join(agentClaudeMdDir, 'CLAUDE.md')
  if (!existsSync(claudeMdPath)) return

  const block = `${BRAIN_RULES_BEGIN}\n${buildBrainRulesBody()}\n${BRAIN_RULES_END}`

  let existing: string
  try {
    existing = readFileSync(claudeMdPath, 'utf-8')
  } catch {
    return
  }

  const updated = BRAIN_RULES_BLOCK_RE.test(existing)
    ? existing.replace(BRAIN_RULES_BLOCK_RE, block)
    : existing.trimEnd() + '\n\n' + block + '\n'

  if (updated === existing) return
  atomicWrite(claudeMdPath, updated)
}
