// GG fork (v1.46.1 merge, 2026-11-05): the gg-mcp proxy exec lane of the Bash egress parser.
// Upstream's launched-fetch reading denied `gg-mcp-proxy exec --alias <a> -- curl ...`, the
// way every colleague agent reaches Linear, Slack and Google Drive. Replayed on 1824 real
// fleet commands, 15 were newly denied, all of this form. See ggProxyExec.
import { describe, it, expect } from 'vitest'
// @ts-expect-error -- plain .mjs hook script, no types
import { classify, ggProxyExec } from '../../scripts/hooks/bash-egress-parser.mjs'

const deny = (cmd: string): boolean => classify(cmd).deny

describe('gg-mcp proxy exec lane', () => {
  it('recognises only the proxy exec forms', () => {
    expect(ggProxyExec('gg-mcp-proxy', ['exec', '--alias', 'linear', '--', 'curl', 'https://api.linear.app/graphql'])).toBe(true)
    expect(ggProxyExec('node', ['/home/u/.gg-mcp/proxy.bundle.js', 'exec', '--alias', 'x', '--', 'curl', 'https://x.io'])).toBe(true)
    expect(ggProxyExec('gg-mcp-proxy', ['exec', '--alias', 'x', 'curl', 'https://x.io'])).toBe(false) // no `--`
    expect(ggProxyExec('node', ['/tmp/proxy.bundle.js', 'exec', '--', 'curl', 'https://x.io'])).toBe(false) // not ~/.gg-mcp
    expect(ggProxyExec('node', ['/home/u/.gg-mcp/proxy.bundle.js', 'serve', '--', 'curl'])).toBe(false) // not exec
  })

  it('passes the proxy segment, as before the merge', () => {
    expect(deny('/home/gg/.local/bin/gg-mcp-proxy exec --alias linear -- curl -s https://api.linear.app/graphql')).toBe(false)
    expect(deny("timeout 110 env GG_MCP_TOKEN_FILE=/t GG_MCP_AGENT_LABEL=a/b gg-mcp-proxy exec --alias slack -- sh -c 'curl -s \"$U\" -o x'")).toBe(false)
    expect(deny('node /home/gg/.gg-mcp/proxy.bundle.js exec --alias linear -- curl -s https://api.linear.app/graphql')).toBe(false)
  })

  it('still judges every OTHER segment of the same command', () => {
    expect(deny('gg-mcp-proxy exec --alias linear -- git status; curl -s https://example.org/x')).toBe(true)
    expect(deny('curl -s https://example.org/x && node /home/gg/.gg-mcp/proxy.bundle.js exec --alias x -- true')).toBe(true)
  })

  it('a look-alike program is not the lane', () => {
    expect(deny('node /tmp/proxy.bundle.js exec --alias x -- curl -s https://example.org/x')).toBe(true)
    expect(deny('mcp-proxy exec --alias x -- curl -s https://example.org/x')).toBe(true)
  })
})
