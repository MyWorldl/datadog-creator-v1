// tests/audit.test.js — node --test, sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeCoverage, coverageScore, buildSuggestedInfra, AUDIT_CATALOG } from '../src/lib/audit.js'

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

test('buildSuggestedInfra habilita só as métricas de infra em lacuna, para os hosts dados', () => {
  const cov = analyzeCoverage(monitorsSample)
  const sug = buildSuggestedInfra(cov, ['web', 'db'])
  // cpu e hostUp cobertos -> fora; memory/disk/diskIO/network/load em lacuna -> dentro
  assert.ok(!sug.gapKinds.includes('cpu'))
  assert.ok(!sug.gapKinds.includes('hostUp'))
  assert.ok(sug.gapKinds.includes('memory'))
  assert.ok(sug.gapKinds.includes('network'))
  assert.equal(sug.hostCount, 2)
  assert.equal(sug.monitorCount, sug.gapKinds.length * 2)
  // o objeto infra vem pronto: hosts selecionados e só as gapKinds habilitadas
  assert.deepEqual(Object.keys(sug.infra.selected).sort(), ['db', 'web'])
  for (const k of Object.keys(sug.infra.metrics)) {
    assert.equal(sug.infra.metrics[k].enabled, sug.gapKinds.includes(k), `métrica ${k}`)
  }
})

test('catálogo cobre Infra + APM', () => {
  const groups = new Set(AUDIT_CATALOG.map(c => c.group))
  assert.ok(groups.has('Infra'))
  assert.ok(groups.has('APM'))
  assert.ok(AUDIT_CATALOG.length >= 10)
})
