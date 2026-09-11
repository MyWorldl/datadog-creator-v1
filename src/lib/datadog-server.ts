// src/lib/datadog-server.ts
//
// Helpers server-side para coletar dados do Datadog (usados por
// scope-maturity e audit-monitors). Tudo defensivo: em falha,
// retorna null e a dimensão vira "N/D" em vez de quebrar.

import type { Product } from './finops-pricing.ts'

export interface DatadogCtx {
  apiKey: string
  appKey: string
  site: string
}

export function ctxFrom({ apiKey, appKey, site }: DatadogCtx): DatadogCtx {
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
export function isSafeDqlToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && SAFE_DQL_TOKEN.test(value)
}

interface ErrorBody {
  detail: string
  json: unknown
}

// Extrai texto + (se possível) JSON do corpo de uma resposta de erro, sem
// lançar. Usado por ddGet/ddPost para dar contexto além do status HTTP — o
// corpo de erro do Datadog costuma trazer { errors: [...] }, que as rotas
// leem via r.json?.errors (mesmo campo `json` do caso de sucesso, só que
// com outro shape nesse caminho — daí o cast pontual em ddGet/ddPost).
async function readErrorBody(r: Response): Promise<ErrorBody> {
  const text = await r.text().catch(() => '')
  let json: unknown = null
  try { json = text ? JSON.parse(text) : null } catch { /* corpo não é JSON */ }
  return { detail: text.slice(0, 300), json }
}

export interface DdResult<T = unknown> {
  ok: boolean
  status?: number
  json?: T
  detail?: string
  error?: string
  partial?: boolean
}

export async function ddGet<T = unknown>(ctx: DatadogCtx, path: string): Promise<DdResult<T>> {
  try {
    const r = await fetch(`https://api.${ctx.site}${path}`, {
      headers: { 'DD-API-KEY': ctx.apiKey, 'DD-APPLICATION-KEY': ctx.appKey, Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!r.ok) return { ok: false, status: r.status, ...(await readErrorBody(r)) } as DdResult<T>
    return { ok: true, json: await r.json() }
  } catch (e) { return { ok: false, error: (e as Error).message } }
}

// Lista TODOS os monitores paginando. Motivo: em GET /api/v1/monitor, se o
// parâmetro `page` NÃO é informado, a API tenta devolver todos de uma vez —
// o que em orgs grandes pode dar timeout (504). Com `page`, paginamos em
// blocos até vir um bloco menor que o page_size (fim). Cap de segurança em
// maxPages para nunca entrar em loop. Retorna { ok, json:[...] } para manter
// o mesmo formato dos consumidores (monitorsR.json).
// Doc: https://docs.datadoghq.com/api/latest/monitors/#get-all-monitor-details
export async function listMonitors(ctx: DatadogCtx, pageSize = 1000, maxPages = 50): Promise<DdResult<unknown[]>> {
  const all: unknown[] = []
  for (let page = 0; page < maxPages; page++) {
    const r = await ddGet<unknown[]>(ctx, `/api/v1/monitor?page=${page}&page_size=${pageSize}`)
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
export async function listHosts(ctx: DatadogCtx, filter = '', pageSize = 1000, maxPages = 20): Promise<DdResult<unknown[]>> {
  const all: unknown[] = []
  for (let page = 0; page < maxPages; page++) {
    const start = page * pageSize
    const qs = new URLSearchParams({ start: String(start), count: String(pageSize) })
    if (filter) qs.set('filter', filter)
    const r = await ddGet<{ host_list?: unknown[] }>(ctx, `/api/v1/hosts?${qs.toString()}`)
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

// ── Service Definitions (metadados do Software Catalog) ──
// GET /api/v2/services/definitions (paginado por page[size]/page[number]).
// Diferente de /api/v2/apm/services (que só devolve serviços com trace ativo
// numa janela recente), aqui vêm os serviços com metadado CADASTRADO — dono,
// time, contatos, tags — inclusive serviços sem tráfego nenhum agora. Usado
// pra (1) mostrar quantos serviços do catálogo não têm APM e (2) enriquecer
// os monitores sugeridos do AuditMonitors com team/notificação do dono.
// Schema v2.x: campos com hífen (`dd-service`, `schema-version`); v3 usa
// endpoints separados (Software Catalog API) e não vem por aqui.
// Doc: https://docs.datadoghq.com/api/latest/service-definition/
export interface ServiceDefinitionMeta {
  name: string                                       // dd-service
  team?: string
  contacts?: { type?: string; contact?: string }[]
  tags?: string[]                                    // já no formato key:value
}

interface ServiceDefinitionRaw {
  attributes?: {
    schema?: Record<string, unknown> & {
      'dd-service'?: string
      name?: string
      team?: string
      contacts?: unknown
      tags?: unknown
      metadata?: { name?: string; owner?: string }  // shape v3, tolerado por segurança
    }
  }
}

function parseServiceDefinition(raw: ServiceDefinitionRaw): ServiceDefinitionMeta | null {
  const schema = raw?.attributes?.schema
  if (!schema) return null
  const name = (schema['dd-service'] || schema.name || schema.metadata?.name) as string | undefined
  if (!name || typeof name !== 'string') return null
  const team = typeof schema.team === 'string' ? schema.team : (typeof schema.metadata?.owner === 'string' ? schema.metadata.owner : undefined)
  const contacts = Array.isArray(schema.contacts)
    ? (schema.contacts as { type?: string; contact?: string }[]).filter(c => c && typeof c.contact === 'string')
    : undefined
  const tags = Array.isArray(schema.tags)
    ? (schema.tags as unknown[]).filter((t): t is string => typeof t === 'string' && t.includes(':'))
    : undefined
  return { name, team, contacts, tags }
}

export async function listServiceDefinitions(ctx: DatadogCtx, pageSize = 100, maxPages = 50): Promise<DdResult<ServiceDefinitionMeta[]>> {
  const all: ServiceDefinitionMeta[] = []
  for (let page = 0; page < maxPages; page++) {
    const r = await ddGet<{ data?: ServiceDefinitionRaw[] }>(ctx, `/api/v2/services/definitions?page%5Bsize%5D=${pageSize}&page%5Bnumber%5D=${page}`)
    if (!r.ok) {
      if (all.length > 0) return { ok: true, json: all, partial: true }
      return { ok: false, status: r.status, error: r.error, detail: r.detail }
    }
    const batch = Array.isArray(r.json?.data) ? r.json.data : []
    for (const d of batch) {
      const meta = parseServiceDefinition(d)
      if (meta) all.push(meta)
    }
    if (batch.length < pageSize) break // último bloco
  }
  return { ok: true, json: all }
}

export async function ddPost<T = unknown>(ctx: DatadogCtx, path: string, body: unknown): Promise<DdResult<T>> {
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
    if (!r.ok) return { ok: false, status: r.status, ...(await readErrorBody(r)) } as DdResult<T>
    return { ok: true, json: await r.json() }
  } catch (e) { return { ok: false, error: (e as Error).message } }
}

// PUT parcial: a API do Datadog aceita um body só com os campos que devem
// mudar (ex.: { name: "..." }) — os demais campos do monitor (query, tags,
// options etc.) ficam intactos. Usado hoje só pelo rename em lote
// (bulk-rename/route.ts).
export async function ddPut<T = unknown>(ctx: DatadogCtx, path: string, body: unknown): Promise<DdResult<T>> {
  try {
    const r = await fetch(`https://api.${ctx.site}${path}`, {
      method: 'PUT',
      headers: {
        'DD-API-KEY': ctx.apiKey, 'DD-APPLICATION-KEY': ctx.appKey,
        'Content-Type': 'application/json', Accept: 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    if (!r.ok) return { ok: false, status: r.status, ...(await readErrorBody(r)) } as DdResult<T>
    return { ok: true, json: await r.json() }
  } catch (e) { return { ok: false, error: (e as Error).message } }
}

// ── Metrics: último valor de uma query no intervalo (fromMs/toMs em ms) ──
// GET /api/v1/query  -> series[0].pointlist[[ts_ms, value], ...]
// Usada como fallback do Usage Metering (usage/summary) quando a conta não
// é a Parent Org: métricas datadog.estimated_usage.* são lidas normalmente
// via API de métricas, sem a restrição de multi-org do usage/summary.
// ── Logs Analytics: contagem total para uma query (janela em ms) ──
// POST /api/v2/logs/analytics/aggregate  -> data.buckets[0].computes.c0
export async function logsCount(ctx: DatadogCtx, query: string, fromMs: number, toMs: number): Promise<number | null> {
  const body = {
    compute: [{ type: 'total', aggregation: 'count' }],
    filter: { from: String(fromMs), to: String(toMs), query: query || '*' },
  }
  const r = await ddPost<{ data?: { buckets?: { computes?: { c0?: number } }[] } }>(ctx, '/api/v2/logs/analytics/aggregate', body)
  if (!r.ok) return null
  const buckets = r.json?.data?.buckets
  if (!Array.isArray(buckets)) return null
  if (buckets.length === 0) return 0
  const c0 = buckets[0]?.computes?.c0
  return typeof c0 === 'number' ? c0 : 0
}

export interface SloBudgetResult {
  measured: boolean
  pct?: number
  evaluated?: number
  detail?: string
}

export interface SloRaw {
  id: string
  thresholds?: { target?: number }[]
}

// ── SLO: % de SLOs cumprindo o target (via history) ──
// Limita a N SLOs para não estourar chamadas.
//
// Recebe a lista de SLOs já buscada pelo chamador (não faz o GET /slo aqui
// dentro) — scope-maturity/route.ts, único chamador hoje, já busca essa
// mesma lista pra outra dimensão ("Serviços com SLO"); antes disso, essa
// função repetia a MESMA chamada `/api/v1/slo?limit=1000` internamente,
// dobrando à toa uma das ~14 chamadas da rota (achado da revisão de APIs).
export async function sloBudget(ctx: DatadogCtx, slos: SloRaw[], maxSlos = 15): Promise<SloBudgetResult> {
  // measured:false (não pct:0) quando não há SLO nenhum: "error budget
  // respeitado" mede COMPLIANCE de SLOs existentes — sem nenhum SLO, não há o
  // que medir, então N/D é o sinal correto (excluído da média do pilar). Sem
  // isso, scope-maturity/route.ts contava 0 aqui E 0 em "Serviços com SLO"
  // (que corretamente fica 0 — adoção zero é um fato real) pela MESMA causa,
  // descontando o pilar Processos duas vezes por um único motivo (achado da
  // auditoria — penalizava demais ambientes greenfield sem SLO configurado).
  if (slos.length === 0) return { measured: false, detail: 'Nenhum SLO configurado.' }

  const now = Math.floor(Date.now() / 1000)
  const from = now - 30 * 24 * 3600
  const subset = slos.slice(0, maxSlos)

  // Histórico de cada SLO é independente — busca tudo em paralelo em vez
  // de um `for` sequencial com await (que podia levar vários segundos
  // com o subset cheio de 15 SLOs).
  const histories = await Promise.all(
    subset.map(slo => ddGet<{ data?: { overall?: { sli_value?: number } } }>(ctx, `/api/v1/slo/${slo.id}/history?from_ts=${from}&to_ts=${now}`))
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

export interface AlertEventsResult {
  measured: boolean
  total?: number
  triggers?: number
  recoveries?: number
  cycles?: number
  flapping?: number
  flappingRate?: number | null
  instant?: number
  instantRate?: number | null
}

interface AlertEvent {
  alert_type?: string
  aggregation_key?: string
  monitor_id?: string | number
  id?: string | number
  date_happened?: number
}

// ── Eventos de alerta (últimos N dias): pareia disparo→recuperação por
//    monitor (aggregation_key) e mede flapping = auto-recuperação rápida.
//    GET /api/v1/events?start&end&sources=alert&unaggregated=true
export async function alertEvents(ctx: DatadogCtx, days = 7): Promise<AlertEventsResult> {
  const now = Math.floor(Date.now() / 1000)
  const start = now - days * 24 * 3600
  const r = await ddGet<{ events?: AlertEvent[] }>(ctx, `/api/v1/events?start=${start}&end=${now}&sources=alert&unaggregated=true`)
  if (!r.ok) return { measured: false }
  const events = Array.isArray(r.json?.events) ? r.json.events : []
  const triggers = events.filter(e => e.alert_type === 'error' || e.alert_type === 'warning').length
  const recoveries = events.filter(e => e.alert_type === 'success' || e.alert_type === 'recovery').length

  // Pareia por aggregation_key para estimar flapping.
  // - flapping: recuperou em < 10min (proxy de falso positivo)
  // - instant:  recuperou em < 2min  (auto-resolvido "quase instantâneo")
  const FLAP_SECONDS = 600
  const INSTANT_SECONDS = 120
  const byKey: Record<string, AlertEvent[]> = {}
  for (const e of events) {
    // Agrupa por ciclo do mesmo monitor. Desde 1º/mar/2025 o aggregation_key
    // dos eventos de monitor é único por Monitor ID + Grupo (bom para parear
    // disparo→recuperação). Fallback para monitor_id/id se vier ausente.
    // Doc: https://docs.datadoghq.com/api/latest/events/
    const k = String(e.aggregation_key || e.monitor_id || e.id)
    ;(byKey[k] = byKey[k] || []).push(e)
  }
  let cycles = 0, flapping = 0, instant = 0
  for (const list of Object.values(byKey)) {
    list.sort((a, b) => (a.date_happened || 0) - (b.date_happened || 0))
    let triggerTs: number | null = null
    for (const e of list) {
      const t = e.alert_type
      if ((t === 'error' || t === 'warning') && triggerTs == null) {
        triggerTs = e.date_happened ?? null
      } else if ((t === 'success' || t === 'recovery') && triggerTs != null) {
        cycles++
        const dt = (e.date_happened || 0) - triggerTs
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

export interface QueryMetricResult {
  ok: boolean
  status?: number
  error?: string
  points?: number[]
  seriesCount?: number
}

// ── Metrics Query API: pontos de uma métrica no intervalo ──
// GET /api/v1/query?from=<unix_s>&to=<unix_s>&query=<query>
// Funciona em QUALQUER org (escopo timeseries_query) — base do FinOps quando
// a conta não é parent-org. Doc: https://docs.datadoghq.com/api/latest/metrics/#query-timeseries-points
export async function queryMetric(ctx: DatadogCtx, query: string, fromSec: number, toSec: number): Promise<QueryMetricResult> {
  const r = await ddGet<{ series?: { pointlist?: [number, number | null][] }[] }>(ctx, `/api/v1/query?from=${fromSec}&to=${toSec}&query=${encodeURIComponent(query)}`)
  if (!r.ok) return { ok: false, status: r.status, error: r.error }
  const series = Array.isArray(r.json?.series) ? r.json.series : []
  const points: number[] = []
  for (const s of series) for (const p of (s.pointlist || [])) if (p && p[1] != null) points.push(p[1])
  return { ok: true, points, seriesCount: series.length }
}

export interface TraceOperationsResult {
  ok: boolean
  status?: number
  error?: string
  detail?: string
  operations?: string[]
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
//
// Default de janela: 30 dias (era 24h até a revisão de APIs deste app —
// achado: namespace-operations/route.ts já passava 30d explícito, com o
// comentário "baixo volume pode não ter tráfego em janela curta"; a mesma
// razão vale pra serviços com tráfego esporádico/batch, que com 24h podiam
// voltar 0 operations em operations/route.ts — o caminho mais usado do app
// (Etapa 2 do MonitorsCreator, "Identificar operações"). Janela maior só
// ACRESCENTA operations encontradas, nunca esconde uma que a janela curta
// já achava — troca sem risco de regressão pros ambientes já cobertos.
export async function traceOperations(ctx: DatadogCtx, scopeTag: string, windowSeconds = 30 * 86400): Promise<TraceOperationsResult> {
  const r = await ddGet<{ data?: { id?: string }[] }>(ctx, `/api/v2/metrics?filter[tags]=${encodeURIComponent(scopeTag)}&window[seconds]=${windowSeconds}`)
  if (!r.ok) return { ok: false, status: r.status, error: r.error, detail: r.detail }
  const names = Array.isArray(r.json?.data) ? r.json.data.map(d => d?.id).filter((id): id is string => Boolean(id)) : []
  const ops = new Set<string>()
  for (const name of names) {
    const m = /^trace\.(.+)\.hits$/.exec(name)
    if (m) ops.add(m[1])
  }
  return { ok: true, operations: [...ops].sort() }
}

export interface MetricTagValuesResult {
  ok: boolean
  status?: number
  error?: string
  detail?: string
  values?: string[]
}

// ── Enumera valores distintos de uma tag via Metrics Query API ──
// GET /api/v1/query com "<metric>{scope} by {tagKey}" — cada série volta com
// o valor da tag no `scope`/`tag_set`, então dá pra enumerar os valores
// distintos (ex.: todos os kube_namespace com tráfego APM). Diferente da
// Spans Aggregate API, a Metrics Query API NÃO é amostrada — enumera de forma
// confiável. Descarta "N/A" (spans sem a tag). Escopo timeseries_query.
export async function metricTagValues(ctx: DatadogCtx, query: string, tagKey: string, fromSec: number, toSec: number): Promise<MetricTagValuesResult> {
  const r = await ddGet<{ series?: { tag_set?: string[]; scope?: string }[] }>(ctx, `/api/v1/query?from=${fromSec}&to=${toSec}&query=${encodeURIComponent(query)}`)
  if (!r.ok) return { ok: false, status: r.status, error: r.error, detail: r.detail }
  const series = Array.isArray(r.json?.series) ? r.json.series : []
  const values = new Set<string>()
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
function pctile(sortedAsc: number[], p: number): number | null {
  if (!sortedAsc.length) return null
  const i = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1))
  return sortedAsc[i]
}

export interface EstimatedUsageResult {
  ok: boolean
  unavailable?: boolean
  status?: number
  query?: string
  value?: number | null
  empty?: boolean
  points?: number
}

// Uso estimado de um produto no período, agregando conforme o Datadog FATURA:
//  - 'sum'  -> soma do mês (logs/RUM/synthetics). Query com .as_count() para
//              somar as contagens por intervalo; rollup(sum,1h) torna determinístico.
//  - 'peak' -> high-water mark do p99 (hosts de infra/APM/DBM/profiler/network).
//              rollup(max,1h) por hora e depois p99 (descarta o 1% de picos).
//  - 'avg'  -> média do mês (containers, custom metrics).
// Doc de métricas e tipos: https://docs.datadoghq.com/account_management/billing/usage_metrics/
// Doc de como cada uso é faturado: https://docs.datadoghq.com/account_management/plan_and_usage/cost_details/
export async function estimatedUsage(ctx: DatadogCtx, product: Pick<Product, 'estMetric' | 'estAgg'>, fromSec: number, toSec: number): Promise<EstimatedUsageResult> {
  const m = product?.estMetric
  if (!m) return { ok: false, unavailable: true }
  const agg = product.estAgg || 'avg'
  const query =
    agg === 'sum' ? `sum:${m}{*}.as_count().rollup(sum, 3600)`
      : agg === 'peak' ? `max:${m}{*}.rollup(max, 3600)`
        : `avg:${m}{*}.rollup(avg, 3600)`
  const r = await queryMetric(ctx, query, fromSec, toSec)
  if (!r.ok) return { ok: false, status: r.status, query }
  const pts = r.points || []
  if (pts.length === 0) return { ok: true, value: null, empty: true, query, points: 0 }
  let value: number
  if (agg === 'sum') value = pts.reduce((a, b) => a + b, 0)
  else if (agg === 'peak') value = pctile([...pts].sort((a, b) => a - b), 99) as number
  else value = pts.reduce((a, b) => a + b, 0) / pts.length
  return { ok: true, value, query, points: pts.length }
}
