import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Repo root = two levels up from src/__tests__/.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// The Linux installer's dependency probe: `for pkg in <names>; do command -v ...`.
// Everything the runtime shells out to has to be on this list, otherwise a fresh
// box silently ends up without it -- the installer only checks what it enumerates.
function linuxInstallerPackages(): string[] {
  const installer = readFileSync(join(REPO_ROOT, 'install-linux.sh'), 'utf-8')
  const m = installer.match(/for pkg in ([^;]+); do/)
  if (!m) throw new Error('install-linux.sh: could not find the `for pkg in ...` dependency list')
  return m[1].trim().split(/\s+/)
}

describe('the Linux installer covers the CLIs the runtime shells out to', () => {
  // Incident (2026-07-30, GG fork): the bot reported `sqlite3: command not found`
  // on the marveen box. better-sqlite3 (the native node module) was fine -- what
  // was missing is the sqlite3 CLI, which the runtime shells out to in several
  // places, and which the installer never enumerated. Visible symptom: doctor.sh
  // printed `claudeclaw.db: alive (? memories)` -- the count silently degraded to
  // "?" -- and the dream-engine / kanban-audit scheduled tasks could not run their
  // documented queries at all.
  it('installs sqlite3, which doctor.sh and status.ts shell out to', () => {
    const doctor = readFileSync(join(REPO_ROOT, 'scripts', 'doctor.sh'), 'utf-8')
    const status = readFileSync(join(REPO_ROOT, 'scripts', 'status.ts'), 'utf-8')

    // Premise of this test: if the runtime ever stops shelling out to the sqlite3
    // CLI, revisit the requirement below instead of carrying it by inertia.
    expect(/\bsqlite3 ["'$]/.test(doctor) || /\bsqlite3 ["'$]/.test(status)).toBe(true)

    expect(linuxInstallerPackages()).toContain('sqlite3')
  })
})
