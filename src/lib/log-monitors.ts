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
// Sintaxe da query:
//   logs(filtro).index(índice).rollup(método[, "@atributo"])[.by("a,b")].last(janela) operador N
// Confirmada de duas formas: pela doc da API (Create a Monitor -> "Logs alert
// query") E, o que vale mais, pelo endpoint POST /api/v1/monitor/validate do
// próprio Datadog (valida sem criar nada), contra um org real:
//  - rollup: count | avg | sum | min | max | median | pc50/75/90/98/99 |
//    cardinality. Tudo menos "count" EXIGE um atributo "@..." (sem ele:
//    "invalid aggregation metric specified");
//  - .by("facet1,facet2"): até 4 grupos (5 => "max number of groups allowed 4");
//    vira um monitor multi-alert (1 alerta por grupo);
//  - janela: "#m" ou "#h" (ex.: 15m, 48h). O validador também aceita "#d" de 1
//    a 2 dias, mas seguimos em m/h (documentado);
//  - operadores < <= > >=; com ">" o warning precisa ser MENOR que o critical,
//    com "<" precisa ser MAIOR (o validador recusa o contrário).

import type { MonitorPayload } from './discovery'

export interface LogWindowOption {
  value: string
  label: string
}

// Janelas em "#m"/"#h" (as unidades documentadas) — 1/2 dias saem como 24h/48h.
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

export type LogRollup = 'count' | 'avg' | 'sum' | 'min' | 'max' | 'median' | 'pc75' | 'pc90' | 'pc95' | 'pc98' | 'pc99' | 'cardinality'
export type LogOperator = '>' | '>=' | '<' | '<='

export const LOG_ROLLUP_OPTIONS: { value: LogRollup; label: string; needsMeasure: boolean }[] = [
  { value: 'count', label: 'Contagem de logs', needsMeasure: false },
  { value: 'avg', label: 'Média de um atributo', needsMeasure: true },
  { value: 'sum', label: 'Soma de um atributo', needsMeasure: true },
  { value: 'min', label: 'Mínimo de um atributo', needsMeasure: true },
  { value: 'max', label: 'Máximo de um atributo', needsMeasure: true },
  { value: 'median', label: 'Mediana de um atributo', needsMeasure: true },
  { value: 'pc75', label: 'Percentil 75 de um atributo', needsMeasure: true },
  { value: 'pc90', label: 'Percentil 90 de um atributo', needsMeasure: true },
  { value: 'pc95', label: 'Percentil 95 de um atributo', needsMeasure: true },
  { value: 'pc98', label: 'Percentil 98 de um atributo', needsMeasure: true },
  { value: 'pc99', label: 'Percentil 99 de um atributo', needsMeasure: true },
  { value: 'cardinality', label: 'Valores distintos de um atributo', needsMeasure: true },
]
export const LOG_OPERATORS: LogOperator[] = ['>', '>=', '<', '<=']
export const MAX_LOG_GROUPS = 4 // limite do Datadog no .by()

export interface LogMonitorRule {
  id: string          // chave client-side (lista editável na UI, não vai pro payload)
  label: string        // nome curto do que a regra monitora (ex.: "Erros 5xx do checkout")
  queryFilter: string  // Log Search Syntax — vazio = todos os logs do índice
  index: string
  window: string
  // v2 (opcionais: regras antigas/sem esses campos = contagem simples, ">")
  rollup?: LogRollup
  measure?: string      // atributo "@..." — obrigatório quando rollup != count
  groupBy?: string[]    // facets do .by() (máx. 4) — vira multi-alert
  operator?: LogOperator
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
    rollup: 'count',
    measure: '',
    groupBy: [],
    operator: '>',
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

export interface BuildLogQueryArgs {
  queryFilter: string
  index?: string
  window: string
  threshold: number
  rollup?: LogRollup
  measure?: string
  groupBy?: string[]
  operator?: LogOperator
}

// Facets do .by(): sem aspas/vírgula/espaço (quebrariam a string "a,b"),
// sem vazios, sem repetidos, no máximo MAX_LOG_GROUPS.
export function sanitizeLogGroupBy(groupBy: string[] | undefined): string[] {
  const out: string[] = []
  for (const g of groupBy || []) {
    const v = String(g).trim().replace(/[\s,"]+/g, '')
    if (v && !out.includes(v)) out.push(v)
  }
  return out.slice(0, MAX_LOG_GROUPS)
}

// Atributo do rollup ("@duration"): o validador exige o "@" na frente.
export function normalizeLogMeasure(measure: string | undefined): string {
  const v = String(measure || '').trim().replace(/[\s,"]+/g, '')
  return v ? (v.startsWith('@') ? v : `@${v}`) : ''
}

export function buildLogQuery({ queryFilter, index = DEFAULT_LOG_INDEX, window, threshold, rollup = 'count', measure, groupBy, operator = '>' }: BuildLogQueryArgs): string {
  const filter = escapeForLogsQuery((queryFilter || '').trim())
  const idx = escapeForLogsQuery((index || DEFAULT_LOG_INDEX).trim() || DEFAULT_LOG_INDEX)
  const rollupArgs = rollup === 'count' ? '"count"' : `"${rollup}", "${normalizeLogMeasure(measure)}"`
  const groups = sanitizeLogGroupBy(groupBy)
  const by = groups.length ? `.by("${groups.join(',')}")` : ''
  return `logs("${filter}").index("${idx}").rollup(${rollupArgs})${by}.last("${window}") ${operator} ${threshold}`
}

// v1 (só contagem, ">") — mantida como atalho/compatibilidade.
export function buildLogCountQuery(args: Pick<BuildLogQueryArgs, 'queryFilter' | 'index' | 'window' | 'threshold'>): string {
  return buildLogQuery({ ...args, rollup: 'count', operator: '>' })
}

// Replica source:<valor>/status:<valor> do FILTRO da regra como tags
// estáticas do monitor — só quando o valor é inequívoco. Pedido do usuário:
// poder filtrar monitores de log na tela "Manage Monitors" (tag:source:...)
// sem abrir cada um pra ler a query. Fica de fora de propósito, sem gerar
// tag nenhuma pra esse facet, quando o filtro:
//  - nega o valor (-status:info ou NOT status:info) — tagear "status:info"
//    diria o OPOSTO do que o monitor observa;
//  - usa wildcard (source:ng*) — "ng*" não é um valor real;
//  - agrupa/OR (source:(nginx OR apache)) — não é 1 valor único, tagear só
//    um dos dois seria incompleto. A regex abaixo já nem casa esse caso (o
//    valor depois de ":" não pode conter "(", então o grupo inteiro falha
//    silenciosamente em vez de capturar algo errado).
// Não tenta ser um parser completo de Log Search Syntax — na dúvida, pula.
const LOG_FILTER_TAG_RE = /(-|\bNOT\s+)?\b(source|status):(?:"([^"]*)"|([^\s()]+))/gi

export function tagsFromLogFilter(filter: string): string[] {
  const text = filter || ''
  const tags: string[] = []
  let m: RegExpExecArray | null
  LOG_FILTER_TAG_RE.lastIndex = 0
  while ((m = LOG_FILTER_TAG_RE.exec(text))) {
    if (m[1]) continue // negado — não replica
    const key = m[2].toLowerCase()
    const value = m[3] ?? m[4]
    if (!value || value.includes('*')) continue // wildcard — valor não é literal
    const tag = `${key}:${value}`
    if (!tags.includes(tag)) tags.push(tag)
  }
  return tags
}

export interface BuildLogMonitorArgs {
  label: string
  queryFilter: string
  index?: string
  window: string
  threshold: number
  warningThreshold?: number | null
  rollup?: LogRollup
  measure?: string
  groupBy?: string[]
  operator?: LogOperator
  enableLogsSample?: boolean
  message?: string
  tags?: string[]
  namePrefix?: string
  priority?: number | null
  notifyTarget?: string
  notifyNoData?: boolean
  renotifyInterval?: number
}

// Variável de template do grupo: tag simples => {{service.name}}; atributo
// (@...) => {{[@http.status_code].name}} (mesmo padrão dos monitores reais).
function groupVar(g: string): string {
  return g.startsWith('@') ? `{{[${g}].name}}` : `{{${g}.name}}`
}

// Mensagem padrão — muda com a agregação/agrupamento da regra.
export function defaultLogMessage({ rollup = 'count', measure, groupBy, operator = '>' }: Pick<BuildLogQueryArgs, 'rollup' | 'measure' | 'groupBy' | 'operator'> = { rollup: 'count' }): string {
  const groups = sanitizeLogGroupBy(groupBy)
  const what = rollup === 'count' ? '{{value}} log(s)' : `${rollup}(${normalizeLogMeasure(measure)}) = {{value}}`
  const limitWord = operator === '<' || operator === '<=' ? 'mínimo' : 'limite'
  const scope = groups.length ? ` em ${groups.map(groupVar).join(' / ')}` : ''
  const desc = rollup === 'count'
    ? 'contagem de logs que casam o filtro configurado'
    : `${rollup} do atributo ${normalizeLogMeasure(measure)} nos logs que casam o filtro configurado`
  return `{{#is_alert}}🔴 [Log Monitor] {{name}}${scope} — ${what} na janela (${limitWord}: {{threshold}}).{{/is_alert}}{{#is_warning}}⚠️ [Log Monitor] {{name}}${scope} — ${what} na janela (aviso: {{warn_threshold}}).{{/is_warning}}{{#is_alert_recovery}}✅ [Log Monitor] {{name}}${scope} — voltou ao normal.{{/is_alert_recovery}}{{#is_no_data}}⚪ [Log Monitor] {{name}}${scope} — sem dados recentes.{{/is_no_data}}

**O que monitora:** ${desc}, dentro da janela avaliada${groups.length ? `, separado por ${groups.join(', ')} (1 alerta por grupo)` : ''}.

**Ação recomendada:** abra a amostra de logs anexada à notificação (ou o Log Explorer com o mesmo filtro) para identificar a causa raiz antes de escalar.

@equipe-ops`
}

export function buildLogMonitorPayload({ label, queryFilter, index = DEFAULT_LOG_INDEX, window, threshold, warningThreshold, rollup = 'count', measure, groupBy, operator = '>', enableLogsSample = true, message, tags, namePrefix, priority, notifyTarget, notifyNoData, renotifyInterval }: BuildLogMonitorArgs): MonitorPayload & { options: MonitorPayload['options'] & { enable_logs_sample?: boolean } } {
  const name = `${(namePrefix || '[MonitorsCreator]').trim()} ${label}`.trim()
  const baseTags = ['created_by:monitorscreator', 'monitor_kind:log']
  // source:/status: do filtro, quando inequívocos — ver tagsFromLogFilter.
  for (const t of tagsFromLogFilter(queryFilter)) if (!baseTags.includes(t)) baseTags.push(t)
  for (const t of (tags || [])) if (t && !baseTags.includes(t)) baseTags.push(t)

  let resolvedMessage = message || defaultLogMessage({ rollup, measure, groupBy, operator })
  if (notifyTarget) resolvedMessage = resolvedMessage.replaceAll('@equipe-ops', notifyTarget)

  return {
    name,
    type: 'log alert',
    query: buildLogQuery({ queryFilter, index, window, threshold, rollup, measure, groupBy, operator }),
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
  // service/operation: mesmos nomes de campo genéricos que PlanItem/
  // InfraPlanItem usam (DiscoveryCreate.tsx e monitor-create-server.ts
  // exibem/repassam esses 2 campos sem saber se a origem é serviço, host ou
  // regra de log) — aqui "service" é o nome da regra e "operation" é a
  // janela avaliada, só pra manter essas telas genéricas funcionando sem
  // precisar de um 3º branch condicional nelas.
  service: string
  operation: string
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
      rollup: rule.rollup,
      measure: rule.measure,
      groupBy: rule.groupBy,
      operator: rule.operator,
      threshold: rule.threshold,
      warningThreshold: rule.warningThreshold,
      enableLogsSample: rule.enableLogsSample,
      message: messages[rule.id],
      tags, namePrefix,
      priority: rule.priority,
      notifyTarget, notifyNoData, renotifyInterval,
    })
    plan.push({ kind: 'log', label: rule.label, service: rule.label, operation: rule.window, name: payload.name, query: payload.query, message: payload.message, priority: rule.priority ?? null, payload })
  }
  return plan
}

// Problemas de uma regra que o Datadog recusaria (confirmado via /validate) —
// a UI mostra antes de avançar e a rota devolve 400 em vez de falhar no
// meio da criação. Lista vazia = regra ok.
export function validateLogRule(rule: Pick<LogMonitorRule, 'rollup' | 'measure' | 'groupBy' | 'operator' | 'threshold' | 'warningThreshold'>): string[] {
  const problems: string[] = []
  const rollup = rule.rollup || 'count'
  if (rollup !== 'count' && !normalizeLogMeasure(rule.measure)) problems.push('informe o atributo (ex.: @duration) para essa agregação')
  if ((rule.groupBy || []).filter(g => String(g).trim()).length > MAX_LOG_GROUPS) problems.push(`no máximo ${MAX_LOG_GROUPS} grupos em "agrupar por"`)
  if (rule.warningThreshold != null) {
    const below = (rule.operator || '>') === '<' || rule.operator === '<='
    if (!below && rule.warningThreshold >= rule.threshold) problems.push('o limite de aviso precisa ser MENOR que o crítico (operador ">"/">=")')
    if (below && rule.warningThreshold <= rule.threshold) problems.push('o limite de aviso precisa ser MAIOR que o crítico (operador "<"/"<=")')
  }
  return problems
}
