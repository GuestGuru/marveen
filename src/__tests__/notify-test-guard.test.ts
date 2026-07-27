import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'

// The regression this covers: a vitest run drove the break-glass audit path,
// which paged the owner with a real-looking security alert. Owner decision:
// test-run messages may go out, but must be unmistakably marked ([TESZT]
// prefix) at every outbound chokepoint, with the env-emptying kill-switch
// (CHANNEL_TOKEN= CHANNEL_CHAT_ID=) for long debug cycles.

vi.mock('../config.js', () => ({
  CHANNEL_PROVIDER: 'telegram',
  CHANNEL_TOKEN: 'live-looking-token',
  CHANNEL_CHAT_ID: '123456789',
}))
vi.mock('../logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))
vi.mock('../channel-provider.js', () => ({ getProvider: vi.fn() }))

import { isTestRun, markTestRun, TEST_RUN_PREFIX, notifyChannel, notifySecurityEvent } from '../notify.js'
import { getProvider } from '../channel-provider.js'

describe('isTestRun', () => {
  it('is false for a plain runtime env', () => {
    expect(isTestRun({})).toBe(false)
    expect(isTestRun({ NODE_ENV: 'production' })).toBe(false)
  })

  it('is true when vitest or NODE_ENV=test marks the process', () => {
    expect(isTestRun({ VITEST: 'true' })).toBe(true)
    expect(isTestRun({ NODE_ENV: 'test' })).toBe(true)
  })

  it('detects THIS process as a test run (the property everything below relies on)', () => {
    expect(isTestRun()).toBe(true)
  })
})

describe('markTestRun', () => {
  it('prefixes in a test env and leaves runtime messages untouched', () => {
    expect(markTestRun('riasztas', { VITEST: 'true' })).toBe(TEST_RUN_PREFIX + 'riasztas')
    expect(markTestRun('riasztas', {})).toBe('riasztas')
  })

  it('is idempotent -- no stacked prefix across two chokepoints', () => {
    const once = markTestRun('riasztas', { VITEST: 'true' })
    expect(markTestRun(once, { VITEST: 'true' })).toBe(once)
  })
})

describe('outbound chokepoints under a test run', () => {
  function providerSpy() {
    const sendMessage = vi.fn(async (..._args: unknown[]) => {})
    vi.mocked(getProvider).mockReturnValue({
      formatMessage: (t: string) => t,
      splitMessage: (t: string) => [t],
      sendMessage,
    } as never)
    return sendMessage
  }

  it('notifyChannel still sends, but with the [TESZT] prefix', async () => {
    const sendMessage = providerSpy()
    await notifyChannel('fake security alert')
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0]![2]).toBe(TEST_RUN_PREFIX + 'fake security alert')
  })

  it('notifySecurityEvent (the break-glass regression path) is marked too', async () => {
    const sendMessage = providerSpy()
    await notifySecurityEvent("Break-glass jelszo-reset: 'alice'")
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(String(sendMessage.mock.calls[0]![2])).toMatch(/^\[TESZT\] /)
  })
})

describe('every outbound sender carries the mark (source contract)', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf-8')

  it.each([
    ['../web/telegram.ts', ['sendTelegramMessage', 'sendTelegramPhoto']],
    ['../channel-coordinator.ts', ['function sendAlert']],
    ['../web/reauth-healer.ts', ['function sendNotify']],
  ] as const)('%s marks its sender(s)', (file, fns) => {
    const src = read(file)
    for (const fn of fns) {
      const idx = src.indexOf(fn)
      expect(idx, `${fn} missing from ${file}`).toBeGreaterThan(-1)
      const body = src.slice(idx, idx + 300)
      expect(body, `${fn} in ${file} lacks the markTestRun() stamp`).toContain('markTestRun(')
    }
  })
})
