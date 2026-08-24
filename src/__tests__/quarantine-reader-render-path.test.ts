// EGRESSRENDER824: an operator grant typed into store/egress-allowlist.json
// silently never reached the quarantine-reader, and the denial looked exactly
// like a legitimate block (prompt-level rejection, no network call, nothing in
// egress-blocked.log). Two independent causes, both measured 2026-08-24 with
// positive AND negative controls:
//
//   1. TARGET PATH: the main agent's rendered copy went to the USER scope
//      (~/.claude/agents), which the runtime caches at session start. A
//      PROJECT-scoped copy is read from disk at each sub-agent spawn -- the
//      fleet agents were already project-scoped, which is why their grants
//      landed without restart while the main agent's did not.
//   2. RENDER TRIGGER: the copies were rendered only at scaffold time, so a
//      JSON edit between boots reached the HOOK (live read) but not the
//      PROMPT copies.
//
// These tests pin the target path and the watcher's re-render decision.

import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { quarantineReaderDestDir } from '../web/agent-scaffold.js'
import { PROJECT_ROOT, MAIN_AGENT_ID } from '../config.js'

describe('quarantineReaderDestDir (EGRESSRENDER824 target path)', () => {
  it('the MAIN agent copy goes to PROJECT scope, never the user scope', () => {
    const dest = quarantineReaderDestDir(MAIN_AGENT_ID)
    expect(dest).toBe(join(PROJECT_ROOT, '.claude', 'agents'))
    // The load-bearing negative: the old location must be gone for good. A
    // user-scoped definition is cached at session start, so a grant written
    // there waits for a full session restart -- the measured failure.
    expect(dest.startsWith(join(homedir(), '.claude'))).toBe(false)
  })

  it('sub-agent copies stay project-scoped under their own agent dir', () => {
    const dest = quarantineReaderDestDir('samu')
    expect(dest).toContain(join('agents', 'samu', '.claude', 'agents'))
    expect(dest.startsWith(join(homedir(), '.claude', 'agents'))).toBe(false)
  })
})
