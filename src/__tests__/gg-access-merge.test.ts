import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mergeAccess, mergeAccessFile } from '../gg/access-merge.js'

describe('mergeAccess', () => {
  it('keeps existing approvals instead of resetting them', () => {
    // The bug this guards: channel setup wiped allowFrom/groups on every call,
    // locking out everyone who had already been approved.
    const current = {
      dmPolicy: 'allowlist' as const,
      allowFrom: ['111', '222'],
      groups: { '999': { requireMention: false } },
      pending: {},
    }
    expect(mergeAccess(current)).toEqual(current)
  })

  it('applies only the fields explicitly changed', () => {
    const current = { dmPolicy: 'allowlist' as const, allowFrom: ['111'] }
    const next = mergeAccess(current, { dmPolicy: 'pairing' })
    expect(next.dmPolicy).toBe('pairing')
    expect(next.allowFrom).toEqual(['111'])
  })

  it('preserves unknown keys — the channel plugin co-owns this file', () => {
    const current = { allowFrom: ['1'], invites: { tok: { used: false } } }
    expect(mergeAccess(current).invites).toEqual({ tok: { used: false } })
  })

  it('produces sane defaults when there is no file yet', () => {
    expect(mergeAccess(null)).toEqual({
      dmPolicy: 'pairing',
      allowFrom: [],
      groups: {},
      pending: {},
    })
  })

  it('fills in missing fields without dropping the present ones', () => {
    const next = mergeAccess({ allowFrom: ['1'] })
    expect(next.allowFrom).toEqual(['1'])
    expect(next.groups).toEqual({})
    expect(next.dmPolicy).toBe('pairing')
  })
})

describe('mergeAccessFile', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gg-access-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns defaults when the file does not exist', () => {
    expect(mergeAccessFile(join(dir, 'access.json')).allowFrom).toEqual([])
  })

  it('merges over the on-disk state', () => {
    const p = join(dir, 'access.json')
    writeFileSync(p, JSON.stringify({ allowFrom: ['abc'], dmPolicy: 'allowlist' }))
    const next = mergeAccessFile(p, { dmPolicy: 'pairing' })
    expect(next.allowFrom).toEqual(['abc'])
    expect(next.dmPolicy).toBe('pairing')
  })

  it('treats a corrupt file as absent rather than throwing', () => {
    // Refusing to configure the channel would be worse than losing a broken
    // allowlist — and the plugin behaves the same way.
    const p = join(dir, 'access.json')
    writeFileSync(p, '{ not json')
    expect(() => mergeAccessFile(p)).not.toThrow()
    expect(mergeAccessFile(p).allowFrom).toEqual([])
  })

  it('treats a JSON array as absent (access.json must be an object)', () => {
    const p = join(dir, 'access.json')
    writeFileSync(p, '[1,2,3]')
    expect(mergeAccessFile(p).dmPolicy).toBe('pairing')
  })
})
