import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

// GG fork: CI gate for the ledger-live-drain pre-check.
//
// The drain fired every 2 minutes as a full LLM turn. Measured 2026-09-02: with
// zero work done all day the agent's pane still grew ~270 kB of transcript per
// hour, saturating the 1M context window in ~22 h and forcing a context-guard
// restart on two consecutive days. The pre-check answers the deterministic
// question ("is there an unanswered inbound?") in shell, so a quiet tick costs
// no model turn at all.
//
// The python suite pins the contract -- above all the FALSE-SKIP trap: the drain
// consumes its dedup marker the moment it prints, so a pre-check that reports
// "nothing actionable" when it could not actually check loses the rescued
// message forever. Same wrapper shape as ledger-agent-identity.test.ts.
const ROOT = join(__dirname, '..', '..')

describe('ledger-live-drain pre-check (quiet ticks cost no model turn)', () => {
  it('the python suite passes (skip / forward / dedup / grace / fail-open)', () => {
    const res = spawnSync('python3', [join(ROOT, 'scripts', '__tests__', 'gg-ledger-drain-precheck.test.py')], {
      encoding: 'utf-8',
      timeout: 120_000,
    })
    if (res.status !== 0) {
      console.error(res.stdout)
      console.error(res.stderr)
    }
    expect(res.status).toBe(0)
  })
})
