// A közös céges szabályt a gg-mcp instructions, a wiki és a telepített skillek adják.
// Ez a generált blokk csak a Marveen saját memóriaadapterét és gazdájának tokenjét
// köti hozzájuk. Minden induláskor frissül; a kézi persona többi része megmarad.
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
    '## Céges agy: központi szabályok, Marveen saját adapter',
    '',
    'A közös céges memória szabályainak forrása a gg-mcp szerver instructions és a kézikönyv:',
    '`gg_knowledge_get(topic: "ceges-agy")`. A gg-mcp telepíti a `ceges-agy` közös skillt',
    '(tool-leképezés, keresés, mentés, javítás, visszavonás) és a `memory-review` skillt',
    '(kliensoldali átnézés, forráshoz kötött javaslat). Hiányzó skillnél a kézikönyvet olvasd;',
    'helyi másolattal ne pótold a közös szabályokat. Ez a blokk csak a Marveen adaptere.',
    '',
    '### A `shared` polc nem a céges agy',
    '',
    'A `shared` a flotta botjainak közös polca: a kollégák Claude Code-ja és Codexe nem látja.',
    'Ha a kézi memória-szakaszod a `shared`-et közös céges memóriának nevezi, EZ a blokk a mérvadó:',
    'a céges tudás a céges agyba megy, a bot működése és a gazda preferenciái a saját memóriába.',
    'Ne mentsd mindkét helyre: saját felidézéshez elég a céges bejegyzésre mutató hivatkozás.',
    'A flotta személyes-adat-szabálya a `shared` polcra szól; a céges agy célterét és hozzáférését',
    'a központi szabály adja. Titok és auth nélküli végpont kulcsa egyik helyre sem kerülhet.',
    '',
    '### Gazda és háttérkör',
    '',
    'A mentés a gazdád nevében megy: a gg-mcp tokened az övé. Csak a gazdád munkájában született',
    'tudást mentsd; amit egy másik bottól kaptál, azt az a bot mentse. Idegen tokent ne használj.',
    'A visszaigazolás a gazdádnak küldött Telegram- vagy Slack-válasz része, a `ceges-agy`',
    'szabálya szerint; a terminált nem látja. Visszavonásnál ugyanazt a közös skillt kövesd.',
    '',
    'Heartbeatben és más háttérkörben ne ments a céges agyba: a következő gazdával folytatott',
    'beszélgetésben ajánld fel a tudást, és válasz után mentsd.',
    'Egy kivétel van: a `brain-promotion-<neved>` éjszakai átemelő kör. Ott a saját memóriád céges',
    'tudását te értékeled és mented, a gazdád tokenjével, felajánlás és üzenet nélkül.',
    'A saját `warm` polcodra kerüljön a beszélgetésben menthető, de ott el nem mentett céges tudás;',
    'a helyi átemelő adapter onnan veszi elő. A 40-es adag, sorrendkapu és kurzor megmarad.',
    '',
    '### Tartós célhely és forrás',
    '',
    'A dream-engine a flotta saját memória-egészségét és helyi működését vizsgálja; a céges',
    'memória átnézése a `memory-review` munkafolyamat, a saját tokeneddel. Ne végezz céges',
    'átemelést más bot helyett a fő agent sessionjéből.',
    'Céges tudás célja a wiki vagy a közös skill forrásrepója (gg-mcp), forrás-id-vel és konkrét',
    'javaslattal. Ne zárd a céges szabályt globális bot-created skillbe, ami a kollégákhoz nem jut el.',
    'A generált közös skill fájlját ne szerkeszd: a következő telepítés felülírja. Csak személyes',
    'és botműködési tudás kerüljön user/local skillbe, a gazda személyes működését érintő',
    'változtatáshoz az ő jóváhagyása kell.',
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
