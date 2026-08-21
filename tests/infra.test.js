// tests/infra.test.js — runner nativo do Node (node --test), sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialInfraDiscovery, planInfraPreview, buildInfraQuery, buildInfraMonitorPayload, INFRA_TYPES } from '../src/lib/infra.ts'

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

test('windowAgg: network e dbQueryHealth usam sum(window) em modo threshold (total na janela, não média por intervalo)', () => {
  const network = buildInfraQuery({ kind: 'network', host: 'web', groupBy: ['host'], mode: 'threshold', thresholds: { critical: 50, warning: 10 } })
  assert.match(network, /^sum\(last_1h\):/)

  const dbQueryHealth = buildInfraQuery({ kind: 'dbQueryHealth', host: 'db-1', groupBy: ['host'], mode: 'threshold', thresholds: { critical: 5, warning: 1 } })
  assert.match(dbQueryHealth, /^sum\(last_1h\):/)
})

test('windowAgg: tipos sem .as_count() continuam avg(window) (regressão — comportamento de sempre preservado)', () => {
  const cpu = buildInfraQuery({ kind: 'cpu', host: 'web', groupBy: ['host'], mode: 'threshold', thresholds: { critical: 90, warning: 80 } })
  assert.match(cpu, /^avg\(last_1h\):/)

  const k8sNodeReady = buildInfraQuery({ kind: 'k8sNodeReady', host: 'node-1', groupBy: ['host'], mode: 'threshold', thresholds: { critical: 1, warning: 1 } })
  assert.match(k8sNodeReady, /^avg\(last_1h\):/)

  const dbConnections = buildInfraQuery({ kind: 'dbConnections', host: 'db-1', groupBy: ['host'], mode: 'threshold', thresholds: { critical: 90, warning: 80 } })
  assert.match(dbConnections, /^avg\(last_1h\):/)
})

test('windowAgg: modo anomaly sempre usa avg(window) fixo, mesmo pra tipos com windowAgg:sum (network/dbQueryHealth)', () => {
  // anomaly tem semântica própria (histórico/padrão, não total-na-janela) —
  // avg() externo é o padrão correto documentado pro modo anomaly, mesmo
  // envolvendo .as_count() por dentro (mesmo padrão do highVolume em discovery.ts).
  const q = buildInfraQuery({ kind: 'network', host: 'web', groupBy: ['host'], mode: 'anomaly', deviations: 3, alertWindow: 'last_15m' })
  assert.match(q, /^avg\(last_1h\):/)
})

test('require_full_window: true em todos os modos (achado da auditoria — doc recomenda false só pra métricas esparsas, nenhuma métrica de infra/DBM aqui é esparsa)', () => {
  const threshold = buildInfraMonitorPayload({ kind: 'cpu', host: 'web', groupBy: ['host'], mode: 'threshold', thresholds: { critical: 90, warning: 80 } })
  const anomaly = buildInfraMonitorPayload({ kind: 'cpu', host: 'web', groupBy: ['host'], mode: 'anomaly', deviations: 3, alertWindow: 'last_15m', thresholds: { critical: 90, warning: 80 } })
  assert.equal(threshold.options.require_full_window, true)
  assert.equal(anomaly.options.require_full_window, true)
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

test('no_data_timeframe: todos os tipos usam o padrão de 10min (k8sNodeReady dispara direto na query agora, não depende mais de no-data)', () => {
  const d = initialInfraDiscovery()
  d.selected = { 'node-1': true }
  for (const t of INFRA_TYPES) d.metrics[t.key].enabled = false
  d.metrics.cpu.enabled = true
  d.metrics.k8sNodeReady.enabled = true
  const plan = planInfraPreview(d)
  const cpu = plan.find(m => m.kind === 'cpu')
  const k8sNodeReady = plan.find(m => m.kind === 'k8sNodeReady')
  assert.equal(cpu.payload.options.no_data_timeframe, 10)
  assert.equal(k8sNodeReady.payload.options.no_data_timeframe, 10, 'não é mais um caso especial — notify_no_data virou só a rede de segurança genérica, não o gatilho principal')
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

test('notifyTarget: vazio preserva @equipe-infra; definido substitui na mensagem de métrica E de service check', () => {
  const d = initialInfraDiscovery()
  d.selected = { web: true }
  for (const t of INFRA_TYPES) d.metrics[t.key].enabled = false
  d.metrics.cpu.enabled = true
  d.metrics.hostUp.enabled = true
  d.notifyTarget = '@pagerduty-infra-oncall'
  const plan = planInfraPreview(d)
  const cpu = plan.find(m => m.kind === 'cpu')
  const hostUp = plan.find(m => m.kind === 'hostUp')
  assert.ok(cpu.payload.message.includes('@pagerduty-infra-oncall'))
  assert.ok(!cpu.payload.message.includes('@equipe-infra'))
  assert.ok(hostUp.payload.message.includes('@pagerduty-infra-oncall'))
})

// ── Outlier Detection (atrás da feature flag outlierDetection) ──
// Diferente de threshold/anomaly: outlier compara os hosts SELECIONADOS
// entre si, então a query usa TODOS os hosts de uma vez (host[], não host
// único) e o plano gera 1 monitor pro grupo, não 1 por host.

test('outlier: query usa outliers(), by {host} e os hosts unidos por OR', () => {
  const q = buildInfraQuery({ kind: 'cpu', host: ['web-1', 'web-2', 'web-3'], groupBy: ['host'], mode: 'outlier', thresholds: { critical: 90, warning: 80 }, algorithm: 'DBSCAN', tolerance: 3 })
  assert.match(q, /^avg\(last_1h\):/)
  assert.match(q, /outliers\(/)
  assert.match(q, /host:web-1 OR host:web-2 OR host:web-3/)
  assert.match(q, /by \{host\}/)
  assert.match(q, /'DBSCAN'/)
  assert.match(q, /, 3\)/)
  assert.match(q, />= 1$/)
})

test('outlier: percentage só entra na query pros algoritmos MAD/scaledMAD', () => {
  const dbscan = buildInfraQuery({ kind: 'cpu', host: ['a', 'b'], mode: 'outlier', thresholds: { critical: 90, warning: 80 }, algorithm: 'DBSCAN', tolerance: 1, percentage: 20 })
  assert.doesNotMatch(dbscan, /, 20\)/, 'DBSCAN não usa percentage')

  const mad = buildInfraQuery({ kind: 'cpu', host: ['a', 'b'], mode: 'outlier', thresholds: { critical: 90, warning: 80 }, algorithm: 'MAD', tolerance: 2, percentage: 20 })
  assert.match(mad, /'MAD', 2, 20\)/)
})

test('outlier: rede (2 termos) recebe by {host} em CADA termo, igual threshold/anomaly', () => {
  const q = buildInfraQuery({ kind: 'network', host: ['a', 'b'], mode: 'outlier', thresholds: { critical: 50, warning: 10 }, algorithm: 'DBSCAN', tolerance: 3 })
  const matches = q.match(/by \{host,device\}/g) || []
  assert.equal(matches.length, 2)
})

test('planInfraPreview: modo outlier gera 1 monitor por métrica pro GRUPO inteiro, não 1 por host', () => {
  const d = initialInfraDiscovery()
  d.selected = { 'web-1': true, 'web-2': true, 'web-3': true } // 3 hosts
  for (const t of INFRA_TYPES) d.metrics[t.key].enabled = false
  d.metrics.cpu.enabled = true
  d.metrics.cpu.mode = 'outlier'
  d.metrics.cpu.algorithm = 'DBSCAN'
  d.metrics.cpu.tolerance = 3
  const plan = planInfraPreview(d)

  const cpuItems = plan.filter(m => m.kind === 'cpu')
  assert.equal(cpuItems.length, 1, 'outlier deve gerar 1 monitor só, não 1 por host')
  assert.equal(cpuItems[0].service, '3 host(s)')
  assert.match(cpuItems[0].query, /host:web-1 OR host:web-2 OR host:web-3/)
  assert.match(cpuItems[0].payload.name, /\(outlier\)/)
  assert.deepEqual(cpuItems[0].payload.options.thresholds, { critical: 1.0 })
  assert.ok(!('threshold_windows' in cpuItems[0].payload.options), 'outlier não usa threshold_windows (isso é de anomaly)')
})

test('planInfraPreview: outlier e threshold/anomaly convivem no mesmo plano sem se misturar', () => {
  const d = initialInfraDiscovery()
  d.selected = { 'web-1': true, 'web-2': true }
  for (const t of INFRA_TYPES) d.metrics[t.key].enabled = false
  d.metrics.cpu.enabled = true
  d.metrics.cpu.mode = 'outlier'
  d.metrics.memory.enabled = true
  d.metrics.memory.mode = 'threshold'
  const plan = planInfraPreview(d)

  assert.equal(plan.filter(m => m.kind === 'cpu').length, 1, 'cpu (outlier) = 1 item pro grupo')
  assert.equal(plan.filter(m => m.kind === 'memory').length, 2, 'memory (threshold) = 1 item por host')
})

test('outlier: tags incluem host:<nome> de CADA host do grupo', () => {
  const d = initialInfraDiscovery()
  d.selected = { 'web-1': true, 'web-2': true }
  for (const t of INFRA_TYPES) d.metrics[t.key].enabled = false
  d.metrics.cpu.enabled = true
  d.metrics.cpu.mode = 'outlier'
  const plan = planInfraPreview(d)
  const cpu = plan.find(m => m.kind === 'cpu')
  assert.ok(cpu.payload.tags.includes('host:web-1'))
  assert.ok(cpu.payload.tags.includes('host:web-2'))
})

// ── K8s Node Ready + DBM (atrás da feature flag k8sDbmCoverage) ──
// Estes tipos existem em INFRA_TYPES independente da flag — quem gate-keeps
// é a UI (DiscoveryConfigureInfra.tsx) e a rota (infra-monitors/route.ts),
// não lib/infra.ts, então os testes abaixo não precisam mockar a flag.

test('k8sNodeReady: todos os tipos flagged declaram flag:k8sDbmCoverage', () => {
  const flagged = INFRA_TYPES.filter(t => ['k8sNodeReady', 'dbConnections', 'dbReplication', 'dbQueryHealth'].includes(t.key))
  assert.equal(flagged.length, 4)
  for (const t of flagged) assert.equal(t.flag, 'k8sDbmCoverage')
})

test('k8sNodeReady: usa kubernetes_state.node.by_condition{condition:ready,status:false}, dispara direto com "> 0" (achado da auditoria: métrica antiga media schedulability, não a condição Ready)', () => {
  const q = buildInfraQuery({ kind: 'k8sNodeReady', host: 'node-1', groupBy: ['host'], mode: 'threshold', thresholds: { critical: 0, warning: 0 } })
  assert.match(q, /kubernetes_state\.node\.by_condition/)
  assert.ok(!q.includes('kubernetes_state.nodes.by_condition'), 'tem que ser singular (nodes.by_condition plural é cluster-wide, sem tag de host)')
  assert.match(q, /condition:ready,status:false/)
  assert.match(q, /> 0$/)
})

test('dbConnections: Postgres usa percent_usage_connections; MySQL usa razão threads_connected/max_connections', () => {
  const pg = buildInfraQuery({ kind: 'dbConnections', host: 'db-1', groupBy: ['host'], mode: 'threshold', thresholds: { critical: 90, warning: 80 }, engine: 'postgres' })
  assert.match(pg, /postgresql\.percent_usage_connections\{host:db-1\}/)
  assert.match(pg, /> 90$/)

  const my = buildInfraQuery({ kind: 'dbConnections', host: 'db-1', groupBy: ['host'], mode: 'threshold', thresholds: { critical: 90, warning: 80 }, engine: 'mysql' })
  assert.match(my, /mysql\.performance\.threads_connected\{host:db-1\}/)
  assert.match(my, /mysql\.net\.max_connections_available\{host:db-1\}/)
})

test('dbConnections: sem engine explícito, cai no default (postgres)', () => {
  const q = buildInfraQuery({ kind: 'dbConnections', host: 'db-1', groupBy: ['host'], mode: 'threshold', thresholds: { critical: 90, warning: 80 } })
  assert.match(q, /postgresql\.percent_usage_connections/)
})

test('dbReplication: métrica muda por engine (Postgres vs MySQL)', () => {
  const pg = buildInfraQuery({ kind: 'dbReplication', host: 'db-1', groupBy: ['host'], mode: 'threshold', thresholds: { critical: 30, warning: 10 }, engine: 'postgres' })
  assert.match(pg, /postgresql\.replication_delay/)
  const my = buildInfraQuery({ kind: 'dbReplication', host: 'db-1', groupBy: ['host'], mode: 'threshold', thresholds: { critical: 30, warning: 10 }, engine: 'mysql' })
  assert.match(my, /mysql\.replication\.seconds_behind_master/)
})

test('dbQueryHealth: Postgres só soma deadlocks; MySQL soma deadlocks + slow_queries', () => {
  // by {host} entra ANTES do modificador .as_count() (mesmo padrão de 'network' acima).
  const pg = buildInfraQuery({ kind: 'dbQueryHealth', host: 'db-1', groupBy: ['host'], mode: 'threshold', thresholds: { critical: 5, warning: 1 }, engine: 'postgres' })
  assert.match(pg, /sum:postgresql\.deadlocks\{host:db-1\} by \{host\}\.as_count\(\)/)
  assert.ok(!pg.includes('+'), 'Postgres é um termo só, sem soma')

  const my = buildInfraQuery({ kind: 'dbQueryHealth', host: 'db-1', groupBy: ['host'], mode: 'threshold', thresholds: { critical: 5, warning: 1 }, engine: 'mysql' })
  assert.match(my, /sum:mysql\.innodb\.deadlocks\{host:db-1\} by \{host\}\.as_count\(\) \+ sum:mysql\.performance\.slow_queries\{host:db-1\} by \{host\}\.as_count\(\)/)
})

test('planInfraPreview: dbEngine escolhido pelo usuário chega até a query gerada', () => {
  const d = initialInfraDiscovery()
  d.selected = { 'db-1': true }
  for (const t of INFRA_TYPES) d.metrics[t.key].enabled = false
  d.metrics.dbConnections.enabled = true
  d.metrics.dbConnections.dbEngine = 'mysql'
  const plan = planInfraPreview(d)
  const item = plan.find(m => m.kind === 'dbConnections')
  assert.match(item.query, /mysql\.performance\.threads_connected/)
})
