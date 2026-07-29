// tests/discovery.test.js — runner nativo do Node (node --test), sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialDiscovery, planPreview, buildAnomalyQuery, buildPodRestartsQuery, buildPodPendingQuery, ALERT_TYPES, POD_RESTARTS_TYPE, POD_PENDING_TYPE, DEFAULT_OPERATION, pickPrimaryOperation } from '../src/lib/discovery.ts'

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

test('scopeType: padrão é "service" em initialDiscovery()', () => {
  const d = initialDiscovery()
  assert.equal(d.scopeType, 'service')
})

test('scopeType "namespace": query e tags usam kube_namespace: em vez de service:', () => {
  const d = initialDiscovery()
  d.scopeType = 'namespace'
  d.selected = { payments: { opsCount: 1, operations: ['grpc.request'], chosen: ['grpc.request'] } }
  d.alerts.latency.enabled = true
  const [m] = planPreview(d)
  assert.match(m.query, /kube_namespace:payments/)
  assert.doesNotMatch(m.query, /service:payments/)
  assert.ok(m.payload.tags.includes('kube_namespace:payments'))
  assert.ok(!m.payload.tags.some(t => t.startsWith('service:')))
})

test('scopeType "service" (default, sem passar o campo): continua gerando service: — regressão', () => {
  const d = initialDiscovery()
  d.selected = { web: { opsCount: 1, operations: ['http.request'], chosen: ['http.request'] } }
  d.alerts.latency.enabled = true
  const [m] = planPreview(d)
  assert.match(m.query, /service:web/)
  assert.doesNotMatch(m.query, /kube_namespace:/)
  assert.ok(m.payload.tags.includes('service:web'))
})

test('tag operation:<op> sempre presente no payload, nos dois modos', () => {
  const svc = initialDiscovery()
  svc.selected = { web: { opsCount: 1, operations: ['http.request'], chosen: ['http.request'] } }
  svc.alerts.latency.enabled = true
  const [svcMonitor] = planPreview(svc)
  assert.ok(svcMonitor.payload.tags.includes('operation:http.request'))

  const ns = initialDiscovery()
  ns.scopeType = 'namespace'
  ns.selected = { payments: { opsCount: 1, operations: ['web.request'], chosen: ['web.request'] } }
  ns.alerts.latency.enabled = true
  const [nsMonitor] = planPreview(ns)
  assert.ok(nsMonitor.payload.tags.includes('operation:web.request'))
})

test('operation ausente cai em DEFAULT_OPERATION de forma consistente na query e na tag', () => {
  const d = initialDiscovery()
  d.selected = { web: { opsCount: 0, operations: [], chosen: [''] } } // chosen com string vazia -> operation falsy
  d.alerts.latency.enabled = true
  const [m] = planPreview(d)
  assert.match(m.query, new RegExp(`trace\\.${DEFAULT_OPERATION}\\{`))
  assert.ok(m.payload.tags.includes(`operation:${DEFAULT_OPERATION}`))
})

test('pickPrimaryOperation: respeita a ordem de preferência e cai no primeiro item quando nada bate', () => {
  assert.equal(pickPrimaryOperation(['grpc.request', 'http.request']), 'http.request')
  assert.equal(pickPrimaryOperation(['custom.op', 'another.op']), 'custom.op')
  assert.equal(pickPrimaryOperation([]), DEFAULT_OPERATION)
})

test('queryWindow: escalado por tipo (~5x o alert_window) — errorRate usa last_30m, os demais last_1h', () => {
  const byKind = Object.fromEntries(fullPlan().map(m => [m.kind, m]))
  assert.match(byKind.errorRate.query, /^avg\(last_30m\):/)
  assert.match(byKind.latency.query, /^avg\(last_1h\):/)
  assert.match(byKind.highVolume.query, /^avg\(last_1h\):/)
  assert.match(byKind.lowVolume.query, /^avg\(last_1h\):/)
})

test('evaluation_delay: presente em todo monitor, igual ao interval da query (60s)', () => {
  for (const m of fullPlan()) {
    assert.equal(m.payload.options.evaluation_delay, 60, `${m.kind}: evaluation_delay ausente ou diferente de 60`)
    assert.match(m.query, /interval=60/)
  }
})

test('notify_no_data/renotify_interval: false/0 por padrão (comportamento de sempre), configuráveis via discovery state', () => {
  const off = fullPlan()
  for (const m of off) {
    assert.equal(m.payload.options.notify_no_data, false)
    assert.equal(m.payload.options.renotify_interval, 0)
  }

  const d = initialDiscovery()
  d.selected = { web: { opsCount: 1, operations: ['http.request'], chosen: ['http.request'] } }
  d.alerts.latency.enabled = true
  d.notifyNoData = true
  d.renotifyInterval = 30
  const on = planPreview(d)
  assert.equal(on[0].payload.options.notify_no_data, true)
  assert.equal(on[0].payload.options.renotify_interval, 30)
})

test('notifyTarget: vazio preserva @equipe-ops; definido substitui em TODAS as mensagens do plano', () => {
  const untouched = fullPlan()
  assert.ok(untouched.every(m => m.payload.message.includes('@equipe-ops')))

  const d = initialDiscovery()
  d.selected = { web: { opsCount: 1, operations: ['http.request'], chosen: ['http.request'] } }
  d.alerts.latency.enabled = true
  d.alerts.errorRate.enabled = true
  d.notifyTarget = '@slack-checkout-alerts'
  const routed = planPreview(d)
  for (const m of routed) {
    assert.ok(m.payload.message.includes('@slack-checkout-alerts'), `${m.kind}: mention não substituído`)
    assert.ok(!m.payload.message.includes('@equipe-ops'), `${m.kind}: @equipe-ops não deveria mais aparecer`)
  }
})

// ── Pod Restarts (K8s, namespace-only, sem operation — atrás de k8sDbmCoverage) ──
// Gate de flag é responsabilidade da UI/rota, não de lib/discovery.ts — os
// testes abaixo não precisam mockar a flag.

test('buildPodRestartsQuery: usa change() sobre kubernetes.containers.restarts, escopado só por kube_namespace', () => {
  const q = buildPodRestartsQuery({ namespace: 'payments' })
  assert.match(q, /^change\(sum\(last_5m\),last_5m\):/)
  assert.match(q, /exclude_null\(avg:kubernetes\.containers\.restarts\{kube_namespace:payments\} by \{pod_name\}\)/)
  assert.match(q, /> 5$/)
  assert.ok(!q.includes('env:'), 'não deve filtrar por env (tag não confiável nessa métrica)')
})

test('buildPodRestartsQuery: threshold e changeWindow customizados entram na query', () => {
  const q = buildPodRestartsQuery({ namespace: 'checkout', threshold: 10, changeWindow: 'last_15m' })
  assert.match(q, /^change\(sum\(last_15m\),last_15m\):/)
  assert.match(q, /> 10$/)
})

test('planPreview: Pod Restarts gera 1 monitor por NAMESPACE selecionado, sem depender de operação escolhida', () => {
  const d = initialDiscovery()
  d.scopeType = 'namespace'
  // Nota: nenhuma operação escolhida (chosen:[]) — Pod Restarts não depende disso.
  d.selected = { payments: { opsCount: 0, operations: [], chosen: [] }, checkout: { opsCount: 0, operations: [], chosen: [] } }
  for (const k of Object.keys(d.alerts)) d.alerts[k].enabled = false // só Pod Restarts habilitado
  d.podRestarts.enabled = true
  const plan = planPreview(d)

  const podItems = plan.filter(m => m.kind === POD_RESTARTS_TYPE.key)
  assert.equal(podItems.length, 2, 'esperado 1 monitor por namespace selecionado')
  assert.deepEqual(podItems.map(m => m.service).sort(), ['checkout', 'payments'])
  for (const m of podItems) {
    assert.match(m.query, /kube_namespace:(payments|checkout)/)
    assert.equal(m.payload.type, 'query alert')
    assert.ok(m.payload.tags.includes(`kube_namespace:${m.service}`))
  }
})

test('planPreview: Pod Restarts NÃO aparece em scopeType:service, mesmo habilitado', () => {
  const d = initialDiscovery()
  d.scopeType = 'service'
  d.selected = { web: { opsCount: 1, operations: ['http.request'], chosen: ['http.request'] } }
  d.podRestarts.enabled = true
  const plan = planPreview(d)
  assert.equal(plan.filter(m => m.kind === POD_RESTARTS_TYPE.key).length, 0)
})

test('planPreview: Pod Restarts e os 4 alertas de trace convivem no mesmo plano sem se misturar', () => {
  const d = initialDiscovery()
  d.scopeType = 'namespace'
  d.selected = { payments: { opsCount: 1, operations: ['http.request'], chosen: ['http.request'] } }
  d.alerts.latency.enabled = true
  d.podRestarts.enabled = true
  const plan = planPreview(d)
  assert.equal(plan.filter(m => m.kind === POD_RESTARTS_TYPE.key).length, 1)
  assert.equal(plan.filter(m => m.kind === 'latency').length, 1)
})

// ── Pod Pending (K8s, GLOBAL — sem entidade nem operation) ──

test('buildPodPendingQuery: usa min()/default_zero() sobre kubernetes_state.pod.status_phase, quebrado por kube_namespace', () => {
  const q = buildPodPendingQuery()
  assert.match(q, /^min\(last_10m\):default_zero\(max:kubernetes_state\.pod\.status_phase\{phase:pending\} by \{kube_namespace\}\)/)
  assert.match(q, /> 0$/)
})

test('buildPodPendingQuery: threshold e window customizados entram na query', () => {
  const q = buildPodPendingQuery({ window: 'last_30m', threshold: 3 })
  assert.match(q, /^min\(last_30m\):/)
  assert.match(q, /> 3$/)
})

test('planPreview: Pod Pending gera NO MÁXIMO 1 item, independente de `selected`/scopeType', () => {
  const d = initialDiscovery()
  d.scopeType = 'service' // nem precisa ser namespace — Pod Pending ignora scopeType
  d.selected = {} // nem precisa de nenhuma entidade selecionada
  d.podPending.enabled = true
  const plan = planPreview(d)
  const podPendingItems = plan.filter(m => m.kind === POD_PENDING_TYPE.key)
  assert.equal(podPendingItems.length, 1)
  assert.equal(podPendingItems[0].payload.type, 'query alert')
})

test('planPreview: Pod Pending desabilitado não aparece no plano', () => {
  const d = initialDiscovery()
  const plan = planPreview(d)
  assert.equal(plan.filter(m => m.kind === POD_PENDING_TYPE.key).length, 0)
})

test('planPreview: Pod Restarts e Pod Pending respeitam notifyNoData/renotifyInterval do discovery state (antes vinha hardcoded false/0)', () => {
  const d = initialDiscovery()
  d.scopeType = 'namespace'
  d.selected = { payments: { opsCount: 0, operations: [], chosen: [] } }
  d.podRestarts.enabled = true
  d.podPending.enabled = true
  d.notifyNoData = true
  d.renotifyInterval = 45
  const plan = planPreview(d)
  const podRestarts = plan.find(m => m.kind === POD_RESTARTS_TYPE.key)
  const podPending = plan.find(m => m.kind === POD_PENDING_TYPE.key)
  assert.equal(podRestarts.payload.options.notify_no_data, true)
  assert.equal(podRestarts.payload.options.renotify_interval, 45)
  assert.equal(podPending.payload.options.notify_no_data, true)
  assert.equal(podPending.payload.options.renotify_interval, 45)
})
