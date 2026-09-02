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

import type { FeatureFlag } from './feature-flags'

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

// `def` (por tipo) é o `deviations` default — vira o parâmetro "bounds" de
// anomalies() em buildAnomalyQuery(), a LARGURA (em desvios-padrão) da banda
// considerada normal. Quanto MENOR, mais estreita a banda e mais sensível o
// monitor (mais pontos viram anomalia) — o rótulo "Anomalies" na UI
// (DiscoveryConfigure.tsx) é enganoso nesse sentido, não é uma contagem de
// quantas anomalias disparam o alerta (isso é o `>= 1` fixo no fim da query:
// 1 único ponto anômalo na alert_window já dispara). Latência subiu de 2
// para 4 e Alto/Baixo volume de 2 para 3 (pedido do usuário: 2 estava
// disparando com picos/quedas pontuais demais) — Taxa de Erro ficou em 2 de
// propósito (é o tipo com maior custo de falso negativo, mantido sensível).
export const ALERT_TYPES: AlertType[] = [
  {
    key: 'latency', label: 'Latência (p95)', direction: 'above', def: 4,
    algorithm: 'robust', seasonality: 'weekly', alertWindow: 'last_15m', queryWindow: 'last_75m',
    hint: 'Anomalia na latência p95 (desvio do padrão histórico).',
    message: `{{#is_alert}}🔴 [Anomalia · Latência] {{service.name}} — p95 fora do padrão histórico (atual: {{value}}).{{/is_alert}}{{#is_alert_recovery}}✅ [Anomalia · Latência] {{service.name}} — p95 voltou ao padrão histórico (atual: {{value}}).{{/is_alert_recovery}}{{#is_no_data}}⚪ [Anomalia · Latência] {{service.name}} — sem dados recentes.{{/is_no_data}}

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
    algorithm: 'robust', seasonality: 'weekly', alertWindow: 'last_5m', queryWindow: 'last_25m',
    hint: 'Anomalia na taxa de erros (erros/requisições).',
    message: `{{#is_alert}}🔴 [Anomalia · Taxa de Erro] {{service.name}} — erros fora do padrão (atual: {{value}}%).{{/is_alert}}{{#is_alert_recovery}}✅ [Anomalia · Taxa de Erro] {{service.name}} — taxa de erro voltou ao padrão (atual: {{value}}%).{{/is_alert_recovery}}{{#is_no_data}}⚪ [Anomalia · Taxa de Erro] {{service.name}} — sem dados recentes.{{/is_no_data}}

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
    key: 'highVolume', label: 'Alto volume de requisições', direction: 'above', def: 3,
    algorithm: 'agile', seasonality: 'weekly', alertWindow: 'last_15m', queryWindow: 'last_75m',
    hint: 'Anomalia de pico: requisições acima do padrão histórico.',
    message: `{{#is_alert}}⚠️ [Anomalia · Alto volume] {{service.name}} — requisições acima do padrão (atual: {{value}}). Possível pico.{{/is_alert}}{{#is_alert_recovery}}✅ [Anomalia · Alto volume] {{service.name}} — volume de requisições voltou ao padrão (atual: {{value}}).{{/is_alert_recovery}}{{#is_no_data}}⚪ [Anomalia · Alto volume] {{service.name}} — sem dados recentes.{{/is_no_data}}

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
    key: 'lowVolume', label: 'Baixo volume de requisições', direction: 'below', def: 3,
    algorithm: 'agile', seasonality: 'weekly', alertWindow: 'last_15m', queryWindow: 'last_75m',
    hint: 'Anomalia de queda: requisições abaixo do padrão histórico.',
    message: `{{#is_alert}}⚠️ [Anomalia · Baixo volume] {{service.name}} — requisições abaixo do padrão (atual: {{value}}). Possível queda/serviço mudo.{{/is_alert}}{{#is_alert_recovery}}✅ [Anomalia · Baixo volume] {{service.name}} — volume de requisições voltou ao padrão (atual: {{value}}).{{/is_alert_recovery}}{{#is_no_data}}⚪ [Anomalia · Baixo volume] {{service.name}} — sem dados recentes.{{/is_no_data}}

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

// Pod Restarts (K8s) — FORA de ALERT_TYPES de propósito: os 4 tipos acima são
// TODOS baseados em trace (metricExpr por operação APM); Pod Restarts é uma
// métrica de infra do Kubernetes (kubernetes.containers.restarts), sem
// conceito de "operation" — 1 monitor por NAMESPACE selecionado (não por
// namespace × operação). Por isso entra num loop à parte em planPreview,
// mesmo padrão do outlier em planInfraPreview (lib/infra.ts). Só faz sentido
// com scopeType:'namespace' (não há tag de pod/container agregável por
// "service" sozinho) e fica atrás da flag k8sDbmCoverage.
//
// A métrica kubernetes.containers.restarts é CUMULATIVA (contador que só
// cresce) — por isso a query usa change() em vez de um threshold cru: um
// threshold direto no valor absoluto nunca "resetaria" e o monitor ficaria
// preso em alerta. Sintaxe confirmada no exemplo oficial do Datadog Operator
// (github.com/DataDog/datadog-operator, metric-monitor-pods-restarting.yaml):
// change(sum(last_5m),last_5m):exclude_null(avg:kubernetes.containers.restarts{*} by {pod_name}) > 5
export interface PodRestartsType {
  key: 'podRestarts'
  label: string
  hint: string
  message: string
  defThreshold: number
  defChangeWindow: string
  flag: FeatureFlag
}

export const POD_RESTARTS_TYPE: PodRestartsType = {
  key: 'podRestarts',
  label: 'K8s · Restart de Pods',
  defThreshold: 5,
  defChangeWindow: 'last_5m',
  flag: 'k8sDbmCoverage',
  hint: 'Alerta quando o nº de restarts de containers no namespace cresce mais que o limite dentro da janela (usa change(), não valor absoluto — o contador é cumulativo).',
  message: `{{#is_alert}}🔴 [K8s · Restart de Pods] {{pod_name.name}} — {{value}} restart(s) a mais na janela (limite: {{threshold}}).{{/is_alert}}{{#is_alert_recovery}}✅ [K8s · Restart de Pods] {{pod_name.name}} — restarts voltaram ao normal na janela.{{/is_alert_recovery}}{{#is_no_data}}⚪ [K8s · Restart de Pods] {{pod_name.name}} — sem dados recentes.{{/is_no_data}}

**O que monitora:** o aumento (delta) no número de restarts de containers dentro do namespace, na janela avaliada — não o total acumulado, e sim quanto ele CRESCEU no período.

**Por que importa:** restarts frequentes geralmente indicam CrashLoopBackOff, OOMKilled ou falha de liveness probe — o pod fica instável, perde estado em memória e pode causar erros intermitentes ou indisponibilidade parcial mesmo que o serviço "volte" a cada restart.

**Causas prováveis:**
- Exceção não tratada causando crash da aplicação (CrashLoopBackOff)
- Container sendo morto por estourar o limite de memória (OOMKilled)
- Liveness/readiness probe mal configurado, matando pods saudáveis
- Deploy recente com bug introduzido
- Dependência externa indisponível na inicialização (banco, config, secret)

**Ação recomendada:** verificar \`kubectl describe pod\` e os logs do container anterior (\`kubectl logs --previous\`) para a causa do crash, checar se há OOMKilled nos eventos do pod, e revisar se o deploy mais recente introduziu a instabilidade.

@equipe-ops`,
}

export interface PodRestartsConfig {
  enabled: boolean
  threshold: number
  changeWindow: string
  priority: number | null
}

// Pod Pending — assim como Pod Restarts, fora de ALERT_TYPES (não é trace,
// não tem operation). Mas diferente de Pod Restarts, NÃO tem entidade
// nenhuma: é 1 monitor ÚNICO e GLOBAL pro cluster inteiro (kubernetes_state.
// pod.status_phase{phase:pending} by {kube_namespace} só serve pra permitir
// triagem por namespace DENTRO do mesmo monitor, não pra selecionar quais
// namespaces entram). Por isso planPreview() gera no máximo 1 item pra esse
// kind, independente de `selected`/scopeType — mesmo espírito do monitor de
// consumo anômalo do FinOps (finops/monitor/route.ts), só que modelado aqui
// dentro do plano (não como rota própria) pra reaproveitar Personalizar/
// Revisar/Criar do wizard sem duplicar lógica.
export interface PodPendingType {
  key: 'podPending'
  label: string
  hint: string
  message: string
  defThreshold: number
  defWindow: string
  flag: FeatureFlag
}

export const POD_PENDING_TYPE: PodPendingType = {
  key: 'podPending',
  label: 'K8s · Pods pendentes',
  defThreshold: 0,
  defWindow: 'last_10m',
  flag: 'k8sDbmCoverage',
  hint: 'Monitor único e global (não por namespace/serviço selecionado): alerta quando há pods presos em "Pending" (aceitos mas não agendados) em qualquer namespace do cluster.',
  message: `{{#is_alert}}🔴 [K8s · Pods pendentes] {{kube_namespace.name}} — {{value}} pod(s) pendente(s) (limite: {{threshold}}).{{/is_alert}}{{#is_alert_recovery}}✅ [K8s · Pods pendentes] {{kube_namespace.name}} — não há mais pods pendentes acima do limite.{{/is_alert_recovery}}{{#is_no_data}}⚪ [K8s · Pods pendentes] {{kube_namespace.name}} — sem dados recentes.{{/is_no_data}}

**O que monitora:** quantidade de pods no cluster no estado "Pending" (aceitos pelo control plane mas ainda não agendados/rodando em nenhum node), por namespace.

**Por que importa:** um pod preso em Pending geralmente significa que o cluster não consegue agendá-lo — falta de capacidade, afinidade/taint impossível de satisfazer, ou volume que não monta — e isso atrasa deploys, autoscaling e recuperação de pods que crasharam (ficam sem substituto rodando).

**Causas prováveis:**
- Capacidade insuficiente no cluster (CPU/memória) para os requests do pod
- Node affinity, anti-affinity ou taint/toleration impossível de satisfazer
- PersistentVolumeClaim pendente (nenhum volume disponível pra montar)
- Autoscaler ainda provisionando novo node (transitório) ou autoscaler travado
- Falta de imagem (ImagePullBackOff represado como Pending no scheduler)

**Ação recomendada:** verificar "kubectl describe pod" no namespace afetado pelo evento de scheduling (FailedScheduling), conferir capacidade disponível no cluster/node pool, e checar se o autoscaler está ativo e conseguindo provisionar novos nodes.

@equipe-ops`,
}

export interface PodPendingConfig {
  enabled: boolean
  threshold: number
  window: string
  priority: number | null
}

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
// por isso namespace-operations/route.ts primeiro descobre os SERVIÇOS do
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
  opsCount?: number | null
  operations?: string[]
  chosen?: string[]
  operation?: string
  // Não usado por planPreview — guardado aqui pela UI (DiscoveryConfigure)
  // pra mostrar o erro de "identificar operações" por entidade selecionada.
  error?: string | null
}

export interface DiscoveryState {
  env: string
  services: string[]
  selected: Record<string, SelectedMeta>
  scopeType: ScopeType
  alerts: Record<string, AlertConfig>
  podRestarts: PodRestartsConfig
  podPending: PodPendingConfig
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
    podRestarts: {
      enabled: false, // atrás da flag k8sDbmCoverage + só faz sentido com scopeType:'namespace'
      threshold: POD_RESTARTS_TYPE.defThreshold,
      changeWindow: POD_RESTARTS_TYPE.defChangeWindow,
      priority: 3,
    },
    podPending: {
      enabled: false, // atrás da flag k8sDbmCoverage — global, não depende de `selected`
      threshold: POD_PENDING_TYPE.defThreshold,
      window: POD_PENDING_TYPE.defWindow,
      priority: 3,
    },
    groupBy: [...DEFAULT_GROUP_BY],
    messages: Object.fromEntries([...ALERT_TYPES.map(a => [a.key, a.message]), [POD_RESTARTS_TYPE.key, POD_RESTARTS_TYPE.message], [POD_PENDING_TYPE.key, POD_PENDING_TYPE.message]]),
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
    // default, exatamente 5x o alertWindow do tipo ("Datadog recommends the
    // query_window to be around five times the alert_window" —
    // docs.datadoghq.com/monitors/types/anomaly/). Achado da auditoria: a
    // nota anterior assumia que a Datadog só aceitava um conjunto fechado de
    // janelas — não é verdade, a doc de configuração de monitor confirma um
    // campo "custom" aceitando qualquer duração (ver mesma nota em infra.ts).
    // Usado em planPreview via cfg.queryWindow || a.queryWindow.
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
      // Razão errors/hits: em janelas sem tráfego (hits=0) o resultado é
      // indefinido (0/0). Não há função Datadog documentada pra dar um piso
      // seguro no denominador (checado: não existe clamp_min/equivalente em
      // dashboards/functions/arithmetic/) — o mecanismo esperado pra esse
      // caso é count_default_zero='true', já ligado no anomalies() abaixo,
      // que é a forma documentada do Datadog de tratar um ponto sem valor
      // válido como 0 em vez de pulá-lo (achado da auditoria: sem essa nota,
      // parecia um gap não tratado).
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
    // threshold_windows é documentado como exclusivo/obrigatório de monitores
    // de anomaly detection (trigger_window precisa bater com o alert_window
    // da query) — por isso é opcional aqui: só buildMonitorPayload (sempre
    // anomaly) o inclui; buildPodRestartsMonitorPayload (change()) e
    // buildPodPendingMonitorPayload (threshold) não, mesmo padrão já usado em
    // lib/infra.ts (só inclui quando mode==='anomaly'). Achado da auditoria —
    // ver https://docs.datadoghq.com/monitors/guide/anomaly-monitor/
    threshold_windows?: { trigger_window: string; recovery_window: string }
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
      // true: doc recomenda false só pra métricas ESPARSAS (achado da
      // auditoria) — serviços com operação selecionada têm tráfego regular,
      // não é o caso de gap esperado que a recomendação de false cobre.
      require_full_window: true,
      renotify_interval: Number(renotifyInterval) || 0,
      // interval=60 na query (rollup de 60s) — doc do Datadog recomenda
      // evaluation_delay >= esse rollup, pra evitar falso alarme por dado
      // ainda incompleto no momento em que o monitor é avaliado.
      evaluation_delay: 60,
    },
  }
}

// ── Pod Restarts (K8s, namespace-only, sem operation) ──
export function buildPodRestartsQuery({ namespace, changeWindow = POD_RESTARTS_TYPE.defChangeWindow, threshold = POD_RESTARTS_TYPE.defThreshold }: { namespace: string; changeWindow?: string; threshold?: number }): string {
  // Escopo só por kube_namespace (sem env:) — kubernetes.containers.restarts
  // não tem cobertura confiável de unified service tagging (tag `env`), então
  // filtrar por env aqui arriscaria "sem dados" em ambientes sem essa tag.
  return `change(sum(${changeWindow}),${changeWindow}):exclude_null(avg:kubernetes.containers.restarts{kube_namespace:${namespace}} by {pod_name}) > ${threshold}`
}

export interface BuildPodRestartsMonitorArgs {
  namespace: string
  threshold?: number
  changeWindow?: string
  message?: string
  tags?: string[]
  namePrefix?: string
  priority?: number | null
  notifyTarget?: string
  notifyNoData?: boolean
  renotifyInterval?: number
}

export function buildPodRestartsMonitorPayload({ namespace, threshold = POD_RESTARTS_TYPE.defThreshold, changeWindow = POD_RESTARTS_TYPE.defChangeWindow, message, tags, namePrefix, priority, notifyTarget, notifyNoData, renotifyInterval }: BuildPodRestartsMonitorArgs): MonitorPayload {
  const name = `${(namePrefix || '[MonitorsCreator]').trim()} ${namespace} · ${POD_RESTARTS_TYPE.label}`.trim()
  const baseTags = ['created_by:monitorscreator', `kube_namespace:${namespace}`, 'infra_metric:podRestarts']
  for (const t of (tags || [])) if (t && !baseTags.includes(t)) baseTags.push(t)

  let resolvedMessage = message || POD_RESTARTS_TYPE.message
  if (notifyTarget) resolvedMessage = resolvedMessage.replaceAll('@equipe-ops', notifyTarget)

  return {
    name,
    type: 'query alert',
    query: buildPodRestartsQuery({ namespace, changeWindow, threshold }),
    message: resolvedMessage,
    tags: baseTags,
    ...(priority ? { priority } : {}),
    options: {
      // threshold_windows omitido de propósito: change() não é anomaly, e a
      // doc documenta esse campo como exclusivo/obrigatório só pra anomaly
      // (achado da auditoria — ver comentário em MonitorPayload acima).
      // critical PRECISA bater com o valor usado no `> ${threshold}` da query
      // (mesma regra do modo threshold em lib/infra.ts).
      thresholds: { critical: threshold },
      notify_no_data: !!notifyNoData,
      notify_audit: false,
      require_full_window: true, // doc recomenda false só pra métricas esparsas — ver comentário em buildMonitorPayload
      renotify_interval: Number(renotifyInterval) || 0,
      evaluation_delay: 60,
    },
  }
}

// ── Pod Pending (K8s, GLOBAL — sem entidade, sem operation) ──
// Query confirmada via WebSearch (docs/exemplos oficiais do Datadog):
//   min(last_10m):default_zero(max:kubernetes_state.pod.status_phase{phase:pending} by {kube_namespace}) > 0
export function buildPodPendingQuery({ window = POD_PENDING_TYPE.defWindow, threshold = POD_PENDING_TYPE.defThreshold }: { window?: string; threshold?: number } = {}): string {
  return `min(${window}):default_zero(max:kubernetes_state.pod.status_phase{phase:pending} by {kube_namespace}) > ${threshold}`
}

export interface BuildPodPendingMonitorArgs {
  threshold?: number
  window?: string
  message?: string
  tags?: string[]
  namePrefix?: string
  priority?: number | null
  notifyTarget?: string
  notifyNoData?: boolean
  renotifyInterval?: number
}

export function buildPodPendingMonitorPayload({ threshold = POD_PENDING_TYPE.defThreshold, window = POD_PENDING_TYPE.defWindow, message, tags, namePrefix, priority, notifyTarget, notifyNoData, renotifyInterval }: BuildPodPendingMonitorArgs = {}): MonitorPayload {
  const name = `${(namePrefix || '[MonitorsCreator]').trim()} ${POD_PENDING_TYPE.label}`.trim()
  const baseTags = ['created_by:monitorscreator', 'infra_metric:podPending']
  for (const t of (tags || [])) if (t && !baseTags.includes(t)) baseTags.push(t)

  let resolvedMessage = message || POD_PENDING_TYPE.message
  if (notifyTarget) resolvedMessage = resolvedMessage.replaceAll('@equipe-ops', notifyTarget)

  return {
    name,
    type: 'query alert',
    query: buildPodPendingQuery({ window, threshold }),
    message: resolvedMessage,
    tags: baseTags,
    ...(priority ? { priority } : {}),
    options: {
      // threshold_windows omitido de propósito — mesmo motivo do Pod Restarts
      // acima (não é anomaly, doc documenta o campo como exclusivo dela).
      thresholds: { critical: threshold },
      notify_no_data: !!notifyNoData,
      notify_audit: false,
      require_full_window: true, // doc recomenda false só pra métricas esparsas — ver comentário em buildMonitorPayload
      renotify_interval: Number(renotifyInterval) || 0,
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
    scopeType = 'service', notifyTarget = '', notifyNoData = false, renotifyInterval = 0,
    podRestarts, podPending } = d

  const plan: PlanItem[] = []

  // Pod Pending: GLOBAL — no máximo 1 item, independente de `selected` e de
  // scopeType (não tem entidade pra selecionar). Roda antes de tudo.
  if (podPending?.enabled) {
    const payload = buildPodPendingMonitorPayload({
      threshold: podPending.threshold, window: podPending.window,
      message: messages[POD_PENDING_TYPE.key], tags, namePrefix,
      priority: podPending.priority, notifyTarget, notifyNoData, renotifyInterval,
    })
    plan.push({
      kind: POD_PENDING_TYPE.key, label: POD_PENDING_TYPE.label, service: 'cluster', operation: POD_PENDING_TYPE.label,
      name: payload.name, query: payload.query, message: payload.message, priority: podPending.priority ?? null, payload,
    })
  }

  // Pod Restarts: 1 monitor por NAMESPACE selecionado (não por operação) —
  // roda antes e fora do loop de operação abaixo, mesmo padrão do outlier em
  // planInfraPreview (lib/infra.ts). Só existe em scopeType:'namespace'.
  if (scopeType === 'namespace' && podRestarts?.enabled) {
    for (const namespace of Object.keys(selected)) {
      const payload = buildPodRestartsMonitorPayload({
        namespace, threshold: podRestarts.threshold, changeWindow: podRestarts.changeWindow,
        message: messages[POD_RESTARTS_TYPE.key], tags, namePrefix,
        priority: podRestarts.priority, notifyTarget, notifyNoData, renotifyInterval,
      })
      plan.push({
        kind: POD_RESTARTS_TYPE.key, label: POD_RESTARTS_TYPE.label, service: namespace, operation: POD_RESTARTS_TYPE.label,
        name: payload.name, query: payload.query, message: payload.message, priority: podRestarts.priority ?? null, payload,
      })
    }
  }

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
