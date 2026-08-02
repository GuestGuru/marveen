// GG fork: per-agent human owner (src/gg/agent-owner.ts).
//
// The regression these guard: upstream substitutes ONE global OWNER_NAME into
// every generated persona, so on a shared company install every colleague's bot
// was told it belongs to the operator. The fallback tests matter just as much
// as the override ones -- an install that never sets an owner must keep the
// exact upstream behaviour, otherwise this feature is a breaking change.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const tmpRoot = mkdtempSync(join(tmpdir(), 'marveen-gg-owner-test-'))
const agentsDir = join(tmpRoot, 'agents')

let agentNames: string[] = []

vi.mock('../config.js', () => ({
  OWNER_NAME: 'TestOperator',
}))

vi.mock('../web/agent-config.js', () => ({
  agentDir: (name: string) => join(tmpRoot, 'agents', name),
  readFileOr: (path: string, fallback: string) => {
    try { return readFileSync(path, 'utf-8') } catch { return fallback }
  },
  listAgentNames: () => agentNames,
}))

vi.mock('../web/atomic-write.js', () => ({
  atomicWriteFileSync: (path: string, data: string) => writeFileSync(path, data),
}))

const { readAgentOwner, writeAgentOwner, resolveAgentOwner, listOwnerNames } =
  await import('../gg/agent-owner.js')

function seedAgent(name: string, config: Record<string, unknown> | null): void {
  const dir = join(agentsDir, name)
  mkdirSync(dir, { recursive: true })
  if (config) writeFileSync(join(dir, 'agent-config.json'), JSON.stringify(config, null, 2))
}

beforeEach(() => {
  rmSync(agentsDir, { recursive: true, force: true })
  mkdirSync(agentsDir, { recursive: true })
  agentNames = []
})

describe('readAgentOwner', () => {
  it('returns null when the agent has no owner, so the caller can tell "inherits" from "explicitly the operator"', () => {
    seedAgent('sales', { model: 'claude-opus-5' })
    expect(readAgentOwner('sales')).toBeNull()
  })

  it('returns null rather than throwing on a corrupt config -- persona generation must not break', () => {
    const dir = join(agentsDir, 'broken')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'agent-config.json'), '{ not json')
    expect(readAgentOwner('broken')).toBeNull()
  })

  it('ignores a non-string owner', () => {
    seedAgent('weird', { owner: 42 })
    expect(readAgentOwner('weird')).toBeNull()
  })

  it('treats a whitespace-only owner as unset', () => {
    seedAgent('blank', { owner: '   ' })
    expect(readAgentOwner('blank')).toBeNull()
  })
})

describe('writeAgentOwner', () => {
  it('persists the owner without disturbing the rest of the config', () => {
    seedAgent('sales', { model: 'claude-opus-5', displayName: 'SalesNinja' })
    writeAgentOwner('sales', 'Péter')
    const config = JSON.parse(readFileSync(join(agentsDir, 'sales', 'agent-config.json'), 'utf-8'))
    expect(config.owner).toBe('Péter')
    expect(config.model).toBe('claude-opus-5')
    expect(config.displayName).toBe('SalesNinja')
  })

  it('trims the stored value', () => {
    seedAgent('sales', {})
    writeAgentOwner('sales', '  Péter  ')
    expect(readAgentOwner('sales')).toBe('Péter')
  })

  it('clearing removes the key entirely rather than storing an empty string', () => {
    seedAgent('sales', { owner: 'Péter', model: 'claude-opus-5' })
    writeAgentOwner('sales', '')
    const config = JSON.parse(readFileSync(join(agentsDir, 'sales', 'agent-config.json'), 'utf-8'))
    expect('owner' in config).toBe(false)
    expect(config.model).toBe('claude-opus-5')
  })
})

describe('resolveAgentOwner', () => {
  it('falls back to the operator when no owner is set -- unchanged upstream behaviour', () => {
    seedAgent('sales', {})
    expect(resolveAgentOwner('sales')).toBe('TestOperator')
  })

  it('falls back to the operator for an agent that does not exist at all', () => {
    expect(resolveAgentOwner('ghost')).toBe('TestOperator')
  })

  it('returns the per-agent owner when set', () => {
    seedAgent('sales', { owner: 'Péter' })
    expect(resolveAgentOwner('sales')).toBe('Péter')
  })
})

describe('listOwnerNames', () => {
  it('is exactly [operator] on a single-person install', () => {
    agentNames = ['sales', 'ops']
    seedAgent('sales', {})
    seedAgent('ops', {})
    expect(listOwnerNames()).toEqual(['TestOperator'])
  })

  it('puts the operator first, then each distinct owner in agent order', () => {
    agentNames = ['sales', 'ops', 'finance']
    seedAgent('sales', { owner: 'Péter' })
    seedAgent('ops', { owner: 'Anna' })
    seedAgent('finance', {})
    expect(listOwnerNames()).toEqual(['TestOperator', 'Péter', 'Anna'])
  })

  it('deduplicates two agents owned by the same person', () => {
    agentNames = ['sales', 'sales2']
    seedAgent('sales', { owner: 'Péter' })
    seedAgent('sales2', { owner: 'Péter' })
    expect(listOwnerNames()).toEqual(['TestOperator', 'Péter'])
  })

  it('does not list the operator twice when an agent is explicitly owned by them', () => {
    agentNames = ['sales']
    seedAgent('sales', { owner: 'TestOperator' })
    expect(listOwnerNames()).toEqual(['TestOperator'])
  })
})
