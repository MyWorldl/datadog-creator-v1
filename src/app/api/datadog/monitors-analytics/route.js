// src/app/api/datadog/monitors-analytics/route.js
//
// Analisa a maturidade dos monitores e calcula um score 0-100 ponderado.
// KPIs (peso): Falsos Positivos (0.35) · Cobertura de Ativos Críticos (0.20) ·
//   Alertas Auto-Resolvidos (0.20) · Padronização de Tags (0.15) ·
//   Densidade de Alertas por Monitor (0.10).
// O que não dá pra medir com confiança fica "N/D" e sai do cálculo do score.

import { auth } from '@/auth'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom, ddGet, listMonitors, alertEvents } from '@/lib/datadog-server'
import { cacheKey, cacheGet, cacheSet } from '@/lib/route-cache'

const CACHE_TTL_MS = 60 * 1000 // 1 min: alivia refresh repetido / uso simultâneo

// Densidade "cheia de ruído": nº de disparos por monitor (7d) a partir do qual
// o score de densidade zera. Heurística ajustável — a ideia é expor "vizinhos
// barulhentos" (poucos monitores mal configurados geram a maior parte do spam).
const NOISY_DENSITY = 10

const REQUIRED_TAGS = ['env', 'service', 'team']
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)))

function metricsFromQuery(q) {
  if (!q) return []
  const out = []
  const re = /\b(?:avg|sum|min|max|count|p\d{2,3}):([a-zA-Z_][a-zA-Z0-9_.]+)/g
  let m
  while ((m = re.exec(q)) !== null) out.push(m[1])
  return out
}
function servicesFromQuery(q) {
  if (!q) return []
  const out = []
  const re = /service:([a-zA-Z0-9_.\-]+)/g
  let m
  while ((m = re.exec(q)) !== null) out.push(m[1])
  return out
}
function hasTagKey(tags, key) { return (tags || []).some(t => t.startsWith(key + ':')) }

export async function GET() {
  const session = await auth()
  if (!session?.user) return Response.json({ error: 'Não autenticado.' }, { status: 401 })

  const { apiKey, appKey, site } = await readSessionKeys()
  if (!apiKey || !appKey || !site) {
    return Response.json({ error: 'Sessão sem credenciais do Datadog. Conecte-se primeiro.' }, { status: 412 })
  }
  const ctx = ctxFrom({ apiKey, appKey, site })

  const key = cacheKey(['monitors-analytics', site, apiKey, appKey])
  const cached = await cacheGet(key)
  if (cached) return Response.json({ ...cached, cached: true })

  const [monitorsR, apmR, evR] = await Promise.all([
    listMonitors(ctx),
    ddGet(ctx, '/api/v2/apm/services?filter[env]=*'),
    alertEvents(ctx, 7),
  ])

  if (!monitorsR.ok) {
    return Response.json({ error: `Não foi possível listar monitores (${monitorsR.status || monitorsR.error}). Verifique permissões da App key.` }, { status: 502 })
  }
  const monitors = Array.isArray(monitorsR.json) ? monitorsR.json : []
  const total = monitors.length

  // APM services
  const apmServices = (() => {
    const data = apmR.ok ? apmR.json?.data : null
    if (Array.isArray(data)) return data.map(d => d?.attributes?.services || d?.id).flat().filter(Boolean)
    if (data?.attributes?.services) return data.attributes.services
    return []
  })()
  const serviceSet = new Set(apmServices)

  const dims = []
  const add = (o) => dims.push(o)

  // 1. Padronização de Tags (peso 0.15) — cobertura média de env/service/team
  {
    const per = REQUIRED_TAGS.map(k => total ? monitors.filter(m => hasTagKey(m.tags, k)).length / total * 100 : 0)
    const avg = per.reduce((a, b) => a + b, 0) / per.length
    add({ key: 'tagStandardization', label: 'Padronização de Tags', measured: total > 0, value: clamp(avg), goodness: clamp(avg), weight: 0.15, higherIsBetter: true,
      detail: total ? `Cobertura média de ${REQUIRED_TAGS.join(', ')} em ${total} monitores.` : 'Sem monitores.' })
  }

  // 2. Cobertura de Ativos Críticos (peso 0.20) — % de serviços APM com monitor
  {
    if (apmR.ok && serviceSet.size > 0) {
      const monitored = new Set()
      for (const m of monitors) for (const svc of servicesFromQuery(m.query)) if (serviceSet.has(svc)) monitored.add(svc)
      const pct = monitored.size / serviceSet.size * 100
      add({ key: 'criticalCoverage', label: 'Cobertura de Ativos Críticos', measured: true, value: clamp(pct), goodness: clamp(pct), weight: 0.20, higherIsBetter: true,
        detail: `${monitored.size} de ${serviceSet.size} serviços APM referenciados por algum monitor (heurístico).` })
    } else {
      add({ key: 'criticalCoverage', label: 'Cobertura de Ativos Críticos', measured: false, value: null, weight: 0.20, higherIsBetter: true, detail: 'Requer apm_read (serviços) para medir.' })
    }
  }

  // 3. Densidade de Alertas por Monitor (peso 0.10) — disparos / nº de monitores
  //    Expõe "vizinhos barulhentos": poucos monitores mal configurados costumam
  //    concentrar a maior parte do spam. Menor é melhor.
  {
    if (evR.measured && total > 0) {
      const density = evR.triggers / total // disparos por monitor (7d)
      const goodness = clamp(100 * (1 - Math.min(density / NOISY_DENSITY, 1)))
      add({ key: 'alertDensity', label: 'Densidade de Alertas por Monitor', measured: true,
        value: Math.round(density * 10) / 10, display: `${(Math.round(density * 10) / 10).toLocaleString('pt-BR')} disp./mon`,
        goodness, weight: 0.10, higherIsBetter: false,
        detail: `${evR.triggers} disparos em ${total} monitores nos últimos 7 dias (${(Math.round(density * 10) / 10).toLocaleString('pt-BR')} por monitor). Alta densidade sugere poucos monitores gerando muito ruído.` })
    } else {
      add({ key: 'alertDensity', label: 'Densidade de Alertas por Monitor', measured: false, value: null, weight: 0.10, higherIsBetter: false, detail: 'Requer Events API (disparos) e ao menos um monitor.' })
    }
  }

  // 4. Taxa de Falsos Positivos (peso 0.35) — flapping = auto-recuperação rápida
  {
    if (evR.measured && evR.flappingRate != null) {
      const fp = clamp(evR.flappingRate)
      add({ key: 'falsePositives', label: 'Taxa de Falsos Positivos', measured: true, value: fp, goodness: 100 - fp, weight: 0.35, higherIsBetter: false,
        detail: `${evR.flapping} de ${evR.cycles} ciclos de alerta recuperaram em <10min (flapping, 7d). Proxy — menor é melhor.` })
    } else {
      add({ key: 'falsePositives', label: 'Taxa de Falsos Positivos', measured: false, value: null, weight: 0.35, higherIsBetter: false, detail: evR.measured ? 'Sem ciclos de alerta pareáveis no período.' : 'Requer acesso à Events API.' })
    }
  }

  // 5. Taxa de Alertas Auto-Resolvidos (peso 0.20) — disparo→recuperação
  //    "quase instantânea" (<2min). Se resolve sozinho em segundos, o threshold
  //    está sensível demais (falta avg()/janela maior). Menor é melhor.
  {
    if (evR.measured && evR.instantRate != null) {
      const ar = clamp(evR.instantRate)
      add({ key: 'autoResolved', label: 'Taxa de Alertas Auto-Resolvidos', measured: true, value: ar, goodness: 100 - ar, weight: 0.20, higherIsBetter: false,
        detail: `${evR.instant} de ${evR.cycles} ciclos recuperaram em <2min (auto-resolvidos, 7d). Alto = threshold sensível demais; considere avg() ou 'for X minutes'.` })
    } else {
      add({ key: 'autoResolved', label: 'Taxa de Alertas Auto-Resolvidos', measured: false, value: null, weight: 0.20, higherIsBetter: false, detail: evR.measured ? 'Sem ciclos de alerta pareáveis no período.' : 'Requer acesso à Events API.' })
    }
  }

  // Score ponderado (renormaliza pesos sobre o que foi medido)
  const measured = dims.filter(d => d.measured && typeof d.goodness === 'number')
  const wsum = measured.reduce((a, d) => a + d.weight, 0)
  const score = wsum > 0 ? clamp(measured.reduce((a, d) => a + d.goodness * d.weight, 0) / wsum) : null

  const payload = {
    site,
    generatedAt: new Date().toISOString(),
    monitorsCount: total,
    score,
    measuredCount: measured.length,
    totalDimensions: dims.length,
    dimensions: dims,
  }
  await cacheSet(key, payload, CACHE_TTL_MS)
  return Response.json(payload)
}
