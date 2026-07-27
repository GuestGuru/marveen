import { CHANNEL_PROVIDER, CHANNEL_TOKEN, CHANNEL_CHAT_ID } from './config.js'
import { getProvider } from './channel-provider.js'
import { logger } from './logger.js'

// Messages sent from a test run must be DISTINGUISHABLE, not suppressed
// (owner decision, 2026-07-27): on a wired host the env holds a live bot token
// and the owner's chat id, so a test-driven code path (e.g. the break-glass
// audit suite) reaches the owner's phone. A real-looking fake security alert
// trains the owner to ignore the real one -- so every outbound chokepoint
// stamps a [TESZT] prefix instead. Kill-switch for long debug cycles: start
// the run with the channel env emptied (CHANNEL_TOKEN= CHANNEL_CHAT_ID=),
// which the existing token/chat guards already treat as "do not send".
export function isTestRun(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VITEST !== undefined || env.NODE_ENV === 'test'
}

export const TEST_RUN_PREFIX = '[TESZT] '

// Idempotent: a message that crosses two chokepoints (build -> send) must not
// end up with a stacked "[TESZT] [TESZT]".
export function markTestRun(text: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!isTestRun(env) || text.startsWith(TEST_RUN_PREFIX)) return text
  return TEST_RUN_PREFIX + text
}

export async function notifyChannel(text: string): Promise<void> {
  text = markTestRun(text)
  if (!CHANNEL_TOKEN || !CHANNEL_CHAT_ID) {
    logger.warn('Channel ertesites kihagyva: token vagy chat ID hianyzik')
    return
  }

  const provider = getProvider(CHANNEL_PROVIDER)
  const formatted = provider.formatMessage(text)
  const chunks = provider.splitMessage(formatted)

  for (const chunk of chunks) {
    try {
      const parseMode = CHANNEL_PROVIDER === 'telegram' ? 'HTML' : undefined
      await provider.sendMessage(CHANNEL_TOKEN, CHANNEL_CHAT_ID, chunk, parseMode)
    } catch {
      try {
        await provider.sendMessage(CHANNEL_TOKEN, CHANNEL_CHAT_ID, text.slice(0, 4096))
      } catch { /* last resort, give up */ }
    }
  }
}

// Backward-compatible alias
export const notifyTelegram = notifyChannel

// Security-event notification (break-glass password reset, security:reset).
// Unlike notifyChannel, a missing channel config is an EXPECTED state here
// (fresh installs, channel-less deployments), so it stays fully silent -- the
// recovery path must never depend on, or be noisy about, Telegram being wired.
export async function notifySecurityEvent(text: string): Promise<void> {
  if (!CHANNEL_TOKEN || !CHANNEL_CHAT_ID) return
  try {
    await notifyChannel(text)
  } catch {
    /* never let a notification failure break the recovery action itself */
  }
}
