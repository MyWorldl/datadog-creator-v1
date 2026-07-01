// src/lib/discovery.js
//
// Fluxo de descoberta de serviços -> monitores de ANOMALY DETECTION.
// Centraliza tipos de alerta, defaults, mensagens-template e a construção
// do payload do monitor (usada tanto no preview do cliente quanto na rota
// /api/datadog/service-monitors, evitando lógica duplicada).
//
// Cada tipo vira um monitor de anomalia (type "query alert") com a função
// anomalies(...). Direção fixa por tipo (ex.: latência/erros/alto volume =
// 'above'; baixo volume = 'below').
//
// Variáveis de template do Datadog nas mensagens:
//   {{service.name}}  -> nome do serviço (via group by service)
//   {{value}}         -> valor avaliado

export const ALERT_TYPES = [
  {
    key: 'latency', label: 'Latência (p95)', direction: 'above', def: 2,
    hint: 'Anomalia na latência p95 (desvio do padrão histórico).',
    message: '🔴 [Anomalia · Latência] {{service.name}} — p95 fora do padrão histórico (atual: {{value}}).\n@equipe-ops',
  },
  {
    key: 'errorRate', label: 'Taxa de Erro', direction: 'above', def: 2,
    hint: 'Anomalia na taxa de erros (erros/requisições).',
    message: '🔴 [Anomalia · Taxa de Erro] {{service.name}} — erros fora do padrão (atual: {{value}}%).\n@equipe-ops',
  },
  {
    key: 'highVolume', label: 'Alto volume de requisições', direction: 'above', def: 2,
    hint: 'Anomalia de pico: requisições acima do padrão histórico.',
    message: '⚠️ [Anomalia · Alto volume] {{service.name}} — requisições acima do padrão (atual: {{value}}). Possível pico.\n@equipe-ops',
  },
  {
    key: 'lowVolume', label: 'Baixo volume de requisições', direction: 'below', def: 2,
    hint: 'Anomalia de queda: requisições abaixo do padrão histórico.',
    message: '⚠️ [Anomalia · Baixo volume] {{service.name}} — requisições abaixo do padrão (atual: {{value}}). Possível queda/serviço mudo.\n@equipe-ops',
  },
]

export const ALERT_BY_KEY = Object.fromEntries(ALERT_TYPES.map(a => [a.key, a]))
export const DEFAULT_GROUP_BY = ['service', 'resource_name']

export function initialDiscovery() {
  return {
    env: '',
    services: [],   // nomes descobertos
    selected: {},   // { svc: { opsCount, operations:[], chosen:[] } }
    alerts: Object.fromEntries(
      ALERT_TYPES.map(a => [a.key, { enabled: a.key === 'latency' || a.key === 'errorRate', deviations: a.def }])
    ),
    groupBy: [...DEFAULT_GROUP_BY],
    messages: Object.fromEntries(ALERT_TYPES.map(a => [a.key, a.message])),
    // Personalização (Etapas 3)
    namePrefix: '[MonitorsCreator]',
    tags: [],
    // Parâmetros do anomaly detection
    algorithm: 'agile',       // basic | agile | robust
    queryWindow: 'last_4h',
    alertWindow: 'last_15m',
  }
}

// ── Construção de query/payload (fonte única) ──
function scopeOf(service, env) {
  const parts = [`service:${service}`]
  if (env && env !== '*') parts.push(`env:${env}`)
  return parts.join(',')
}
function byClauseOf(groupBy) {
  const g = (groupBy || []).filter(Boolean)
  return g.length ? ` by {${g.join(',')}}` : ''
}
function metricExpr(kind, op, sc, by) {
  switch (kind) {
    case 'latency':
      return `p95:trace.${op}{${sc}}${by}`
    case 'errorRate':
      return `( sum:trace.${op}.errors{${sc}}${by}.as_count() / sum:trace.${op}.hits{${sc}}${by}.as_count() ) * 100`
    case 'highVolume':
    case 'lowVolume':
      return `sum:trace.${op}.hits{${sc}}${by}.as_count()`
    default:
      return ''
  }
}

export function buildAnomalyQuery({ kind, service, env, operation, deviations, groupBy, algorithm = 'agile', queryWindow = 'last_4h', alertWindow = 'last_15m' }) {
  const sc = scopeOf(service, env)
  const by = byClauseOf(groupBy)
  const op = operation || 'http.request'
  const dir = ALERT_BY_KEY[kind]?.direction || 'above'
  const seasonality = algorithm !== 'basic' ? `, seasonality='daily'` : ''
  const m = metricExpr(kind, op, sc, by)
  return (
    `avg(${queryWindow}):anomalies(${m}, '${algorithm}', ${deviations}, ` +
    `direction='${dir}', alert_window='${alertWindow}', interval=60, ` +
    `count_default_zero='true'${seasonality}) >= 1`
  )
}

export function buildMonitorPayload({ kind, service, env, operation, deviations, groupBy, message, tags, namePrefix, algorithm, queryWindow, alertWindow }) {
  const label = ALERT_BY_KEY[kind]?.label || kind
  const name = `${(namePrefix || '[MonitorsCreator]').trim()} ${service} · ${label}`.trim()
  const baseTags = ['created_by:monitorscreator', `service:${service}`]
  if (env && env !== '*') baseTags.push(`env:${env}`)
  for (const t of (tags || [])) if (t && !baseTags.includes(t)) baseTags.push(t)

  return {
    name,
    type: 'query alert',
    query: buildAnomalyQuery({ kind, service, env, operation, deviations, groupBy, algorithm, queryWindow, alertWindow }),
    message: message || ALERT_BY_KEY[kind]?.message || '',
    tags: baseTags,
    options: {
      threshold_windows: { alert_window: alertWindow || 'last_15m', recovery_window: 'last_15m' },
      thresholds: { critical: 1.0 },
      notify_no_data: false,
      notify_audit: false,
      require_full_window: false,
      renotify_interval: 0,
    },
  }
}

// Expande o estado de descoberta em uma lista de monitores previstos.
// Um monitor por (serviço × operação escolhida × tipo habilitado).
export function planPreview(discovery) {
  const d = discovery || {}
  const { selected = {}, env = '', groupBy = [], alerts = {}, messages = {},
    namePrefix = '[MonitorsCreator]', tags = [], algorithm = 'agile',
    queryWindow = 'last_4h', alertWindow = 'last_15m' } = d

  const plan = []
  for (const [service, meta] of Object.entries(selected)) {
    const ops = (meta?.chosen && meta.chosen.length) ? meta.chosen : (meta?.operation ? [meta.operation] : [])
    for (const operation of ops) {
      for (const a of ALERT_TYPES) {
        const cfg = alerts[a.key]
        if (!cfg?.enabled) continue
        const payload = buildMonitorPayload({
          kind: a.key, service, env, operation,
          deviations: cfg.deviations, groupBy,
          message: messages[a.key], tags, namePrefix,
          algorithm, queryWindow, alertWindow,
        })
        plan.push({ kind: a.key, label: a.label, service, operation, name: payload.name, query: payload.query, message: payload.message, payload })
      }
    }
  }
  return plan
}
