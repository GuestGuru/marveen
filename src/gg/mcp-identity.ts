// GG fork: rewrite the gg-access identity in a freshly scaffolded agent's
// .mcp.json so it is the AGENT's own, not the main agent's.
//
// Why (2026-08-11): agent-scaffold copies the project-root .mcp.json into every
// new agent dir, so the new agent inherits the common tool set -- which is the
// point. But the copy also carries the main agent's IDENTITY: the gg-mcp token
// file and the audit label. A new agent therefore starts out calling GG systems
// as `marveen/Marveen`, with the owner's full `superfejleszto` tier (commit,
// merge, secret write, GG3 write), and every call it makes is logged under the
// main agent's name, so afterwards nobody can tell who actually asked.
//
// Measured that day on the freshly created `bubi` agent (owner: Rita, a
// non-developer role whose own CLAUDE.md forbids writing code): its .mcp.json
// pointed at `tokens/marveen.token` with label `marveen/Marveen`. The
// `salesninja` agent only looks correct because someone fixed the same thing by
// hand back in August. The trap is even documented in the onboarding skill --
// and it still happened, because it relied on a human remembering a step.
//
// The fix keeps the copy (shared servers stay shared) and rewrites only the two
// identity fields. Missing token file is FINE and deliberate: gg-mcp then starts
// in "waiting for pairing" mode, so the agent runs but reaches nothing until the
// owner issues its token. Fail-closed beats inheriting someone else's rights.
//
// 2026-08-12 -- the same leak, on a transport the fix did not cover. gg-mcp also
// runs as a Streamable-HTTP service, and the main agent switched its own
// .mcp.json to it while measuring whether that transport survives a server
// restart (it does). In the remote shape there is no `env` block at all: the
// credential is a bearer token sitting in `headers.Authorization`. The rewrite
// below used to touch only `env`, so it would have written an empty `env` and
// copied the main agent's token through verbatim -- the PR #16 bug again, just
// over HTTP. Nothing had been scaffolded inside that window, so no agent was
// actually issued the token, but only luck separated the two.
//
// The root cause is structural and worth stating plainly: the main agent's
// working .mcp.json IS the scaffold template. Any transport the owner adopts
// for themselves is inherited by the next agent created, so this function has
// to be safe for shapes nobody has invented yet -- not just for the one in the
// repo today.
//
// Hence the rule: a gg-access entry that talks to a REMOTE endpoint is
// normalised back to the canonical stdio shape carrying the agent's own
// identity. It is not merely stripped of its header, because a credential-less
// remote config cannot heal: `gg_belepes` issues a token FILE, which the remote
// transport never reads, so such an agent would stay mute forever with no
// obvious cause. The stdio shape is the only one that carries a per-agent
// identity today AND participates in the pairing flow.
//
// A future deliberate per-agent HTTP rollout therefore has to extend this
// function on purpose -- write the NEW agent's token into the header -- rather
// than inherit the owner's by omission. That is the intended cost: the safe
// path is the default, and the flexible one has to be asked for.

/** Where a per-agent gg-mcp token lives, by convention. */
export function ggTokenPathFor(agentName: string, tokensDir = '/home/gg/gg-mcp/tokens'): string {
  return `${tokensDir}/${agentName}.token`
}

/** The stdio entrypoint of the local gg-mcp server, by convention. */
export const GG_MCP_STDIO_ENTRY = '/home/gg/gg-mcp/dist/index.js'

/**
 * True when a gg-access entry speaks to a remote endpoint (Streamable HTTP or
 * SSE) rather than spawning a local process.
 *
 * Deliberately broad: `url` alone is enough, whatever `type` claims. A remote
 * entry is assumed to carry the owner's credential somewhere -- header, query
 * string, URL path -- so no attempt is made to locate and surgically remove it.
 * Guessing where a secret hides is how the 2026-08-12 hole opened in the first
 * place.
 */
function isRemoteEntry(entry: Record<string, unknown>): boolean {
  if (typeof entry.url === 'string' && entry.url !== '') return true
  return entry.type === 'http' || entry.type === 'sse'
}

/**
 * Rewrite the gg-access identity for `agentName` in a parsed .mcp.json object.
 *
 * Returns a NEW object; the input is not mutated. Every other MCP server is
 * left exactly as copied, so this can never break an unrelated integration.
 *
 * For a local (stdio) gg-access entry only the two identity env vars change --
 * command, args and unrelated env vars survive. For a remote entry the whole
 * entry is replaced by the canonical stdio shape, dropping `url`, `headers` and
 * `type` along with whatever credential they held; see the file header for why
 * replacing beats stripping.
 *
 * Deliberately tolerant: an .mcp.json with no `gg-access` (or no `mcpServers`)
 * is returned untouched rather than "repaired". Scaffolding must not fail on a
 * config shape we did not expect, and inventing a server nobody asked for would
 * be worse than doing nothing.
 */
export function withOwnGgIdentity(
  config: unknown,
  agentName: string,
  tokensDir?: string,
  stdioEntry: string = GG_MCP_STDIO_ENTRY,
): unknown {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return config
  const root = config as Record<string, unknown>
  const servers = root.mcpServers
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return config
  const serverMap = servers as Record<string, unknown>
  const gg = serverMap['gg-access']
  if (!gg || typeof gg !== 'object' || Array.isArray(gg)) return config

  const ggObj = gg as Record<string, unknown>
  const identity = {
    GG_MCP_TOKEN_FILE: ggTokenPathFor(agentName, tokensDir),
    // Label format mirrors the existing fleet convention (`marveen/<agent>`),
    // so the audit trail groups per install and identifies the caller.
    GG_MCP_AGENT_LABEL: `marveen/${agentName}`,
  }

  // Remote entry: rebuild from scratch. Spreading `ggObj` here would carry the
  // owner's `headers` (and thus their bearer token) into the new agent, which
  // is the entire bug being fixed -- so the old entry is discarded, not merged.
  const rewritten = isRemoteEntry(ggObj)
    ? { command: 'node', args: [stdioEntry], env: identity }
    : {
        ...ggObj,
        env: {
          ...(ggObj.env && typeof ggObj.env === 'object' && !Array.isArray(ggObj.env)
            ? ggObj.env as Record<string, unknown>
            : {}),
          ...identity,
        },
      }

  return {
    ...root,
    mcpServers: {
      ...serverMap,
      'gg-access': rewritten,
    },
  }
}
