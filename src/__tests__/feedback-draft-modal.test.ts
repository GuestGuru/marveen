import { describe, it, expect } from 'vitest'
import { detectsFeedbackDraftModal, detectsFeedbackOptOutPrompt, detectPaneState } from '../pane-state.js'

// Captured verbatim from agent-samu on 2026-08-31, the incident that motivated
// the detector: the session sat not-ready for 10 minutes with 5 inter-agent
// messages queued while this modal swallowed every keystroke.
const REAL_MODAL_PANE = [
  '  Geri aktív köre a scan-fix (#1119 ALLOWLISTED_PATHS), ami független a',
  '  kerettől. Nálam nincs blokkoló; a soak napi riportja ~08:20-kor jön.',
  '',
  '✻ Crunched for 4m 19s · done 7:48',
  '',
  '╭──────────────────────────────────────────────────────────────────────────────╮',
  "│ ✻ Bug report drafted: Adopted a peer's rebuttal and applied it to a differe… │",
  '│ │ What happened: A peer agent proposed excluding the rate-limit\'s OWN 429    │',
  '│ │ rows from the daily-cap count. The coordinator had separately rebut…       │',
  '│ 1 to review · 2 to send · 0 to dismiss                                       │',
  '╰──────────────────────────────────────────────────────────────────────────────╯',
  '',
  '───────────────────────────────────────────────────────────────────────── Samu ─',
  '❯ ',
  '────────────────────────────────────────────────────────────────────────────────',
  '  ⏵⏵ bypass permissions on (shift+tab to cycle) · ← for agents · 1 feedback d…',
].join('\n')

// The follow-up frame after the dismiss key. Note it renders ~7 lines above the
// footer, outside LIVE_FOOTER_REGION_LINES -- the reason the opt-out detector
// scopes to the wider live region.
const OPT_OUT_PANE = [
  '✻ Crunched for 4m 19s · done 7:48',
  '',
  'Turn off Claude-drafted feedback? 0 to turn off · Esc to keep',
  '',
  '',
  '───────────────────────────────────────────────────────────────────────── Samu ─',
  '❯ ',
  '────────────────────────────────────────────────────────────────────────────────',
  '  ⏵⏵ bypass permissions on (shift+tab to cycle) · ← for agents · 1 feedback d…',
].join('\n')

// The false positive the detector must survive: a peer message that QUOTES the
// modal's option line, parked in the prompt input. This is not hypothetical --
// an inter-agent report describing this very incident contains that string.
const QUOTED_IN_INPUT_PANE = [
  '✻ Crunched for 2m 1s · done 8:02',
  '',
  '───────────────────────────────────────────────────────────────────────── Samu ─',
  '❯ A pane-en ez allt: "1 to review · 2 to send · 0 to dismiss" -- ezert akadt el',
  '  a kezbesites, a modal nyelte a billentyuket.',
  '────────────────────────────────────────────────────────────────────────────────',
  '  ⏵⏵ bypass permissions on (shift+tab to cycle) · ← for agents',
].join('\n')

const BUSY_WITH_MODAL_TEXT_PANE = [
  '╭──────────────────────────────────────────────────────────────────────────────╮',
  '│ 1 to review · 2 to send · 0 to dismiss                                       │',
  '╰──────────────────────────────────────────────────────────────────────────────╯',
  '✻ Brewing… (23s · ↓ 1.4k tokens)',
  '───────────────────────────────────────────────────────────────────────── Samu ─',
  '❯ ',
  '────────────────────────────────────────────────────────────────────────────────',
  '  ⏵⏵ bypass permissions on · esc to interrupt · ← for agents',
].join('\n')

describe('detectsFeedbackDraftModal', () => {
  it('fires on the real captured modal (known positive)', () => {
    expect(detectsFeedbackDraftModal(REAL_MODAL_PANE)).toBe(true)
  })

  it('does NOT fire when a message merely quotes the option line in the input box', () => {
    expect(detectsFeedbackDraftModal(QUOTED_IN_INPUT_PANE)).toBe(false)
  })

  it('does NOT fire on a busy pane', () => {
    expect(detectsFeedbackDraftModal(BUSY_WITH_MODAL_TEXT_PANE)).toBe(false)
  })

  // Mutation control: the ONLY thing separating the real modal from a quoted
  // line is the box border on the option line. Strip it from the otherwise
  // identical capture and the detector must go dark -- otherwise the negative
  // above would be passing for some unrelated reason.
  it('goes dark when the option line loses its box border', () => {
    const unboxed = REAL_MODAL_PANE.replace(
      '│ 1 to review · 2 to send · 0 to dismiss                                       │',
      '  1 to review · 2 to send · 0 to dismiss',
    )
    expect(unboxed).not.toBe(REAL_MODAL_PANE)
    expect(detectsFeedbackDraftModal(unboxed)).toBe(false)
  })

  it('does NOT fire on an empty or blank pane', () => {
    expect(detectsFeedbackDraftModal('')).toBe(false)
    expect(detectsFeedbackDraftModal('   \n  \n')).toBe(false)
  })

  it('documents WHY the detector is needed: the pane still reads idle', () => {
    // This is the whole hazard. detectPaneState sees a normal idle footer, so
    // delivery believes the pane is ready and writes into a swallowing modal.
    expect(detectPaneState(REAL_MODAL_PANE)).toBe('idle')
  })
})

describe('detectsFeedbackOptOutPrompt', () => {
  it('fires on the follow-up frame after the dismiss key', () => {
    expect(detectsFeedbackOptOutPrompt(OPT_OUT_PANE)).toBe(true)
  })

  it('does NOT fire on the draft modal itself', () => {
    expect(detectsFeedbackOptOutPrompt(REAL_MODAL_PANE)).toBe(false)
  })

  it('does NOT fire on a mention buried in scrollback', () => {
    const buried = ['Turn off Claude-drafted feedback? 0 to turn off · Esc to keep', ...Array(20).fill('  filler line')].join('\n')
    expect(detectsFeedbackOptOutPrompt(buried)).toBe(false)
  })
})
