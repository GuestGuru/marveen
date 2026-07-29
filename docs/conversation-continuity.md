# Deterministic conversation continuity (rolling-transcript ledger)

**Problem.** The channel-watchdog respawns the channels session as a *fresh* claude
(`channels.sh`, no `--continue` — because `--continue` breaks `--channels`
activation). A fresh session has **zero memory** of the live conversation, so if
Gyula is mid-conversation when a respawn happens, both his last unanswered question
**and the context it refers to** are lost. This must be impossible to miss —
guaranteed by a **deterministic harness** (hooks + a durable ledger), never by
agent behaviour (which can fail or restart).

**Mechanism (zero agent discretion).**

1. **Durable rolling transcript** — `store/claudeclaw.db` → table `conversation_log`
   (`id, agent_id, chat_id, direction('in'|'out'), message_id, text, ts, created_at`,
   `UNIQUE(agent_id, chat_id, direction, message_id)`). Every channel turn — inbound
   user messages AND outbound replies — is appended here. Created by the `db.ts`
   `initDatabase()` migration; `scripts/hooks/ledger_lib.py` re-creates it defensively
   too (a hook may run before the dashboard migration on a fresh boot).
2. **Inbound capture** — `UserPromptSubmit` hook `scripts/hooks/ledger-capture.py`
   parses every inbound `<channel source="plugin:<provider>:<server>" …>` block from
   the prompt and `INSERT OR IGNORE`s it as `direction='in'`, **before** the agent
   acts. The `UNIQUE` constraint makes re-capture idempotent. **Provider-generic**:
   Telegram, Discord and any other channel plugin land in the same ledger (see
   *Multi-provider* below).
3. **Outbound capture** — `PostToolUse` hook `scripts/hooks/ledger-outbound.py` on
   **any** channel plugin's reply tool records the reply text as `direction='out'`
   (resolving the `chat_id=0` shorthand to the owner chat — Telegram only). Outbound
   rows carry `message_id=NULL`, so they are never deduped against each other.
4. **Startup replay** — `SessionStart` hook `scripts/hooks/ledger-replay.py` injects
   hidden `additionalContext` at the top of the fresh session's context:
   - the **last N turns** of the transcript in chronological order, each prefixed
     `Gyula:` (inbound) / `Te:` (outbound), so the fresh session knows *what the
     conversation was about*;
   - a highlighted **OPEN QUESTION** — the most recent inbound with no later outbound
     ("NYITOTT KÉRDÉS … válaszolj rá MOST") — with its `chat_id` so the reply goes to
     the right chat.

   The agent does not need to *remember* to look — the context and the open question
   are already in front of it.
5. **Live-session drain** — `SessionStart` replay only fires on a *respawn*, but a
   message can also be lost in an **already-running** session (a mid-session
   deafness gap): capture still records it, yet the live session never sees it
   until the next respawn. `scripts/hooks/ledger-live-drain.py` (run every ~2 min
   by the `ledger-live-drain` scheduled task in the live session) re-surfaces the
   still-unanswered inbound — `OPEN_QUESTION provider=… chat_id=… message_id=…\n<text>` on
   stdout — so the running agent answers it without waiting for a respawn. Two
   safety rails: a **grace window** (`GRACE_SECONDS = 60` — never fight an in-flight
   reply) and a **dedup statefile** (`store/.ledger-drain-<agent_id>` — a missed
   question is surfaced once, not every tick). Never blocks (any error → exit 0,
   silent). NOT a settings.json hook — it is a heartbeat scheduled task whose
   prompt answers via the telegram reply tool only when a block is printed.

**Multi-provider.** One agent can be reachable on several channels at once
(Telegram + Discord + …), and all of them share this single ledger. To keep two
providers from colliding on the same numeric id — and to keep a replayed turn
answerable in the place it came from — non-Telegram chats are stored **namespaced**
as `"<provider>:<chat_id>"` (`ledger_lib.qualify_chat` / `split_chat`). Telegram
stays **bare**, so every row written before multi-provider support, the drain
statefiles and the `chat_id=0` owner shorthand keep working unchanged — no schema
migration was needed (the `conversation_log` columns are frozen by a drift test).

Consequences, all covered by tests:

- the **provider decides which reply tool** the replay tells the fresh session to
  call (`ledger_lib.reply_tool` → `mcp__plugin_discord_discord__reply`, …), and it
  is handed the **bare** chat id, never the namespaced key;
- replayed transcript turns from a non-default provider are **labelled**
  (`[ts] (discord) Tamás: "…"`) so the session cannot answer a Discord message on
  Telegram;
- a reply tool called **without** a `chat_id` falls back to the open question **of
  the same provider** — that is what such a reply answers in practice. Only when
  there is no open question on that provider is the turn skipped, because then it
  is genuinely unattributable. (On Telegram the owner-chat shorthand still
  applies.) Dropping it unconditionally used to leave the question open forever,
  so every respawn replayed the same prompt.
- the open question is resolved **per chat**, not per agent: a reply sent on one
  channel does not close another channel's unanswered question. Without this the
  whole multi-provider idea collapses — a Discord answer would silently discard a
  pending Telegram question.

Adding a provider **does** need a `ledger_lib.REPLY_TOOLS` entry. The
`<provider>_<provider>` convention does **not** hold in general: per
`src/channel-provider.ts`, slack is `plugin:slack-channel:marveen-marketplace`
and teams is `plugin:teams:marveen-marketplace` — their MCP server is named
after the *marketplace*, not the plugin. An unknown provider therefore yields
**no** tool name at all (rather than a guessed, non-existent one), and the replay
describes the channel instead. Keep the table in sync with `channel-provider.ts`.

**Multi-agent scope.** The hooks are **generic across all channel agents**
(marveen / dia / erno-ba): `agent_id` is derived from the session's cwd
(`<install>/agents/<id>` → `<id>`; `<install>` → `MAIN_AGENT_ID`). Every read and
write is scoped by `agent_id`, so a session only ever replays its **own** chat and
agents never cross-contaminate.

**Tuning (env).**

- `LEDGER_CONTEXT_WINDOW` — number of recent turns to replay (default `20`). If the
  rendered window exceeds ~4000 tokens (`CONTEXT_CHAR_BUDGET = 16000` chars in
  `ledger-replay.py`), the **oldest** turns are dropped so injected context stays
  bounded.
- `LEDGER_OWNER_CHAT` / `ALLOWED_CHAT_ID` — resolves the reply tool's `chat_id=0`
  shorthand to the owner chat in `ledger-outbound.py`.
- `LEDGER_DB_PATH` — test-only DB path override.

## settings.json block to add (`/home/marveen/marveen/.claude/settings.json`)

Wire the hooks in the **project** settings (NOT user scope). The main channels
session runs with cwd `/home/marveen/marveen`, so it picks these up. The hooks
self-scope by cwd, so they are safe even if inherited. Merge this `hooks` object
(`$CLAUDE_PROJECT_DIR` → `/home/marveen/marveen` for the main session).

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR/scripts/hooks/ledger-capture.py\"", "timeout": 15 } ] }
    ],
    "PostToolUse": [
      { "matcher": "mcp__plugin_[a-z0-9-]+_[a-z0-9-]+__reply", "hooks": [ { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR/scripts/hooks/ledger-outbound.py\"", "timeout": 15 } ] }
    ],
    "SessionStart": [
      { "matcher": "startup|resume|clear", "hooks": [ { "type": "command", "command": "python3 \"$CLAUDE_PROJECT_DIR/scripts/hooks/ledger-replay.py\"", "timeout": 15 } ] }
    ]
  }
}
```

- `UserPromptSubmit` takes no matcher (fires on every prompt).
- `PostToolUse` matcher `mcp__plugin_[a-z0-9-]+_[a-z0-9-]+__reply`: matches **every**
  channel plugin's sanitized reply tool name (`mcp__plugin_telegram_telegram__reply`,
  `mcp__plugin_discord_discord__reply`, …).
  ⚠️ The hook re-parses the tool name, but that check only re-applies the **same
  pattern** — it does not know which plugins are channels. A non-channel plugin
  that happens to expose a `reply` tool would therefore be recorded as an outbound
  turn. Capture is restricted to known providers, so such a row cannot become an
  open question, but the outbound side is still shape-based, not identity-based.
- `SessionStart` matcher `startup|resume|clear`: the matcher is a **regex over the
  `source` field**, whose only values are `startup` / `resume` / `clear` / `compact`.
  There is no `auto` source — an `"auto"` matcher silently matches nothing, so the
  replay never fires (this was the 2026-06-02 deafness-replay bug). `compact` is
  intentionally excluded: the compaction summary already preserves live context.
  The replay is a no-op when the transcript is empty.

**No systemd needed** — these are event-driven Claude Code hooks, not timers. The
hooks read `store/claudeclaw.db` via `python3` stdlib `sqlite3` (no node startup,
no `jq`). Take effect on the next session start after the settings change.

## Tests

- `bash scripts/__tests__/conversation-ledger.test.sh` — 48 cases (inbound/outbound
  capture / replay context window / N-limit / chronological order + prefixes /
  open-question / answered-no-block / idempotency / multi-agent scope / live-drain
  grace + dedup + answered / multi-provider namespacing + reply-tool routing /
  edges) against the real hooks, isolated via `LEDGER_DB_PATH` + `LEDGER_OWNER_CHAT`.
- `npx vitest run src/__tests__/conversation-ledger-schema.test.ts` — schema-drift
  guard (db.ts migration == ledger_lib.py).
