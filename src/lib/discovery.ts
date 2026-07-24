// src/lib/discovery.ts
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

export type AlertDirection = 'above' | 'below' | 'both'
export type AlertKey = 'latency' | 'errorRate' | 'highVolume' | 'lowVolume'
export type ScopeType = 'service' | 'namespace'

export interface AlertWindowOption {
  value: string
  label: string
}

// Opções do seletor "Alert window" — usadas tanto no fluxo de serviços
// quanto no de infra. O `value` é o formato que o Datadog espera
// (trigger_window/alert_window); o `label` é só o texto exibido, sem o
// prefixo "last_" (que ficava parecendo um sublinhado colado ao número).
export const ALERT_WINDOW_OPTIONS: AlertWindowOption[] = [
  { value: 'last_5m', label: '5m' },
  { value: 'last_10m', label: '10m' },
  { value: 'last_15m', label: '15m' },
  { value: 'last_30m', label: '30m' },
  { value: 'last_1h', label: '1h' },
]

export interface AlertType {
  key: AlertKey
  label: string
  direction: AlertDirection
  def: number
  algorithm: string
  seasonality: string
  alertWindow: string
  queryWindow: string
  hint: string
  message: string
}

export const ALERT_TYPES: AlertType[] = [
  {
    key: 'latency', label: 'Latência (p95)', direction: 'above', def: 2,
    algorithm: 'robust', seasonality: 'weekly', alertWindow: 'last_15m', queryWindow: 'last_1h',
    hint: 'Anomalia na latência p95 (desvio do padrão histórico).',
    message: `🔴 [Anomalia · Latência] {{service.name}} — p95 fora do padrão histórico (atual: {{value}}).

**O que monitora:** compara a latência p95 das requisições do serviço com o padrão histórico via detecção de anomalia, em vez de um limite fixo.

**Por que importa:** o p95 captura a experiência da cauda de usuários mais afetados sem ser distorcido por outliers extremos (p99) nem mascarado por médias (p50) — costuma ser um dos primeiros sinais de degradação antes do problema se generalizar.

**Causas prováveis:**
- Degradação de dependência externa (banco de dados, API terceira, cache)
- Aumento de carga acima da capacidade normal do serviço
- Deploy recente introduzindo regressão de performance
- Contenção de recursos (CPU, I/O, conexões de pool)
- Aumento de complexidade nas requisições recebidas (ex.: payloads maiores)

**Ação recomendada:** correlacionar o horário do desvio com deploys recentes, checar a saúde das dependências diretas (banco, cache, filas), analisar traces distribuídos para localizar a etapa concentrando a latência, e avaliar rollback caso associado a uma release.

@equipe-ops`,
  },
  {
    key: 'errorRate', label: 'Taxa de Erro', direction: 'above', def: 2,
    algorithm: 'robust', seasonality: 'weekly', alertWindow: 'last_5m', queryWindow: 'last_30m',
    hint: 'Anomalia na taxa de erros (erros/requisições).',
    message: `🔴 [Anomalia · Taxa de Erro] {{service.name}} — erros fora do padrão (atual: {{value}}%).

**O que monitora:** compara a taxa de erros (respostas 5xx ou exceções tratadas) do serviço com o padrão histórico, sinalizando desvios significativos.

**Por que importa:** aumento na taxa de erro impacta diretamente a experiência do usuário e pode indicar desde bug em deploy até falha de dependência crítica — um dos indicadores mais diretos de indisponibilidade parcial ou total.

**Causas prováveis:**
- Deploy recente com bug ou regressão
- Falha ou indisponibilidade de dependência downstream (banco, API, fila)
- Dados de entrada inválidos ou inesperados de um cliente/integração
- Esgotamento de recursos (conexões, memória, threads) causando exceções
- Mudança de configuração ou variável de ambiente incorreta

**Ação recomendada:** verificar logs de erro para identificar tipo e mensagem predominante, checar se coincide com deploy/mudança de configuração recente, validar a saúde das dependências e avaliar rollback ou hotfix conforme a causa.

@equipe-ops`,
  },
  {
    key: 'highVolume', label: 'Alto volume de requisições', direction: 'above', def: 2,
    algorithm: 'agile', seasonality: 'weekly', alertWindow: 'last_15m', queryWindow: 'last_1h',
    hint: 'Anomalia de pico: requisições acima do padrão histórico.',
    message: `⚠️ [Anomalia · Alto volume] {{service.name}} — requisições acima do padrão (atual: {{value}}). Possível pico.

**O que monitora:** compara o volume atual de requisições com o padrão histórico esperado para o horário/dia, sinalizando tráfego significativamente acima do normal.

**Por que importa:** picos podem ser sinal de sucesso (campanha, evento) mas também comportamento anômalo — retry storms, bots, scraping ou ataque (DDoS) — que pode saturar recursos e degradar outros monitores (CPU, latência, erro).

**Causas prováveis:**
- Campanha de marketing, lançamento de produto ou evento sazonal
- Retry storm causado por falha em cliente ou serviço consumidor
- Bot, scraper ou tráfego automatizado não identificado
- Possível ataque de negação de serviço (DDoS)
- Migração ou redirecionamento de tráfego de outro serviço/região

**Ação recomendada:** verificar a origem do tráfego (IPs, user-agents, regiões), confirmar causa legítima conhecida, monitorar de perto CPU/latência/erro do serviço e, se necessário, ativar rate limiting ou escalonamento adicional.

@equipe-ops`,
  },
  {
    key: 'lowVolume', label: 'Baixo volume de requisições', direction: 'below', def: 2,
    algorithm: 'agile', seasonality: 'weekly', alertWindow: 'last_15m', queryWindow: 'last_1h',
    hint: 'Anomalia de queda: requisições abaixo do padrão histórico.',
    message: `⚠️ [Anomalia · Baixo volume] {{service.name}} — requisições abaixo do padrão (atual: {{value}}). Possível queda/serviço mudo.

**O que monitora:** compara o volume atual de requisições com o padrão histórico esperado, sinalizando tráfego significativamente abaixo do normal.

**Por que importa:** queda de volume costuma ser subestimada, mas pode indicar serviço inacessível para os clientes (mesmo sem erros explícitos), falha em integração upstream, problema de DNS/roteamento, ou que o serviço parou de ser acionado por quem o consome.

**Causas prováveis:**
- Falha em serviço upstream que deveria estar enviando requisições
- Problema de DNS, roteamento ou balanceador de carga impedindo tráfego
- Indisponibilidade parcial não capturada por outros monitores de erro
- Mudança de comportamento em cliente/integração (ex.: feature desativada)
- Sazonalidade real não refletida corretamente no baseline histórico

**Ação recomendada:** verificar se o serviço está de fato acessível (health check externo), checar a saúde de serviços upstream, revisar DNS/roteamento e validar se o baseline histórico está calibrado para o dia/horário.

@equipe-ops`,
  },
]

export const ALERT_BY_KEY: Record<string, AlertType> = Object.fromEntries(ALERT_TYPES.map(a => [a.key, a]))
export const DEFAULT_GROUP_BY = ['service', 'resource_name']

// Preferência de operation "primária" (entradas web primeiro) — usada tanto
// para sugerir a operation dominante no modo Serviço (descoberta automática)
// quanto como sugestão/fallback no modo Namespace (entrada manual).
export const OPERATION_PREFERENCE = ['http.request', 'web.request', 'servlet.request', 'grpc.request', 'rack.request', 'express.request']
export const DEFAULT_OPERATION = OPERATION_PREFERENCE[0]
export function pickPrimaryOperation(ops: string[]): string {
  for (const p of OPERATION_PREFERENCE) if (ops.includes(p)) return p
  return ops[0] || DEFAULT_OPERATION
}

// Operações de ENTRADA (root spans) mais comuns entre frameworks/protocolos —
// usadas como sondas pra enumerar, via Metrics Query API, quais namespaces e
// serviços têm tráfego (não confundir com OPERATION_PREFERENCE acima: aqui o
// objetivo é COBERTURA — incluir kafka/grpc/etc. — não preferência de uma
// operação primária). A tag kube_namespace não é propagada com a mesma
// cobertura que service nas métricas de trace (confirmado em smoke-test:
// filtrar direto por kube_namespace:<ns> perdia a maioria das operations) —
// por isso namespace-operations/route.js primeiro descobre os SERVIÇOS do
// namespace usando essas sondas, depois busca operations por serviço.
export const NAMESPACE_PROBE_OPERATIONS = [
  'http.request', 'servlet.request', 'grpc.server', 'rack.request',
  'express.request', 'aspnet_core.request', 'kafka.consume',
  'spring.handler', 'netty.request',
]

export interface AlertConfig {
  enabled: boolean
  deviations: number
  direction: AlertDirection
  algorithm: string
  seasonality: string
  alertWindow: string
  // Não definido por initialDiscovery() (cada ALERT_TYPES já tem seu próprio
  // default) — mas a UI de personalização permite sobrescrever por tipo.
  queryWindow?: string
  priority: number | null
}

export interface SelectedMeta {
  opsCount?: number
  operations?: string[]
  chosen?: string[]
  operation?: string
}

export interface DiscoveryState {
  env: string
  services: string[]
  selected: Record<string, SelectedMeta>
  scopeType: ScopeType
  alerts: Record<string, AlertConfig>
  groupBy: string[]
  messages: Record<string, string>
  namePrefix: string
  tags: string[]
  notifyTarget: string
  notifyNoData: boolean
  renotifyInterval: number
}

export function initialDiscovery(): DiscoveryState {
  return {
    env: '',
    services: [],   // nomes descobertos
    selected: {},   // { nome: { opsCount, operations:[], chosen:[] } } — nome é serviço ou namespace, conforme scopeType
    scopeType: 'service', // 'service' | 'namespace' — escopo do filtro na query/tags
    alerts: Object.fromEntries(
      ALERT_TYPES.map(a => [a.key, {
        enabled: a.key === 'latency' || a.key === 'errorRate',
        deviations: a.def,
        direction: a.direction,
        algorithm: a.algorithm,
        seasonality: a.seasonality,
        alertWindow: a.alertWindow,
        priority: 3, // 1-5 (P1-P5) ou null = sem prioridade — campo nativo do Datadog. Default P3.
      }])
    ),
    groupBy: [...DEFAULT_GROUP_BY],
    messages: Object.fromEntries(ALERT_TYPES.map(a => [a.key, a.message])),
    // Personalização (Etapas 3)
    namePrefix: '[MonitorsCreator]',
    tags: [],
    // '' = mantém o @equipe-ops de cada template; preenchido, substitui esse
    // mention em TODOS os monitores do plano (roteamento de notificação sem
    // precisar editar mensagem por mensagem — ver buildMonitorPayload).
    notifyTarget: '',
    // Ambos abaixo preservam o comportamento de sempre por padrão (false/0).
    // notify_no_data=false é intencional pra monitores de SERVIÇO (ausência de
    // dado pode só significar baixo tráfego, não incidente — diferente de
    // infra, onde host sem dado já É o incidente); exposto pra quem quiser
    // ligar em alertas de criticidade alta. renotify_interval=0 nunca reforça
    // a notificação; um valor em minutos reforça enquanto o monitor
    // permanecer em alerta — útil pra P1/P2.
    notifyNoData: false,
    renotifyInterval: 0,
    // queryWindow não é mais global aqui — cada ALERT_TYPES já tem seu próprio
    // default (~5x o alertWindow do tipo, recomendação do Datadog pra janela
    // externa do avg() em anomalies()), usado em planPreview via
    // cfg.queryWindow || a.queryWindow.
  }
}

// ── Construção de query/payload (fonte única) ──
function scopeOf(scopeType: ScopeType, value: string, env?: string): string {
  const tag = scopeType === 'namespace' ? 'kube_namespace' : 'service'
  const parts = [`${tag}:${value}`]
  if (env && env !== '*') parts.push(`env:${env}`)
  return parts.join(',')
}
function byClauseOf(groupBy?: string[]): string {
  const g = (groupBy || []).filter(Boolean)
  return g.length ? ` by {${g.join(',')}}` : ''
}
function metricExpr(kind: string, op: string, sc: string, by: string): string {
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

export interface BuildAnomalyQueryArgs {
  kind: string
  service: string
  env?: string
  operation?: string
  scopeType?: ScopeType
  deviations: number
  groupBy?: string[]
  direction?: AlertDirection
  algorithm?: string
  seasonality?: string
  queryWindow?: string
  alertWindow?: string
}

export function buildAnomalyQuery({ kind, service, env, operation, scopeType = 'service', deviations, groupBy, direction, algorithm = 'agile', seasonality = 'daily', queryWindow = 'last_4h', alertWindow = 'last_15m' }: BuildAnomalyQueryArgs): string {
  const sc = scopeOf(scopeType, service, env)
  const by = byClauseOf(groupBy)
  const op = operation || DEFAULT_OPERATION
  const dir = direction || ALERT_BY_KEY[kind]?.direction || 'above'
  // seasonality só se aplica a algoritmos != basic
  const seas = algorithm !== 'basic' ? `, seasonality='${seasonality}'` : ''
  const m = metricExpr(kind, op, sc, by)
  return (
    `avg(${queryWindow}):anomalies(${m}, '${algorithm}', ${deviations}, ` +
    `direction='${dir}', alert_window='${alertWindow}', interval=60, ` +
    `count_default_zero='true'${seas}) >= 1`
  )
}

export interface BuildMonitorPayloadArgs {
  kind: string
  service: string
  env?: string
  operation?: string
  scopeType?: ScopeType
  deviations: number
  direction?: AlertDirection
  groupBy?: string[]
  message?: string
  tags?: string[]
  namePrefix?: string
  algorithm?: string
  seasonality?: string
  queryWindow?: string
  alertWindow?: string
  priority?: number | null
  notifyTarget?: string
  notifyNoData?: boolean
  renotifyInterval?: number
}

export interface MonitorPayload {
  name: string
  type: string
  query: string
  message: string
  tags: string[]
  priority?: number
  options: {
    threshold_windows: { trigger_window: string; recovery_window: string }
    thresholds: { critical: number }
    notify_no_data: boolean
    notify_audit: boolean
    require_full_window: boolean
    renotify_interval: number
    evaluation_delay: number
  }
}

export function buildMonitorPayload({ kind, service, env, operation, scopeType = 'service', deviations, direction, groupBy, message, tags, namePrefix, algorithm, seasonality, queryWindow, alertWindow, priority, notifyTarget, notifyNoData, renotifyInterval }: BuildMonitorPayloadArgs): MonitorPayload {
  const label = ALERT_BY_KEY[kind]?.label || kind
  const name = `${(namePrefix || '[MonitorsCreator]').trim()} ${service} · ${label}`.trim()
  const scopeTag = scopeType === 'namespace' ? 'kube_namespace' : 'service'
  const op = operation || DEFAULT_OPERATION
  const baseTags = ['created_by:monitorscreator', `${scopeTag}:${service}`, `operation:${op}`]
  if (env && env !== '*') baseTags.push(`env:${env}`)
  for (const t of (tags || [])) if (t && !baseTags.includes(t)) baseTags.push(t)

  let resolvedMessage = message || ALERT_BY_KEY[kind]?.message || ''
  // Roteamento de notificação: '' preserva o @equipe-ops do template; um
  // valor troca o mention em QUALQUER mensagem (padrão ou já editada pelo
  // usuário) sem precisar reescrever mensagem por mensagem.
  if (notifyTarget) resolvedMessage = resolvedMessage.replaceAll('@equipe-ops', notifyTarget)

  return {
    name,
    type: 'query alert',
    query: buildAnomalyQuery({ kind, service, env, operation: op, scopeType, deviations, direction, groupBy, algorithm, seasonality, queryWindow, alertWindow }),
    message: resolvedMessage,
    tags: baseTags,
    // priority é campo de TOPO no monitor (não dentro de options) — P1 a P5,
    // omitido quando não definido (o Datadog trata ausência como "sem prioridade").
    ...(priority ? { priority } : {}),
    options: {
      // Anomaly detection: a chave é trigger_window (não alert_window) e ela
      // DEVE ser igual ao alert_window usado na query. Doc:
      // https://docs.datadoghq.com/monitors/types/anomaly/
      threshold_windows: {
        trigger_window: alertWindow || 'last_15m',
        recovery_window: alertWindow || 'last_15m',
      },
      thresholds: { critical: 1.0 },
      // Ambos configuráveis (default preserva o comportamento de sempre) —
      // ver o comentário em initialDiscovery() sobre o porquê de cada default.
      notify_no_data: !!notifyNoData,
      notify_audit: false,
      require_full_window: false,
      renotify_interval: Number(renotifyInterval) || 0,
      // interval=60 na query (rollup de 60s) — doc do Datadog recomenda
      // evaluation_delay >= esse rollup, pra evitar falso alarme por dado
      // ainda incompleto no momento em que o monitor é avaliado.
      evaluation_delay: 60,
    },
  }
}

export interface PlanItem {
  kind: string
  label: string
  service: string
  operation: string
  name: string
  query: string
  message: string
  priority: number | null
  payload: MonitorPayload
}

// Expande o estado de descoberta em uma lista de monitores previstos.
// Um monitor por (serviço × operação escolhida × tipo habilitado).
export function planPreview(discovery: Partial<DiscoveryState>): PlanItem[] {
  const d = discovery || {}
  const { selected = {}, env = '', groupBy = [], alerts = {}, messages = {},
    namePrefix = '[MonitorsCreator]', tags = [],
    scopeType = 'service', notifyTarget = '', notifyNoData = false, renotifyInterval = 0 } = d

  const plan: PlanItem[] = []
  for (const [service, meta] of Object.entries(selected)) {
    const ops = (meta?.chosen && meta.chosen.length) ? meta.chosen : (meta?.operation ? [meta.operation] : [])
    for (const operation of ops) {
      for (const a of ALERT_TYPES) {
        const cfg = alerts[a.key]
        if (!cfg?.enabled) continue
        const payload = buildMonitorPayload({
          kind: a.key, service, env, operation, scopeType,
          deviations: cfg.deviations, direction: cfg.direction, groupBy,
          message: messages[a.key], tags, namePrefix,
          // Parâmetros de anomalia POR TIPO (com fallback para o default do tipo)
          algorithm: cfg.algorithm || a.algorithm,
          seasonality: cfg.seasonality || a.seasonality,
          alertWindow: cfg.alertWindow || a.alertWindow,
          queryWindow: cfg.queryWindow || a.queryWindow,
          priority: cfg.priority,
          notifyTarget, notifyNoData, renotifyInterval,
        })
        plan.push({ kind: a.key, label: a.label, service, operation, name: payload.name, query: payload.query, message: payload.message, priority: cfg.priority ?? null, payload })
      }
    }
  }
  return plan
}
