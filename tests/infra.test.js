// tests/infra.test.js — runner nativo do Node (node --test), sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialInfraDiscovery, planInfraPreview, buildInfraQuery, buildInfraMonitorPayload, INFRA_TYPES } from '../src/lib/infra.js'

test('threshold: query traz aritmética, group-by e o valor de critical', () => {
  const q = buildInfraQuery({ kind: 'cpu', host: 'web', groupBy: ['host'], mode: 'threshold', thresholds: { critical: 90, warning: 80 } })
  assert.match(q, /^avg\(last_1h\):/)
  assert.match(q, /100 - avg:system\.cpu\.idle\{host:web\}/)
  assert.match(q, /by \{host\}/)
  assert.match(q, /> 90$/)
})

test('anomaly: query usa anomalies() com direção/janela/algoritmo', () => {
  const q = buildInfraQuery({ kind: 'cpu', host: 'web', groupBy: ['host'], mode: 'anomaly', deviations: 3, direction: 'above', algorithm: 'robust', seasonality: 'weekly', alertWindow: 'last_15m' })
  assert.match(q, /anomalies\(/)
  assert.match(q, /'robust'/)
  assert.match(q, /direction='above'/)
  assert.match(q, /alert_window='last_15m'/)
  assert.match(q, /seasonality='weekly'/)
})

test('rede: o by {host,device} entra em CADA termo da soma', () => {
  const q = buildInfraQuery({ kind: 'network', host: 'web', groupBy: ['host'], mode: 'threshold', thresholds: { critical: 50, warning: 10 } })
  const matches = q.match(/by \{host,device\}/g) || []
  assert.equal(matches.length, 2, 'esperado o by em ambos os termos (packets_in e packets_out)')
})

test('service check (Agent Down): payload correto', () => {
  const p = buildInfraMonitorPayload({ kind: 'hostUp', host: 'web', counts: { critical: 3, warning: 1 }, window: 4 })
  assert.equal(p.type, 'service check')
  assert.match(p.query, /^"datadog\.agent\.up"\.over\("host:web"\)\.by\("host"\)\.last\(4\)\.count_by_status\(\)$/)
  assert.equal(p.options.thresholds.critical, 3)
  assert.equal(p.options.thresholds.warning, 1)
  assert.ok('ok' in p.options.thresholds)
})

test('anomaly de infra: trigger_window casa com alert_window (regra da doc)', () => {
  const d = initialInfraDiscovery()
  d.selected = { web: true }
  d.metrics.cpu.enabled = true
  d.metrics.cpu.mode = 'anomaly'
  d.metrics.cpu.alertWindow = 'last_30m'
  const plan = planInfraPreview(d)
  const cpu = plan.find(m => m.kind === 'cpu')
  assert.ok(cpu, 'plano deve conter o monitor de CPU')
  const aw = cpu.query.match(/alert_window='(\w+)'/)[1]
  assert.equal(cpu.payload.options.threshold_windows.trigger_window, aw)
})

test('planInfraPreview: um monitor por (host × métrica habilitada)', () => {
  const d = initialInfraDiscovery()
  d.selected = { web: true, db: true } // 2 hosts
  for (const t of INFRA_TYPES) d.metrics[t.key].enabled = false
  d.metrics.cpu.enabled = true
  d.metrics.memory.enabled = true // 2 métricas
  const plan = planInfraPreview(d)
  assert.equal(plan.length, 4) // 2 hosts × 2 métricas
})

test('priority: padrão é P3 (initialInfraDiscovery já vem com priority:3 pra cada métrica/check)', () => {
  const d = initialInfraDiscovery()
  d.selected = { web: true }
  for (const t of INFRA_TYPES) d.metrics[t.key].enabled = false
  d.metrics.cpu.enabled = true
  d.metrics.hostUp.enabled = true
  const plan = planInfraPreview(d)
  for (const m of plan) {
    assert.equal(m.priority, 3, `${m.kind}: esperado priority 3 (padrão)`)
    assert.equal(m.payload.priority, 3, `${m.kind}: payload deveria ter priority 3`)
  }
})

test('priority: null explícito (usuário escolheu "Sem prioridade" na UI) faz o campo nem aparecer no payload', () => {
  const d = initialInfraDiscovery()
  d.selected = { web: true }
  for (const t of INFRA_TYPES) d.metrics[t.key].enabled = false
  d.metrics.cpu.enabled = true
  d.metrics.cpu.priority = null
  d.metrics.hostUp.enabled = true
  d.metrics.hostUp.priority = null
  const plan = planInfraPreview(d)
  for (const m of plan) {
    assert.equal(m.priority, null, `${m.kind}: esperado priority null`)
    assert.ok(!('priority' in m.payload), `${m.kind}: payload não deveria ter priority`)
  }
})

test('priority: definida na config, propaga pro payload de métrica E de service check (campo de topo)', () => {
  const d = initialInfraDiscovery()
  d.selected = { web: true }
  for (const t of INFRA_TYPES) d.metrics[t.key].enabled = false
  d.metrics.cpu.enabled = true
  d.metrics.cpu.priority = 1
  d.metrics.hostUp.enabled = true
  d.metrics.hostUp.priority = 5
  const plan = planInfraPreview(d)
  const cpu = plan.find(m => m.kind === 'cpu')
  const hostUp = plan.find(m => m.kind === 'hostUp')
  assert.equal(cpu.priority, 1)
  assert.equal(cpu.payload.priority, 1)
  assert.equal(hostUp.priority, 5)
  assert.equal(hostUp.payload.priority, 5)
})

test('queryWindow: default é last_1h (alinhado ao alertWindow de 15m, ~4x)', () => {
  const d = initialInfraDiscovery()
  assert.equal(d.metrics.cpu.queryWindow, 'last_1h')
})

test('recovery threshold: ausente por padrão (comportamento igual ao de sempre)', () => {
  const d = initialInfraDiscovery()
  d.selected = { web: true }
  for (const t of INFRA_TYPES) d.metrics[t.key].enabled = false
  d.metrics.cpu.enabled = true
  const plan = planInfraPreview(d)
  const cpu = plan.find(m => m.kind === 'cpu')
  assert.ok(!('critical_recovery' in cpu.payload.options.thresholds))
  assert.ok(!('warning_recovery' in cpu.payload.options.thresholds))
})

test('recovery threshold: definido no config, entra em options.thresholds.critical_recovery/warning_recovery', () => {
  const d = initialInfraDiscovery()
  d.selected = { web: true }
  for (const t of INFRA_TYPES) d.metrics[t.key].enabled = false
  d.metrics.cpu.enabled = true
  d.metrics.cpu.thresholds.criticalRecovery = 80
  d.metrics.cpu.thresholds.warningRecovery = 70
  const plan = planInfraPreview(d)
  const cpu = plan.find(m => m.kind === 'cpu')
  assert.equal(cpu.payload.options.thresholds.critical_recovery, 80)
  assert.equal(cpu.payload.options.thresholds.warning_recovery, 70)
})

test('evaluation_delay: presente por padrão (60s) nos monitores de métrica, ausente no service check', () => {
  const d = initialInfraDiscovery()
  d.selected = { web: true }
  for (const t of INFRA_TYPES) d.metrics[t.key].enabled = false
  d.metrics.cpu.enabled = true
  d.metrics.hostUp.enabled = true
  const plan = planInfraPreview(d)
  const cpu = plan.find(m => m.kind === 'cpu')
  const hostUp = plan.find(m => m.kind === 'hostUp')
  assert.equal(cpu.payload.options.evaluation_delay, 60)
  assert.ok(!('evaluation_delay' in hostUp.payload.options), 'service check não usa evaluation_delay')
})
