// src/app/api/datadog/monitors-analytics/route.js
//
// Analisa a maturidade dos monitores e calcula um score 0-100 ponderado.
// KPIs (peso): Falsos Positivos (0.35) · Ação por Alerta (0.20) ·
//   Cobertura de Ativos Críticos (0.20) · Padronização de Tags (0.15) ·
//   Tempo de Resolução por Severidade (0.10).
// O que não dá pra medir com confiança fica "N/D" e sai do cálculo do score.

import { auth } from '@/auth'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom, ddGet, alertEvents, incidents } from '@/lib/datadog-server'

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

  const [monitorsR, apmR, evR, incR] = await Promise.all([
    ddGet(ctx, '/api/v1/monitor?page_size=1000'),
    ddGet(ctx, '/api/v2/apm/services?filter[env]=*'),
    alertEvents(ctx, 7),
    incidents(ctx),
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

  // 3. Tempo de Resolução por Severidade (peso 0.10)
  {
    let done = false
    if (incR.measured && Array.isArray(incR.data) && incR.data.length) {
      const groups = {}
      for (const inc of incR.data) {
        const a = inc?.attributes || {}
        const sev = a?.fields?.severity?.value || a?.severity || null
        const created = a?.created ? Date.parse(a.created) : null
        const resolved = a?.resolved ? Date.parse(a.resolved) : null
        if (!sev || !created || !resolved || resolved < created) continue
        const hrs = (resolved - created) / 3600000
        ;(groups[sev] = groups[sev] || []).push(hrs)
      }
      const sevKeys = Object.keys(groups)
      if (sevKeys.length >= 1) {
        const avg = (arr) => arr.reduce((x, y) => x + y, 0) / arr.length
        const crit = [...(groups['SEV-1'] || []), ...(groups['SEV-2'] || [])]
        const low = [...(groups['SEV-3'] || []), ...(groups['SEV-4'] || []), ...(groups['SEV-5'] || [])]
        let goodness, detail
        if (crit.length && low.length) {
          const ac = avg(crit), al = avg(low)
          // proporcional: crítico deve ser mais rápido. score alto se ac<<al.
          goodness = ac <= al ? 100 : clamp((al / ac) * 100)
          detail = `Crítico (SEV-1/2) ~${ac.toFixed(1)}h vs baixo (SEV-3+) ~${al.toFixed(1)}h.`
        } else {
          // só um grupo: reporta o MTTR médio, sem score de proporção
          const all = avg(Object.values(groups).flat())
          goodness = null
          detail = `MTTR médio ~${all.toFixed(1)}h (severidades insuficientes p/ proporção).`
        }
        add({ key: 'mttrSeverity', label: 'Tempo de Resolução por Severidade', measured: goodness != null, value: goodness, goodness, weight: 0.10, higherIsBetter: true, detail })
        done = true
      }
    }
    if (!done) add({ key: 'mttrSeverity', label: 'Tempo de Resolução por Severidade', measured: false, value: null, weight: 0.10, higherIsBetter: true, detail: 'Requer Incidents com severidade e horário de resolução.' })
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

  // 5. Taxa de Ação por Alerta (peso 0.20) — incidentes (7d) / disparos (7d)
  {
    if (evR.measured && evR.triggers > 0 && incR.measured) {
      const cutoff = Date.now() - 7 * 24 * 3600 * 1000
      const inc7d = (incR.data || []).filter(i => {
        const c = i?.attributes?.created ? Date.parse(i.attributes.created) : null
        return c != null && c >= cutoff
      }).length
      const rate = clamp((inc7d / evR.triggers) * 100)
      add({ key: 'actionRate', label: 'Taxa de Ação por Alerta', measured: true, value: rate, goodness: rate, weight: 0.20, higherIsBetter: true,
        detail: `${inc7d} incidentes para ${evR.triggers} disparos (7d). Baixo = ruído/monitoramento imaturo.` })
    } else {
      add({ key: 'actionRate', label: 'Taxa de Ação por Alerta', measured: false, value: null, weight: 0.20, higherIsBetter: true, detail: 'Requer Events API e Incident Management.' })
    }
  }

  // Score ponderado (renormaliza pesos sobre o que foi medido)
  const measured = dims.filter(d => d.measured && typeof d.goodness === 'number')
  const wsum = measured.reduce((a, d) => a + d.weight, 0)
  const score = wsum > 0 ? clamp(measured.reduce((a, d) => a + d.goodness * d.weight, 0) / wsum) : null

  return Response.json({
    site,
    generatedAt: new Date().toISOString(),
    monitorsCount: total,
    score,
    measuredCount: measured.length,
    totalDimensions: dims.length,
    dimensions: dims,
  })
}
