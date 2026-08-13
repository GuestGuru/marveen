// GG fork regression test for the 2026-08-13 cross-identity write (GG-559).
//
// An agent reaches gg-mcp two ways, and only one of them carries its identity
// automatically. On the MCP path the agent's own `.mcp.json` supplies the token
// file. On the SHELL path (`gg-mcp-proxy exec` / `node dist/proxy.js exec`) the
// caller supplies it -- and the wrapper used to fall back to the MAIN agent's
// `.mcp.json` when the caller supplied nothing.
//
// Measured that day: jean called `gg_allowed_tools` over MCP at 12:40:34Z and it
// landed as `imrenyi.eszter@guest.guru`; nine seconds later the same agent
// fetched the Linear key over the shell path and it landed as
// `krasser.tamas@guest.guru`. The GG-559 comment was then authored by the wrong
// human -- with that human's full rights, and with the audit log agreeing.
//
// The wrapper is fail-closed now, so this rule is the second layer. It is still
// worth locking down, because this failure class has already recurred twice
// here: a rule that lived only in someone's memory (rule 7), and a skill whose
// own example command shipped the bug.
//
// Locked down here: the rule text, the fact that it names the agent's OWN paths
// (not the main agent's), and that the scaffold prompt interpolates it rather
// than carrying a hardcoded copy.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ggFleetRule8 } from '../gg/fleet-rules.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCAFFOLD_PATH = join(__dirname, '..', 'web', 'agent-scaffold.ts')

const IDENTITY = {
  botName: 'Marveen',
  mainAgentId: 'marveen',
  ownerName: 'GuestGuru',
  agentId: 'jean',
  projectRoot: '/home/gg/marveen',
}

describe('ggFleetRule8: only your own gg-mcp token', () => {
  const rule = ggFleetRule8(IDENTITY)

  it('starts as list item 8 so it drops into the numbered fleet-rules block', () => {
    expect(rule.startsWith('8. ')).toBe(true)
    expect(rule).not.toMatch(/\n/)
  })

  it('points at the AGENT OWN .mcp.json, never the main agent as the source', () => {
    expect(rule).toContain('/home/gg/marveen/agents/jean/.mcp.json')
    // The exact bug: the main agent's file being used as the identity source.
    // It may only appear as the thing that is FORBIDDEN, never as the path to read.
    expect(rule).not.toContain('/home/gg/marveen/.mcp.json')
  })

  it('names both env vars the shell path needs, with the agent own label', () => {
    expect(rule).toContain('GG_MCP_TOKEN_FILE')
    expect(rule).toContain('GG_MCP_AGENT_LABEL=marveen/jean')
  })

  it('forbids the main agent token explicitly, in capitals', () => {
    expect(rule).toContain('TOKEN-FÁJLJÁT HASZNÁLNI TILOS')
    expect(rule).toContain('CSAK A SAJÁT MCP TOKENEDET HASZNÁLHATOD')
  })

  it('says it is a rights swap, not a display-name swap', () => {
    // Why an agent should care: it is not cosmetic. Someone reading only "wrong
    // name in the audit" would deprioritise it.
    expect(rule).toContain('JOGCSERE')
    expect(rule).toContain('TELJES JOGÁVAL')
  })

  it('gives a check the agent can actually run, and a stop instruction', () => {
    expect(rule).toContain('gg_allowed_tools')
    expect(rule).toContain('HA NEM AZ, ÁLLJ MEG')
  })

  it('tells the agent that a fail-closed wrapper error is the defence, not a bug', () => {
    // Otherwise the next agent to hit the hard error "fixes" it by reaching for
    // a token file that does exist -- the main agent's -- and we are back to the
    // original bug.
    expect(rule).toContain('fail-closed')
    expect(rule).toContain('NEM elromlott rendszer')
  })

  it('is parameterised, not hardcoded to this install or this agent', () => {
    const other = ggFleetRule8({
      botName: 'Tanfield',
      mainAgentId: 'tanfield',
      ownerName: 'Acme',
      agentId: 'zola',
      projectRoot: '/srv/tanfield',
    })
    expect(other).toContain('/srv/tanfield/agents/zola/.mcp.json')
    expect(other).toContain('GG_MCP_AGENT_LABEL=tanfield/zola')
    expect(other).not.toMatch(/Marveen|marveen|jean|home\/gg/)
  })
})

describe('generateClaudeMd prompt: rule 8 comes from the fork module', () => {
  const src = readFileSync(SCAFFOLD_PATH, 'utf-8')

  it('interpolates ggFleetRule8 in the fleet-rules block', () => {
    expect(src).toContain('${ggFleetRule8(')
    expect(src).toMatch(/import\s*{[^}]*ggFleetRule8[^}]*}\s*from\s*'\.\.\/gg\/fleet-rules\.js'/)
  })

  it('passes the scaffolded agent own id, not the main agent id', () => {
    // `name` is generateClaudeMd()'s first parameter: the NEW agent's id. Passing
    // MAIN_AGENT_ID here would generate a rule telling every colleague to use the
    // main agent's token -- the precise inversion of the rule.
    expect(src).toMatch(/ggFleetRule8\(\{[^}]*agentId:\s*name[^}]*\}\)/)
  })

  it('keeps rule 7 interpolated too, so 8 did not displace it', () => {
    expect(src).toContain('${ggFleetRule7(')
  })
})
