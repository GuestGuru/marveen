#!/usr/bin/env python3
"""PostToolUse hook (matcher: any channel plugin's reply tool): record the
OUTBOUND reply text into the rolling transcript (direction='out'). This both (a)
gives the SessionStart replay full conversation context and (b) closes the open
question (an inbound with a later outbound is considered answered). Deterministic.

agent_id is derived from the session's cwd (generic across the three agents). The
provider comes from the tool name (mcp__plugin_<plugin>_<server>__reply) and
namespaces the ledger chat id, mirroring ledger-capture.py. The chat_id=0/empty
shorthand for the main chat (CLAUDE.md) is TELEGRAM-ONLY -- it resolves to the
agent's owner chat, which is a Telegram id. Never blocks (exit 0).

GG fork: az upstream ugyanezt provider-agnosztikusan oldotta meg, de a provider
KIOLVASASA nelkul. Nekunk kell (a chat-id namespace-elesehez es ahhoz, hogy
MELYIK reply toolt hivjuk), ezert a TOOL_RX csoportja marad. Az upstream
agent_id_from_payload-jat viszont atvesszuk: a cwd egy sessionon BELUL valtozhat,
es akkor minden kesobbi sor mas agens neve ala kerul (LEDGERCWD828).
"""
import sys
import os
import json
import re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ledger_lib  # noqa: E402

# mcp__plugin_telegram_telegram__reply -> "telegram"
TOOL_RX = re.compile(r"^mcp__plugin_([A-Za-z0-9-]+)_[A-Za-z0-9-]+__reply$")


# mcp__plugin_telegram_telegram__reply, mcp__plugin_discord_discord__reply, ...
REPLY_TOOL_RX = re.compile(r"^mcp__plugin_[A-Za-z0-9_]+__reply$")


def _owner_chat():
    v = os.environ.get("LEDGER_OWNER_CHAT") or os.environ.get("ALLOWED_CHAT_ID")
    return v.strip() if v else ""


def _id_from_text(text):
    """Extract a numeric id from a plain-text string, or return None.

    Three patterns in priority order:
    1. Parenthesized exact form: "sent (id: 3461)" -> "3461"
       Matches the current Telegram plugin response format.
    2. Multi-part form: "sent 2 parts (ids: 3461, 3462)" -> "3461"
       Matches a channel plugin that splits an over-long reply (Discord).
    3. Word-boundary fallback: matches "id: 42" or "id 42" but not
       "invalid 42" (the word boundary \b prevents partial-word hits
       that would produce false positives from error messages).
    """
    # Exact parenthesized form first.
    m = re.search(r"\(id:\s*(\d+)\)", text, re.IGNORECASE)
    if m:
        return str(m.group(1))
    # Multi-part form: a long reply is split and the tool answers
    # "sent 2 parts (ids: 123, 456)". The FIRST id identifies the turn; it is
    # only used to deduplicate a double-fire of the hook, so any stable choice
    # works as long as it is deterministic.
    m = re.search(r"\(ids:\s*(\d+)", text, re.IGNORECASE)
    if m:
        return str(m.group(1))
    # Word-boundary fallback for looser formats.
    m = re.search(r"\bid[:\s]+(\d+)", text, re.IGNORECASE)
    return str(m.group(1)) if m else None


def _extract_message_id(payload):
    """Extract the Telegram message_id from the tool response, or return None.

    The hook payload key is `tool_response` (not `tool_result`).
    The MCP plugin returns a content-block list:
      [{"type": "text", "text": "sent (id: 3461)"}]
    The text is NOT JSON -- it is a plain sentence. We first try json.loads
    in case the format ever changes, then fall back to a regex.
    Falls back to None on any parse error so the caller is never blocked.
    """
    result = payload.get("tool_response")
    if result is None:
        return None

    # Unwrap a JSON string at the top level.
    if isinstance(result, str):
        try:
            result = json.loads(result)
        except Exception:
            # Plain string -- try regex directly.
            return _id_from_text(result)

    # Direct dict: {"message_id": 123, ...}
    if isinstance(result, dict):
        mid = result.get("message_id")
        if mid is not None:
            return str(mid)

    # Content-block list: [{"type": "text", "text": "sent (id: 3461)"}]
    if isinstance(result, list):
        for block in result:
            if not isinstance(block, dict):
                continue
            text = block.get("text") or block.get("content") or ""
            if not isinstance(text, str):
                continue
            # Try JSON first (future-proof), then regex for the current format.
            try:
                parsed = json.loads(text)
                if isinstance(parsed, dict):
                    mid = parsed.get("message_id")
                    if mid is not None:
                        return str(mid)
            except Exception:
                pass
            mid = _id_from_text(text)
            if mid is not None:
                return mid

    return None


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)
    tool = payload.get("tool_name") or ""
    # Double-check (the matcher should already filter): only a channel plugin's
    # reply tool. Anchored on the full MCP tool-name shape (upstream) so an
    # unrelated tool that merely contains "reply" cannot write a bogus turn.
    if not REPLY_TOOL_RX.match(tool):
        sys.exit(0)
    # GG fork: the provider itself is needed below (chat-id namespacing, and WHICH
    # reply tool to call), so keep the capturing match too.
    m = TOOL_RX.match(tool)
    if not m:
        sys.exit(0)
    provider = m.group(1).lower()
    # upstream: cwd changes within a session; the payload carries the stable id.
    agent_id = ledger_lib.agent_id_from_payload(payload)
    tool_input = payload.get("tool_input") or {}
    chat_id = tool_input.get("chat_id")
    chat_id = "" if chat_id is None else str(chat_id).strip()
    if chat_id in ("", "0"):
        if provider != ledger_lib.DEFAULT_PROVIDER:
            # The owner-chat shorthand is a Telegram id, so it cannot resolve
            # here. But dropping the turn is not harmless either: the inbound
            # stays unanswered forever, and every respawn replays the same
            # question. Fall back to the open question OF THIS PROVIDER — that
            # is what a chat_id-less reply answers in practice.
            oq = ledger_lib.open_question(agent_id)
            resolved = ""
            if oq:
                q_provider, q_bare = ledger_lib.split_chat(oq[0])
                if q_provider == provider:
                    resolved = q_bare
            if not resolved:
                sys.exit(0)  # genuinely unattributable -> better to skip
            chat_id = resolved
        else:
            chat_id = _owner_chat()
    text = tool_input.get("text")
    message_id = _extract_message_id(payload)
    if chat_id and text is not None:
        try:
            # GG fork: a chat kulcsot provider-rel minositjuk (multi-provider ledger),
            # az upstream message_id dedup-argumentumot megtartva.
            ledger_lib.log_outbound(
                agent_id, ledger_lib.qualify_chat(provider, chat_id), str(text), message_id
            )
        except Exception:
            pass
    sys.exit(0)


if __name__ == "__main__":
    main()
