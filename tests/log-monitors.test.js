// tests/log-monitors.test.js — runner nativo do Node (node --test), sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLogCountQuery, buildLogMonitorPayload, planLogPreview, initialLogMonitors, newLogMonitorRule, LOG_WINDOW_OPTIONS, DEFAULT_LOG_INDEX } from '../src/lib/log-monitors.ts'

test('buildLogCountQuery: monta logs(query).index(idx).rollup("count").last(window) > threshold', () => {
  const q = buildLogCountQuery({ queryFilter: 'service:checkout status:error', index: 'main', window: '15m', threshold: 50 })
  assert.equal(q, 'logs("service:checkout status:error").index("main").rollup("count").last("15m") > 50')
})

test('buildLogCountQuery: index ausente cai pro default "*" (todos os índices)', () => {
  const q = buildLogCountQuery({ queryFilter: 'status:error', window: '5m', threshold: 1 })
  assert.ok(q.includes('.index("*")'))
  assert.equal(DEFAULT_LOG_INDEX, '*')
})

test('buildLogCountQuery: filtro vazio é aceito (conta TODOS os logs do índice)', () => {
  const q = buildLogCountQuery({ queryFilter: '', index: '*', window: '1h', threshold: 1000 })
  assert.equal(q, 'logs("").index("*").rollup("count").last("1h") > 1000')
})

test('buildLogCountQuery: aspas duplas no filtro do usuário são escapadas (não quebram a query)', () => {
  const q = buildLogCountQuery({ queryFilter: 'message:"connection refused"', index: '*', window: '5m', threshold: 1 })
  assert.equal(q, 'logs("message:\\"connection refused\\"").index("*").rollup("count").last("5m") > 1')
})

test('LOG_WINDOW_OPTIONS: nenhuma janela passa do teto documentado de 2 dias', () => {
  for (const w of LOG_WINDOW_OPTIONS) {
    const m = w.value.match(/^(\d+)([mh])$/)
    assert.ok(m, `formato inesperado: ${w.value}`)
    const minutes = m[2] === 'h' ? Number(m[1]) * 60 : Number(m[1])
    assert.ok(minutes <= 2880, `${w.value} excede o teto de 2 dias`)
  }
})

test('buildLogMonitorPayload: type "log alert", nome com prefixo, tags base, enable_logs_sample', () => {
  const payload = buildLogMonitorPayload({ label: 'Erros do checkout', queryFilter: 'service:checkout status:error', index: '*', window: '15m', threshold: 50 })
  assert.equal(payload.type, 'log alert')
  assert.equal(payload.name, '[MonitorsCreator] Erros do checkout')
  assert.ok(payload.tags.includes('created_by:monitorscreator'))
  assert.ok(payload.tags.includes('monitor_kind:log'))
  assert.equal(payload.options.thresholds.critical, 50)
  assert.equal(payload.options.enable_logs_sample, true)
  assert.equal(payload.options.thresholds.warning, undefined)
})

test('buildLogMonitorPayload: warningThreshold definido entra em options.thresholds.warning', () => {
  const payload = buildLogMonitorPayload({ label: 'x', queryFilter: '', index: '*', window: '5m', threshold: 100, warningThreshold: 50 })
  assert.equal(payload.options.thresholds.warning, 50)
})

test('buildLogMonitorPayload: priority null/ausente não entra no payload; definida entra no topo', () => {
  const semPrioridade = buildLogMonitorPayload({ label: 'x', queryFilter: '', window: '5m', threshold: 1 })
  assert.equal('priority' in semPrioridade, false)
  const comPrioridade = buildLogMonitorPayload({ label: 'x', queryFilter: '', window: '5m', threshold: 1, priority: 2 })
  assert.equal(comPrioridade.priority, 2)
})

test('buildLogMonitorPayload: notifyTarget substitui @equipe-ops na mensagem default', () => {
  const payload = buildLogMonitorPayload({ label: 'x', queryFilter: '', window: '5m', threshold: 1, notifyTarget: '@equipe-plataforma' })
  assert.ok(payload.message.includes('@equipe-plataforma'))
  assert.ok(!payload.message.includes('@equipe-ops'))
})

test('planLogPreview: 1 item por regra habilitada (com label); regra sem label é pulada', () => {
  const state = initialLogMonitors()
  state.rules = [
    { ...newLogMonitorRule('r1'), label: 'Erros checkout', queryFilter: 'service:checkout status:error', threshold: 50 },
    { ...newLogMonitorRule('r2'), label: '' }, // sem label — deve ser pulada
  ]
  const plan = planLogPreview(state)
  assert.equal(plan.length, 1)
  assert.equal(plan[0].label, 'Erros checkout')
  assert.equal(plan[0].payload.type, 'log alert')
})

test('planLogPreview: mensagem por regra vem de messages[rule.id] quando presente', () => {
  const state = initialLogMonitors()
  state.rules = [{ ...newLogMonitorRule('r1'), label: 'x' }]
  state.messages = { r1: 'mensagem customizada' }
  const plan = planLogPreview(state)
  assert.equal(plan[0].message, 'mensagem customizada')
})

test('planLogPreview: sem regras (ou objeto vazio) devolve plano vazio, sem lançar', () => {
  assert.deepEqual(planLogPreview({}), [])
  assert.deepEqual(planLogPreview(initialLogMonitors()), [])
})

test('newLogMonitorRule: defaults sensatos (janela 15m, índice "*", amostra de logs ligada)', () => {
  const r = newLogMonitorRule('abc')
  assert.equal(r.id, 'abc')
  assert.equal(r.window, '15m')
  assert.equal(r.index, '*')
  assert.equal(r.enableLogsSample, true)
  assert.equal(r.warningThreshold, null)
})
