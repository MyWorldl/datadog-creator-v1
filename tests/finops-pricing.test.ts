// tests/finops-pricing.test.js — node --test, sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeCost, PRODUCTS, EST_METRICS } from '../src/lib/finops-pricing.ts'

test('computeCost: por unidade (host)', () => {
  assert.equal(computeCost(100, 15, 1, false), 1500) // 100 hosts × $15
})

test('computeCost: bytes → GB', () => {
  assert.equal(computeCost(500e9, 0.10, 1, true), 50) // 500 GB × $0.10
})

test('computeCost: base por 100 (custom metrics)', () => {
  assert.equal(computeCost(10000, 5, 100, false), 500) // 10k/100 × $5
})

test('computeCost: base por 1M (logs indexados)', () => {
  assert.equal(computeCost(50e6, 1.70, 1e6, false), 85) // 50M/1M × $1.70
})

test('computeCost: base por 1k (RUM sessões)', () => {
  assert.equal(computeCost(200000, 0.15, 1e3, false), 30) // 200k/1k × $0.15
})

test('computeCost: valor nulo/NaN retorna null (defensivo)', () => {
  assert.equal(computeCost(null, 15, 1, false), null)
  assert.equal(computeCost(NaN, 15, 1, false), null)
})

test('computeCost: base por 1M (APM spans indexados) — mesmo preço/base de logs indexados (15d)', () => {
  assert.equal(computeCost(25e6, 1.70, 1e6, false), 42.5) // 25M/1M × $1.70
})

test('apmIndexed: diferente de logsIndexed, tem estMetric (não sofre do "gap silencioso" em Sub-Org)', () => {
  const apmIndexed = PRODUCTS.find(p => p.key === 'apmIndexed')
  const logsIndexed = PRODUCTS.find(p => p.key === 'logsIndexed')
  assert.ok(apmIndexed, 'produto apmIndexed deveria existir no catálogo')
  assert.ok(logsIndexed, 'produto logsIndexed deveria existir no catálogo')
  assert.equal(apmIndexed.estMetric, 'datadog.estimated_usage.apm.indexed_spans')
  assert.equal(apmIndexed.estAgg, 'sum')
  assert.equal(logsIndexed.estMetric, null, 'logsIndexed continua sem métrica estimada — limitação real da Datadog, não regressão')
})

test('catálogo tem produtos e cada um traz preço e base; métrica de uso é opcional mas válida quando existe', () => {
  assert.ok(PRODUCTS.length >= 10)
  for (const p of PRODUCTS) {
    assert.ok(typeof p.price === 'number' && p.price > 0, `${p.key} sem preço`)
    assert.ok(typeof p.per === 'number' && p.per > 0, `${p.key} sem base 'per'`)
    if (p.estMetric != null) {
      assert.ok(p.estMetric.startsWith('datadog.estimated_usage.'), `${p.key} métrica inválida`)
      assert.ok(p.estAgg != null && ['sum', 'peak', 'avg'].includes(p.estAgg), `${p.key} sem agregação válida`)
    }
  }
  // EST_METRICS lista só os produtos que têm métrica estimada.
  assert.equal(EST_METRICS.length, PRODUCTS.filter(p => p.estMetric).length)
})
