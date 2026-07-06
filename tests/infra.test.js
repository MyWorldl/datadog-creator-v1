// tests/infra.test.js — runner nativo do Node (node --test), sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialInfraDiscovery, planInfraPreview, buildInfraQuery, buildInfraMonitorPayload, INFRA_TYPES } from '../src/lib/infra.js'

test('threshold: query traz aritmética, group-by e o valor de critical', () => {
  const q = buildInfraQuery({ kind: 'cpu', host: 'web', groupBy: ['host'], mode: 'threshold', thresholds: { critical: 90, warning: 80 } })
  assert.match(q, /^avg\(last_10m\):/)
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
