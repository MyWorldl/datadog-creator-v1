// src/lib/audit.js
//
// AuditMonitors: analisa o ambiente e identifica quais MÉTRICAS-CHAVE já têm
// monitor e quais estão SEM cobertura, cruzando um catálogo de métricas
// (Infra + APM) com as queries dos monitores existentes.
//
// Detecção "por nome de métrica na query" (conforme combinado): um item do
// catálogo é considerado COBERTO se o nome da sua métrica aparece na query de
// pelo menos um monitor — o que também pega monitores criados fora do app.
//
// Nomes de métrica:
//  - Infra: Datadog Agent padrão (integração system) — espelham lib/infra.js.
//    https://docs.datadoghq.com/integrations/system/
//  - APM: trace.<span>.hits, trace.<span>.errors e trace.<span>/.duration.
//    https://docs.datadoghq.com/tracing/metrics/metrics_namespace/

import { initialInfraDiscovery, planInfraPreview } from './infra.js'
import { buildMonitorPayload, DEFAULT_OPERATION, ALERT_BY_KEY, DEFAULT_GROUP_BY } from './discovery.js'

const any = (q, ...subs) => subs.some(s => q.includes(s))

export const AUDIT_CATALOG = [
  // ── Infra (host) — infraKind liga na sugestão via lib/infra.js ──
  { key: 'cpu', group: 'Infra', label: 'CPU', infraKind: 'cpu', detect: q => any(q, 'system.cpu.idle', 'system.cpu.user', 'system.cpu.system') },
  { key: 'memory', group: 'Infra', label: 'Memória', infraKind: 'memory', detect: q => any(q, 'system.mem.pct_usable', 'system.mem.usable', 'system.mem.used') },
  { key: 'disk', group: 'Infra', label: 'Disco (espaço)', infraKind: 'disk', detect: q => any(q, 'system.disk.in_use', 'system.disk.used') },
  { key: 'diskIO', group: 'Infra', label: 'Disco I/O', infraKind: 'diskIO', detect: q => q.includes('system.io.util') },
  { key: 'network', group: 'Infra', label: 'Rede (erros)', infraKind: 'network', detect: q => any(q, 'system.net.packets_in.error', 'system.net.packets_out.error') },
  { key: 'load', group: 'Infra', label: 'Load', infraKind: 'load', detect: q => any(q, 'system.load.norm.5', 'system.load.1', 'system.load.5', 'system.load.15') },
  { key: 'hostUp', group: 'Infra', label: 'Agent Down', infraKind: 'hostUp', detect: q => q.includes('datadog.agent.up') },
  // ── APM (serviço) — apm liga no tipo de alerta do discovery.js ──
  { key: 'apmLatency', group: 'APM', label: 'Latência (APM)', apm: 'latency', detect: q => q.includes('trace.') && (/p\d\d:trace\./.test(q) || q.includes('.duration') || (q.includes('avg:trace.') && !q.includes('.hits') && !q.includes('.errors'))) },
  { key: 'apmErrors', group: 'APM', label: 'Erros (APM)', apm: 'errorRate', detect: q => q.includes('trace.') && q.includes('.errors') },
  { key: 'apmHits', group: 'APM', label: 'Throughput (APM)', apm: 'highVolume', detect: q => q.includes('trace.') && q.includes('.hits') },
]

// Cruza o catálogo com as queries dos monitores. Retorna cobertura por item.
export function analyzeCoverage(monitors) {
  const queries = (monitors || []).map(m => String(m?.query || ''))
  return AUDIT_CATALOG.map(c => {
    let monitorCount = 0
    for (const q of queries) { try { if (c.detect(q)) monitorCount++ } catch { /* query estranha: ignora */ } }
    return { key: c.key, group: c.group, label: c.label, covered: monitorCount > 0, monitorCount, infraKind: c.infraKind || null, apm: c.apm || null }
  })
}

// Score de cobertura = % de itens do catálogo com pelo menos um monitor.
export function coverageScore(coverage) {
  if (!coverage.length) return 0
  return Math.round((coverage.filter(c => c.covered).length / coverage.length) * 100)
}

// ── Cobertura POR HOST das métricas de Infra (Feature: granularidade por host) ──
// Heurística de escopo (detecção por texto da query):
//  - monitor "amplo": referencia a métrica E tem {*}  -> cobre TODOS os hosts.
//  - monitor específico: referencia a métrica E contém host:<nome> -> cobre aquele host.
// host X coberto para a métrica M = existe monitor amplo em M OU específico de X em M.
// Monitores escopados por outras tags (ex.: env:prod) NÃO contam, para evitar
// falsa cobertura — é conservador (pode marcar lacuna a mais, nunca a menos).
export const INFRA_CATALOG = AUDIT_CATALOG.filter(c => c.group === 'Infra')
export const APM_CATALOG = AUDIT_CATALOG.filter(c => c.group === 'APM')

export function analyzeHostCoverage(monitors, hostNames) {
  const queries = (monitors || []).map(m => String(m?.query || ''))
  const broad = {}
  const specific = {}
  for (const c of INFRA_CATALOG) {
    broad[c.key] = queries.some(q => { try { return c.detect(q) && q.includes('{*}') } catch { return false } })
    const set = new Set()
    for (const q of queries) {
      try {
        if (!c.detect(q)) continue
        for (const h of (hostNames || [])) if (q.includes(`host:${h}`)) set.add(h)
      } catch { /* query estranha: ignora */ }
    }
    specific[c.key] = set
  }
  return (hostNames || []).map(host => {
    const metrics = {}
    let gapCount = 0
    for (const c of INFRA_CATALOG) {
      const covered = broad[c.key] || specific[c.key].has(host)
      metrics[c.key] = covered
      if (!covered) gapCount++
    }
    return { host, metrics, gapCount }
  })
}

// ── Cobertura POR SERVIÇO das métricas de APM (mesma heurística acima, agora
// pra service:<nome> em vez de host:<nome>) ──
// LIMITAÇÃO CONHECIDA E DELIBERADA: um monitor de NAMESPACE (scopeType:
// 'namespace' em discovery.js) escopa a query por kube_namespace:X, nunca por
// service:Y — mesmo cobrindo Y na prática via `by {service}`, esta função não
// reconhece isso e marca Y como lacuna. Mitigar exigiria mapear
// serviço->namespace (custo de N chamadas extras, mesmo problema de custo já
// documentado em NAMESPACE_PROBE_OPERATIONS, discovery.js) — mantido como
// limitação documentada, mesma filosofia conservadora de analyzeHostCoverage:
// pode marcar lacuna a mais, nunca a menos.
export function analyzeServiceCoverage(monitors, serviceNames) {
  const queries = (monitors || []).map(m => String(m?.query || ''))
  const broad = {}
  const specific = {}
  for (const c of APM_CATALOG) {
    broad[c.key] = queries.some(q => { try { return c.detect(q) && q.includes('{*}') } catch { return false } })
    const set = new Set()
    for (const q of queries) {
      try {
        if (!c.detect(q)) continue
        for (const svc of (serviceNames || [])) if (q.includes(`service:${svc}`)) set.add(svc)
      } catch { /* query estranha: ignora */ }
    }
    specific[c.key] = set
  }
  return (serviceNames || []).map(service => {
    const metrics = {}
    let gapCount = 0
    for (const c of APM_CATALOG) {
      const covered = broad[c.key] || specific[c.key].has(service)
      metrics[c.key] = covered
      if (!covered) gapCount++
    }
    return { service, metrics, gapCount }
  })
}

// % de entidades cobertas para 1 item do catálogo, a partir da matriz
// por-entidade (hostCoverage p/ Infra, serviceCoverage p/ APM — mesmo shape
// {metrics:{<key>:bool}}). Fonte única pros cards (refino: % real em vez de
// "existe ≥1 monitor no ambiente = 100%") e pra qualquer outro uso futuro.
export function coveragePercent(entityRows, key) {
  const rows = entityRows || []
  const totalCount = rows.length
  if (totalCount === 0) return { coveredCount: 0, totalCount: 0, percent: null }
  const coveredCount = rows.filter(r => r.metrics[key]).length
  return { coveredCount, totalCount, percent: Math.round((coveredCount / totalCount) * 100) }
}

// Faixa de cor a partir do %, faixas de negócio (não CSS — page.js mapeia
// band -> var(--css)): <=40 vermelho, 40-75 amarelo, >=75 verde.
export function percentBand(percent) {
  if (percent == null) return null
  if (percent <= 40) return 'red'
  if (percent < 75) return 'yellow'
  return 'green'
}

// Monta a lista de monitores de Infra sugeridos pras lacunas, host por host —
// só as métricas REALMENTE faltantes daquele host entram (hosts 100%
// cobertos não geram nenhum item). Reaproveita planInfraPreview (já com
// queryWindow/evaluationDelay corretos) — só orquestra por host.
export function buildSuggestedInfra(hostCoverage) {
  const base = initialInfraDiscovery()
  let plan = []
  let hostCount = 0
  for (const hc of (hostCoverage || [])) {
    const gapKinds = INFRA_CATALOG.filter(c => c.infraKind && !hc.metrics[c.key]).map(c => c.infraKind)
    if (!gapKinds.length) continue
    hostCount++
    const d = {
      ...base,
      selected: { [hc.host]: true },
      metrics: Object.fromEntries(Object.entries(base.metrics).map(([k, v]) => [k, { ...v, enabled: gapKinds.includes(k) }])),
    }
    plan = plan.concat(planInfraPreview(d))
  }
  return { plan, hostCount, monitorCount: plan.length }
}

// Monta a lista de monitores de APM sugeridos pras lacunas, serviço por
// serviço — só os tipos REALMENTE faltantes daquele serviço entram. Não passa
// por planPreview()/initialDiscovery() (que assumem os MESMOS tipos
// habilitados pra todos os serviços selecionados num único objeto — não dá
// pra expressar "serviço A só falta errorRate, serviço B falta 2 tipos"
// nisso); chama buildMonitorPayload diretamente por (serviço × tipo-em-gap).
// Usa DEFAULT_OPERATION (sem descoberta real de operations — custaria 1
// chamada extra por serviço em gap) — ver operationNote pra avisar na UI.
export function buildSuggestedApm(serviceCoverage) {
  const plan = []
  let serviceCount = 0
  for (const sc of (serviceCoverage || [])) {
    const gapTypes = APM_CATALOG.filter(c => c.apm && !sc.metrics[c.key]).map(c => c.apm)
    if (!gapTypes.length) continue
    serviceCount++
    for (const kind of gapTypes) {
      // buildMonitorPayload não tem defaults por TIPO (isso normalmente vem de
      // planPreview, via cfg.algorithm || a.algorithm etc.) — como aqui não
      // passamos por planPreview, os defaults de ALERT_BY_KEY[kind] precisam
      // ser passados explicitamente, senão cai nos defaults genéricos de
      // buildAnomalyQuery (agile/daily/last_4h), errados pro tipo.
      const a = ALERT_BY_KEY[kind]
      const payload = buildMonitorPayload({
        kind, service: sc.service, operation: DEFAULT_OPERATION, groupBy: DEFAULT_GROUP_BY,
        deviations: a.def, direction: a.direction, algorithm: a.algorithm,
        seasonality: a.seasonality, alertWindow: a.alertWindow, queryWindow: a.queryWindow,
        priority: 3, // mesmo default P3 usado em initialDiscovery()
      })
      plan.push({ kind, service: sc.service, operation: DEFAULT_OPERATION, name: payload.name, query: payload.query, message: payload.message, priority: 3, payload })
    }
  }
  return {
    plan,
    serviceCount,
    monitorCount: plan.length,
    operationNote: `Operation usada: ${DEFAULT_OPERATION} (padrão) — para escolher outra, use o MonitorsCreator.`,
  }
}
