// tests/audit.test.js — node --test, sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  analyzeCoverage, coverageScore, buildSuggestedInfra, buildSuggestedApm,
  analyzeHostCoverage, analyzeServiceCoverage, coveragePercent, percentBand,
  AUDIT_CATALOG,
} from '../src/lib/audit.js'

const monitorsSample = [
  { query: 'avg(last_10m):100 - avg:system.cpu.idle{*} by {host} > 90' },      // CPU
  { query: '"datadog.agent.up".over("host:web").by("host").last(4).count_by_status()' }, // Agent Down
  { query: '( sum:trace.web.request.errors{*}.as_count() / sum:trace.web.request.hits{*}.as_count() ) * 100 > 5' }, // APM erros + hits
  { query: 'avg(last_5m):p95:trace.web.request{service:web} > 1' },             // APM latência
]

test('detecta métricas cobertas por nome na query', () => {
  const cov = analyzeCoverage(monitorsSample)
  const byKey = Object.fromEntries(cov.map(c => [c.key, c]))
  assert.equal(byKey.cpu.covered, true)
  assert.equal(byKey.hostUp.covered, true)
  assert.equal(byKey.apmErrors.covered, true)
  assert.equal(byKey.apmHits.covered, true)
  assert.equal(byKey.apmLatency.covered, true)
  // memória/disco/rede/load NÃO estão nos monitores de exemplo -> lacuna
  assert.equal(byKey.memory.covered, false)
  assert.equal(byKey.disk.covered, false)
  assert.equal(byKey.network.covered, false)
})

test('coverageScore = % de itens cobertos', () => {
  const cov = analyzeCoverage(monitorsSample)
  const covered = cov.filter(c => c.covered).length
  assert.equal(coverageScore(cov), Math.round((covered / cov.length) * 100))
  assert.equal(coverageScore([]), 0)
})

test('buildSuggestedInfra: host 100% coberto fica de fora; host com gap parcial só recebe as métricas faltantes', () => {
  const hostCoverage = [
    // web: cpu coberto (amplo {*} do monitorsSample), resto tudo em gap
    ...analyzeHostCoverage(monitorsSample, ['web']),
  ]
  // Adiciona um host 100% coberto manualmente (todas as métricas true).
  const fullyCovered = { host: 'db-full', metrics: Object.fromEntries(AUDIT_CATALOG.filter(c => c.group === 'Infra').map(c => [c.key, true])), gapCount: 0 }
  const sug = buildSuggestedInfra([...hostCoverage, fullyCovered])

  assert.ok(!sug.plan.some(m => m.service === 'db-full'), 'host 100% coberto não deve gerar nenhum item no plano')
  const webItems = sug.plan.filter(m => m.service === 'web')
  assert.ok(webItems.length > 0, 'host com gap parcial deve gerar itens')
  assert.ok(!webItems.some(m => m.kind === 'cpu'), 'web já tem CPU coberto (monitor amplo {*}) — não deve sugerir CPU de novo')
  assert.ok(webItems.some(m => m.kind === 'memory'), 'web não tem memória coberta — deve sugerir')
  assert.equal(sug.hostCount, 1, 'só web tem gap; db-full não conta')
  assert.equal(sug.monitorCount, sug.plan.length)
})

test('catálogo cobre Infra + APM', () => {
  const groups = new Set(AUDIT_CATALOG.map(c => c.group))
  assert.ok(groups.has('Infra'))
  assert.ok(groups.has('APM'))
  assert.ok(AUDIT_CATALOG.length >= 10)
})

test('analyzeHostCoverage: {*} cobre todos os hosts; host:X cobre só X', () => {
  const monitors = [
    { query: 'avg(last_10m):100 - avg:system.cpu.idle{*} by {host} > 90' }, // CPU amplo
    { query: 'avg(last_5m):avg:system.mem.pct_usable{host:web} * 100 < 10' }, // memória só web
  ]
  const hc = analyzeHostCoverage(monitors, ['web', 'db'])
  const byHost = Object.fromEntries(hc.map(h => [h.host, h]))
  assert.equal(byHost.web.metrics.cpu, true)
  assert.equal(byHost.db.metrics.cpu, true)      // {*} cobre db também
  assert.equal(byHost.web.metrics.memory, true)  // host:web
  assert.equal(byHost.db.metrics.memory, false)  // db sem monitor de memória
  assert.ok(byHost.db.gapCount >= 1)
})

test('analyzeServiceCoverage: {*} cobre todos os serviços; service:X cobre só X', () => {
  const monitors = [
    { query: 'avg(last_5m):p95:trace.http.request{*} > 1' }, // latência ampla
    { query: '( sum:trace.http.request.errors{service:checkout}.as_count() / sum:trace.http.request.hits{service:checkout}.as_count() ) * 100 > 5' }, // erros só checkout
  ]
  const sc = analyzeServiceCoverage(monitors, ['checkout', 'cart'])
  const byService = Object.fromEntries(sc.map(s => [s.service, s]))
  assert.equal(byService.checkout.metrics.apmLatency, true)
  assert.equal(byService.cart.metrics.apmLatency, true)   // {*} cobre cart também
  assert.equal(byService.checkout.metrics.apmErrors, true) // service:checkout
  assert.equal(byService.cart.metrics.apmErrors, false)    // cart sem monitor de erros
  assert.ok(byService.cart.gapCount >= 1)
})

test('analyzeServiceCoverage: limitação documentada — monitor de namespace (kube_namespace:X, sem service: literal) NÃO marca o serviço como coberto', () => {
  const monitors = [
    { query: '( sum:trace.http.request.errors{kube_namespace:checkout-ns}.as_count() / sum:trace.http.request.hits{kube_namespace:checkout-ns}.as_count() ) * 100 > 5' },
  ]
  const sc = analyzeServiceCoverage(monitors, ['checkout'])
  assert.equal(sc[0].metrics.apmErrors, false, 'limitação conhecida: query escopada por kube_namespace não é reconhecida como cobrindo o serviço')
})

test('coveragePercent: array vazio -> percent null; fração normal com arredondamento; 100%/0%', () => {
  assert.deepEqual(coveragePercent([], 'cpu'), { coveredCount: 0, totalCount: 0, percent: null })

  const rows = [
    { metrics: { cpu: true } }, { metrics: { cpu: true } }, { metrics: { cpu: false } },
  ]
  const r = coveragePercent(rows, 'cpu')
  assert.equal(r.coveredCount, 2)
  assert.equal(r.totalCount, 3)
  assert.equal(r.percent, Math.round((2 / 3) * 100))

  const allCovered = [{ metrics: { cpu: true } }, { metrics: { cpu: true } }]
  assert.equal(coveragePercent(allCovered, 'cpu').percent, 100)

  const noneCovered = [{ metrics: { cpu: false } }, { metrics: { cpu: false } }]
  assert.equal(coveragePercent(noneCovered, 'cpu').percent, 0)
})

test('percentBand: fronteiras exatas (<=40 red, <75 yellow, >=75 green, null -> null)', () => {
  assert.equal(percentBand(40), 'red')
  assert.equal(percentBand(41), 'yellow')
  assert.equal(percentBand(74), 'yellow')
  assert.equal(percentBand(75), 'green')
  assert.equal(percentBand(0), 'red')
  assert.equal(percentBand(100), 'green')
  assert.equal(percentBand(null), null)
  assert.equal(percentBand(undefined), null)
})

test('buildSuggestedApm: 2 serviços com gaps diferentes geram a contagem certa de itens, cada um com DEFAULT_OPERATION', () => {
  const serviceCoverage = [
    { service: 'checkout', metrics: { apmLatency: true, apmErrors: false, apmHits: true }, gapCount: 1 }, // só falta errorRate
    { service: 'cart', metrics: { apmLatency: false, apmErrors: true, apmHits: false }, gapCount: 2 },    // falta latency + highVolume
    { service: 'search', metrics: { apmLatency: true, apmErrors: true, apmHits: true }, gapCount: 0 },    // 100% coberto
  ]
  const sug = buildSuggestedApm(serviceCoverage)

  const checkoutItems = sug.plan.filter(m => m.service === 'checkout')
  const cartItems = sug.plan.filter(m => m.service === 'cart')
  const searchItems = sug.plan.filter(m => m.service === 'search')

  assert.equal(checkoutItems.length, 1)
  assert.equal(checkoutItems[0].kind, 'errorRate')
  assert.equal(cartItems.length, 2)
  assert.deepEqual(new Set(cartItems.map(m => m.kind)), new Set(['latency', 'highVolume']))
  assert.equal(searchItems.length, 0, 'serviço 100% coberto não deve gerar nenhum item')

  for (const m of sug.plan) {
    assert.equal(m.operation, 'http.request')
    assert.match(m.query, /service:/)
  }
  assert.equal(sug.serviceCount, 2)
  assert.equal(sug.monitorCount, sug.plan.length)
  assert.match(sug.operationNote, /http\.request/)
})
