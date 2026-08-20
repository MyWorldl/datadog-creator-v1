// src/lib/finops-pricing.ts
//
// Catálogo de produtos Datadog para o FinOps Insights.
//
// DUAS FONTES DE CONSUMO:
//  1) Usage Metering API (/api/v1/usage/summary) — precisa de parent-org.
//     Campos: `fields` (candidatos, o coletor usa o 1º que existir).
//  2) Métricas de uso estimado (datadog.estimated_usage.*) via Metrics Query
//     API — funcionam em QUALQUER org (inclusive filha/não-parent). Campos:
//     `estMetric` (nome), `estAgg` (como agregar no mês) e `estCount` (usa
//     .as_count()). Fonte: https://docs.datadoghq.com/account_management/billing/usage_metrics/
//
// AGREGAÇÃO POR PRODUTO (espelha como o Datadog fatura — Cost Details):
//   'peak' → pico do mês (high-water mark): hosts de infra/APM, DBM, profiler…
//   'avg'  → média do mês: custom metrics, containers…
//   'sum'  → soma do mês (com .as_count()): logs (bytes/eventos), RUM, synthetics…
//
// price = preço de LISTA (anual) por unidade — ver pricing/list. Preço real
// contratado difere (committed use/descontos); por isso é editável na UI.
//
// Os valores abaixo são um SNAPSHOT do catálogo de preços — a Datadog muda
// esses valores ao longo do tempo, e nada aqui detecta isso automaticamente.
// Recomendação (achado da auditoria): revisar periodicamente contra
// https://www.datadoghq.com/pricing/list/ — a edição na UI cobre drift
// pontual, mas não substitui uma checagem de tempos em tempos.
//
// Cálculo: custo ≈ (bytes ? valor/1e9 : valor) / per × price
//
// SIMPLIFICAÇÃO CONHECIDA: todo produto usa preço LINEAR (mesmo $/unidade em
// qualquer volume). 'customMetrics' é o caso mais visível — a Datadog aplica
// blocos degressivos (desconto por volume) em contas de volume muito alto,
// que este cálculo não modela. Aproximação razoável pra maioria dos clientes;
// para volumes muito grandes, o custo real tende a ficar ABAIXO do estimado
// aqui (achado da auditoria — documentado, não corrigido, pois os blocos de
// desconto não são públicos/fixos o bastante pra codificar com confiança).
//
// Segundo arquivo migrado pra TypeScript (achado da auditoria: código que
// calcula custo é onde um erro de contrato entre tipos dói mais).

export type EstAgg = 'sum' | 'peak' | 'avg'

export interface Product {
  key: string
  label: string
  unit: string
  price: number
  per: number
  bytes: boolean
  fields: string[]
  estMetric: string | null
  estAgg: EstAgg | null
  estCount: boolean
}

export const PRODUCTS: Product[] = [
  { key: 'infra',        label: 'Infrastructure Pro',      unit: 'hosts (p99)',   price: 15,   per: 1,    bytes: false, fields: ['infra_host_top99p_sum'], estMetric: 'datadog.estimated_usage.hosts', estAgg: 'peak', estCount: false },
  { key: 'apm',          label: 'APM',                     unit: 'hosts (p99)',   price: 31,   per: 1,    bytes: false, fields: ['apm_host_top99p_sum'], estMetric: 'datadog.estimated_usage.apm_hosts', estAgg: 'peak', estCount: false },
  { key: 'containers',   label: 'Container Monitoring',    unit: 'containers',    price: 1,    per: 1,    bytes: false, fields: ['container_hwm_sum', 'container_avg_sum'], estMetric: 'datadog.estimated_usage.containers', estAgg: 'avg', estCount: false },
  { key: 'customMetrics',label: 'Custom Metrics',          unit: 'custom metrics',price: 5,    per: 100,  bytes: false, fields: ['custom_ts_sum', 'custom_ts_avg_sum', 'num_custom_timeseries'], estMetric: 'datadog.estimated_usage.metrics.custom', estAgg: 'avg', estCount: false },
  { key: 'logsIngest',   label: 'Logs — Ingestão',         unit: 'GB ingeridos',  price: 0.10, per: 1,    bytes: true,  fields: ['ingested_events_bytes_sum'], estMetric: 'datadog.estimated_usage.logs.ingested_bytes', estAgg: 'sum', estCount: true },
  { key: 'logsIndexed',  label: 'Logs — Indexados (15d)',  unit: '1M eventos',    price: 1.70, per: 1e6,  bytes: false, fields: ['indexed_events_count_sum'], estMetric: null, estAgg: null, estCount: false },
  { key: 'apmIngest',    label: 'APM — Ingestão',          unit: 'GB de spans',   price: 0.10, per: 1,    bytes: true,  fields: ['apm_ingested_traces_bytes_sum', 'ingested_spans_bytes_sum', 'apm_ingested_bytes_sum'], estMetric: 'datadog.estimated_usage.apm.ingested_bytes', estAgg: 'sum', estCount: true },
  // Ingestão de spans (acima) e indexação por retention filter são cobradas
  // SEPARADAMENTE — mesma dicotomia de logsIngest/logsIndexed, que faltava
  // pro lado de APM (achado da auditoria). Diferente de logsIndexed, aqui
  // EXISTE uma estimated_usage metric própria (confirmado em
  // https://docs.datadoghq.com/tracing/trace_retention/usage_metrics/), então
  // não sofre do mesmo "gap silencioso" — 15d pra bater com o mesmo tier já
  // usado em logsIndexed. Preço confirmado em https://www.datadoghq.com/pricing/list/.
  // NÃO desconta a allocation gratuita (1M spans/host de APM, 65k/task
  // Fargate) que a Datadog inclui — mesma simplificação já assumida pros
  // demais produtos (preço de lista, sem tiers/allowance).
  { key: 'apmIndexed',   label: 'APM — Spans Indexados (15d)', unit: '1M spans', price: 1.70, per: 1e6,  bytes: false, fields: ['indexed_spans_count_sum'], estMetric: 'datadog.estimated_usage.apm.indexed_spans', estAgg: 'sum', estCount: true },
  { key: 'dbm',          label: 'Database Monitoring',     unit: 'hosts (p99)',   price: 70,   per: 1,    bytes: false, fields: ['dbm_host_top99p_sum'], estMetric: 'datadog.estimated_usage.dbm.hosts', estAgg: 'peak', estCount: false },
  { key: 'rum',          label: 'RUM — Sessões',           unit: '1k sessões',    price: 0.15, per: 1e3,  bytes: false, fields: ['rum_session_count_sum', 'rum_units_sum'], estMetric: 'datadog.estimated_usage.rum.sessions', estAgg: 'sum', estCount: true },
  { key: 'synthApi',     label: 'Synthetics — API',        unit: '10k runs',      price: 5,    per: 1e4,  bytes: false, fields: ['synthetics_check_calls_count_sum'], estMetric: 'datadog.estimated_usage.synthetics.api_test_runs', estAgg: 'sum', estCount: true },
  { key: 'synthBrowser', label: 'Synthetics — Browser',    unit: '1k runs',       price: 12,   per: 1e3,  bytes: false, fields: ['browser_check_calls_count_sum'], estMetric: 'datadog.estimated_usage.synthetics.browser_test_runs', estAgg: 'sum', estCount: true },
  { key: 'profiler',     label: 'Continuous Profiler',     unit: 'hosts (p99)',   price: 19,   per: 1,    bytes: false, fields: ['profiling_host_top99p_sum', 'prof_host_top99p_sum'], estMetric: 'datadog.estimated_usage.profiling.hosts', estAgg: 'peak', estCount: false },
  { key: 'network',      label: 'Network Monitoring (CNM)',unit: 'hosts (p99)',   price: 5,    per: 1,    bytes: false, fields: ['cnm_host_top99p_sum', 'netflow_indexed_events_count_sum'], estMetric: 'datadog.estimated_usage.network.hosts', estAgg: 'peak', estCount: false },
]

// Métricas de uso estimado (para o alarme de anomalia) — só as que existem.
// https://docs.datadoghq.com/account_management/billing/usage_metrics/
export const EST_METRICS: { metric: string; label: string }[] = PRODUCTS
  .filter((p): p is Product & { estMetric: string } => p.estMetric != null)
  .map(p => ({ metric: p.estMetric, label: p.label }))

export function computeCost(value: number | null | undefined, price: number, per = 1, bytes = false): number | null {
  if (value == null || Number.isNaN(value)) return null
  const base = bytes ? value / 1e9 : value
  return (base / per) * price
}

export const fmtMoney = (n: number | null | undefined): string => n == null ? '—'
  : n.toLocaleString('pt-BR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
export const fmtNum = (n: number | null | undefined): string => n == null ? '—'
  : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
