// src/lib/finops-pricing.js
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
//   'max' → pico do mês (high-water mark): hosts de infra/APM, DBM, profiler…
//   'avg' → média do mês: custom metrics, fargate…
//   'sum' → soma do mês (com .as_count()): logs (bytes/eventos), RUM, synthetics…
//
// price = preço de LISTA (anual) por unidade — ver pricing/list. Preço real
// contratado difere (committed use/descontos); por isso é editável na UI.
//
// Cálculo: custo ≈ (bytes ? valor/1e9 : valor) / per × price

export const PRODUCTS = [
  { key: 'infra',        label: 'Infrastructure Pro',      unit: 'hosts (p99)',   price: 15,   per: 1,    bytes: false, fields: ['infra_host_top99p_sum'], estMetric: 'datadog.estimated_usage.hosts', estAgg: 'peak', estCount: false },
  { key: 'apm',          label: 'APM',                     unit: 'hosts (p99)',   price: 31,   per: 1,    bytes: false, fields: ['apm_host_top99p_sum'], estMetric: 'datadog.estimated_usage.apm_hosts', estAgg: 'peak', estCount: false },
  { key: 'containers',   label: 'Container Monitoring',    unit: 'containers',    price: 1,    per: 1,    bytes: false, fields: ['container_hwm_sum', 'container_avg_sum'], estMetric: 'datadog.estimated_usage.containers', estAgg: 'avg', estCount: false },
  { key: 'customMetrics',label: 'Custom Metrics',          unit: 'custom metrics',price: 5,    per: 100,  bytes: false, fields: ['custom_ts_sum', 'custom_ts_avg_sum', 'num_custom_timeseries'], estMetric: 'datadog.estimated_usage.metrics.custom', estAgg: 'avg', estCount: false },
  { key: 'logsIngest',   label: 'Logs — Ingestão',         unit: 'GB ingeridos',  price: 0.10, per: 1,    bytes: true,  fields: ['ingested_events_bytes_sum'], estMetric: 'datadog.estimated_usage.logs.ingested_bytes', estAgg: 'sum', estCount: true },
  { key: 'logsIndexed',  label: 'Logs — Indexados (15d)',  unit: '1M eventos',    price: 1.70, per: 1e6,  bytes: false, fields: ['indexed_events_count_sum'], estMetric: null, estAgg: null, estCount: false },
  { key: 'apmIngest',    label: 'APM — Ingestão',          unit: 'GB de spans',   price: 0.10, per: 1,    bytes: true,  fields: ['apm_ingested_traces_bytes_sum', 'ingested_spans_bytes_sum', 'apm_ingested_bytes_sum'], estMetric: 'datadog.estimated_usage.apm.ingested_bytes', estAgg: 'sum', estCount: true },
  { key: 'dbm',          label: 'Database Monitoring',     unit: 'hosts (p99)',   price: 70,   per: 1,    bytes: false, fields: ['dbm_host_top99p_sum'], estMetric: 'datadog.estimated_usage.dbm.hosts', estAgg: 'peak', estCount: false },
  { key: 'rum',          label: 'RUM — Sessões',           unit: '1k sessões',    price: 0.15, per: 1e3,  bytes: false, fields: ['rum_session_count_sum', 'rum_units_sum'], estMetric: 'datadog.estimated_usage.rum.sessions', estAgg: 'sum', estCount: true },
  { key: 'synthApi',     label: 'Synthetics — API',        unit: '10k runs',      price: 5,    per: 1e4,  bytes: false, fields: ['synthetics_check_calls_count_sum'], estMetric: 'datadog.estimated_usage.synthetics.api_test_runs', estAgg: 'sum', estCount: true },
  { key: 'synthBrowser', label: 'Synthetics — Browser',    unit: '1k runs',       price: 12,   per: 1e3,  bytes: false, fields: ['browser_check_calls_count_sum'], estMetric: 'datadog.estimated_usage.synthetics.browser_test_runs', estAgg: 'sum', estCount: true },
  { key: 'profiler',     label: 'Continuous Profiler',     unit: 'hosts (p99)',   price: 19,   per: 1,    bytes: false, fields: ['profiling_host_top99p_sum', 'prof_host_top99p_sum'], estMetric: 'datadog.estimated_usage.profiling.hosts', estAgg: 'peak', estCount: false },
  { key: 'network',      label: 'Network Monitoring (CNM)',unit: 'hosts (p99)',   price: 5,    per: 1,    bytes: false, fields: ['cnm_host_top99p_sum', 'netflow_indexed_events_count_sum'], estMetric: 'datadog.estimated_usage.network.hosts', estAgg: 'peak', estCount: false },
]

// Métricas de uso estimado (para o alarme de anomalia) — só as que existem.
// https://docs.datadoghq.com/account_management/billing/usage_metrics/
export const EST_METRICS = PRODUCTS
  .filter(p => p.estMetric)
  .map(p => ({ metric: p.estMetric, label: p.label }))

export function computeCost(value, price, per = 1, bytes = false) {
  if (value == null || Number.isNaN(value)) return null
  const base = bytes ? value / 1e9 : value
  return (base / per) * price
}

export const fmtMoney = (n) => n == null ? '—'
  : n.toLocaleString('pt-BR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
export const fmtNum = (n) => n == null ? '—'
  : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
