# Inter-agent send reliability (verify + retry)

## The problem
Agents send inter-agent messages with `POST /api/messages`. A common shorthand is a `curl` whose output
is discarded and success inferred from the shell `&&`:

    curl -s ... -d @- <<HEREDOC >/dev/null && echo sent
    ...
    HEREDOC

This is **dangerous**: `curl` exits `0` on a completed HTTP request even when the server **rejected** it
(401 unauthorized, 400 bad body, 5xx), because `>/dev/null` discards the response and `&&` only checks
curl's exit code. The agent sees its own `echo sent` and believes the message went out. Result: a **silent
send failure** — the recipient never gets the message, and two agents can wait on each other indefinitely.

Observed in the field (2026-07): a sub-agent's completion callbacks were silently lost this way, costing
~30–60 minutes of an idle main+sub deadlock. The `/api/messages` router was healthy the whole time
(HTTP 200 + a message `id`); the defect was purely sender-side (never checking the result).

## The rule
**A message counts as sent only when the response returned an `id`** (`{"id":<n>,"status":"pending",...}`
with HTTP 200). Verify the HTTP status **and** the returned id, and resend if missing.

## The fix
- `scripts/agent-msg.sh <from> <to> "<content>"` — builds the JSON body with `json.dumps` (no quoting
  pitfalls), checks HTTP status + `id`, retries up to 3×, logs failures to `store/agent-msg-failures.log`.
  Large/multi-line content may come from STDIN with a `-` third arg. Base dir is auto-detected, port from
  `MARVEEN_WEB_PORT` (default 3420), so it runs from any CWD / any install.
- The generated agent `CLAUDE.md` (from `templates/CLAUDE.md.template`) documents this rule and points
  at the helper.

  ⚠️ **That last sentence used to end "so every agent in every fleet verifies its sends by default", and
  that was false.** `templates/CLAUDE.md.template` is the MAIN agent's template (`{{MAIN_AGENT_ID}}`);
  sub-agents are scaffolded by `src/web/agent-scaffold.ts`, which never mentioned the helper or the rule.
  Measured 2026-09-10 on the GG fleet: all six sub-agent `CLAUDE.md` files scored **zero** for the rule,
  zero for the id-check sentence and zero for `agent-msg` — while the main `CLAUDE.md` scored 1 on the
  same patterns, so the zeros were absence and not a broken search. Two of the six turned out to call the
  helper anyway, by habit; the files are not the behaviour, and the messages table records no path, so
  real coverage was unknown rather than zero either way.

  The fix is a maintained generated block, `src/gg/send-reliability-section.ts`, applied on every agent
  spawn next to the fleet-rules block. Marker-delimited on purpose: text interpolated once at scaffold
  time is a snapshot, so every later correction would reach only agents created afterwards (the same trap
  written up in `src/gg/fleet-rules-section.ts`).

## The hazard the `id` check does NOT catch
A message can arrive **truncated** while the send reports `OK id=<n>`, because the shell expands a
double-quoted argument **before** the helper ever sees it: one quote character inside the text closes the
string early and the remainder never reaches the script. Measured 2026-09-10: a message ended at 1303
characters, exactly where a quote followed, and the POST succeeded with half the content. The helper holds
no `eval` — the caller's own shell does this — so the helper can only report the symptom, and since
2026-09-10 it warns when argv-supplied content does not end at a sentence boundary (threshold from a
measurement over 1041 messages: 20 non-terminal endings, of which 9 are paths or URLs and 7 signatures, so
the warning is rare and non-blocking). **The actual fix is to pass long content on STDIN with a QUOTED
heredoc**, which disables expansion entirely.

## Accent gate on the same endpoint
`POST /api/messages` also runs the fleet's accent gate (`src/gg/accent-gate.ts`) over outgoing text and
returns an additive `accentWarning` field. It never blocks: the row is already stored, and a cosmetic
check must not be able to reject a message. It lives at the endpoint rather than in the helper because the
endpoint is the one point every sender passes through whatever tool it uses. Thresholds and word lists are
a faithful port of the `fleet-helper` detector, checked for parity over the whole message corpus (n=1090)
with zero divergence; if the two ever disagree, the Python side is the truth.

## Belt-and-suspenders
For delegated tasks, pairing the callback with a **DONE-marker file** (written as the final step) lets the
orchestrator detect completion by file signal even if a callback is ever lost. But the primary fix is that
the sender must not treat an unchecked `curl` as success.
