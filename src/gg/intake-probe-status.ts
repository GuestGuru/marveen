// GG-specific: which Telegram HTTP answers really mean "the bot token is bad".
//
// ── Why this file exists ────────────────────────────────────────────────────
//
// parseIntakeProbe() (src/web/channel-intake-monitor.ts) treats every non-200
// getWebhookInfo answer as a rejected token and pages the owner. Telegram's own
// server errors are not token verdicts, though. Measured 2026-10-11: at 03:12
// the monitor reported marlenka's token as rejected with "Bad Gateway" (HTTP
// 502); at 06:4x the same token answered getMe and getWebhookInfo with 200,
// pending 0, no error. One Telegram hiccup would page every bot at once.
//
// Telegram answers a revoked or malformed token with 401 (Unauthorized) or 404
// (Not Found). A 5xx is Telegram being down, a 429 is rate limiting: neither
// says anything about the token, so both read as "unreachable" -- the same
// no-alert verdict the monitor already gives when our own network is down.
//
// This module lives under src/gg/ so the upstream file keeps a one-line touch
// point; see docs/gg-fork-konvenciok.md.

/** True when the HTTP status says nothing about the token (server-side or rate limit). */
export function isTransientTelegramStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599)
}
