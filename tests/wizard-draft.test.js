// tests/wizard-draft.test.js — runner nativo do Node (node --test), sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeDraft, parseDraft, isDraftMeaningful, DRAFT_MAX_CHARS } from '../src/lib/wizard-draft.ts'

const initial = () => ({
  resourceType: 'services',
  discovery: { selected: {}, env: '', namePrefix: '[MonitorsCreator]', novoCampo: 'padrao' },
  infra: { selected: {}, hosts: [] },
  logMonitors: { rules: [] },
})

test('rascunho vazio (só a tela inicial) não é "digno de retomar"', () => {
  assert.equal(isDraftMeaningful(initial()), false)
  assert.equal(parseDraft(serializeDraft(1, initial()), initial()), null)
})

test('seleção de entidades ou regras de log tornam o rascunho relevante', () => {
  const a = initial(); a.discovery.selected = { checkout: { chosen: [] } }
  assert.equal(isDraftMeaningful(a), true)
  const b = initial(); b.logMonitors.rules = [{ id: 'r1' }]
  assert.equal(isDraftMeaningful(b), true)
  const c = initial(); c.infra.selected = { 'web-1': false } // desmarcado não conta
  assert.equal(isDraftMeaningful(c), false)
})

test('ida e volta: preserva passo e configuração', () => {
  const cfg = initial(); cfg.discovery.selected = { api: { chosen: ['http.request'] } }; cfg.discovery.env = 'prod'
  const back = parseDraft(serializeDraft(2, cfg, 1700000000000), initial())
  assert.equal(back.step, 2)
  assert.equal(back.savedAt, 1700000000000)
  assert.equal(back.config.discovery.env, 'prod')
  assert.deepEqual(back.config.discovery.selected, { api: { chosen: ['http.request'] } })
})

test('campos novos (ausentes no rascunho antigo) ficam com o padrão atual — merge por seção', () => {
  const old = { resourceType: 'services', discovery: { selected: { api: {} }, env: 'x' }, infra: { selected: {}, hosts: [] }, logMonitors: { rules: [] } } // sem novoCampo/namePrefix
  const back = parseDraft(JSON.stringify({ v: 1, savedAt: 1, step: 1, config: old }), initial())
  assert.equal(back.config.discovery.novoCampo, 'padrao')
  assert.equal(back.config.discovery.namePrefix, '[MonitorsCreator]')
  assert.equal(back.config.discovery.env, 'x')
})

test('inválido / outra versão / JSON quebrado / passo fora da faixa', () => {
  assert.equal(parseDraft(null, initial()), null)
  assert.equal(parseDraft('{quebrado', initial()), null)
  assert.equal(parseDraft(JSON.stringify({ v: 99, savedAt: 1, step: 1, config: {} }), initial()), null)
  assert.equal(parseDraft(JSON.stringify({ v: 1, savedAt: 'x', step: 1, config: {} }), initial()), null)
  const cfg = initial(); cfg.discovery.selected = { a: {} }
  assert.equal(parseDraft(JSON.stringify({ v: 1, savedAt: 1, step: 99, config: cfg }), initial()).step, 4)
  assert.equal(parseDraft(JSON.stringify({ v: 1, savedAt: 1, step: -3, config: cfg }), initial()).step, 0)
})

test('estado gigante não é salvo (devolve null em vez de estourar a cota)', () => {
  const cfg = initial(); cfg.discovery.selected = { a: {} }; cfg.infra.hosts = ['x'.repeat(DRAFT_MAX_CHARS)]
  assert.equal(serializeDraft(1, cfg), null)
})
