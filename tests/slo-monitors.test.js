// tests/slo-monitors.test.js — runner nativo do Node (node --test), sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSloQuery, buildSloMonitorPayload, planSloPreview, initialSloMonitors, validateSloAlerts, defaultSloMessage, SLO_ALERT_TYPES } from '../src/lib/slo-monitors.ts'

const slo = { id: 'abc123', name: 'API - Disponibilidade', type: 'metric', timeframe: '30d', target: 99.9 }

test('buildSloQuery: burn rate rápido/lento e error budget (sintaxe confirmada no validador do Datadog)', () => {
  assert.equal(buildSloQuery({ kind: 'burnFast', sloId: 'abc123', timeframe: '30d', threshold: 14.4 }), 'burn_rate("abc123").over("30d").long_window("1h").short_window("5m") > 14.4')
  assert.equal(buildSloQuery({ kind: 'burnSlow', sloId: 'abc123', timeframe: '7d', threshold: 6 }), 'burn_rate("abc123").over("7d").long_window("6h").short_window("30m") > 6')
  assert.equal(buildSloQuery({ kind: 'errorBudget', sloId: 'abc123', timeframe: '30d', threshold: 75 }), 'error_budget("abc123").over("30d") > 75')
})

test('buildSloQuery: aspas/contrabarra no id não quebram a query', () => {
  assert.equal(buildSloQuery({ kind: 'errorBudget', sloId: 'a"b\\c', timeframe: '7d', threshold: 1 }), 'error_budget("a\\"b\\\\c").over("7d") > 1')
})

test('janela curta é 1/12 da longa nos presets de burn rate (recomendação multi-janela do SRE Workbook)', () => {
  const to = w => (w.endsWith('h') ? Number(w.slice(0, -1)) * 60 : Number(w.slice(0, -1)))
  for (const t of SLO_ALERT_TYPES.filter(t => t.longWindow)) assert.equal(to(t.longWindow) / to(t.shortWindow), 12)
})

test('payload: type "slo alert", tags de rastreio, critical = número da query, prioridade no topo', () => {
  const p = buildSloMonitorPayload({ kind: 'burnFast', slo, threshold: 14.4, priority: 2, tags: ['team:x'] })
  assert.equal(p.type, 'slo alert')
  assert.equal(p.name, '[MonitorsCreator] API - Disponibilidade · Burn rate rápido')
  assert.ok(p.tags.includes('slo_id:abc123') && p.tags.includes('slo_alert:burnFast') && p.tags.includes('monitor_kind:slo') && p.tags.includes('team:x'))
  assert.equal(p.options.thresholds.critical, 14.4)
  assert.equal(p.priority, 2)
})

test('mensagem: cita o nome do SLO; notifyTarget troca o @equipe-ops', () => {
  assert.ok(defaultSloMessage('errorBudget', 'Meu SLO').includes('"Meu SLO"'))
  const p = buildSloMonitorPayload({ kind: 'burnSlow', slo, threshold: 6, notifyTarget: '@slack-sre' })
  assert.ok(p.message.includes('@slack-sre') && !p.message.includes('@equipe-ops'))
})

test('planSloPreview: 1 monitor por (SLO escolhido × alerta habilitado); padrão = burn rápido + lento', () => {
  const st = initialSloMonitors()
  st.slos = [slo, { ...slo, id: 'def456', name: 'Outro' }]
  st.selected = { abc123: true }
  const plan = planSloPreview(st)
  assert.deepEqual(plan.map(p => p.kind), ['burnFast', 'burnSlow'])
  assert.ok(plan.every(p => p.service === 'API - Disponibilidade'))
  st.alerts.errorBudget.enabled = true
  assert.equal(planSloPreview(st).length, 3)
})

test('planSloPreview: sem seleção, SLO desconhecido ou estado vazio não gera nada nem quebra', () => {
  assert.deepEqual(planSloPreview({}), [])
  const st = initialSloMonitors(); st.slos = [slo]
  assert.deepEqual(planSloPreview(st), [])
  st.selected = { naoExiste: true }
  assert.deepEqual(planSloPreview(st), [])
})

test('planSloPreview: usa o timeframe do SLO e o limite configurado', () => {
  const st = initialSloMonitors(); st.slos = [{ ...slo, timeframe: '90d' }]; st.selected = { abc123: true }
  st.alerts.burnFast.threshold = 10
  const q = planSloPreview(st)[0].query
  assert.ok(q.includes('.over("90d")') && q.endsWith('> 10'))
})

test('validateSloAlerts: limite > 0; error budget é % (<= 100); desabilitado é ignorado', () => {
  const st = initialSloMonitors()
  assert.deepEqual(validateSloAlerts(st.alerts), [])
  st.alerts.burnFast.threshold = 0
  assert.equal(validateSloAlerts(st.alerts).length, 1)
  st.alerts.errorBudget = { enabled: true, threshold: 150, priority: 3 }
  assert.equal(validateSloAlerts(st.alerts).length, 2)
  st.alerts.burnFast.enabled = false
  assert.equal(validateSloAlerts(st.alerts).length, 1)
})
