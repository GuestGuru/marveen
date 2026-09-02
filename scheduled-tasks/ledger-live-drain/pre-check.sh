#!/usr/bin/env bash
# Pre-check for the ledger-live-drain scheduled task.
#
# WHY (measured 2026-09-02): the drain fired every 2 min as a FULL LLM turn, and
# virtually every round was empty. With zero work done all day the agent's pane
# still accumulated ~270 kB of transcript per hour (08h-20h measured: 255-290
# kB/h, no user message in the window), which saturated the 1M context window in
# ~22 h and forced a context-guard restart on two consecutive days. Deciding
# "is there an unanswered inbound" is deterministic -- it needs no model. So the
# decision moves here: empty -> SKIP (no LLM turn at all), non-empty -> hand the
# OPEN_QUESTION block to the LLM as the pre-check prefix.
#
# NEVER `set -e`, never exit non-zero. A pre-check failure fails OPEN (the runner
# invokes the LLM anyway), but the drain may ALREADY have consumed its dedup
# marker by then, so a surfaced question would be lost. Every error path must
# therefore end in EMPTY stdout (= "run the LLM normally", and the task prompt
# re-runs the drain itself) and NEVER in a false "SKIP".
INSTALL_DIR={{PROJECT_ROOT}}

cd "$INSTALL_DIR" 2>/dev/null || exit 0        # cannot check -> fail open (empty stdout)
OUT=$(python3 scripts/hooks/ledger-live-drain.py 2>/dev/null); RC=$?
[ "$RC" -eq 0 ] || exit 0                      # drain errored -> fail open, NOT "SKIP"
[ -n "${OUT//[[:space:]]/}" ] || { echo SKIP; exit 0; }
printf '%s\n' "$OUT"
exit 0
