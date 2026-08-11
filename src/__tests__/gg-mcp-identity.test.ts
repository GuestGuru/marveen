// GG fork: tests for the per-agent gg-mcp identity rewrite.
//
// The bug this guards against is silent by construction: a new agent with the
// main agent's token works perfectly -- it just works with the WRONG rights,
// under the WRONG name in the audit log. Nothing fails, so only a test catches
// a regression.

import { describe, it, expect } from 'vitest'
import { withOwnGgIdentity, ggTokenPathFor } from '../gg/mcp-identity.js'

const MAIN_COPY = {
  mcpServers: {
    'gg-access': {
      command: 'node',
      args: ['/home/gg/gg-mcp/dist/index.js'],
      env: {
        GG_MCP_TOKEN_FILE: '/home/gg/gg-mcp/tokens/marveen.token',
        GG_MCP_AGENT_LABEL: 'marveen/Marveen',
      },
    },
  },
}

describe('ggTokenPathFor', () => {
  it('follows the fleet convention', () => {
    expect(ggTokenPathFor('bubi')).toBe('/home/gg/gg-mcp/tokens/bubi.token')
  })

  it('honours a custom tokens dir', () => {
    expect(ggTokenPathFor('bubi', '/tmp/t')).toBe('/tmp/t/bubi.token')
  })
})

describe('withOwnGgIdentity', () => {
  it('replaces the inherited main-agent identity with the agent’s own', () => {
    const out = withOwnGgIdentity(MAIN_COPY, 'bubi') as typeof MAIN_COPY
    expect(out.mcpServers['gg-access'].env).toEqual({
      GG_MCP_TOKEN_FILE: '/home/gg/gg-mcp/tokens/bubi.token',
      GG_MCP_AGENT_LABEL: 'marveen/bubi',
    })
  })

  it('leaves command and args untouched — only identity changes', () => {
    const out = withOwnGgIdentity(MAIN_COPY, 'bubi') as typeof MAIN_COPY
    expect(out.mcpServers['gg-access'].command).toBe('node')
    expect(out.mcpServers['gg-access'].args).toEqual(['/home/gg/gg-mcp/dist/index.js'])
  })

  it('does not mutate the input', () => {
    const input = JSON.parse(JSON.stringify(MAIN_COPY))
    withOwnGgIdentity(input, 'bubi')
    expect(input.mcpServers['gg-access'].env.GG_MCP_TOKEN_FILE)
      .toBe('/home/gg/gg-mcp/tokens/marveen.token')
  })

  it('keeps other MCP servers exactly as they were', () => {
    const withExtra = {
      mcpServers: {
        ...MAIN_COPY.mcpServers,
        'aiam-blog': { command: 'node', args: ['/x.js'], env: { SOME: 'value' } },
      },
    }
    const out = withOwnGgIdentity(withExtra, 'bubi') as typeof withExtra
    expect(out.mcpServers['aiam-blog']).toEqual(withExtra.mcpServers['aiam-blog'])
  })

  it('preserves unrelated env vars on gg-access', () => {
    const withEnv = {
      mcpServers: {
        'gg-access': {
          command: 'node',
          args: [],
          env: { ...MAIN_COPY.mcpServers['gg-access'].env, KEEP_ME: '1' },
        },
      },
    }
    const out = withOwnGgIdentity(withEnv, 'bubi') as typeof withEnv
    expect(out.mcpServers['gg-access'].env.KEEP_ME).toBe('1')
  })

  it('adds the identity when gg-access has no env block at all', () => {
    const noEnv = { mcpServers: { 'gg-access': { command: 'node', args: [] } } }
    const out = withOwnGgIdentity(noEnv, 'bubi') as { mcpServers: Record<string, { env: Record<string, string> }> }
    expect(out.mcpServers['gg-access'].env.GG_MCP_AGENT_LABEL).toBe('marveen/bubi')
  })

  // Tolerance: scaffolding must never die on an unexpected shape, and inventing
  // a gg-access server nobody configured would be worse than doing nothing.
  it.each([
    ['no gg-access', { mcpServers: { other: { command: 'x' } } }],
    ['no mcpServers', { something: 'else' }],
    ['mcpServers is an array', { mcpServers: [] }],
    ['gg-access is a string', { mcpServers: { 'gg-access': 'nope' } }],
    ['null', null],
    ['an array', []],
    ['a string', 'not json'],
  ])('returns %s untouched', (_label, input) => {
    expect(withOwnGgIdentity(input, 'bubi')).toBe(input)
  })
})
