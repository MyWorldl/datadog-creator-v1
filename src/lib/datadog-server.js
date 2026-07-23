// src/lib/datadog-server.js
//
// Helpers server-side para coletar dados do Datadog (usados por
// scope-maturity e audit-monitors). Tudo defensivo: em falha,
// retorna null e a dimensão vira "N/D" em vez de quebrar.

export function ctxFrom({ apiKey, appKey, site }) {
  return { apiKey, appKey, site }
}

// Valida um token de usuário antes de interpolá-lo numa query DQL (nome de
// métrica, valor de tag como env/kube_namespace). Não é uma fronteira entre
// tenants — o usuário só afeta o PRÓPRIO ambiente Datadog, ao qual já tem
// acesso total via a própria API key — mas evita que caracteres de sintaxe
// DQL ({}, vírgula, aspas, quebra de linha) quebrem a query montada ou
// produzam um escopo diferente do pretendido. Allowlist generosa o bastante
// pra nomes de métrica (letras/dígitos/ponto/underscore/hífen) e valores de
// tag (mesmo padrão + dois-pontos/barra, comuns em namespace/env).
const SAFE_DQL_TOKEN = /^[a-zA-Z0-9_.:/-]+$/
export function isSafeDqlToken(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && SAFE_DQL_TOKEN.test(value)
}

// Extrai texto + (se possível) JSON do corpo de uma resposta de erro, sem
// lançar. Usado por ddGet/ddPost para dar contexto além do status HTTP.
async function readErrorBody(r) {
  const text = await r.text().catch(() => '')
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* corpo não é JSON */ }
  return { detail: text.slice(0, 300), json }
}

export async function ddGet(ctx, path) {
  try {
    const r = await fetch(`https://api.${ctx.site}${path}`, {
      headers: { 'DD-API-KEY': ctx.apiKey, 'DD-APPLICATION-KEY': ctx.appKey, Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!r.ok) return { ok: false, status: r.status, ...(await readErrorBody(r)) }
    return { ok: true, json: await r.json() }
  } catch (e) { return { ok: false, error: e.message } }
}

// Lista TODOS os monitores paginando. Motivo: em GET /api/v1/monitor, se o
// parâmetro `page` NÃO é informado, a API tenta devolver todos de uma vez —
// o que em orgs grandes pode dar timeout (504). Com `page`, paginamos em
// blocos até vir um bloco menor que o page_size (fim). Cap de segurança em
// maxPages para nunca entrar em loop. Retorna { ok, json:[...] } para manter
// o mesmo formato dos consumidores (monitorsR.json).
// Doc: https://docs.datadoghq.com/api/latest/monitors/#get-all-monitor-details
export async function listMonitors(ctx, pageSize = 1000, maxPages = 50) {
  const all = []
  for (let page = 0; page < maxPages; page++) {
    const r = await ddGet(ctx, `/api/v1/monitor?page=${page}&page_size=${pageSize}`)
    if (!r.ok) {
      // Falhou no meio: se já temos algo, devolve como sucesso parcial.
      if (all.length > 0) return { ok: true, json: all, partial: true }
      return { ok: false, status: r.status, error: r.error }
    }
    const batch = Array.isArray(r.json) ? r.json : []
    all.push(...batch)
    if (batch.length < pageSize) break // último bloco
  }
  return { ok: true, json: all }
}

// Lista TODOS os hosts paginando (start/count), no mesmo espírito de
// listMonitors: GET /api/v1/hosts não pagina automaticamente e orgs grandes
// podem ter milhares de hosts. `filter` aceita a sintaxe de busca de hosts
// do Datadog (ex.: "env:prod", "tag_key:value"). Doc:
// https://docs.datadoghq.com/api/latest/hosts/#get-all-hosts-for-your-organization
export async function listHosts(ctx, filter = '', pageSize = 1000, maxPages = 20) {
  const all = []
  for (let page = 0; page < maxPages; page++) {
    const start = page * pageSize
    const qs = new URLSearchParams({ start: String(start), count: String(pageSize) })
    if (filter) qs.set('filter', filter)
    const r = await ddGet(ctx, `/api/v1/hosts?${qs.toString()}`)
    if (!r.ok) {
      if (all.length > 0) return { ok: true, json: all, partial: true }
      return { ok: false, status: r.status, error: r.error, detail: r.detail }
    }
    const batch = Array.isArray(r.json?.host_list) ? r.json.host_list : []
    all.push(...batch)
    if (batch.length < pageSize) break // último bloco
  }
  return { ok: true, json: all }
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
    if (!r.ok) return { ok: false, status: r.status, ...(await readErrorBody(r)) }
    return { ok: true, json: await r.json() }
  } catch (e) { return { ok: false, error: e.message } }
}

// ── Metrics: último valor de uma query no intervalo (fromMs/toMs em ms) ──
// GET /api/v1/query  -> series[0].pointlist[[ts_ms, value], ...]
// Usada como fallback do Usage Metering (usage/summary) quando a conta não
// é a Parent Org: métricas datadog.estimated_usage.* são lidas normalmente
// via API de métricas, sem a restrição de multi-org do usage/summary.
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

  // Histórico de cada SLO é independente — busca tudo em paralelo em vez
  // de um `for` sequencial com await (que podia levar vários segundos
  // com o subset cheio de 15 SLOs).
  const histories = await Promise.all(
    subset.map(slo => ddGet(ctx, `/api/v1/slo/${slo.id}/history?from_ts=${from}&to_ts=${now}`))
  )

  let ok = 0, evaluated = 0
  subset.forEach((slo, i) => {
    const h = histories[i]
    if (!h.ok) return
    const target = slo?.thresholds?.[0]?.target
    const sli = h.json?.data?.overall?.sli_value
    if (typeof sli !== 'number' || typeof target !== 'number') return
    evaluated++
    if (sli >= target) ok++
  })

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

  // Pareia por aggregation_key para estimar flapping.
  // - flapping: recuperou em < 10min (proxy de falso positivo)
  // - instant:  recuperou em < 2min  (auto-resolvido "quase instantâneo")
  const FLAP_SECONDS = 600
  const INSTANT_SECONDS = 120
  const byKey = {}
  for (const e of events) {
    // Agrupa por ciclo do mesmo monitor. Desde 1º/mar/2025 o aggregation_key
    // dos eventos de monitor é único por Monitor ID + Grupo (bom para parear
    // disparo→recuperação). Fallback para monitor_id/id se vier ausente.
    // Doc: https://docs.datadoghq.com/api/latest/events/
    const k = e.aggregation_key || e.monitor_id || e.id
    ;(byKey[k] = byKey[k] || []).push(e)
  }
  let cycles = 0, flapping = 0, instant = 0
  for (const list of Object.values(byKey)) {
    list.sort((a, b) => (a.date_happened || 0) - (b.date_happened || 0))
    let triggerTs = null
    for (const e of list) {
      const t = e.alert_type
      if ((t === 'error' || t === 'warning') && triggerTs == null) {
        triggerTs = e.date_happened
      } else if ((t === 'success' || t === 'recovery') && triggerTs != null) {
        cycles++
        const dt = e.date_happened - triggerTs
        if (dt <= FLAP_SECONDS) flapping++
        if (dt <= INSTANT_SECONDS) instant++
        triggerTs = null
      }
    }
  }
  const flappingRate = cycles > 0 ? Math.round((flapping / cycles) * 100) : null
  const instantRate = cycles > 0 ? Math.round((instant / cycles) * 100) : null
  return { measured: true, total: events.length, triggers, recoveries, cycles, flapping, flappingRate, instant, instantRate }
}

// ── Metrics Query API: pontos de uma métrica no intervalo ──
// GET /api/v1/query?from=<unix_s>&to=<unix_s>&query=<query>
// Funciona em QUALQUER org (escopo timeseries_query) — base do FinOps quando
// a conta não é parent-org. Doc: https://docs.datadoghq.com/api/latest/metrics/#query-timeseries-points
export async function queryMetric(ctx, query, fromSec, toSec) {
  const r = await ddGet(ctx, `/api/v1/query?from=${fromSec}&to=${toSec}&query=${encodeURIComponent(query)}`)
  if (!r.ok) return { ok: false, status: r.status, error: r.error }
  const series = Array.isArray(r.json?.series) ? r.json.series : []
  const points = []
  for (const s of series) for (const p of (s.pointlist || [])) if (p && p[1] != null) points.push(p[1])
  return { ok: true, points, seriesCount: series.length }
}

// ── Descoberta de operations (spans) por escopo, via Metrics List API ──
// GET /api/v2/metrics?filter[tags]=<scopeTag>&window[seconds]=...
// Lista as métricas submetidas com a tag de escopo (service:<svc> OU
// kube_namespace:<ns>) e extrai o nome da operation dos nomes "trace.<op>.hits".
// Requer escopo metrics_read na Application key.
//   https://docs.datadoghq.com/api/latest/metrics/get-a-list-of-metrics/
//
// Por que Metrics e não a Spans Analytics Aggregate API: a Aggregate API
// opera sobre uma AMOSTRA dos spans (traffic_type: "sampled"), então
// group_by kube_namespace/operation_name volta VAZIO de forma imprevisível
// (confirmado em smoke-test contra o Datadog real — retornava 0 operations
// para namespaces que claramente tinham tráfego). As métricas de trace são
// pré-agregadas e NÃO amostradas — enumeram operations de forma confiável,
// idêntica ao que a UI do Trace Explorer mostra. É a MESMA estratégia já
// usada (e comprovada) para descobrir operations por serviço.
export async function traceOperations(ctx, scopeTag, windowSeconds = 86400) {
  const r = await ddGet(ctx, `/api/v2/metrics?filter[tags]=${encodeURIComponent(scopeTag)}&window[seconds]=${windowSeconds}`)
  if (!r.ok) return { ok: false, status: r.status, error: r.error, detail: r.detail }
  const names = Array.isArray(r.json?.data) ? r.json.data.map(d => d?.id).filter(Boolean) : []
  const ops = new Set()
  for (const name of names) {
    const m = /^trace\.(.+)\.hits$/.exec(name)
    if (m) ops.add(m[1])
  }
  return { ok: true, operations: [...ops].sort() }
}

// ── Enumera valores distintos de uma tag via Metrics Query API ──
// GET /api/v1/query com "<metric>{scope} by {tagKey}" — cada série volta com
// o valor da tag no `scope`/`tag_set`, então dá pra enumerar os valores
// distintos (ex.: todos os kube_namespace com tráfego APM). Diferente da
// Spans Aggregate API, a Metrics Query API NÃO é amostrada — enumera de forma
// confiável. Descarta "N/A" (spans sem a tag). Escopo timeseries_query.
export async function metricTagValues(ctx, query, tagKey, fromSec, toSec) {
  const r = await ddGet(ctx, `/api/v1/query?from=${fromSec}&to=${toSec}&query=${encodeURIComponent(query)}`)
  if (!r.ok) return { ok: false, status: r.status, error: r.error, detail: r.detail }
  const series = Array.isArray(r.json?.series) ? r.json.series : []
  const values = new Set()
  for (const s of series) {
    for (const t of (s.tag_set || [])) {
      if (t.startsWith(tagKey + ':')) values.add(t.slice(tagKey.length + 1))
    }
    // Fallback: alguns retornos trazem só `scope` (ex.: "kube_namespace:x").
    const scope = s.scope || ''
    const m = new RegExp(`(?:^|,)${tagKey}:([^,]+)`).exec(scope)
    if (m) values.add(m[1])
  }
  values.delete('N/A')
  return { ok: true, values: [...values].filter(Boolean) }
}

// ── Uso estimado de um produto no período (agrega conforme a cobrança) ──
// 'sum' -> soma com .as_count() (logs, RUM, synthetics)
// 'max' -> pico via .rollup(max,3600)  (hosts de infra/APM, DBM, profiler…)
// 'avg' -> média                        (custom metrics, fargate…)
// Percentil (0-100) de um array já ordenado em ordem crescente.
function pctile(sortedAsc, p) {
  if (!sortedAsc.length) return null
  const i = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1))
  return sortedAsc[i]
}

// Uso estimado de um produto no período, agregando conforme o Datadog FATURA:
//  - 'sum'  -> soma do mês (logs/RUM/synthetics). Query com .as_count() para
//              somar as contagens por intervalo; rollup(sum,1h) torna determinístico.
//  - 'peak' -> high-water mark do p99 (hosts de infra/APM/DBM/profiler/network).
//              rollup(max,1h) por hora e depois p99 (descarta o 1% de picos).
//  - 'avg'  -> média do mês (containers, custom metrics).
// Doc de métricas e tipos: https://docs.datadoghq.com/account_management/billing/usage_metrics/
// Doc de como cada uso é faturado: https://docs.datadoghq.com/account_management/plan_and_usage/cost_details/
export async function estimatedUsage(ctx, product, fromSec, toSec) {
  const m = product?.estMetric
  if (!m) return { ok: false, unavailable: true }
  const agg = product.estAgg || 'avg'
  const query =
    agg === 'sum' ? `sum:${m}{*}.as_count().rollup(sum, 3600)`
      : agg === 'peak' ? `max:${m}{*}.rollup(max, 3600)`
        : `avg:${m}{*}.rollup(avg, 3600)`
  const r = await queryMetric(ctx, query, fromSec, toSec)
  if (!r.ok) return { ok: false, status: r.status, query }
  const pts = r.points
  if (pts.length === 0) return { ok: true, value: null, empty: true, query, points: 0 }
  let value
  if (agg === 'sum') value = pts.reduce((a, b) => a + b, 0)
  else if (agg === 'peak') value = pctile([...pts].sort((a, b) => a - b), 99)
  else value = pts.reduce((a, b) => a + b, 0) / pts.length
  return { ok: true, value, query, points: pts.length }
}
