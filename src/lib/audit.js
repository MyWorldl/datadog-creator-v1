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

import { initialInfraDiscovery, INFRA_BY_KEY } from './infra.js'

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

// Monta um estado de descoberta de infra pronto para POST em
// /api/datadog/infra-monitors: os hosts dados, com APENAS as métricas de infra
// em LACUNA habilitadas. Reaproveita a fonte única de payload de lib/infra.js.
export function buildSuggestedInfra(coverage, hosts) {
  const gapKinds = coverage
    .filter(c => c.group === 'Infra' && !c.covered && c.infraKind && INFRA_BY_KEY[c.infraKind])
    .map(c => c.infraKind)
  const d = initialInfraDiscovery()
  d.selected = Object.fromEntries((hosts || []).map(h => [h, true]))
  for (const k of Object.keys(d.metrics)) d.metrics[k].enabled = gapKinds.includes(k)
  return { infra: d, gapKinds, hostCount: (hosts || []).length, monitorCount: gapKinds.length * (hosts || []).length }
}
