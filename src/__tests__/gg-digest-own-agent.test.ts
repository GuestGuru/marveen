/**
 * GG fork (#1225): the nightly digest must summarise only the main agent's own
 * rows. On a fleet install the sub-agents share the owner's Telegram chat_id,
 * and the chat_id-only read put their work into the main agent's digest.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { rmSync } from 'node:fs'

const { fakeHome } = await vi.hoisted(async () => {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  return { fakeHome: fs.mkdtempSync(path.join(os.tmpdir(), 'gg-digest-own-agent-')) }
})

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, homedir: () => fakeHome, default: { ...actual, homedir: () => fakeHome } }
})
vi.mock('../config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../config.js')>()),
  MAIN_AGENT_ID: 'orin',
  ALLOWED_CHAT_ID: 'test-chat',
  OLLAMA_URL: '',
  EMBED_URL: '',
}))
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))
const runAgent = vi.fn(async (_prompt: string) => ({ text: 'digest summary' }))
vi.mock('../agent.js', () => ({ runAgent: (p: string) => runAgent(p) }))

import { initDatabase, getDb, saveMemory } from '../db.js'
import { runDailyDigest } from '../memory.js'
import { getDigestInputMemories } from '../gg/digest-memories.js'

const CHAT = 'owner-chat'

function ageRow(content: string, secondsAgo: number): void {
  getDb().prepare('UPDATE memories SET created_at = ?, accessed_at = ? WHERE content = ?')
    .run(Math.floor(Date.now() / 1000) - secondsAgo, Math.floor(Date.now() / 1000), content)
}

beforeAll(() => {
  process.env.NODE_ENV = 'test'
  initDatabase(':memory:')
})
afterAll(() => {
  rmSync(fakeHome, { recursive: true, force: true })
})

describe('daily digest input (GG fork, #1225)', () => {
  it('reads only the main agent rows of the chat, in the 24h window, oldest first', () => {
    saveMemory(CHAT, 'own-morning briefing', 'episodic')
    ageRow('own-morning briefing', 3600 * 10)
    saveMemory(CHAT, 'own-evening wrapup', 'episodic')
    saveMemory(CHAT, 'peer invoice round', 'episodic', undefined, 'peer-agent')
    saveMemory(CHAT, 'own-old two days', 'episodic')
    ageRow('own-old two days', 86400 * 2)
    saveMemory(CHAT, '[Napi naplo 2026. 11. 15.] earlier digest', 'episodic')
    saveMemory('other-chat', 'own-other chat', 'episodic')

    const since = Math.floor(Date.now() / 1000) - 86400
    const got = getDigestInputMemories(CHAT, 'orin', since).map((m) => m.content)
    expect(got).toEqual(['own-morning briefing', 'own-evening wrapup'])
  })

  it('keeps the newest rows when the cap is hit', () => {
    const since = Math.floor(Date.now() / 1000) - 86400
    const got = getDigestInputMemories(CHAT, 'orin', since, 1).map((m) => m.content)
    expect(got).toEqual(['own-evening wrapup'])
  })

  it('skips retracted rows', () => {
    saveMemory(CHAT, 'own-retracted', 'episodic')
    getDb().prepare('UPDATE memories SET retracted_at = ? WHERE content = ?')
      .run(Math.floor(Date.now() / 1000), 'own-retracted')
    const since = Math.floor(Date.now() / 1000) - 86400
    const got = getDigestInputMemories(CHAT, 'orin', since).map((m) => m.content)
    expect(got).not.toContain('own-retracted')
  })

  it('runDailyDigest sends no peer row to the summariser', async () => {
    runAgent.mockClear()
    const digest = await runDailyDigest(CHAT)
    expect(digest).toBe('digest summary')
    const prompt = runAgent.mock.calls[0][0]
    expect(prompt).toContain('own-morning briefing')
    expect(prompt).toContain('own-evening wrapup')
    expect(prompt).not.toContain('peer invoice round')
    expect(prompt).not.toContain('own-old two days')
    expect(prompt).not.toContain('earlier digest')
  })
})
