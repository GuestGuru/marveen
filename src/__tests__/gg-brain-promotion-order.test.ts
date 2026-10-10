import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runCli, readState } from '../gg/brain-promotion-cli.js'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'promotion-order-'))
  const db = new Database(join(root, 'm.db'))
  db.exec("CREATE TABLE memories (id INTEGER, agent_id TEXT, category TEXT, content TEXT, created_at INTEGER, keywords TEXT); INSERT INTO memories VALUES (463,'jean','warm','tény',0,NULL),(464,'jean','cold','tény',0,NULL),(465,'bubi','warm','másik bot',0,NULL),(466,'jean','hot','futó állapot',0,NULL),(467,'jean','warm','tény',0,NULL)")
  db.close()
})
afterEach(() => rmSync(root, { recursive: true, force: true }))
const paths = () => ({ dbPath: join(root, 'm.db'), stateDir: join(root, 'state') })
const check = (id: number) => runCli(['check-save', '--agent', 'jean', '--id', String(id)], paths())
const done = (id: number) => runCli(['done', '--agent', 'jean', '--id', String(id), '--decision', 'SKIP'], paths())

describe('a sorrend ellenőrzése még a mentés előtt', () => {
  it('a 467-es mentést blokkolja, amíg a 463-as lezáratlan', () => {
    expect(() => check(467)).toThrow(/463/)
    expect(() => check(463)).not.toThrow()
    done(463)
    expect(() => check(467)).toThrow(/464/)
    done(464)
    expect(() => check(467)).not.toThrow()
  })

  it('a done sem ugorhat át tételt, és a sikertelen próbálkozás nem ír kurzort', () => {
    expect(() => done(467)).toThrow(/463/)
    expect(readState(paths().stateDir, 'jean').cursor).toBe(0)
  })

  it('az ismételt és visszafelé done nem duplázza a naplót', () => {
    done(463)
    const before = readFileSync(join(paths().stateDir, 'jean.json'))
    expect(() => done(463)).toThrow(/lezárt/)
    expect(readFileSync(join(paths().stateDir, 'jean.json')).equals(before)).toBe(true)
  })

  it('a check csak olvas, és az elfogyott listán nem enged menteni', () => {
    const before = readFileSync(paths().dbPath)
    check(463)
    expect(readFileSync(paths().dbPath).equals(before)).toBe(true)
    done(463); done(464); done(467)
    expect(() => check(468)).toThrow(/nincs/)
  })

  it.each(['{bad', '{}', '{\"cursor\":\"467\"}', '{\"cursor\":-1}', '{\"cursor\":1.5}'])('sérült kurzornál nem enged tovább: %s', (state) => {
    mkdirSync(paths().stateDir)
    writeFileSync(join(paths().stateDir, 'jean.json'), state)
    expect(() => check(463)).toThrow(/unreadable/)
  })
})
