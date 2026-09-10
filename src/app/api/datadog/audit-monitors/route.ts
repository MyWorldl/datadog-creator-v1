// src/app/api/datadog/audit-monitors/route.ts
//
// AuditMonitors: analisa o ambiente (hosts + serviços APM + monitores) e
// devolve a cobertura de monitoramento por métrica-chave, além de uma sugestão
// pronta de monitores de Infra para as lacunas.

import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom, ddGet, listMonitors, listHosts, listServiceDefinitions, type ServiceDefinitionMeta } from '@/lib/datadog-server'
import {
  analyzeCoverage, coverageScoreWeighted, buildSuggestedInfra, buildSuggestedApm,
  analyzeHostCoverage, analyzeServiceCoverage, INFRA_CATALOG, APM_CATALOG,
  type DatadogMonitor,
} from '@/lib/audit'
import { cacheKey, cacheGet, cacheSet } from '@/lib/route-cache'
import { recordScore, computeDelta } from '@/lib/score-history'
import { isFeatureEnabled } from '@/lib/feature-flags'

interface ApmServicesResponse {
  data?: { id?: string; attributes?: { services?: string[] } }[] | { attributes?: { services?: string[] } }
}

interface HostRaw {
  host_name?: string
  name?: string
}

const CACHE_TTL_MS = 60 * 1000

export async function GET(): Promise<Response> {
  const user = await getServerUser()
  if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 })

  const { apiKey, appKey, site } = await readSessionKeys()
  if (!apiKey || !appKey || !site) {
    return Response.json({ error: 'Sessão sem credenciais do Datadog. Conecte-se primeiro.' }, { status: 412 })
  }

  const ctx = ctxFrom({ apiKey, appKey, site })
  const key = cacheKey(['audit-monitors', site, apiKey, appKey])
  const cached = await cacheGet(key)
  if (cached) return Response.json({ ...cached, cached: true })

  const [monitorsR, hostsR, apmR, defsR] = await Promise.all([
    listMonitors(ctx),
    listHosts(ctx),
    ddGet<ApmServicesResponse>(ctx, '/api/v2/apm/services?filter[env]=*'),
    // Service Definitions (Software Catalog) — enriquece a sugestão de APM com
    // team/dono e conta quantos serviços do catálogo estão sem APM. Opcional:
    // se a App key não tiver escopo pra isso, degrada sem quebrar a auditoria.
    listServiceDefinitions(ctx),
  ])

  if (!monitorsR.ok) {
    return Response.json({ error: `Falha ao listar monitores (${monitorsR.status || monitorsR.error}).` }, { status: monitorsR.status === 403 ? 403 : 502 })
  }

  const monitors = (Array.isArray(monitorsR.json) ? monitorsR.json : []) as DatadogMonitor[]
  const hosts = ((hostsR.ok ? hostsR.json : []) as HostRaw[]).map(h => h.host_name || h.name).filter(Boolean) as string[]
  const apmServices = (() => {
    const data = apmR.json?.data
    if (Array.isArray(data)) return data.map(d => d?.attributes?.services || d?.id).flat().filter(Boolean) as string[]
    if (data?.attributes?.services) return data.attributes.services
    return [] as string[]
  })()
  const services = [...new Set(apmServices)].sort()
  const serviceCount = services.length

  // Service Definitions: mapa nome -> metadado (dono/time/contatos/tags).
  // defsR pode falhar (escopo ausente) — nesse caso o mapa fica vazio e tudo
  // abaixo degrada pra "sem enriquecimento", sem afetar o resto da auditoria.
  const defsList: ServiceDefinitionMeta[] = defsR.ok && Array.isArray(defsR.json) ? defsR.json : []
  const defsByName: Record<string, ServiceDefinitionMeta> = {}
  for (const d of defsList) if (d?.name && !defsByName[d.name]) defsByName[d.name] = d
  const apmSet = new Set(services)
  // Serviços que têm cadastro no catálogo mas NÃO estão reportando APM agora.
  const servicesWithoutApm = defsList.map(d => d.name).filter(n => n && !apmSet.has(n))
  // "No catálogo" = união (APM ativo ∪ com Service Definition). NÃO inclui
  // inferred services (esses só vêm pela Software Catalog API v3, não pela de
  // definitions) — por isso pode não bater exatamente com o número da tela
  // "Software Catalog" do Datadog, que soma os inferred também.
  const catalogServiceCount = new Set([...services, ...defsList.map(d => d.name)]).size
  const definitionsAvailable = defsR.ok

  // K8s/DBM (lib/audit.ts: K8S_CATALOG/DBM_CATALOG) ficam atrás da flag
  // k8sDbmCoverage — com ela desligada, filtramos esses itens fora de
  // `coverage` pra não mudar score/gapCount de quem não tem a flag ligada
  // (mesmo comportamento de sempre, byte a byte).
  const k8sDbmOn = isFeatureEnabled('k8sDbmCoverage')
  const coverage = analyzeCoverage(monitors).filter(c => k8sDbmOn || (c.group !== 'K8s' && c.group !== 'DBM'))
  const envCoverage = coverage.filter(c => c.group === 'K8s' || c.group === 'DBM')
  const hostCoverage = analyzeHostCoverage(monitors, hosts)
  const serviceCoverage = analyzeServiceCoverage(monitors, services)
  // Score REAL = média dos % efetivos por métrica (mesma fonte dos cards),
  // em vez do binário "existe ≥1 monitor = 100%". K8s/DBM entram como
  // binário (0/100) já que não têm lista de entidades — só quando a flag
  // está ligada (envCoverage vem vazio senão, resultado idêntico a antes).
  const score = coverageScoreWeighted(hostCoverage, serviceCoverage, envCoverage)
  const suggestedInfra = buildSuggestedInfra(hostCoverage)
  const suggestedApm = buildSuggestedApm(serviceCoverage, defsByName)

  const gaps = coverage.filter(c => !c.covered)

  // Histórico da % de cobertura (sparkline + delta) — só em compute fresco.
  const histId = cacheKey(['audit-hist', site, apiKey, appKey])
  const hist = await recordScore('audit-monitors', histId, score)

  const payload = {
    site,
    score, // % de cobertura (0-100)
    environment: {
      hostCount: hosts.length,
      serviceCount, // serviços com APM ativo na janela recente (fonte: /apm/services)
      monitorCount: monitors.length,
      hostsPartial: !!hostsR.partial,
      // Software Catalog (via Service Definitions): união APM ∪ com definição.
      // definitionsAvailable=false quando a App key não tem escopo pra ler
      // definitions — aí a UI não mostra esses números.
      definitionsAvailable,
      catalogServiceCount,
      definedServiceCount: defsList.length,
      servicesWithoutApmCount: servicesWithoutApm.length,
    },
    coverage,
    hostCoverage,
    serviceCoverage,
    infraMetrics: INFRA_CATALOG.map(c => ({ key: c.key, label: c.label })),
    apmMetrics: APM_CATALOG.map(c => ({ key: c.key, label: c.label })),
    gapCount: gaps.length,
    suggestedInfra: { plan: suggestedInfra.plan, hostCount: suggestedInfra.hostCount, monitorCount: suggestedInfra.monitorCount },
    suggestedApm: { plan: suggestedApm.plan, serviceCount: suggestedApm.serviceCount, monitorCount: suggestedApm.monitorCount, enrichedServiceCount: suggestedApm.enrichedServiceCount, operationNote: suggestedApm.operationNote },
    history: hist.map(h => h.score),
    delta: computeDelta(hist),
    generatedAt: new Date().toISOString(),
  }
  await cacheSet(key, payload, CACHE_TTL_MS)
  return Response.json(payload)
}
