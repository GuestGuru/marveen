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
"""
import sys
import os
import json
import re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ledger_lib  # noqa: E402

# mcp__plugin_telegram_telegram__reply -> "telegram"
TOOL_RX = re.compile(r"^mcp__plugin_([A-Za-z0-9-]+)_[A-Za-z0-9-]+__reply$")


def _owner_chat():
    v = os.environ.get("LEDGER_OWNER_CHAT") or os.environ.get("ALLOWED_CHAT_ID")
    return v.strip() if v else ""


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)
    tool = payload.get("tool_name") or ""
    # Double-check (the matcher should already filter): only a channel reply tool.
    m = TOOL_RX.match(tool)
    if not m:
        sys.exit(0)
    provider = m.group(1).lower()
    agent_id = ledger_lib.agent_id_from_cwd(payload.get("cwd"))
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
    if chat_id and text is not None:
        try:
            ledger_lib.log_outbound(agent_id, ledger_lib.qualify_chat(provider, chat_id), str(text))
        except Exception:
            pass
    sys.exit(0)


if __name__ == "__main__":
    main()
