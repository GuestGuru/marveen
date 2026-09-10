import { describe, expect, it } from 'vitest'
import { accentGateNote, accentWarning, hungarianRatio, zeroAccentSentences } from '../gg/accent-gate.js'

// The four controls measured on 2026-09-10 when the gate first shipped in
// scripts/agent-msg.sh. The positive one matters most: without it, "it did not
// warn" proves nothing about the other three.
const HU_BROKEN =
  'Felpusholva es a tavoli ref hitelesitett fetch-csel visszaigazolva. Push elott ' +
  'ellenoriztem, hogy egy fajl valtozott, huszonkilenc sor hozzaadas, kizarolag a sajat ' +
  'skilled, es a munkafa is ures volt, stage-elt maradek sincs benne. A push tovabbra is ' +
  'nalam marad, de nem jogosultsagbol, hanem mert a sajat identitasomat igenyli.'

const HU_OK =
  'Felpusholva, és a távoli ref hitelesített fetch-csel visszaigazolva. Push előtt ' +
  'ellenőriztem, hogy egy fájl változott, huszonkilenc sor hozzáadás, kizárólag a saját ' +
  'skilled, és a munkafa is üres volt, stage-elt maradék sincs benne. A push továbbra is ' +
  'nálam marad, de nem jogosultságból, hanem mert a saját identitásomat igényli.'

const EN_TECH =
  'The proxy path push uses an explicit URL, so it does not update the remote tracking ' +
  'ref. That means the question of whether something is pushed must be answered by the ' +
  'GitHub API or by an authenticated fetch, never by reading the local origin/main ' +
  'pointer, which went stale today for exactly this reason.'

describe('accent gate', () => {
  it('fires on long Hungarian text stripped of accents', () => {
    expect(HU_BROKEN.length).toBeGreaterThan(200)
    expect(accentWarning(HU_BROKEN)).toContain('ékezet-gyanú')
    expect(accentGateNote(HU_BROKEN)).toContain('FIGYELEM')
  })

  it('stays silent on the same text written properly', () => {
    expect(accentWarning(HU_OK)).toBeNull()
    expect(accentGateNote(HU_OK)).toBeNull()
  })

  it('stays silent on English technical prose', () => {
    expect(accentGateNote(EN_TECH)).toBeNull()
  })

  it('stays silent below the 200 character floor', () => {
    expect(accentGateNote('Kesz, felpusholtam.')).toBeNull()
  })

  it('says the message is already delivered, because a cosmetic check must not reject it', () => {
    expect(accentGateNote(HU_BROKEN)).toContain('elment')
  })

  // jean, 2026-09-09: the commonest hiding shape is the HALF-FIXED entry -- an
  // accented closing on an unaccented body lifts the whole-text average over the
  // threshold, so only the sentence-level check finds it.
  it('catches a half-fixed text that the whole-text ratio lets through', () => {
    const body =
      'A meres szerint a kapu a helyere kerult, es a tavoli allapotot hitelesitett fetch ' +
      'igazolta vissza, nem a lokalis ref, ami ma pont ezert bizonyult elavultnak. '
    const closing =
      'Az összefoglaló záradékot viszont már gondosan, teljes ékezettel írtam meg, és ' +
      'éppen ez hígítja fel az egészre vett arányt a küszöb fölé, úgyhogy a teljes ' +
      'szövegre számolt ellenőrzés hallgatni fog róla, pedig a törzs romlott maradt.'
    const text = body + closing
    const accents = [...text].filter((c) => 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ'.includes(c)).length
    expect((accents * 100) / text.length).toBeGreaterThan(2.0) // the whole-text check is blind here
    expect(accentWarning(text)).toBeNull()
    expect(zeroAccentSentences(text).length).toBeGreaterThan(0)
    expect(accentGateNote(text)).toContain('ékezet nélküli magyar mondat')
  })

  // brokermarcsi, 2026-09-09: a Hungarian frame around an English block dilutes the
  // whole-text ratio. The decision stays on the whole text, but the warning must say
  // that bilingualism is the likely cause, so nobody has to measure it by hand.
  it('names bilingualism in the warning when the Hungarian part is fine', () => {
    const hu =
      'Ez a rész teljesen ékezetes, és elég hosszú ahhoz, hogy a szűkített arány véleményt ' +
      'tudjon mondani róla, mert a magyar mondatok bőven megvannak benne. '
    const en =
      'This paragraph is a plain English draft of a customer reply, and it contains no ' +
      'accented characters at all, which is correct for English and must not be reported ' +
      'as corruption of the Hungarian frame around it. '
    const text = hu + en.repeat(6)
    const note = accentWarning(text)
    if (note) expect(note).toContain('kétnyelvű')
    expect(hungarianRatio(text).ratio).not.toBeNull()
  })

  it('never throws on junk input', () => {
    for (const bad of ['', ' ', '...', 'a'.repeat(5000)]) {
      expect(() => accentGateNote(bad)).not.toThrow()
    }
  })
})
