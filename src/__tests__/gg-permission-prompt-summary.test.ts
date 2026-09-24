import { describe, it, expect } from 'vitest'
import { summarizePermissionPrompt, PERMISSION_SUMMARY_MAX_CHARS } from '../gg/permission-prompt-summary.js'

// Shape captured from a real parked agent pane on 2026-09-24 (content trimmed).
const BASH_PROMPT = [
  '● Bash(cat <<\'EOF\' > /tmp/x.py',
  '   │ c=c.replace("a","b")',
  '   │ open(\'configs.py\',\'w\').write(c)',
  '   │ EOF',
  '   │ rm -f out/*;',
  '   │ python3 configs.py && python3 build.py configs.json',
  '   Leave common-rep fields blank and rebuild',
  '',
  ' This command requires approval',
  '',
  ' Do you want to proceed?',
  ' ❯ 1. Yes',
  '   2. No',
  '',
  ' Esc to cancel · Tab to amend',
].join('\n')

describe('summarizePermissionPrompt', () => {
  it('quotes the command and its description, without the frame or boilerplate', () => {
    const s = summarizePermissionPrompt(BASH_PROMPT)!
    expect(s).toContain('python3 configs.py && python3 build.py configs.json')
    expect(s).toContain('rm -f out/*;')
    expect(s.endsWith('Leave common-rep fields blank and rebuild')).toBe(true)
    expect(s).not.toContain('│')
    expect(s).not.toContain('This command requires approval')
    expect(s).not.toContain('Do you want')
  })

  it('returns null when there is no permission question on the pane', () => {
    expect(summarizePermissionPrompt('❯ \n── Peppa ──\n  ⏵⏵ bypass permissions on')).toBeNull()
    expect(summarizePermissionPrompt('')).toBeNull()
    expect(summarizePermissionPrompt(null)).toBeNull()
  })

  it('caps a huge heredoc so the alert cannot flood', () => {
    const long = ['   │ ' + 'x'.repeat(5000), '', ' Do you want to proceed?', ' ❯ 1. Yes'].join('\n')
    const s = summarizePermissionPrompt(long)!
    expect(s.length).toBeLessThanOrEqual(PERMISSION_SUMMARY_MAX_CHARS)
    expect(s.startsWith('…')).toBe(true)
  })

  it('stops at a blank line above the block, not pulling in older transcript', () => {
    const pane = ['older unrelated output', '', '   │ git push', ' Do you want to proceed?'].join('\n')
    expect(summarizePermissionPrompt(pane)).toBe('git push')
  })
})
