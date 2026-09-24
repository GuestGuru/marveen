/**
 * GG fork: say WHAT a parked tool-permission prompt asks for.
 *
 * MEASURED 2026-09-24. The channel monitor's PERMDENY905 alert ("session waits
 * on a permission request, I pressed nothing, decide: tmux attach ...") reached
 * the operator without the request itself. The operator's first reply was
 * "which request?", then "of course it can go, why not?" -- two round trips and
 * a relay through the main agent for a prompt whose content was on the pane the
 * whole time. The monitor already captured that pane to classify it; it just
 * did not quote it.
 *
 * This module extracts the prompt body (the lines ABOVE the "Do you want to
 * ..." question) from a captured pane, strips the box-drawing frame, and caps
 * the length so a long heredoc cannot flood the alert. It never sends a
 * keystroke and never decides anything: the human still picks.
 */

const QUESTION_RX = /^\s*Do you want to /
const FRAME_RX = /^[\s│┃|╭╮╰╯─━]*/
const NOISE_RX = /^(This command requires approval|Esc to cancel.*)$/

export const PERMISSION_SUMMARY_MAX_LINES = 8
export const PERMISSION_SUMMARY_MAX_CHARS = 600

/**
 * Returns the last few meaningful lines above the permission question, or null
 * when the pane holds no recognisable question (the caller then sends the plain
 * alert, exactly as before).
 */
export function summarizePermissionPrompt(pane: string | null | undefined): string | null {
  if (!pane) return null
  const lines = pane.split('\n')
  let q = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (QUESTION_RX.test(lines[i])) { q = i; break }
  }
  if (q <= 0) return null

  const picked: string[] = []
  for (let i = q - 1; i >= 0 && picked.length < PERMISSION_SUMMARY_MAX_LINES; i--) {
    const clean = lines[i].replace(FRAME_RX, '').trimEnd()
    if (!clean.trim() || NOISE_RX.test(clean.trim())) {
      if (picked.length > 0 && !clean.trim()) break // a blank line after content ends the block
      continue
    }
    picked.unshift(clean.trim())
  }
  if (picked.length === 0) return null

  let text = picked.join('\n')
  if (text.length > PERMISSION_SUMMARY_MAX_CHARS) {
    text = '…' + text.slice(text.length - PERMISSION_SUMMARY_MAX_CHARS + 1)
  }
  return text
}
