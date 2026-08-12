// GG fork: tests for the per-agent gg-mcp identity rewrite.
//
// The bug this guards against is silent by construction: a new agent with the
// main agent's token works perfectly -- it just works with the WRONG rights,
// under the WRONG name in the audit log. Nothing fails, so only a test catches
// a regression.

import { describe, it, expect } from 'vitest'
import { withOwnGgIdentity, ggTokenPathFor, GG_MCP_STDIO_ENTRY } from '../gg/mcp-identity.js'

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

// 2026-08-12: the same inheritance bug, over the Streamable-HTTP transport. In
// the remote shape the credential is a bearer token in `headers`, not a token
// FILE in `env`, so the original env-only rewrite copied it straight through.
// These tests exist because the failure is silent: the scaffolded agent works
// perfectly, with the owner's rights, under the owner's name.
describe('withOwnGgIdentity — remote (HTTP/SSE) gg-access', () => {
  // Shaped like a real gg-mcp token, deliberately NOT one. A fixture that holds
  // a live credential is a leak with extra steps -- the repo is the one place
  // the owner's token must never reach.
  const OWNER_TOKEN = `ggp_${'0'.repeat(64)}`
  const HTTP_COPY = {
    mcpServers: {
      'gg-access': {
        type: 'http',
        url: 'http://127.0.0.1:3450/mcp',
        headers: { Authorization: `Bearer ${OWNER_TOKEN}` },
      },
    },
  }

  // The one assertion that would have caught the real bug.
  it('never carries the owner’s bearer token into the new agent’s config', () => {
    const out = withOwnGgIdentity(HTTP_COPY, 'bubi')
    expect(JSON.stringify(out)).not.toContain(OWNER_TOKEN)
    expect(JSON.stringify(out)).not.toContain('ggp_')
  })

  it('normalises the remote entry to the canonical stdio shape', () => {
    const out = withOwnGgIdentity(HTTP_COPY, 'bubi') as {
      mcpServers: Record<string, Record<string, unknown>>
    }
    expect(out.mcpServers['gg-access']).toEqual({
      command: 'node',
      args: [GG_MCP_STDIO_ENTRY],
      env: {
        GG_MCP_TOKEN_FILE: '/home/gg/gg-mcp/tokens/bubi.token',
        GG_MCP_AGENT_LABEL: 'marveen/bubi',
      },
    })
  })

  // Merging instead of replacing is exactly how the token would survive, so the
  // absence of these keys is load-bearing, not cosmetic.
  it.each(['headers', 'url', 'type'])('drops the remote-only key %s', (key) => {
    const out = withOwnGgIdentity(HTTP_COPY, 'bubi') as {
      mcpServers: Record<string, Record<string, unknown>>
    }
    expect(out.mcpServers['gg-access']).not.toHaveProperty(key)
  })

  it.each([
    ['sse transport', { type: 'sse', url: 'https://x/mcp', headers: { Authorization: 'Bearer ggp_x' } }],
    ['url with no type', { url: 'http://127.0.0.1:3450/mcp', headers: { Authorization: 'Bearer ggp_x' } }],
    ['type with no url', { type: 'http', headers: { Authorization: 'Bearer ggp_x' } }],
    ['credential in the URL path', { type: 'http', url: 'http://127.0.0.1:3450/mcp/ggp_x' }],
  ])('treats %s as remote and rebuilds it', (_label, entry) => {
    const out = withOwnGgIdentity({ mcpServers: { 'gg-access': entry } }, 'bubi') as {
      mcpServers: Record<string, Record<string, unknown>>
    }
    expect(out.mcpServers['gg-access'].command).toBe('node')
    expect(JSON.stringify(out)).not.toContain('ggp_')
  })

  it('honours a custom tokens dir and stdio entry', () => {
    const out = withOwnGgIdentity(HTTP_COPY, 'bubi', '/tmp/t', '/opt/gg-mcp/index.js') as {
      mcpServers: Record<string, Record<string, unknown>>
    }
    expect(out.mcpServers['gg-access'].args).toEqual(['/opt/gg-mcp/index.js'])
    expect(out.mcpServers['gg-access'].env).toMatchObject({
      GG_MCP_TOKEN_FILE: '/tmp/t/bubi.token',
    })
  })

  it('leaves other MCP servers alone when gg-access is remote', () => {
    const withExtra = {
      mcpServers: {
        ...HTTP_COPY.mcpServers,
        'aiam-blog': { command: 'node', args: ['/x.js'], env: { SOME: 'value' } },
      },
    }
    const out = withOwnGgIdentity(withExtra, 'bubi') as typeof withExtra
    expect(out.mcpServers['aiam-blog']).toEqual(withExtra.mcpServers['aiam-blog'])
  })

  it('does not mutate the input', () => {
    const input = JSON.parse(JSON.stringify(HTTP_COPY))
    withOwnGgIdentity(input, 'bubi')
    expect(input.mcpServers['gg-access'].headers.Authorization).toBe(`Bearer ${OWNER_TOKEN}`)
  })
})
