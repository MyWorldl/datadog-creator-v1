// src/app/api/datadog/finops/route.js
//
// Volume de consumo por produto (licenciamento). Tenta primeiro a Usage
// Metering API:
//   GET /api/v1/usage/summary?start_month=YYYY-MM&end_month=YYYY-MM
// https://docs.datadoghq.com/api/latest/usage-metering/
//
// Esse endpoint exige o escopo usage_read na App key e, em contas
// multi-org (Sub-Org), normalmente só responde para a Parent Org — em
// Sub-Org ele costuma retornar 403 ou objeto vazio mesmo com a interface
// web mostrando consumo normalmente (a UI usa APIs internas de sessão,
// não a API pública).
//
// Fallback: quando usage/summary falha, consultamos as métricas de uso
// estimado (datadog.estimated_usage.*) via Metrics API padrão
// (/api/v1/query), que não tem essa restrição de parent-org. O resultado
// é uma aproximação (consumo acumulado do mês até agora), sinalizada em
// `source`/`warning` na resposta.
//
// O custo é calculado no cliente (preços editáveis), pois preço de
// lista ≠ preço contratado.

import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom, ddGet, estimatedUsage } from '@/lib/datadog-server'
import { PRODUCTS } from '@/lib/finops-pricing'
import { cacheKey, cacheGet, cacheSet } from '@/lib/route-cache'

const CACHE_TTL_MS = 2 * 60 * 1000 // 2 min

function monthStr(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// Limites (ms) do mês solicitado, truncados em "agora" se for o mês corrente.
function monthBoundsMs(month) {
  const [y, m] = month.split('-').map(Number)
  const start = Date.UTC(y, m - 1, 1, 0, 0, 0)
  const endOfMonth = Date.UTC(y, m, 1, 0, 0, 0) - 1
  const end = Math.min(endOfMonth, Date.now())
  return { start, end: Math.max(end, start + 60_000) }
}

async function viaUsageSummary(ctx, month) {
  const res = await ddGet(ctx, `/api/v1/usage/summary?start_month=${month}&end_month=${month}`)
  if (!res.ok) return { ok: false, status: res.status, error: res.error }

  const summary = res.json || {}
  const pick = (fields) => {
    for (const f of fields) {
      const v = summary[f]
      if (typeof v === 'number') return { value: v, field: f }
    }
    return null
  }

  const products = []
  const missing = []
  for (const p of PRODUCTS) {
    const found = pick(p.fields)
    if (found) {
      products.push({
        key: p.key, label: p.label, unit: p.unit, price: p.price, per: p.per, bytes: p.bytes,
        estMetric: p.estMetric, value: found.value, field: found.field,
      })
    } else {
      missing.push(p.key)
    }
  }

  return { ok: true, products, missing, startDate: summary.start_date || null, endDate: summary.end_date || null }
}

async function viaEstimatedUsageMetrics(ctx, month) {
  const { start, end } = monthBoundsMs(month)
  const fromSec = Math.floor(start / 1000)
  const toSec = Math.floor(end / 1000)

  // Agrega cada métrica conforme a cobrança (soma/pico/média) — em paralelo.
  const results = await Promise.all(PRODUCTS.map(async (p) => {
    if (!p.estMetric) return { p, ok: false, reason: 'sem métrica estimada' }
    const u = await estimatedUsage(ctx, p, fromSec, toSec)
    return { p, u, ok: u.ok && u.value != null }
  }))

  const products = []
  const missing = []
  const diagnostics = [] // visibilidade do que a Metrics API devolveu por métrica
  for (const { p, u, ok, reason } of results) {
    diagnostics.push({
      key: p.key, label: p.label, metric: p.estMetric, agg: p.estAgg,
      query: u?.query || null, points: u?.points ?? 0,
      value: u?.value ?? null,
      status: ok ? 'ok' : (u?.status ? `http ${u.status}` : (u?.empty ? 'sem pontos' : (reason || 'sem dados'))),
    })
    if (ok) {
      products.push({
        key: p.key, label: p.label, unit: p.unit, price: p.price, per: p.per, bytes: p.bytes,
        estMetric: p.estMetric, estAgg: p.estAgg, value: u.value, field: p.estMetric,
      })
    } else {
      missing.push(p.key)
    }
  }

  return { ok: products.length > 0, products, missing, diagnostics, startDate: new Date(start).toISOString(), endDate: new Date(end).toISOString() }
}

export async function GET(request) {
  const user = await getServerUser()
  if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 })

  const { apiKey, appKey, site } = await readSessionKeys()
  if (!apiKey || !appKey || !site) {
    return Response.json({ error: 'Sessão sem credenciais do Datadog. Conecte-se primeiro.' }, { status: 412 })
  }
  const ctx = ctxFrom({ apiKey, appKey, site })

  // Mês corrente por padrão (aceita ?month=YYYY-MM).
  const url = new URL(request.url)
  const month = url.searchParams.get('month') || monthStr(new Date())

  // Cache curto: usage/summary + fallback de métricas podem somar várias
  // chamadas; evita refazer tudo em refreshes seguidos no mesmo mês.
  const key = cacheKey(['finops', site, apiKey, appKey, month])
  const cached = await cacheGet(key)
  if (cached) return Response.json({ ...cached, cached: true })

  let result = await viaUsageSummary(ctx, month)
  let source = 'usage_summary'
  let warning = null

  // O usage/summary agrega no nível PARENT-org ("for all organizations").
  // Numa Sub-Org, ele costuma voltar quase vazio — às vezes 200 sem nada,
  // às vezes com apenas 1 campo simples (ex.: custom metrics) e SEM os
  // agregados principais (infra/APM/logs). Tratamos como "incompleto" e
  // caímos para as métricas datadog.estimated_usage.* (que funcionam por org)
  // quando: (a) a chamada falhou, (b) veio 0 produto, ou (c) veio produto
  // mas nenhum dos "core" (infra, apm, logs) — sinal de resposta parcial.
  const CORE = ['infra', 'apm', 'logsIngest']
  const summaryHasCore = result.ok && (result.products || []).some(p => CORE.includes(p.key))
  const summaryCount = result.ok ? (result.products || []).length : 0
  const needFallback = !result.ok || summaryCount === 0 || !summaryHasCore

  if (needFallback) {
    const summaryHint = !result.ok
      ? (result.status === 403
        ? 'usage_summary retornou 403 (App key sem escopo usage_read, ou organização não-parent).'
        : `usage_summary falhou (${result.status || result.error}).`)
      : (summaryCount === 0
        ? 'usage_summary respondeu 200 sem nenhum campo de consumo reconhecido.'
        : `usage_summary respondeu, mas com dados incompletos (${summaryCount} produto(s), sem os agregados principais de infra/APM/logs) — típico de Sub-Org, pois o summary agrega no nível da Parent Org.`)

    const fallback = await viaEstimatedUsageMetrics(ctx, month)
    // Usa o fallback se ele trouxer pelo menos tantos produtos quanto o summary
    // (evita "rebaixar" um summary completo por acidente).
    if (fallback.ok && fallback.products.length >= summaryCount) {
      result = fallback
      source = 'estimated_usage_metrics'
      warning = `${summaryHint} Exibindo consumo via métricas datadog.estimated_usage.* (Metrics API), que respondem por org (inclusive Sub-Org). Agregado como o Datadog fatura (hosts=pico p99, custom metrics/containers=média, logs/RUM/synthetics=soma). Estimativa em tempo real, ~10–20% de diferença média vs. o faturável.`
    } else if (!result.ok) {
      return Response.json({
        error: `${summaryHint} O fallback via Metrics API também não retornou dados (métricas estimated_usage ausentes ou App key sem escopo timeseries_query).`,
      }, { status: 502 })
    } else if (summaryCount === 0) {
      warning = `${summaryHint} O fallback via métricas estimated_usage.* também não retornou pontos (org sem uso no período, ou App key sem escopo timeseries_query/metrics_read).`
      source = 'estimated_usage_metrics'
      result = fallback.ok ? fallback : result
    } else {
      // Summary parcial e o fallback não veio melhor: mantém o summary, mas avisa.
      warning = `${summaryHint} Não consegui complementar via métricas estimated_usage.* (verifique o escopo timeseries_query na App key). Exibindo o que o summary retornou.`
      if (fallback.diagnostics) result.diagnostics = fallback.diagnostics
    }
  }

  const payload = {
    site,
    month,
    source,
    warning,
    startDate: result.startDate,
    endDate: result.endDate,
    products: result.products,
    missing: result.missing,
    diagnostics: result.diagnostics || null,
    generatedAt: new Date().toISOString(),
  }
  await cacheSet(key, payload, CACHE_TTL_MS)
  return Response.json(payload)
}
