import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'
import Database from 'better-sqlite3'

const repo = join(__dirname, '..', '..')
let root: string
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'promotion-hook-')))
  for (const dir of ['scripts/hooks', 'dist/gg', 'dist/web', 'store', 'agents/jean']) mkdirSync(join(root, dir), { recursive: true })
  writeFileSync(join(root, 'package.json'), '{"type":"module"}')
  symlinkSync(join(repo, 'node_modules'), join(root, 'node_modules'))
  for (const name of ['gg/brain-promotion-cli', 'web/atomic-write']) {
    const source = readFileSync(join(repo, 'src', name + '.ts'), 'utf8')
    writeFileSync(join(root, 'dist', name + '.js'), transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } }).outputText)
  }
  copyFileSync(join(repo, 'scripts/hooks/ledger_lib.py'), join(root, 'scripts/hooks/ledger_lib.py'))
  const db = new Database(join(root, 'store/claudeclaw.db'))
  db.exec("CREATE TABLE memories (id INTEGER, agent_id TEXT, category TEXT, content TEXT, created_at INTEGER, keywords TEXT); INSERT INTO memories VALUES (463,'jean','warm','tény',0,NULL),(467,'jean','cold','tény',0,NULL)")
  db.close()
})
afterEach(() => rmSync(root, { recursive: true, force: true }))
function gate(key: string, cwd = join(root, 'agents/jean')) {
  const script = 'scripts/hooks/brain-promotion-save-gate.py'
  copyFileSync(join(repo, script), join(root, script))
  return spawnSync('python3', [join(root, script)], {
    input: JSON.stringify({ tool_name: 'mcp__gg-access__brain_save', tool_input: { kulcs: key }, cwd, transcript_path: join(root, 'agents/jean/.claude-config/projects/test/session.jsonl') }), encoding: 'utf8',
  })
}

describe('az átemelő mentés hookja valódi CLI-val', () => {
  it('a következő tételt engedi, az előreszaladást még a tool előtt blokkolja', () => {
    const allowed = gate('marveen-jean-mem-463'); expect(allowed.status, allowed.stderr).toBe(0)
    const denied = gate('marveen-jean-mem-467')
    expect(denied.status).toBe(2)
    expect(denied.stderr).toContain('463')
  })
  it('a javító kulcs ugyanahhoz a soron következő tételhez mehet', () => {
    expect(gate('marveen-jean-mem-463-v2').status).toBe(0)
  })
  it('az általános, azonnali cégesagy-mentést nem érinti', () => {
    expect(gate('uj-tartós-tény').status).toBe(0)
    expect(gate('marveen-jean-policy').status).toBe(0)
  })
  it('más bot átemelő kulcsát és hibás kulcsot blokkol', () => {
    expect(gate('marveen-bubi-mem-463').status).toBe(2)
    expect(gate('marveen-jean-mem-bad').status).toBe(2)
  })
  it('hiányzó build vagy adatbázis esetén nem enged át átemelő mentést', () => {
    rmSync(join(root, 'dist/gg/brain-promotion-cli.js'))
    expect(gate('marveen-jean-mem-463').status).toBe(2)
    expect(gate('mas-kulcs').status).toBe(0)
  })
})
