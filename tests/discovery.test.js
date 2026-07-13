// tests/discovery.test.js — runner nativo do Node (node --test), sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialDiscovery, planPreview, buildAnomalyQuery, ALERT_TYPES } from '../src/lib/discovery.js'

// Monta uma discovery com 1 serviço + 1 operação e todos os alertas ligados.
function fullPlan() {
  const d = initialDiscovery()
  d.env = 'prod'
  d.selected = { web: { opsCount: 1, operations: ['http.request'], chosen: ['http.request'] } }
  for (const k of Object.keys(d.alerts)) d.alerts[k].enabled = true
  return planPreview(d)
}

test('defaults por tipo de alerta batem com o combinado', () => {
  const byKey = Object.fromEntries(ALERT_TYPES.map(a => [a.key, a]))
  assert.deepEqual(
    { algo: byKey.latency.algorithm, seas: byKey.latency.seasonality, win: byKey.latency.alertWindow, dir: byKey.latency.direction },
    { algo: 'robust', seas: 'weekly', win: 'last_15m', dir: 'above' },
  )
  assert.equal(byKey.errorRate.alertWindow, 'last_5m')
  assert.equal(byKey.highVolume.algorithm, 'agile')
  assert.equal(byKey.lowVolume.direction, 'below')
})

test('trigger_window SEMPRE casa com o alert_window da query (regra crítica da doc)', () => {
  for (const m of fullPlan()) {
    const aw = m.query.match(/alert_window='(\w+)'/)[1]
    const tw = m.payload.options.threshold_windows.trigger_window
    assert.equal(tw, aw, `${m.kind}: trigger_window (${tw}) != alert_window (${aw})`)
  }
})

test('direção só usa above/below/both (nunca "igual")', () => {
  for (const m of fullPlan()) {
    const dir = m.query.match(/direction='(\w+)'/)[1]
    assert.ok(['above', 'below', 'both'].includes(dir), `direção inválida: ${dir}`)
  }
})

test('buildAnomalyQuery injeta seasonality só quando não é basic', () => {
  const withSeas = buildAnomalyQuery({ kind: 'latency', service: 'web', deviations: 2, direction: 'above', algorithm: 'robust', seasonality: 'weekly', alertWindow: 'last_15m' })
  assert.match(withSeas, /seasonality='weekly'/)
  const basic = buildAnomalyQuery({ kind: 'latency', service: 'web', deviations: 2, direction: 'above', algorithm: 'basic', seasonality: 'weekly', alertWindow: 'last_15m' })
  assert.doesNotMatch(basic, /seasonality=/)
})

test('priority: padrão é P3 (initialDiscovery já vem com priority:3 pra cada tipo de alerta)', () => {
  const d = initialDiscovery()
  d.selected = { web: { opsCount: 1, operations: ['http.request'], chosen: ['http.request'] } }
  d.alerts.latency.enabled = true
  const [m] = planPreview(d)
  assert.equal(m.priority, 3)
  assert.equal(m.payload.priority, 3)
})

test('priority: null explícito (usuário escolheu "Sem prioridade" na UI) faz o campo nem aparecer no payload', () => {
  const d = initialDiscovery()
  d.selected = { web: { opsCount: 1, operations: ['http.request'], chosen: ['http.request'] } }
  d.alerts.latency.enabled = true
  d.alerts.latency.priority = null
  const [m] = planPreview(d)
  assert.equal(m.priority, null)
  assert.ok(!('priority' in m.payload))
})

test('priority: definida na config, propaga pro item do plano E pro payload (campo de topo, não dentro de options)', () => {
  const d = initialDiscovery()
  d.selected = { web: { opsCount: 1, operations: ['http.request'], chosen: ['http.request'] } }
  d.alerts.latency.enabled = true
  d.alerts.latency.priority = 2
  const [m] = planPreview(d)
  assert.equal(m.priority, 2)
  assert.equal(m.payload.priority, 2)
  assert.ok(!('priority' in m.payload.options), 'priority é campo de topo do monitor, não deve ficar dentro de options')
})
