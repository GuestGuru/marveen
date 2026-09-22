/**
 * Regression test for POST /api/memories silently attributing a memory to the
 * MAIN agent (MEMOWNER922, measured 2026-09-22).
 *
 * Root cause: the three endpoints of this resource asked for the same thing under
 * three names -- POST `agent_id`, GET `agent`, PUT/DELETE `owner` -- and only the
 * modifying ones had a guard. A peer posted `"agent": "salesninja"`, the field was
 * ignored, and the row landed under the MAIN agent with HTTP 200 and ok:true.
 * Nothing told the caller, so another agent's work was filed under mine.
 *
 * Fix (additive, no existing caller breaks): all three spellings are accepted, and
 * when none is given the default still applies but is declared in the response.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { initDatabase } from '../db.js'
import { tryHandleMemories } from '../web/routes/memories.js'
import type { RouteContext } from '../web/routes/types.js'

vi.mock('../config.js', async () => {
  const actual = await vi.importActual<typeof import('../config.js')>('../config.js')
  return { ...actual, MAIN_AGENT_ID: 'fo-agens', ALLOWED_CHAT_ID: 'test-chat', OLLAMA_URL: '' }
})

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))

function makePost(payload: Record<string, unknown>): { ctx: RouteContext; getBody: () => any } {
  const raw = Buffer.from(JSON.stringify(payload))
  let responseBody = ''
  const req: any = {
    [Symbol.asyncIterator]: async function* () { yield raw },
    on(event: string, cb: (...a: any[]) => void) {
      if (event === 'data') cb(raw)
      if (event === 'end') cb()
      return this
    },
  }
  const res = { writeHead: vi.fn(), end: (body?: string) => { responseBody = body || '' } }
  return {
    ctx: { req, res: res as any, path: '/api/memories', method: 'POST', url: new URL('http://localhost:3420/api/memories') },
    getBody: () => (responseBody ? JSON.parse(responseBody) : null),
  }
}

beforeAll(() => {
  process.env.NODE_ENV = 'test'
  initDatabase(':memory:')
})

describe('POST /api/memories owner field', () => {
  it('accepts the POST spelling (agent_id) and does not declare a default', async () => {
    const { ctx, getBody } = makePost({ agent_id: 'peer-egy', content: 'Ekezetes tartalom, sajat neven.', category: 'shared' })
    expect(await tryHandleMemories(ctx)).toBe(true)
    const body = getBody()
    expect(body.ok).toBe(true)
    expect(body.owner_defaulted).toBeUndefined()
  })

  it('accepts the GET spelling (agent) instead of silently filing under the main agent', async () => {
    const { ctx, getBody } = makePost({ agent: 'peer-ketto', content: 'A GET mezonevet hasznaltam a POST-on.', category: 'shared' })
    expect(await tryHandleMemories(ctx)).toBe(true)
    const body = getBody()
    expect(body.ok).toBe(true)
    expect(body.owner_defaulted).toBeUndefined()
  })

  it('accepts the PUT/DELETE spelling (owner) too', async () => {
    const { ctx, getBody } = makePost({ owner: 'peer-harom', content: 'A PUT mezonevet hasznaltam a POST-on.', category: 'shared' })
    expect(await tryHandleMemories(ctx)).toBe(true)
    expect(getBody().owner_defaulted).toBeUndefined()
  })

  it('still defaults when NO owner is given, but says so in the response', async () => {
    const { ctx, getBody } = makePost({ content: 'Tulajdonos nelkul mentett bejegyzes.', category: 'warm' })
    expect(await tryHandleMemories(ctx)).toBe(true)
    const body = getBody()
    expect(body.ok).toBe(true)
    // The default itself is deliberate (callers rely on it); the SILENCE was the defect.
    expect(body.owner_defaulted).toBe('fo-agens')
  })
})
