#!/usr/bin/env python3
"""UserPromptSubmit hook: capture inbound channel messages into the rolling
transcript (direction='in') BEFORE the agent processes the prompt. Deterministic
and agent-independent. agent_id is derived from the session's cwd so the hook is
generic across all three channel agents and never cross-contaminates. Never
blocks the prompt (always exit 0).

Provider-generic: Telegram, Discord and any other channel plugin are captured.
Non-Telegram chat ids are namespaced "<provider>:<id>" (ledger_lib.qualify_chat)
so two providers can never collide on the same numeric id.
"""
import sys
import os
import json
import re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ledger_lib  # noqa: E402

# <channel source="plugin:discord:discord" chat_id="X" message_id="Y" ... ts="Z">
#   TEXT
# </channel>
# The source is "plugin:<plugin>:<server>" for plugin-provided channels and a
# bare "<provider>" for a native one; group 1 is the provider either way.
CHANNEL_RX = re.compile(
    r'<channel\s+source="(?:plugin:)?([A-Za-z0-9_-]+)(?::[A-Za-z0-9_-]+)?"([^>]*)>(.*?)</channel>',
    re.DOTALL,
)


def _attr(attrs, name):
    m = re.search(name + r'="([^"]*)"', attrs)
    return m.group(1) if m else None


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)
    agent_id = ledger_lib.agent_id_from_cwd(payload.get("cwd"))
    prompt = payload.get("prompt") or ""
    for m in CHANNEL_RX.finditer(prompt):
        provider, attrs, text = m.group(1), m.group(2), m.group(3)
        chat_id = _attr(attrs, "chat_id")
        message_id = _attr(attrs, "message_id")
        ts = _attr(attrs, "ts")
        if chat_id and message_id:
            try:
                key = ledger_lib.qualify_chat(provider, chat_id)
                ledger_lib.log_inbound(agent_id, key, message_id, text.strip(), ts)
            except Exception:
                pass  # never block the prompt on a ledger error
    sys.exit(0)


if __name__ == "__main__":
    main()
