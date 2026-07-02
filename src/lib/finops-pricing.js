// src/lib/finops-pricing.js
//
// Catálogo de produtos Datadog para o FinOps Insights:
//  - price: preço de LISTA (anual) por unidade de cobrança. Fonte:
//    https://www.datadoghq.com/pricing/list/  (preço de lista ≠ preço
//    contratado; committed use e descontos mudam o valor real).
//  - fields: candidatos de campo no /api/v1/usage/summary (o coletor usa
//    o primeiro que existir — tolerante a variações entre produtos/sites).
//  - per / bytes: base de cobrança para o cálculo de custo.
//  - estMetric: métrica datadog.estimated_usage.* para alarme de anomalia.
//
// Cálculo: custo ≈ (bytes ? valor/1e9 : valor) / per × price
//   per=1  → por unidade (host, container, seat)
//   per=100 (custom metrics), 1e6 (1M eventos), 1e3 (1k sessões),
//   1e4 (10k runs); bytes=true → converte bytes → GB (÷1e9).

export const PRODUCTS = [
  { key: 'infra',        label: 'Infrastructure Pro',      unit: 'hosts (p99)',   price: 15,   per: 1,    bytes: false, fields: ['infra_host_top99p_sum'], estMetric: 'datadog.estimated_usage.hosts' },
  { key: 'apm',          label: 'APM',                     unit: 'hosts (p99)',   price: 31,   per: 1,    bytes: false, fields: ['apm_host_top99p_sum'], estMetric: 'datadog.estimated_usage.apm.hosts' },
  { key: 'containers',   label: 'Container Monitoring',    unit: 'containers',    price: 1,    per: 1,    bytes: false, fields: ['container_hwm_sum', 'container_avg_sum'], estMetric: 'datadog.estimated_usage.containers' },
  { key: 'customMetrics',label: 'Custom Metrics',          unit: 'custom metrics',price: 5,    per: 100,  bytes: false, fields: ['custom_ts_sum', 'custom_ts_avg_sum', 'num_custom_timeseries'], estMetric: 'datadog.estimated_usage.timeseries' },
  { key: 'logsIngest',   label: 'Logs — Ingestão',         unit: 'GB ingeridos',  price: 0.10, per: 1,    bytes: true,  fields: ['ingested_events_bytes_sum'], estMetric: 'datadog.estimated_usage.logs.ingested_bytes' },
  { key: 'logsIndexed',  label: 'Logs — Indexados (15d)',  unit: '1M eventos',    price: 1.70, per: 1e6,  bytes: false, fields: ['indexed_events_count_sum'], estMetric: 'datadog.estimated_usage.logs.ingested_events' },
  { key: 'apmIngest',    label: 'APM — Ingestão',          unit: 'GB de spans',   price: 0.10, per: 1,    bytes: true,  fields: ['apm_ingested_traces_bytes_sum', 'ingested_spans_bytes_sum', 'apm_ingested_bytes_sum'], estMetric: 'datadog.estimated_usage.apm.ingested_bytes' },
  { key: 'dbm',          label: 'Database Monitoring',     unit: 'hosts (p99)',   price: 70,   per: 1,    bytes: false, fields: ['dbm_host_top99p_sum'], estMetric: 'datadog.estimated_usage.dbm.hosts' },
  { key: 'rum',          label: 'RUM — Sessões',           unit: '1k sessões',    price: 0.15, per: 1e3,  bytes: false, fields: ['rum_session_count_sum', 'rum_units_sum'], estMetric: 'datadog.estimated_usage.rum.sessions' },
  { key: 'synthApi',     label: 'Synthetics — API',        unit: '10k runs',      price: 5,    per: 1e4,  bytes: false, fields: ['synthetics_check_calls_count_sum'], estMetric: 'datadog.estimated_usage.synthetics.api_test_runs' },
  { key: 'synthBrowser', label: 'Synthetics — Browser',    unit: '1k runs',       price: 12,   per: 1e3,  bytes: false, fields: ['browser_check_calls_count_sum'], estMetric: 'datadog.estimated_usage.synthetics.browser_test_runs' },
  { key: 'profiler',     label: 'Continuous Profiler',     unit: 'hosts (p99)',   price: 19,   per: 1,    bytes: false, fields: ['profiling_host_top99p_sum', 'prof_host_top99p_sum'], estMetric: 'datadog.estimated_usage.profiling.hosts' },
  { key: 'usm',          label: 'Universal Service Mon.',  unit: 'hosts (p99)',   price: 9,    per: 1,    bytes: false, fields: ['universal_service_monitoring_host_top99p_sum', 'usm_host_top99p_sum'], estMetric: 'datadog.estimated_usage.usm.hosts' },
]

// Métricas de uso estimado disponíveis na conta (para o alarme de anomalia).
// https://docs.datadoghq.com/account_management/billing/usage_metrics/
export const EST_METRICS = PRODUCTS.map(p => ({ metric: p.estMetric, label: p.label }))

export function computeCost(value, price, per = 1, bytes = false) {
  if (value == null || Number.isNaN(value)) return null
  const base = bytes ? value / 1e9 : value
  return (base / per) * price
}

export const fmtMoney = (n) => n == null ? '—'
  : n.toLocaleString('pt-BR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
export const fmtNum = (n) => n == null ? '—'
  : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
