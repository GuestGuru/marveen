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

/** Where a per-agent gg-mcp token lives, by convention. */
export function ggTokenPathFor(agentName: string, tokensDir = '/home/gg/gg-mcp/tokens'): string {
  return `${tokensDir}/${agentName}.token`
}

/**
 * Rewrite the gg-access identity for `agentName` in a parsed .mcp.json object.
 *
 * Returns a NEW object; the input is not mutated. Only two env fields change --
 * command, args and every other server are left exactly as copied, so this can
 * never break an unrelated MCP server.
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
): unknown {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return config
  const root = config as Record<string, unknown>
  const servers = root.mcpServers
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return config
  const serverMap = servers as Record<string, unknown>
  const gg = serverMap['gg-access']
  if (!gg || typeof gg !== 'object' || Array.isArray(gg)) return config

  const ggObj = gg as Record<string, unknown>
  const env = (ggObj.env && typeof ggObj.env === 'object' && !Array.isArray(ggObj.env))
    ? ggObj.env as Record<string, unknown>
    : {}

  return {
    ...root,
    mcpServers: {
      ...serverMap,
      'gg-access': {
        ...ggObj,
        env: {
          ...env,
          GG_MCP_TOKEN_FILE: ggTokenPathFor(agentName, tokensDir),
          // Label format mirrors the existing fleet convention (`marveen/<agent>`),
          // so the audit trail groups per install and identifies the caller.
          GG_MCP_AGENT_LABEL: `marveen/${agentName}`,
        },
      },
    },
  }
}
