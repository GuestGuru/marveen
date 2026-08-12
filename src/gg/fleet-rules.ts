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
