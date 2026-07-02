// src/lib/datadog-server.js
//
// Helpers server-side para coletar dados do Datadog (usados por
// scope-maturity e monitors-analytics). Tudo defensivo: em falha,
// retorna null e a dimensão vira "N/D" em vez de quebrar.

export function ctxFrom({ apiKey, appKey, site }) {
  return { apiKey, appKey, site }
}

export async function ddGet(ctx, path) {
  try {
    const r = await fetch(`https://api.${ctx.site}${path}`, {
      headers: { 'DD-API-KEY': ctx.apiKey, 'DD-APPLICATION-KEY': ctx.appKey, Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!r.ok) return { ok: false, status: r.status }
    return { ok: true, json: await r.json() }
  } catch (e) { return { ok: false, error: e.message } }
}

export async function ddPost(ctx, path, body) {
  try {
    const r = await fetch(`https://api.${ctx.site}${path}`, {
      method: 'POST',
      headers: {
        'DD-API-KEY': ctx.apiKey, 'DD-APPLICATION-KEY': ctx.appKey,
        'Content-Type': 'application/json', Accept: 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    if (!r.ok) return { ok: false, status: r.status }
    return { ok: true, json: await r.json() }
  } catch (e) { return { ok: false, error: e.message } }
}

// ── Logs Analytics: contagem total para uma query (janela em ms) ──
// POST /api/v2/logs/analytics/aggregate  -> data.buckets[0].computes.c0
export async function logsCount(ctx, query, fromMs, toMs) {
  const body = {
    compute: [{ type: 'total', aggregation: 'count' }],
    filter: { from: String(fromMs), to: String(toMs), query: query || '*' },
  }
  const r = await ddPost(ctx, '/api/v2/logs/analytics/aggregate', body)
  if (!r.ok) return null
  const buckets = r.json?.data?.buckets
  if (!Array.isArray(buckets)) return null
  if (buckets.length === 0) return 0
  const c0 = buckets[0]?.computes?.c0
  return typeof c0 === 'number' ? c0 : 0
}

// ── SLO: % de SLOs cumprindo o target (via history) ──
// Limita a N SLOs para não estourar chamadas.
export async function sloBudget(ctx, maxSlos = 15) {
  const list = await ddGet(ctx, '/api/v1/slo?limit=1000')
  if (!list.ok) return { measured: false, detail: 'Sem acesso à API de SLO.' }
  const slos = Array.isArray(list.json?.data) ? list.json.data : []
  if (slos.length === 0) return { measured: true, pct: 0, evaluated: 0, detail: 'Nenhum SLO configurado.' }

  const now = Math.floor(Date.now() / 1000)
  const from = now - 30 * 24 * 3600
  const subset = slos.slice(0, maxSlos)
  let ok = 0, evaluated = 0
  for (const slo of subset) {
    const target = slo?.thresholds?.[0]?.target
    const h = await ddGet(ctx, `/api/v1/slo/${slo.id}/history?from_ts=${from}&to_ts=${now}`)
    if (!h.ok) continue
    const sli = h.json?.data?.overall?.sli_value
    if (typeof sli !== 'number' || typeof target !== 'number') continue
    evaluated++
    if (sli >= target) ok++
  }
  if (evaluated === 0) return { measured: false, detail: 'Não foi possível avaliar o histórico de SLO.' }
  return {
    measured: true,
    pct: Math.round((ok / evaluated) * 100),
    evaluated,
    detail: `${ok} de ${evaluated} SLO(s) avaliados cumprindo o target (30d)${slos.length > subset.length ? ` — amostra de ${subset.length}/${slos.length}` : ''}.`,
  }
}

// ── Eventos de alerta (últimos N dias): pareia disparo→recuperação por
//    monitor (aggregation_key) e mede flapping = auto-recuperação rápida.
//    GET /api/v1/events?start&end&sources=alert&unaggregated=true
export async function alertEvents(ctx, days = 7) {
  const now = Math.floor(Date.now() / 1000)
  const start = now - days * 24 * 3600
  const r = await ddGet(ctx, `/api/v1/events?start=${start}&end=${now}&sources=alert&unaggregated=true`)
  if (!r.ok) return { measured: false }
  const events = Array.isArray(r.json?.events) ? r.json.events : []
  const triggers = events.filter(e => e.alert_type === 'error' || e.alert_type === 'warning').length
  const recoveries = events.filter(e => e.alert_type === 'success' || e.alert_type === 'recovery').length

  // Pareia por aggregation_key para estimar flapping (recuperou em < 10min).
  const FLAP_SECONDS = 600
  const byKey = {}
  for (const e of events) {
    const k = e.aggregation_key || e.monitor_id || e.id
    ;(byKey[k] = byKey[k] || []).push(e)
  }
  let cycles = 0, flapping = 0
  for (const list of Object.values(byKey)) {
    list.sort((a, b) => (a.date_happened || 0) - (b.date_happened || 0))
    let triggerTs = null
    for (const e of list) {
      const t = e.alert_type
      if ((t === 'error' || t === 'warning') && triggerTs == null) {
        triggerTs = e.date_happened
      } else if ((t === 'success' || t === 'recovery') && triggerTs != null) {
        cycles++
        if ((e.date_happened - triggerTs) <= FLAP_SECONDS) flapping++
        triggerTs = null
      }
    }
  }
  const flappingRate = cycles > 0 ? Math.round((flapping / cycles) * 100) : null
  return { measured: true, total: events.length, triggers, recoveries, cycles, flapping, flappingRate }
}

// ── Incidentes (Incident Management) ──
export async function incidents(ctx) {
  const r = await ddGet(ctx, '/api/v2/incidents?page[size]=100')
  if (!r.ok) return { measured: false, status: r.status }
  const data = Array.isArray(r.json?.data) ? r.json.data : []
  return { measured: true, data }
}
