// GG-specific: the inter-agent send rule as a MAINTAINED generated block.
//
// ── Why this file exists ────────────────────────────────────────────────────
//
// docs/inter-agent-send-reliability.md states the rule as mandatory and claims it
// reaches everyone: "The generated agent CLAUDE.md ... now documents this rule and
// points at the helper, so every agent in every fleet verifies its sends by
// default." Measured 2026-09-10 on this fleet: that is true of the MAIN agent only.
// The sentence is about templates/CLAUDE.md.template, which is the main agent's
// template ({{MAIN_AGENT_ID}}); sub-agents are scaffolded by agent-scaffold.ts,
// which never mentions the helper or the rule. All six sub-agents scored ZERO for
// 'MEGBIZHATO KULDES', zero for the id-check sentence and zero for 'agent-msg'.
// Positive control on the same patterns: the main CLAUDE.md scores 1, so the
// zeros are absence, not a broken grep.
//
// WHAT THAT MEASUREMENT DOES NOT SAY, and what I got wrong by assuming it did:
// the files are not the behaviour. Told that "you do not send through the helper",
// two agents answered with their actual practice -- jean and brokermarcsi both call
// scripts/agent-msg.sh with a quoted heredoc, and brokermarcsi checked the live
// helper's commit to prove the gate was already running on its sends. So the gap is
// in the INSTRUCTIONS, not necessarily in the traffic, and the messages table
// records no path, so current coverage is unknown rather than zero. That is exactly
// why the block is worth writing anyway, and brokermarcsi put the reason better
// than my original argument did: calling the helper is a HABIT, not a guarantee --
// its own CLAUDE.md shows raw curl in four places, so nothing holds it to that
// habit, and a fresh session is free to follow the documented example instead. A
// guard that depends on remembering is not a guard.
//
// What that costs is already on record in that same doc: a silent send failure
// (curl exits 0 on a rejected request) cost a main+sub pair 30-60 minutes of
// deadlock in 2026-07, because the sender believed it had delegated. Whether it
// has cost anything since is NOT measurable here -- the dashboard log keeps no
// per-request status for /api/messages, so "no evidence of loss" is not evidence
// of no loss.
//
// The block also carries the accent gate's response field, because the gate lives
// at POST /api/messages (src/gg/accent-gate.ts) and a warning nobody is told to
// read is not a warning.
//
// A marker block, not scaffold-time text, for exactly the reason written up in
// src/gg/fleet-rules-section.ts: text interpolated once at creation time is a
// snapshot, and every later correction reaches only agents created afterwards.
// This module never edits anything outside its own markers.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface SendReliabilityIdentity {
  /** The agent this CLAUDE.md belongs to -- goes into the example as `from`. */
  agentId: string
  /** Install root, so the helper path works from any CWD. */
  projectRoot: string
  /** Resolved dashboard origin for the curl example. */
  dashboardOrigin: string
  /** Path of the dashboard bearer token file. */
  tokenPath: string
}

export const SEND_RELIABILITY_BEGIN =
  '<!-- BEGIN GENERATED: inter-agent-send-reliability (auto-generated, do not edit by hand) -->'
export const SEND_RELIABILITY_END = '<!-- END GENERATED: inter-agent-send-reliability -->'

// Non-greedy, so a file holding several generated blocks does not get everything
// between the first BEGIN and the last END eaten.
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const SEND_RELIABILITY_BLOCK_RE = new RegExp(
  `${escape(SEND_RELIABILITY_BEGIN)}[\\s\\S]*?${escape(SEND_RELIABILITY_END)}`,
)

export function buildSendReliabilityBody(identity: SendReliabilityIdentity): string {
  const { agentId, projectRoot, dashboardOrigin, tokenPath } = identity
  const helper = join(projectRoot, 'scripts', 'agent-msg.sh')
  return [
    '## Inter-agent küldés: az `id` az EGYETLEN bizonyíték',
    '',
    'Ez a szekció a legutóbbi indulásodkor generálódott, tehát ez a MÉRVADÓ szövege.',
    '',
    '**A `curl -s ... >/dev/null && echo sent` minta VESZÉLYES.** A curl `0`-val tér vissza akkor is,',
    'ha a szerver ELUTASÍTOTTA a kérést (401, 400, 5xx), tehát a `&&` lefut, te látod a saját',
    '„sent" kiírásodat, és azt hiszed, hogy delegáltál. A címzett viszont semmit nem kapott.',
    'Ez NÉMA küldés-hiba: két ágens végtelenül várhat egymásra. 2026-07-ben egy ilyen',
    'elveszett visszajelzés 30-60 percre megállított egy fő- és egy alágenst, miközben a',
    'szerver egész idő alatt hibátlanul működött. A hiba teljes egészében a küldő oldalán volt:',
    'senki nem nézte meg a választ.',
    '',
    '**A szabály: egy üzenet CSAK akkor számít elküldöttnek, ha a válaszban visszajött egy `id`**',
    '(`{"id":<n>,"status":"pending",...}` HTTP 200-zal). Ellenőrizd a HTTP-kódot ÉS az `id`-t,',
    'és küldd újra, ha nincs.',
    '',
    'Egy sorból megkapod mindkettőt, plusz a 3x újraküldést és a hiba-naplót:',
    '```bash',
    `bash ${helper} ${agentId} CIMZETT "Az üzenet szövege."   # -> OK id=<n>  vagy  FAIL`,
    `# hosszú vagy többsoros szöveghez a content jöhet STDIN-en, IDÉZETT heredoc-kal:`,
    `cat <<'EOF' | bash ${helper} ${agentId} CIMZETT -`,
    '... a szöveg, backtick és $változó is épen marad ...',
    'EOF',
    '```',
    '⚠️ **Az argumentumos alak CSONKÍTHAT, és a küldés akkor is sikeresnek látszik.** Mérve',
    '2026-09-10-én: egy üzenet 1303 karakter után elvágódott, pontosan ott, ahol egy idézőjel',
    'következett, mert a HÍVÓ shellje a dupla idézőjeles argumentumban lezárta a stringet. A',
    'script ebből semmit nem lát, a POST sikerül, és `OK id=<n>` megy vissza FÉL TARTALOMMAL.',
    'Ez ugyanaz a néma küldés-hiba, ami ellen a szabály készült, csak egy szinttel beljebb, és',
    'az `id`-ellenőrzés NEM fogja meg. A helper 2026-09-10 óta szól, ha argv-ról jött szöveg nem',
    'mondatvégen ér véget, de ez csak tünet-jelzés: a megoldás az, hogy hosszú szöveget',
    'MINDIG STDIN-en adsz át.',
    '',
    '⚠️ **A csatorna NEM bájthű.** A helper levágja a szöveg végéről az újsort (a végpont is',
    'levágná, csak a helper ér oda előbb). Mérve 2026-09-10: 10000 karakter záró újsor nélkül',
    '10000-ként tárolódik, ugyanaz egy záró újsorral 9999-ként. Prózánál ez semmi, viszont',
    'kódrészletnél vagy fájl-töredéknél NÉMA tartalomváltozás, és a küldés közben hibátlanul',
    '`OK`-t ír. Ezt nem javítjuk, mert a csatorna ÜZENETET visz, nem adatot: ha bájtokat kell',
    'átvinned, írd fájlba és a fájl útvonalát küldd el.',
    '',
    'Az idézett `EOF` az, ami kikapcsolja a shell-expanziót. Idézőjelek nélküli heredocban',
    'vagy dupla idézőjeles argumentumban a shell MÁR a script előtt kifejti a backtickeket és',
    'a `$változó`-kat, és az üzenet lyukakkal érkezik meg, miközben a küldés hibátlanul',
    '„OK id=<n>"-t ír. A helper `json.dumps`-szal építi a bodyt, tehát a JSON-oldalon nincs',
    'idézőjel-csapda.',
    '',
    'Ha nyers curl-t használsz, a szabály ugyanaz, csak neked kell megcsinálnod:',
    '```bash',
    `curl -s -X POST ${dashboardOrigin}/api/messages -H "Content-Type: application/json" \\`,
    `  -H "Authorization: Bearer $(cat ${tokenPath})" -d @- <<'EOF'`,
    `{"from":"${agentId}","to":"CIMZETT","content":"..."}`,
    'EOF',
    '```',
    '',
    '⚠️ **A válasz `accentWarning` mezőjét is olvasd el.** A POST /api/messages 2026-09-10 óta',
    'ékezet-kaput futtat a kimenő szövegen (ugyanaz a mért detektor, mint a memória-íráson:',
    '2,0 ékezet/100 karakter, 200 karakter felett, magyarnak látszó szövegen). NEM blokkol, és',
    'NEM hibajelzés: az üzenet elment. Viszont ha ott van a mező, a szöveged magyarnak látszik',
    'és szinte nincs benne ékezet, tehát a címzett romlott szöveget kapott. Javítani csak',
    'újraküldéssel lehet, megmondva, melyik üzenetet váltja.',
    '',
    'Miért nem elég a jószándék: a romlás nem az írás útjától jön, hanem a MUNKAANYAG',
    'REGISZTERÉTŐL. Ha körülötted ASCII áll (azonosítók, útvonalak, mért számok), a szöveg már',
    'ékezet nélkül SZÜLETIK MEG, és onnantól a sorozat minden darabja olyan lesz. Mérve',
    '2026-09-10-én a flotta teljes üzenet-előzményén: a találatok ülésekben csomósodnak, nem',
    'ágensekre oszlanak, és a legnagyobb csomó egyetlen körlevél volt hat címzettnek, vagyis',
    'EGY elrontott fogalmazás hatszor ment ki.',
  ].join('\n')
}

// Same five-rule idempotency contract as ensureFleetRulesSection: no CLAUDE.md ->
// skip; markers present -> replace only between them; absent -> append; unchanged
// content -> no write at all; every write atomic.
export function ensureSendReliabilitySection(
  agentClaudeMdDir: string,
  identity: SendReliabilityIdentity,
  atomicWrite: (path: string, data: string) => void,
): void {
  const claudeMdPath = join(agentClaudeMdDir, 'CLAUDE.md')
  if (!existsSync(claudeMdPath)) return

  const block = `${SEND_RELIABILITY_BEGIN}\n${buildSendReliabilityBody(identity)}\n${SEND_RELIABILITY_END}`

  let existing: string
  try {
    existing = readFileSync(claudeMdPath, 'utf-8')
  } catch {
    return
  }

  const updated = SEND_RELIABILITY_BLOCK_RE.test(existing)
    ? existing.replace(SEND_RELIABILITY_BLOCK_RE, block)
    : existing.trimEnd() + '\n\n' + block + '\n'

  if (updated === existing) return
  atomicWrite(claudeMdPath, updated)
}
