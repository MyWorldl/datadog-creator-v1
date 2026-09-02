// src/lib/log-monitors.ts
//
// Log Monitor — monitores de type "log alert" (contagem de logs numa janela,
// com filtro em Log Search Syntax). Diferente de infra.ts/discovery.ts, não
// tem uma etapa de "descoberta de entidade" (não existe uma API de listar
// "todos os filtros de log possíveis") — o usuário monta uma ou mais REGRAS
// diretamente (filtro + índice + janela + limite), cada uma virando 1
// monitor. Mesmo padrão de builder puro (query/payload) + planPreview usado
// pelos outros catálogos, pra reaproveitar createPlanIdempotent sem duplicar
// lógica de criação.
//
// Sintaxe da query confirmada via pesquisa (doc oficial da API do Datadog,
// "Create a Monitor" -> campo "query" -> "Logs alert query"):
//   logs(query).index(index_name).rollup(rollup_method[, measure]).last(time_window) operator #
// - query: Log Search Syntax (mesma sintaxe do Log Explorer)
// - index_name: nome do índice, ou "*" pra todos (orgs multi-índice)
// - rollup_method: count, avg, cardinality
// - time_window: "#m" (1-2880) ou "#h" (1-48) — SEM prefixo "last_" (diferente
//   do ALERT_WINDOW_OPTIONS de metric/anomaly monitor). Teto de 2 dias
//   documentado em docs.datadoghq.com/monitors/types/log/.
// - operator: <, <=, >, >=, ==, !=
//
// Escopo desta v1 (registrado de propósito, não esquecido): só rollup
// "count" (contagem de logs que casam o filtro) — SEM measure (avg/
// cardinality) e SEM .by() (agrupamento por facet). Motivo: encontrei duas
// fontes conflitantes sobre quais funções de agregação valem quando um
// "measure" é escolhido (a doc da API de monitor cita count/avg/cardinality;
// a doc da UI do Log Monitor cita min/avg/sum/median/pc75-99/max pra quando
// uma "measure" é selecionada) — sem um exemplo real testável, não vale
// arriscar inventar sintaxe. .by() (agrupamento) só apareceu confirmado num
// exemplo de events(), não de logs() especificamente. Ambos ficam para uma
// rodada futura, já com a sintaxe re-confirmada.

import type { MonitorPayload } from './discovery'

export interface LogWindowOption {
  value: string
  label: string
}

// Só "#m"/"#h" são unidades válidas no time_window da query (a doc NÃO
// documenta um sufixo "d") — 1/2 dias abaixo são escritos em horas (24h/48h),
// não "1d"/"2d", pra não inventar uma unidade fora do que foi confirmado.
export const LOG_WINDOW_OPTIONS: LogWindowOption[] = [
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '30m', label: '30m' },
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
  { value: '24h', label: '24h' },
  { value: '48h', label: '48h' }, // teto documentado (máx. 2 dias = 48h)
]
export const DEFAULT_LOG_WINDOW = '15m'
export const DEFAULT_LOG_INDEX = '*'

export interface LogMonitorRule {
  id: string          // chave client-side (lista editável na UI, não vai pro payload)
  label: string        // nome curto do que a regra monitora (ex.: "Erros 5xx do checkout")
  queryFilter: string  // Log Search Syntax — vazio = todos os logs do índice
  index: string
  window: string
  threshold: number
  warningThreshold: number | null
  priority: number | null
  enableLogsSample: boolean
}

export function newLogMonitorRule(id: string): LogMonitorRule {
  return {
    id,
    label: '',
    queryFilter: '',
    index: DEFAULT_LOG_INDEX,
    window: DEFAULT_LOG_WINDOW,
    threshold: 100,
    warningThreshold: null,
    priority: 3,
    // Inclui uma amostra dos logs que dispararam o alerta na notificação —
    // ajuda a triagem sem precisar abrir o Log Explorer separadamente.
    enableLogsSample: true,
  }
}

// Escapa aspas duplas do filtro/índice antes de interpolar dentro de
// logs("...") — o próprio filtro do usuário pode conter aspas (ex.:
// message:"connection refused").
function escapeForLogsQuery(v: string): string {
  return (v || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export interface BuildLogCountQueryArgs {
  queryFilter: string
  index?: string
  window: string
  threshold: number
}

export function buildLogCountQuery({ queryFilter, index = DEFAULT_LOG_INDEX, window, threshold }: BuildLogCountQueryArgs): string {
  const filter = escapeForLogsQuery((queryFilter || '').trim())
  const idx = escapeForLogsQuery((index || DEFAULT_LOG_INDEX).trim() || DEFAULT_LOG_INDEX)
  return `logs("${filter}").index("${idx}").rollup("count").last("${window}") > ${threshold}`
}

export interface BuildLogMonitorArgs {
  label: string
  queryFilter: string
  index?: string
  window: string
  threshold: number
  warningThreshold?: number | null
  enableLogsSample?: boolean
  message?: string
  tags?: string[]
  namePrefix?: string
  priority?: number | null
  notifyTarget?: string
  notifyNoData?: boolean
  renotifyInterval?: number
}

const DEFAULT_MESSAGE = `{{#is_alert}}🔴 [Log Monitor] {{name}} — {{value}} log(s) na janela (limite: {{threshold}}).{{/is_alert}}{{#is_warning}}⚠️ [Log Monitor] {{name}} — {{value}} log(s) na janela (aviso: {{warn_threshold}}).{{/is_warning}}{{#is_alert_recovery}}✅ [Log Monitor] {{name}} — voltou abaixo do limite.{{/is_alert_recovery}}{{#is_no_data}}⚪ [Log Monitor] {{name}} — sem dados recentes.{{/is_no_data}}

**O que monitora:** contagem de logs que casam o filtro configurado, dentro da janela avaliada.

**Ação recomendada:** abra a amostra de logs anexada à notificação (ou o Log Explorer com o mesmo filtro) para identificar a causa raiz antes de escalar.

@equipe-ops`

export function buildLogMonitorPayload({ label, queryFilter, index = DEFAULT_LOG_INDEX, window, threshold, warningThreshold, enableLogsSample = true, message, tags, namePrefix, priority, notifyTarget, notifyNoData, renotifyInterval }: BuildLogMonitorArgs): MonitorPayload & { options: MonitorPayload['options'] & { enable_logs_sample?: boolean } } {
  const name = `${(namePrefix || '[MonitorsCreator]').trim()} ${label}`.trim()
  const baseTags = ['created_by:monitorscreator', 'monitor_kind:log']
  for (const t of (tags || [])) if (t && !baseTags.includes(t)) baseTags.push(t)

  let resolvedMessage = message || DEFAULT_MESSAGE
  if (notifyTarget) resolvedMessage = resolvedMessage.replaceAll('@equipe-ops', notifyTarget)

  return {
    name,
    type: 'log alert',
    query: buildLogCountQuery({ queryFilter, index, window, threshold }),
    message: resolvedMessage,
    tags: baseTags,
    ...(priority ? { priority } : {}),
    options: {
      thresholds: {
        critical: threshold,
        ...(warningThreshold != null ? { warning: warningThreshold } : {}),
      },
      notify_no_data: !!notifyNoData,
      notify_audit: false,
      require_full_window: false,
      renotify_interval: Number(renotifyInterval) || 0,
      evaluation_delay: 0,
      // Campo específico de log monitor (confirmado no plano/contexto desta
      // fase) — anexa uma amostra dos logs que dispararam o alerta.
      enable_logs_sample: !!enableLogsSample,
    },
  }
}

export interface LogMonitorPlanItem {
  kind: 'log'
  label: string
  name: string
  query: string
  message: string
  priority: number | null
  payload: MonitorPayload
}

export interface LogMonitorsState {
  rules: LogMonitorRule[]
  tags: string[]
  namePrefix: string
  messages: Record<string, string>
  notifyTarget: string
  notifyNoData: boolean
  renotifyInterval: number
}

export function initialLogMonitors(): LogMonitorsState {
  return {
    rules: [],
    tags: [],
    namePrefix: '[MonitorsCreator]',
    messages: {},
    notifyTarget: '',
    notifyNoData: false,
    renotifyInterval: 0,
  }
}

// Expande as regras habilitadas em uma lista de monitores previstos — 1
// monitor por regra (sem multiplicar por entidade, diferente de
// planPreview/planInfraPreview: aqui a "entidade" já É a regra).
export function planLogPreview(state: Partial<LogMonitorsState>): LogMonitorPlanItem[] {
  const { rules = [], tags = [], namePrefix = '[MonitorsCreator]', messages = {}, notifyTarget = '', notifyNoData = false, renotifyInterval = 0 } = state || {}
  const plan: LogMonitorPlanItem[] = []
  for (const rule of rules) {
    if (!rule?.label?.trim()) continue
    const payload = buildLogMonitorPayload({
      label: rule.label,
      queryFilter: rule.queryFilter,
      index: rule.index,
      window: rule.window,
      threshold: rule.threshold,
      warningThreshold: rule.warningThreshold,
      enableLogsSample: rule.enableLogsSample,
      message: messages[rule.id],
      tags, namePrefix,
      priority: rule.priority,
      notifyTarget, notifyNoData, renotifyInterval,
    })
    plan.push({ kind: 'log', label: rule.label, name: payload.name, query: payload.query, message: payload.message, priority: rule.priority ?? null, payload })
  }
  return plan
}
