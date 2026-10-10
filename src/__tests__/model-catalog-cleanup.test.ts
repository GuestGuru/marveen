import { afterAll, describe, expect, it, vi } from 'vitest'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import { join } from 'node:path'

vi.mock('../config.js', () => ({
  PROJECT_ROOT: join(process.cwd(), '.offline-model-catalog-store'), MAIN_AGENT_ID: 'main', DEFAULT_AGENT_MODEL: 'claude-opus-5-5',
  STORE_DIR: join(process.cwd(), '.offline-model-catalog-store'),
}))
vi.mock('../logger.js', () => ({ logger: { warn: vi.fn() } }))

import { DISTRIBUTION_DEFAULT_AGENT_MODEL, getSettingDefinition, validateSettingValue } from '../config-registry.js'
import { resolveModelId, resolveSelectedModelId, readAgentModel, writeAgentModel, DEFAULT_MODEL } from '../web/agent-config.js'
import { classifyPersona, suggestForAgent } from '../web/model-suggest.js'
import { loadOpenRouterCatalog, resolveOpenRouterModel, openRouterModelWarning } from '../web/openrouter-models.js'

afterAll(() => rmSync(join(process.cwd(), '.offline-model-catalog-store'), { recursive: true, force: true }))

describe('IT-1569 modellkatalógus kompatibilitás', () => {
  it('csak az új kiválasztás rövid aliasai térnek át 5.5-re', () => {
    for (const [alias, previous, selected] of [
      ['opus', 'claude-opus-5[1m]', 'claude-opus-5-5[1m]'],
      ['sonnet', 'claude-sonnet-5', 'claude-sonnet-5-5'],
      ['haiku', 'claude-haiku-4-5-20251001', 'claude-haiku-5-5'],
    ]) {
      expect(resolveModelId(alias)).toBe(previous)
      expect(resolveSelectedModelId(alias)).toBe(selected)
      expect(resolveSelectedModelId(previous)).toBe(previous)
    }
    expect(DEFAULT_MODEL).toBe('claude-opus-5-5')
    expect(DISTRIBUTION_DEFAULT_AGENT_MODEL).toBe('claude-opus-5[1m]')
    expect(resolveSelectedModelId('inherit')).toBe(DEFAULT_MODEL)
  })

  it('a mentett konfiguráció olvasása és visszamentése nem migrálja a régi ID-t vagy aliast', () => {
    const dir = join(process.cwd(), '.offline-model-catalog-store', 'agents', 'old-agent')
    mkdirSync(dir, { recursive: true })
    const path = join(dir, 'agent-config.json')
    for (const [saved, resolved] of [['opus', 'claude-opus-5[1m]'], ['sonnet', 'claude-sonnet-5'], ['haiku', 'claude-haiku-4-5-20251001'], ['claude-opus-5[1m]', 'claude-opus-5[1m]']]) {
      const raw = JSON.stringify({ model: saved, description: 'Megőrzendő mező' })
      writeFileSync(path, raw)
      expect(readAgentModel('old-agent')).toBe(resolved)
      expect(readFileSync(path, 'utf8')).toBe(raw)
      writeAgentModel('old-agent', saved)
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ model: saved, description: 'Megőrzendő mező' })
    }
  })

  it('a beállítás új listájából kikerül a régi ID, de menthető marad', () => {
    const def = getSettingDefinition('DEFAULT_AGENT_MODEL')!
    for (const model of ['claude-opus-5', 'claude-opus-5[1m]', 'claude-sonnet-5', 'claude-haiku-4-5-20251001']) {
      expect(def.valueSet).not.toContain(model)
      expect(validateSettingValue(def, model)).toEqual({ ok: true, value: model })
    }
    expect(def.valueSet).toContain('claude-haiku-5-5')
  })

  it('az ajánló 5.5-öt javasol, de a kapott aktuális modellt megőrzi', () => {
    expect(classifyPersona('senior architect koordinál komplex multi-agent').suggestedModel).toBe('claude-opus-5-5[1m]')
    expect(classifyPersona('általános asszisztens').suggestedModel).toBe('claude-sonnet-5-5')
    expect(classifyPersona('sport, edzés, futás, kerékpár').suggestedModel).toBe('claude-haiku-5-5')
    const result = suggestForAgent('old', 'claude-opus-5[1m]', 'architect komplex multi-agent')
    expect(result.currentModel).toBe('claude-opus-5[1m]')
    expect(result.changeAdvised).toBe(true)
  })

  it('a hiányzó OpenRouter route-ok láthatóan nem ajánlottak, a feloldás és a free jelleg változatlan', () => {
    const catalog = loadOpenRouterCatalog()
    const free = catalog.tiers.find(t => t.key === 'tier0')!
    expect(free.auto).toBe('meta-llama/llama-3.3-70b-instruct:free')
    expect(resolveOpenRouterModel('openrouter-auto:tier0')).toBe(free.auto)
    for (const model of [...free.manual, 'google/gemini-3.1-pro']) {
      expect(openRouterModelWarning(model)).toMatch(/nem ajánlott/)
      expect(resolveOpenRouterModel(model)).toBe(model)
    }
    expect(free.manual.every(m => m.endsWith(':free'))).toBe(true)
    expect(openRouterModelWarning('google/gemini-2.5-flash')).toBeNull()
  })

  it('a Rembrandt kompatibilitási kulcsok friss Sol/Luna modellekre mutatnak, CLI indítása nélkül', () => {
    const script = readFileSync(join(process.cwd(), 'scripts/rembrandt.sh'), 'utf8')
    const mapping = script.match(/case "\$MODEL_KEY" in[\s\S]*?esac/)![0]
    for (const [key, model] of [['sol', 'gpt-6.1-sol'], ['terra', 'gpt-6-sol'], ['luna', 'gpt-6-luna']]) {
      const output = execFileSync('bash', ['-c', mapping + '\nprintf "%s" "$MODEL"'], { env: { MODEL_KEY: key }, encoding: 'utf8' })
      expect(output).toBe(model)
    }
  })

  it('a UI legacy-kapu új választást tilt, a jelenlegi AUTO és manual értéket megőrzi', () => {
    const source = readFileSync(join(process.cwd(), 'web/app.js'), 'utf8')
    const start = source.indexOf('function applyOpenRouterLegacyGate(sel)')
    const body = source.slice(start, source.indexOf('async function loadAvailableModels()', start))
    const options = [
      { value: 'openrouter-auto:tier0', dataset: { legacyWarning: '1' }, disabled: false },
      { value: 'qwen/qwen3-coder:free', dataset: { legacyWarning: '1' }, disabled: false },
      { value: 'google/gemini-2.5-flash', dataset: {}, disabled: false },
    ]
    const sel = { value: 'google/gemini-2.5-flash', options }
    const context = { sel }
    runInNewContext(body + '\napplyOpenRouterLegacyGate(sel)', context)
    expect(options.map(o => o.disabled)).toEqual([true, true, false])
    sel.value = 'openrouter-auto:tier0'
    runInNewContext(body + '\napplyOpenRouterLegacyGate(sel)', context)
    expect(options.map(o => o.disabled)).toEqual([false, true, false])
    sel.value = 'qwen/qwen3-coder:free'
    runInNewContext(body + '\napplyOpenRouterLegacyGate(sel)', context)
    expect(options.map(o => o.disabled)).toEqual([true, false, false])
  })

  it.each(['deepseek-v4-flash', 'claude-opus-5[1m]', 'claude-sonnet-5', 'claude-haiku-4-5-20251001', 'opus', 'sonnet', 'haiku', 'google/gemini-3.1-pro', 'openrouter-auto:tier0'])(
    'az async katalógusfrissítés végén a mentett %s kiválasztás marad', async (model) => {
      class Option {
        value = ''
        textContent = ''
        className = ''
        dataset: Record<string, string> = {}
        disabled = false
      }
      class Select {
        id = 'editAgentModel'
        selected = model
        children: Option[] = []
        groups: Group[] = []
        get options() { return [...this.children, ...this.groups.flatMap(g => g.children)] }
        get value() { return this.options.some(o => o.value === this.selected) ? this.selected : this.options[0]?.value ?? '' }
        set value(value: string) { this.selected = this.options.some(o => o.value === value) ? value : '' }
        appendChild(option: Option) { this.children.push(option) }
      }
      class Group {
        children: Option[] = []
        style = { display: '' }
        constructor(readonly parentElement: Select) { parentElement.groups.push(this) }
        set innerHTML(_value: string) { this.children = [] }
        appendChild(option: Option) { this.children.push(option) }
      }
      const sel = new Select()
      sel.appendChild(Object.assign(new Option(), { value: 'claude-sonnet-5-5' }))
      const stale = new Group(sel)
      stale.appendChild(Object.assign(new Option(), { value: model }))
      const auto = new Group(sel)
      const manual = new Group(sel)
      const elements: Record<string, Select | Group> = { editAgentModel: sel, deepseekModelGroup: stale, openrouterAutoGroup: auto, openrouterManualGroup: manual }
      const source = readFileSync(join(process.cwd(), 'web/app.js'), 'utf8')
      const start = source.indexOf('function applyOpenRouterLegacyGate(sel)')
      const body = source.slice(start, source.indexOf('function updateCustomModelIdRow(selectEl)', start))
      const context = {
        document: { getElementById: (id: string) => elements[id] ?? null, createElement: () => new Option() },
        currentAgent: { model, name: 'old-agent' }, openrouterCurated: new Set(),
        applyClaudeCliGate() {}, updateCustomModelIdRow() {},
        fetch: async () => ({ ok: true, json: async () => ({
          deepseek: [{ id: 'deepseek-flash', label: 'Flash' }],
          openrouter: { tiers: [{ autoId: 'openrouter-auto:tier0', auto: 'meta-llama/llama-3.3-70b-instruct:free', autoWarning: 'Legacy: nem ajánlott' }] },
        }) }),
      }
      await runInNewContext(body + '\nloadAvailableModels()', context)
      expect(sel.value).toBe(model)
      const option = sel.options.find(o => o.value === model)!
      expect(option).toBeDefined()
      expect(option.disabled).toBe(false)
    },
  )

  it('a pending metaadatválasz megőrzi a mentett modelltől eltérő, még nem mentett UI-választást', async () => {
    const source = readFileSync(join(process.cwd(), 'web/app.js'), 'utf8')
    const start = source.indexOf('function applyOpenRouterLegacyGate(sel)')
    const body = source.slice(start, source.indexOf('function updateCustomModelIdRow(selectEl)', start))
    const sel = { value: 'claude-sonnet-5', options: [
      { value: 'claude-sonnet-5', dataset: {} }, { value: 'claude-sonnet-5-5', dataset: {} },
    ] }
    let resolveFetch!: (response: unknown) => void
    const response = new Promise(resolve => { resolveFetch = resolve })
    const context = {
      document: { getElementById: (id: string) => id === 'editAgentModel' ? sel : null },
      currentAgent: { name: 'old-agent', model: 'claude-sonnet-5' }, openrouterCurated: new Set(),
      applyClaudeCliGate() {}, updateCustomModelIdRow() {}, fetch: () => response,
    }
    const pending = runInNewContext(body + '\nloadAvailableModels()', context)
    sel.value = 'claude-sonnet-5-5'
    resolveFetch({ ok: true, json: async () => ({}) })
    await pending
    expect(sel.value).toBe('claude-sonnet-5-5')
    // A curation utáni ismételt betöltés ugyanezt az explicit értéket őrzi.
    await runInNewContext(body + '\nloadAvailableModels()', context)
    expect(sel.value).toBe('claude-sonnet-5-5')
  })

  it.each([
    ['available-first', false], ['ollama-first', false],
    ['available-first', true], ['ollama-first', true],
  ] as const)('a szinkron inicializálás után a %s sorrend helyes (közben user-választás: %s)', async (order, userChanges) => {
    class Option {
      value = ''
      className = ''
      textContent = ''
      dataset: Record<string, string> = {}
      disabled = false
    }
    class Select {
      id = 'editAgentModel'
      selected = 'claude-sonnet-5-5'
      children: Option[] = []
      groups: Group[] = []
      get options() { return [...this.children, ...this.groups.flatMap(group => group.children)] }
      get value() { return this.options.some(option => option.value === this.selected) ? this.selected : this.options[0]?.value ?? '' }
      set value(value: string) { this.selected = value }
      appendChild(option: Option) { this.children.push(option) }
      querySelectorAll() { return [] }
    }
    class Group {
      children: Option[] = []
      style = { display: '' }
      constructor(readonly parentElement: Select) { parentElement.groups.push(this) }
      set innerHTML(_value: string) { this.children = [] }
      appendChild(option: Option) { this.children.push(option) }
    }
    const saved = 'deepseek-v4-flash'
    const sel = new Select()
    sel.appendChild(Object.assign(new Option(), { value: 'claude-sonnet-5-5' }))
    const deepseek = new Group(sel)
    deepseek.appendChild(Object.assign(new Option(), { value: saved }))
    const ollama = new Group(sel)
    const elements: Record<string, Select | Group> = { editAgentModel: sel, deepseekModelGroup: deepseek, ollamaModelGroup: ollama }
    const source = readFileSync(join(process.cwd(), 'web/app.js'), 'utf8')
    const modelStart = source.indexOf('function applyOpenRouterLegacyGate(sel)')
    const modelBody = source.slice(modelStart, source.indexOf('function updateCustomModelIdRow(selectEl)', modelStart))
    const ollamaStart = source.indexOf('async function loadOllamaModels()')
    const ollamaBody = source.slice(ollamaStart, source.indexOf('// Populates the DeepSeek optgroups', ollamaStart))
    const initStart = source.indexOf('  // A mentett modell szinkron inicializálása')
    const initialization = source.slice(initStart, source.indexOf('  populateProfileSelect(', initStart))
      .replace('  loadAvailableModels()', '  availablePending = loadAvailableModels()')
      .replace('  loadOllamaModels()', '  ollamaPending = loadOllamaModels()')
    const resolvers: Record<string, (value: unknown) => void> = {}
    const context = {
      document: { getElementById: (id: string) => elements[id] ?? null, createElement: () => new Option() },
      currentAgent: { name: 'old-agent', model: saved }, openrouterCurated: new Set(), lastAvailableModelsData: null,
      applyClaudeCliGate() {}, updateCustomModelIdRow() {},
      availablePending: null as Promise<unknown> | null, ollamaPending: null as Promise<unknown> | null,
      fetch: (url: string) => new Promise(resolve => { resolvers[url] = resolve }),
    }
    runInNewContext(modelBody + ollamaBody + initialization, context)
    expect(sel.value).toBe(saved)
    if (userChanges) sel.value = 'claude-sonnet-5-5'
    const expected = userChanges ? 'claude-sonnet-5-5' : saved
    const finishAvailable = async () => {
      resolvers['/api/models/available']({ ok: true, json: async () => ({ deepseek: [{ id: 'deepseek-flash', label: 'Flash' }] }) })
      await context.availablePending
    }
    const finishOllama = async () => {
      resolvers['/api/ollama/models']({ ok: true, json: async () => [] })
      await context.ollamaPending
    }
    if (order === 'available-first') { await finishAvailable(); await finishOllama() }
    else { await finishOllama(); await finishAvailable() }
    expect(sel.value).toBe(expected)
    expect(sel.options.some(option => option.value === expected)).toBe(true)
  })

  it('a beállítás UI a listából kivett korábbi értéket kijelzi és ugyanazt menti vissza', () => {
    class Element {
      children: Element[] = []
      dataset: Record<string, string> = {}
      className = ''
      value = ''
      textContent = ''
      appendChild(child: Element) { this.children.push(child) }
      addEventListener() {}
    }
    const source = readFileSync(join(process.cwd(), 'web/app.js'), 'utf8')
    const start = source.indexOf('function buildSettingRow(def)')
    const body = source.slice(start, source.indexOf('async function saveAllSettings()', start))
    const def = { ...getSettingDefinition('DEFAULT_AGENT_MODEL')!, value: 'claude-opus-5[1m]' }
    const context = { document: { createElement: () => new Element() }, t: (key: string) => key, def }
    const row = runInNewContext(body + '\nbuildSettingRow(def)', context) as Element
    const select = row.children[1].children[0]
    expect(select.value).toBe(def.value)
    const saved = select.children.find(o => o.value === def.value)!
    expect(saved.textContent).toContain('korábbi beállítás')
    expect(select.dataset.originalValue).toBe(def.value)
  })

  it('a valódi HTML-választókban is az új Haiku szerepel', () => {
    const html = readFileSync(join(process.cwd(), 'web/index.html'), 'utf8')
    expect(html).not.toMatch(/<option value="claude-(?:opus-5"|sonnet-5"|haiku-4-5-20251001")/)
    expect(html.match(/<option value="claude-haiku-5-5"/g)).toHaveLength(2)
  })
})
