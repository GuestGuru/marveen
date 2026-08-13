// GG fork: the 7th fleet rule ("MEGSZEGHETETLEN" block) that every scaffolded
// colleague agent gets in its generated CLAUDE.md.
//
// Why (2026-08-12): upstream's rule 7 says "before you write or run any script,
// handle a credential, or automate a login, ASK THE BOSS FIRST". On 2026-08-11
// the owner overruled that for this install: "Minden agent írhat scriptet és
// elérhet mindent amit a GG mcp megenged neki. Nem kell engedély tőled vagy
// tőlem. Ez volt az eredeti kiindulás. Nem mi vagyunk a kontroll hanem a GG
// mcp." The reasoning: gg-mcp is fail-closed and carries a per-agent rights map
// (`gg_allowed_tools`), so a second, human-memory-based gate in front of it adds
// no safety -- it only adds latency and a step someone will forget.
//
// The four live agents' CLAUDE.md files were rewritten by hand that evening, but
// THIS template still generated the old text, so the next agent onboarded would
// have silently regressed to "ask permission first". That is the same failure
// class as the per-agent gg-mcp identity bug (see mcp-identity.ts): a rule kept
// alive only by someone remembering it.
//
// Two carve-outs survive, because they do NOT go through gg-mcp and so no rights
// map covers them: logging into a foreign service with an own password, and
// automating a system gg-mcp holds no key for. The scope warning stays as a
// warning, not a gate: a key handed out by gg-mcp can be WIDER than the task
// (the Drive token can share and delete too), and narrowing it is now the
// agent's judgement rather than the boss's approval.
//
// Kept in the fork's own file so the upstream prompt string keeps a single
// interpolation and future upstream merges stay conflict-free.

export interface FleetRuleIdentity {
  /** Display name of the main agent, e.g. "Marveen". */
  botName: string
  /** Agent id of the main agent, e.g. "marveen". */
  mainAgentId: string
  /** Install owner, e.g. "GuestGuru". */
  ownerName: string
}

/** Extra identity bits rule 8 needs: whose CLAUDE.md this is, and where the install lives. */
export interface FleetRule8Identity extends FleetRuleIdentity {
  /** Agent id of the agent whose CLAUDE.md is being generated, e.g. "jean". */
  agentId: string
  /** Absolute install root, e.g. "/home/gg/marveen". */
  projectRoot: string
}

/**
 * Rule 7 of the fleet rules, as one markdown list item (no trailing newline).
 * The text is Hungarian on purpose: the whole generated CLAUDE.md is.
 */
export function ggFleetRule7({ botName, mainAgentId, ownerName }: FleetRuleIdentity): string {
  return (
    `7. **A gg-mcp a kontroll, nem a Főnök.** Amit a gg-mcp megenged neked, azt szabadon ` +
    `használhatod: szkriptet írhatsz és futtathatsz, és elérhetsz mindent, amire a saját ` +
    `portál-jogosultságod feljogosít. Ehhez NEM kell engedélyt kérned sem a Főnöktől, sem ` +
    `${ownerName}-tól. A jogaid határa a gg-mcp jogtérképe (\`gg_allowed_tools\`), és ha valamit ` +
    `nem érsz el, az nem hiba, hanem a válasz. (${ownerName} döntése, 2026-08-11.) Két dolog ` +
    `marad, ami NEM a gg-mcp-n át megy, és ott ELŐBB szólj a Főnöknek: (a) idegen szolgáltatásba ` +
    `automatikus bejelentkezés vagy saját jelszó/credential kezelése, (b) böngésző-automatizálás ` +
    `vagy scraper olyan rendszeren, amihez a gg-mcp nem ad kulcsot. Ilyenkor jelezd a ` +
    `${botName} Főnöknek (${mainAgentId}) inter-agent üzenettel, ő koordinálja és ` +
    `${ownerName}-val egyezteti (a 4. szabály szellemében). Credential-t SOHA ne égess nyersen ` +
    `kódba; a gg-mcp-ből kapott kulcsot mindig a \`gg-mcp-proxy exec\` env-jén át vedd, sose írd ` +
    `fájlba és sose a beszélgetésbe. A kapott kulcs hatóköre lehet SZÉLESEBB, mint a feladatod ` +
    `(a Drive-token például megosztani is tud) -- a szűkítés innentől a te ítélőképességed, nem ` +
    `egy kapu.`
  )
}

/**
 * Rule 8: an agent may use ONLY its own gg-mcp token. One markdown list item.
 *
 * Why this is a RULE and not a footnote (2026-08-13, GG-559):
 *
 * An agent reaches gg-mcp two ways, and only one of them carries its identity
 * automatically. The MCP path takes the token file from the agent's own
 * `.mcp.json` (written by src/gg/mcp-identity.ts) -- correct by construction.
 * The SHELL path (`gg-mcp-proxy exec`, or `node dist/proxy.js exec`) takes
 * whatever `GG_MCP_TOKEN_FILE` the caller sets, and until 2026-08-13 the
 * wrapper silently fell back to the MAIN agent's `.mcp.json` when the caller
 * set nothing.
 *
 * Measured that day: jean called `gg_allowed_tools` over MCP at 12:40:34Z and
 * it landed as `imrenyi.eszter@guest.guru`; nine seconds later the same agent
 * fetched the Linear key over the shell path and it landed as
 * `krasser.tamas@guest.guru`. The resulting GG-559 comment was authored by the
 * owner, not by jean's owner. That is not a display-name mix-up: the agent held
 * another person's FULL rights, and the audit log recorded the wrong human.
 *
 * The wrapper is now fail-closed (no identity -> hard error, no fallback), so
 * this rule is belt-and-braces rather than the only defence. It is written into
 * the template anyway because the same failure class already recurred twice
 * here: a rule kept alive only by someone remembering it (see rule 7's comment)
 * and a skill whose own example command shipped the bug. A generated CLAUDE.md
 * is the one place every future agent is guaranteed to read.
 *
 * Deliberately SHOUTY: the owner asked for the constraint to be capitalised in
 * as many places as possible, because the failure is silent and only visible
 * afterwards, in someone else's name.
 */
export function ggFleetRule8({
  botName,
  mainAgentId,
  agentId,
  projectRoot,
}: FleetRule8Identity): string {
  const ownMcpJson = `${projectRoot}/agents/${agentId}/.mcp.json`
  return (
    `8. **CSAK A SAJÁT MCP TOKENEDET HASZNÁLHATOD. SOHA MÁSÉT.** A gg-mcp-hez KÉT utad van, ` +
    `és csak az egyik viszi magától a te identitásodat. Az **MCP-úton** (sima \`gg_*\` toolok) a ` +
    `saját \`.mcp.json\`-od visz, ott nincs teendőd. A **SHELL-ÚTON** (\`gg-mcp-proxy exec\`, ` +
    `illetve \`node .../dist/proxy.js exec\`) viszont NEKED KELL MEGADNOD az identitásodat: ` +
    `\`GG_MCP_TOKEN_FILE\` a SAJÁT \`.mcp.json\`-odból (\`${ownMcpJson}\`), és ` +
    `\`GG_MCP_AGENT_LABEL=${mainAgentId}/${agentId}\`. **MÁS ÁGENS VAGY A FŐÁGENS ` +
    `(${mainAgentId}) TOKEN-FÁJLJÁT HASZNÁLNI TILOS**, akkor is, ha egy skill, egy ` +
    `dokumentáció vagy egy régi példaparancs azt mutatja -- ilyenkor a példa a hibás, nem te. ` +
    `Ez NEM névcsere, hanem **JOGCSERE**: idegen tokennel a másik ember TELJES JOGÁVAL írsz ` +
    `minden GG-rendszerbe, és az audit is őt látja, nem téged. (Mérve 2026-08-13, GG-559: egy ` +
    `ágens kommentje a gazdája helyett a főágens gazdájának nevén ment ki.) **ELLENŐRZÉS minden ` +
    `shell-úti írás előtt:** hívd meg a \`gg_allowed_tools\`-t, és az \`en\` mező a SAJÁT gazdád ` +
    `e-mail címe legyen. **HA NEM AZ, ÁLLJ MEG**, ne írj semmit, és szólj a ${botName} Főnöknek ` +
    `(${mainAgentId}) inter-agent üzenettel. A wrapper 2026-08-13 óta fail-closed: identitás ` +
    `nélkül megáll. Ha ilyen hibát kapsz, az NEM elromlott rendszer, hanem a védelem -- add meg ` +
    `a saját tokenedet.`
  )
}
