// src/app/api/datadog/audit-monitors/route.js
//
// AuditMonitors: analisa o ambiente (hosts + serviços APM + monitores) e
// devolve a cobertura de monitoramento por métrica-chave, além de uma sugestão
// pronta de monitores de Infra para as lacunas.

import { auth } from '@/auth'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom, ddGet, listMonitors, listHosts } from '@/lib/datadog-server'
import { analyzeCoverage, coverageScore, buildSuggestedInfra, analyzeHostCoverage, INFRA_CATALOG } from '@/lib/audit'
import { cacheKey, cacheGet, cacheSet } from '@/lib/route-cache'
import { recordScore, computeDelta } from '@/lib/score-history'

const CACHE_TTL_MS = 60 * 1000

export async function GET() {
  const session = await auth()
  if (!session?.user) return Response.json({ error: 'Não autenticado.' }, { status: 401 })

  const { apiKey, appKey, site } = await readSessionKeys()
  if (!apiKey || !appKey || !site) {
    return Response.json({ error: 'Sessão sem credenciais do Datadog. Conecte-se primeiro.' }, { status: 412 })
  }

  const ctx = ctxFrom({ apiKey, appKey, site })
  const key = cacheKey(['audit-monitors', site, apiKey, appKey])
  const cached = await cacheGet(key)
  if (cached) return Response.json({ ...cached, cached: true })

  const [monitorsR, hostsR, apmR] = await Promise.all([
    listMonitors(ctx),
    listHosts(ctx),
    ddGet(ctx, '/api/v2/apm/services?filter[env]=*'),
  ])

  if (!monitorsR.ok) {
    return Response.json({ error: `Falha ao listar monitores (${monitorsR.status || monitorsR.error}).` }, { status: monitorsR.status === 403 ? 403 : 502 })
  }

  const monitors = Array.isArray(monitorsR.json) ? monitorsR.json : []
  const hosts = (hostsR.ok ? hostsR.json : []).map(h => h.host_name || h.name).filter(Boolean)
  const apmServices = (() => {
    const data = apmR.json?.data
    if (Array.isArray(data)) return data.map(d => d?.attributes?.services || d?.id).flat().filter(Boolean)
    if (data?.attributes?.services) return data.attributes.services
    return []
  })()
  const serviceCount = new Set(apmServices).size

  const coverage = analyzeCoverage(monitors)
  const score = coverageScore(coverage)
  const suggestedInfra = buildSuggestedInfra(coverage, hosts)
  const hostCoverage = analyzeHostCoverage(monitors, hosts)

  const gaps = coverage.filter(c => !c.covered)
  const apmGaps = gaps.filter(c => c.group === 'APM').map(c => c.label)

  // Histórico da % de cobertura (sparkline + delta) — só em compute fresco.
  const histId = cacheKey(['audit-hist', site, apiKey, appKey])
  const hist = await recordScore('audit-monitors', histId, score)

  const payload = {
    site,
    score, // % de cobertura (0-100)
    environment: { hostCount: hosts.length, serviceCount, monitorCount: monitors.length, hostsPartial: !!hostsR.partial },
    coverage,
    hostCoverage,
    infraMetrics: INFRA_CATALOG.map(c => ({ key: c.key, label: c.label })),
    gapCount: gaps.length,
    suggestedInfra: { gapKinds: suggestedInfra.gapKinds, hostCount: suggestedInfra.hostCount, monitorCount: suggestedInfra.monitorCount, infra: suggestedInfra.infra },
    apmGaps,
    history: hist.map(h => h.score),
    delta: computeDelta(hist),
    generatedAt: new Date().toISOString(),
  }
  await cacheSet(key, payload, CACHE_TTL_MS)
  return Response.json(payload)
}
