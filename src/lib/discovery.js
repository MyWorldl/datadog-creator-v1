// src/lib/discovery.js
//
// Definições compartilhadas do fluxo de descoberta de serviços:
// tipos de alerta, limiares padrão, unidades e mensagens-template padrão.
// Usado pelos passos do wizard (cliente) e como referência no servidor.
//
// Variáveis de template do Datadog usadas nas mensagens:
//   {{service.name}}  -> nome do serviço (vem do group by service)
//   {{value}}         -> valor avaliado
//   {{threshold}}     -> limiar configurado

export const ALERT_TYPES = [
  {
    key: 'latency',
    label: 'Latência (p95)',
    unit: 's',
    def: 1,
    hint: 'Dispara se a latência p95 passar do valor (segundos).',
    message:
      '🔴 [Latência] {{service.name}} com p95 acima de {{threshold}}s (atual: {{value}}).\n@equipe-ops',
  },
  {
    key: 'errorRate',
    label: 'Taxa de Erro',
    unit: '%',
    def: 5,
    hint: 'Dispara se (erros / requisições) passar do valor (%).',
    message:
      '🔴 [Taxa de Erro] {{service.name}} acima de {{threshold}}% (atual: {{value}}%).\n@equipe-ops',
  },
  {
    key: 'highVolume',
    label: 'Alto volume de requisições',
    unit: 'req',
    def: 10000,
    hint: 'Dispara se as requisições em 15min passarem do valor.',
    message:
      '⚠️ [Alto volume] {{service.name}} com requisições acima de {{threshold}} em 15min (atual: {{value}}). Possível pico de tráfego.\n@equipe-ops',
  },
  {
    key: 'lowVolume',
    label: 'Baixo volume de requisições',
    unit: 'req',
    def: 1,
    hint: 'Dispara se as requisições em 15min caírem abaixo do valor.',
    message:
      '⚠️ [Baixo volume] {{service.name}} com requisições abaixo de {{threshold}} em 15min (atual: {{value}}). Possível queda/serviço mudo.\n@equipe-ops',
  },
]

export const ALERT_BY_KEY = Object.fromEntries(ALERT_TYPES.map(a => [a.key, a]))

export const DEFAULT_GROUP_BY = ['service', 'resource_name']

// Defaults iniciais do bloco de descoberta no estado do wizard.
export function initialDiscovery() {
  return {
    env: '',
    services: [],            // lista de nomes descobertos
    selected: {},            // { svcName: { operation, opsCount, operations:[] } }
    alerts: Object.fromEntries(
      ALERT_TYPES.map(a => [a.key, { enabled: a.key === 'latency' || a.key === 'errorRate', threshold: a.def }])
    ),
    groupBy: [...DEFAULT_GROUP_BY],
    messages: Object.fromEntries(ALERT_TYPES.map(a => [a.key, a.message])),
  }
}

// ── Preview das queries (espelha a lógica do servidor em
//    /api/datadog/service-monitors). Mantenha as duas em sincronia. ──
function scopeOf(service, env) {
  const parts = [`service:${service}`]
  if (env && env !== '*') parts.push(`env:${env}`)
  return parts.join(',')
}
function byClauseOf(groupBy) {
  const g = (groupBy || []).filter(Boolean)
  return g.length ? ` by {${g.join(',')}}` : ''
}
function queryFor(kind, { service, env, operation, threshold, groupBy }) {
  const sc = scopeOf(service, env)
  const by = byClauseOf(groupBy)
  const op = operation || 'http.request'
  switch (kind) {
    case 'latency':
      return `avg(last_15m):p95:trace.${op}{${sc}}${by} > ${threshold}`
    case 'errorRate':
      return `avg(last_15m):( sum:trace.${op}.errors{${sc}}${by}.as_count() / sum:trace.${op}.hits{${sc}}${by}.as_count() ) * 100 > ${threshold}`
    case 'lowVolume':
      return `sum(last_15m):sum:trace.${op}.hits{${sc}}${by}.as_count() < ${threshold}`
    case 'highVolume':
      return `sum(last_15m):sum:trace.${op}.hits{${sc}}${by}.as_count() > ${threshold}`
    default:
      return ''
  }
}

// Gera a lista de monitores previstos a partir do estado de descoberta.
export function planPreview(discovery) {
  const { selected = {}, env = '', groupBy = [], alerts = {} } = discovery || {}
  const plan = []
  for (const [service, meta] of Object.entries(selected)) {
    for (const a of ALERT_TYPES) {
      const cfg = alerts[a.key]
      if (!cfg?.enabled) continue
      plan.push({
        kind: a.key,
        label: a.label,
        service,
        name: `[MonitorsCreator] ${service} · ${a.label}`,
        query: queryFor(a.key, { service, env, operation: meta.operation, threshold: cfg.threshold, groupBy }),
      })
    }
  }
  return plan
}
