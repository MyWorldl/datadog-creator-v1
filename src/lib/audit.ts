// src/lib/audit.ts
//
// AuditMonitors: analisa o ambiente e identifica quais MÉTRICAS-CHAVE já têm
// monitor e quais estão SEM cobertura, cruzando um catálogo de métricas
// (Infra + APM + K8s/DBM, atrás de flag) com as queries dos monitores existentes.
//
// Detecção "por nome de métrica na query" (conforme combinado): um item do
// catálogo é considerado COBERTO se o nome da sua métrica aparece na query de
// pelo menos um monitor — o que também pega monitores criados fora do app.
//
// Nomes de métrica:
//  - Infra: Datadog Agent padrão (integração system) — espelham lib/infra.ts.
//    https://docs.datadoghq.com/integrations/system/
//  - APM: trace.<span>.hits, trace.<span>.errors e trace.<span>/.duration.
//    https://docs.datadoghq.com/tracing/metrics/metrics_namespace/
//  - K8s: kube-state-metrics/kubelet (kubernetes_state.*/kubernetes.*) — doc:
//    https://docs.datadoghq.com/containers/kubernetes/data_collected/
//  - DBM: NÃO são métricas do produto Database Monitoring em si (esse não
//    expõe métrica clássica alertável — a doc de setup não documenta nenhuma;
//    confirmado ao consultar docs.datadoghq.com/database_monitoring/setup_postgres/).
//    São as métricas das integrações PADRÃO de Postgres/MySQL (conexões,
//    replicação, deadlocks/slow queries) — o proxy alertável mais próximo de
//    "banco de dados saudável" disponível como monitor clássico. Docs:
//    https://docs.datadoghq.com/integrations/postgres/ e
//    https://docs.datadoghq.com/integrations/mysql/
//
// K8s e DBM ficam atrás da feature flag k8sDbmCoverage (lib/feature-flags.ts):
// diferente de Infra/APM, não há uma lista de "nós"/"bancos" descoberta pelo
// app (como hosts/serviços) pra fazer cobertura POR ENTIDADE — a cobertura
// aqui é binária, no nível do ambiente (existe ≥1 monitor com essa métrica?),
// por isso essas duas entram em coverageScoreWeighted como 0/100, não como
// % de entidades, e a UI (ferramentas/audit/page.tsx) mostra cards simples
// de ✓/✗ em vez da tabela por host/serviço.

import { initialInfraDiscovery, planInfraPreview, type InfraPlanItem } from './infra.ts'
import { buildMonitorPayload, DEFAULT_OPERATION, ALERT_BY_KEY, DEFAULT_GROUP_BY, type PlanItem } from './discovery.ts'

const any = (q: string, ...subs: string[]): boolean => subs.some(s => q.includes(s))

function escapeRegExp(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

// Casa "<tag>:<nome>" só quando <nome> termina ali (não é PREFIXO de um nome
// maior) — sem isso, host:web1 "casava" com uma query escopada em host:web10,
// e service:api casava com service:api-gateway (achado da auditoria: falso-
// positivo sistemático em nomenclatura numerada/hierárquica, comum em produção).
function tagMatches(query: string, tag: string, name: string): boolean {
  return new RegExp(`${tag}:${escapeRegExp(name)}(?![\\w-])`).test(query)
}

export type AuditGroup = 'Infra' | 'APM' | 'K8s' | 'DBM'

export interface AuditCatalogItem {
  key: string
  group: AuditGroup
  label: string
  infraKind?: string | null
  apm?: string | null
  detect: (query: string) => boolean
}

export const AUDIT_CATALOG: AuditCatalogItem[] = [
  // ── Infra (host) — infraKind liga na sugestão via lib/infra.ts ──
  { key: 'cpu', group: 'Infra', label: 'CPU', infraKind: 'cpu', detect: q => any(q, 'system.cpu.idle', 'system.cpu.user', 'system.cpu.system') },
  { key: 'memory', group: 'Infra', label: 'Memória', infraKind: 'memory', detect: q => any(q, 'system.mem.pct_usable', 'system.mem.usable', 'system.mem.used') },
  { key: 'disk', group: 'Infra', label: 'Disco (espaço)', infraKind: 'disk', detect: q => any(q, 'system.disk.in_use', 'system.disk.used') },
  { key: 'diskIO', group: 'Infra', label: 'Disco I/O (saturação)', infraKind: 'diskIO', detect: q => q.includes('system.io.util') },
  { key: 'network', group: 'Infra', label: 'Rede (erros)', infraKind: 'network', detect: q => any(q, 'system.net.packets_in.error', 'system.net.packets_out.error') },
  { key: 'load', group: 'Infra', label: 'Load', infraKind: 'load', detect: q => any(q, 'system.load.norm.5', 'system.load.1', 'system.load.5', 'system.load.15') },
  { key: 'hostUp', group: 'Infra', label: 'Agent Down', infraKind: 'hostUp', detect: q => q.includes('datadog.agent.up') },
  // Abaixo: causas clássicas de incidente que o catálogo não cobria (achado
  // da auditoria). infraKind:null de propósito — o MonitorsCreator ainda não
  // tem um tipo de monitor pronto pra essas métricas, então elas entram na
  // detecção/cobertura (cards, tabela por host) mas NÃO na leva de "monitores
  // sugeridos" (buildSuggestedInfra já ignora infraKind falsy). Nomes de
  // métrica confirmados em https://docs.datadoghq.com/integrations/disk/,
  // https://docs.datadoghq.com/integrations/network/ e no histórico do
  // Agent (system.swap.pct_free) — não em https://docs.datadoghq.com/integrations/system/,
  // que não lista os subchecks disk/network/swap em detalhe.
  { key: 'diskLatency', group: 'Infra', label: 'Disco (latência I/O)', infraKind: null, detect: q => any(q, 'system.disk.read_time', 'system.disk.write_time') },
  { key: 'networkThroughput', group: 'Infra', label: 'Rede (throughput)', infraKind: null, detect: q => any(q, 'system.net.bytes_rcvd', 'system.net.bytes_sent') },
  { key: 'swap', group: 'Infra', label: 'Swap', infraKind: null, detect: q => any(q, 'system.swap.used', 'system.swap.pct_free', 'system.swap.free') },
  { key: 'inodes', group: 'Infra', label: 'Inodes / File Descriptors', infraKind: null, detect: q => any(q, 'system.fs.inodes.free', 'system.fs.inodes.in_use', 'system.fs.inodes.used') },
  // ── APM (serviço) — apm liga no tipo de alerta do discovery.ts ──
  { key: 'apmLatency', group: 'APM', label: 'Latência (APM)', apm: 'latency', detect: q => q.includes('trace.') && (/p\d\d:trace\./.test(q) || q.includes('.duration') || (q.includes('avg:trace.') && !q.includes('.hits') && !q.includes('.errors'))) },
  { key: 'apmErrors', group: 'APM', label: 'Erros (APM)', apm: 'errorRate', detect: q => q.includes('trace.') && q.includes('.errors') },
  // !q.includes('.errors'): a query de errorRate é uma RAZÃO (errors/hits) —
  // contém '.hits' no denominador por construção. Sem essa exclusão, todo
  // monitor de Taxa de Erro era contado (errado) como cobertura de Throughput
  // também, inflando o score de APM e fazendo buildSuggestedApm nunca sugerir
  // o monitor de volume que realmente falta (achado da auditoria).
  { key: 'apmHits', group: 'APM', label: 'Throughput (APM)', apm: 'highVolume', detect: q => q.includes('trace.') && q.includes('.hits') && !q.includes('.errors') },
  // ── Kubernetes (kube-state-metrics/kubelet) — atrás da flag k8sDbmCoverage ──
  { key: 'k8sPodRestarts', group: 'K8s', label: 'Restart de Pods', detect: q => any(q, 'kubernetes_state.container.restarts', 'kubernetes.containers.restarts') },
  { key: 'k8sNodeReady', group: 'K8s', label: 'Node Ready (condição)', detect: q => any(q, 'kubernetes_state.node.by_condition', 'kubernetes_state.node.status') },
  { key: 'k8sPodScheduling', group: 'K8s', label: 'Pods pendentes/sem agendamento', detect: q => any(q, 'kubernetes_state.pod.status_phase', 'kubernetes_state.pod.unschedulable') },
  // ── Database Monitoring (integrações padrão Postgres/MySQL — ver nota no
  // topo do arquivo sobre por que não são métricas do produto DBM em si) ──
  // atrás da flag k8sDbmCoverage.
  { key: 'dbConnections', group: 'DBM', label: 'Conexões / pool', detect: q => any(q, 'postgresql.percent_usage_connections', 'mysql.performance.threads_connected', 'mysql.net.max_connections_available') },
  { key: 'dbReplication', group: 'DBM', label: 'Replicação (lag)', detect: q => any(q, 'postgresql.replication_delay', 'mysql.replication.seconds_behind_master', 'mysql.replication.seconds_behind_source') },
  { key: 'dbQueryHealth', group: 'DBM', label: 'Deadlocks / slow queries', detect: q => any(q, 'postgresql.deadlocks', 'mysql.performance.slow_queries', 'mysql.innodb.deadlocks') },
]

export interface DatadogMonitor {
  query?: string
  [key: string]: unknown
}

export interface CoverageItem {
  key: string
  group: AuditGroup
  label: string
  covered: boolean
  monitorCount: number
  infraKind: string | null
  apm: string | null
}

// Cruza o catálogo com as queries dos monitores. Retorna cobertura por item.
export function analyzeCoverage(monitors: DatadogMonitor[]): CoverageItem[] {
  const queries = (monitors || []).map(m => String(m?.query || ''))
  return AUDIT_CATALOG.map(c => {
    let monitorCount = 0
    for (const q of queries) { try { if (c.detect(q)) monitorCount++ } catch { /* query estranha: ignora */ } }
    return { key: c.key, group: c.group, label: c.label, covered: monitorCount > 0, monitorCount, infraKind: c.infraKind || null, apm: c.apm || null }
  })
}

// Score BINÁRIO (legado) = % de itens do catálogo com pelo menos um monitor.
// Problema: trata "existe ≥1 monitor no ambiente" como 100% do item, mesmo que
// só cubra 53% dos hosts. Mantido apenas para referência/compat — o score
// exibido no anel passou a ser coverageScoreWeighted (abaixo).
export function coverageScore(coverage: CoverageItem[]): number {
  if (!coverage.length) return 0
  return Math.round((coverage.filter(c => c.covered).length / coverage.length) * 100)
}

// Score REAL de cobertura = média simples dos percentuais reais por métrica.
// Cada item do catálogo contribui com sua cobertura efetiva por entidade
// (hostCoverage p/ Infra, serviceCoverage p/ APM), via coveragePercent — a
// MESMA fonte dos cards individuais. Assim o anel reflete o que os cards já
// mostram (ex.: CPU 53%, Rede 0%) em vez de "existe ≥1 monitor = 100%".
//
// Média SIMPLES por métrica (não ponderada por nº de entidades): cada uma das
// N métricas do catálogo pesa igual, batendo com a leitura dos cards. Métricas
// sem entidades (percent null — ex.: nenhum host) ficam de fora da média.
// envCoverage (K8s/DBM) é opcional e só deve ser passado quando a flag
// k8sDbmCoverage estiver ligada (ver audit-monitors/route.ts) — sem lista de
// nós/bancos descoberta pelo app, não há "% de entidades" pra esses grupos,
// então cada item entra como binário (covered ? 100 : 0), igual ao score
// legado (coverageScore) fazia pra tudo antes desse refino.
export function coverageScoreWeighted(hostCoverage: HostCoverageRow[], serviceCoverage: ServiceCoverageRow[], envCoverage?: CoverageItem[]): number {
  const percents: number[] = []
  for (const c of INFRA_CATALOG) {
    const { percent } = coveragePercent(hostCoverage, c.key)
    if (percent != null) percents.push(percent)
  }
  for (const c of APM_CATALOG) {
    const { percent } = coveragePercent(serviceCoverage, c.key)
    if (percent != null) percents.push(percent)
  }
  for (const c of (envCoverage || [])) percents.push(c.covered ? 100 : 0)
  if (!percents.length) return 0
  return Math.round(percents.reduce((a, b) => a + b, 0) / percents.length)
}

// ── Cobertura POR HOST das métricas de Infra (Feature: granularidade por host) ──
// Heurística de escopo (detecção por texto da query):
//  - monitor "amplo": referencia a métrica E tem {*}  -> cobre TODOS os hosts.
//  - monitor específico: referencia a métrica E contém host:<nome> -> cobre aquele host.
// host X coberto para a métrica M = existe monitor amplo em M OU específico de X em M.
// Monitores escopados por outras tags (ex.: env:prod) NÃO contam, para evitar
// falsa cobertura — é conservador (pode marcar lacuna a mais, nunca a menos).
export const INFRA_CATALOG = AUDIT_CATALOG.filter(c => c.group === 'Infra')
export const APM_CATALOG = AUDIT_CATALOG.filter(c => c.group === 'APM')
// K8s/DBM: cobertura binária de ambiente (ver comentário em coverageScoreWeighted),
// não por host/serviço — por isso não têm um analyzeXCoverage próprio.
export const K8S_CATALOG = AUDIT_CATALOG.filter(c => c.group === 'K8s')
export const DBM_CATALOG = AUDIT_CATALOG.filter(c => c.group === 'DBM')

export interface HostCoverageRow {
  host: string
  metrics: Record<string, boolean>
  gapCount: number
}

export function analyzeHostCoverage(monitors: DatadogMonitor[], hostNames: string[]): HostCoverageRow[] {
  const queries = (monitors || []).map(m => String(m?.query || ''))
  const broad: Record<string, boolean> = {}
  const specific: Record<string, Set<string>> = {}
  for (const c of INFRA_CATALOG) {
    // '{*}' cobre monitores de MÉTRICA amplos; '.over("*")' é a sintaxe
    // equivalente pra monitores de SERVICE CHECK (ex.: hostUp/Agent Down criado
    // manualmente fora do app — o app nunca gera essa sintaxe sozinho, sempre
    // usa .over("host:X") por host) — sem isso, um Agent Down amplo feito na
    // mão nunca era reconhecido como cobertura, gerando lacuna sugerida à toa.
    broad[c.key] = queries.some(q => { try { return c.detect(q) && (q.includes('{*}') || q.includes('.over("*")')) } catch { return false } })
    const set = new Set<string>()
    for (const q of queries) {
      try {
        if (!c.detect(q)) continue
        for (const h of (hostNames || [])) if (tagMatches(q, 'host', h)) set.add(h)
      } catch { /* query estranha: ignora */ }
    }
    specific[c.key] = set
  }
  return (hostNames || []).map(host => {
    const metrics: Record<string, boolean> = {}
    let gapCount = 0
    for (const c of INFRA_CATALOG) {
      const covered = broad[c.key] || specific[c.key].has(host)
      metrics[c.key] = covered
      if (!covered) gapCount++
    }
    return { host, metrics, gapCount }
  })
}

export interface ServiceCoverageRow {
  service: string
  metrics: Record<string, boolean>
  gapCount: number
}

// ── Cobertura POR SERVIÇO das métricas de APM (mesma heurística acima, agora
// pra service:<nome> em vez de host:<nome>) ──
// LIMITAÇÃO CONHECIDA E DELIBERADA: um monitor de NAMESPACE (scopeType:
// 'namespace' em discovery.ts) escopa a query por kube_namespace:X, nunca por
// service:Y — mesmo cobrindo Y na prática via `by {service}`, esta função não
// reconhece isso e marca Y como lacuna. Mitigar exigiria mapear
// serviço->namespace (custo de N chamadas extras, mesmo problema de custo já
// documentado em NAMESPACE_PROBE_OPERATIONS, discovery.ts) — mantido como
// limitação documentada, mesma filosofia conservadora de analyzeHostCoverage:
// pode marcar lacuna a mais, nunca a menos.
export function analyzeServiceCoverage(monitors: DatadogMonitor[], serviceNames: string[]): ServiceCoverageRow[] {
  const queries = (monitors || []).map(m => String(m?.query || ''))
  const broad: Record<string, boolean> = {}
  const specific: Record<string, Set<string>> = {}
  for (const c of APM_CATALOG) {
    broad[c.key] = queries.some(q => { try { return c.detect(q) && q.includes('{*}') } catch { return false } })
    const set = new Set<string>()
    for (const q of queries) {
      try {
        if (!c.detect(q)) continue
        for (const svc of (serviceNames || [])) if (tagMatches(q, 'service', svc)) set.add(svc)
      } catch { /* query estranha: ignora */ }
    }
    specific[c.key] = set
  }
  return (serviceNames || []).map(service => {
    const metrics: Record<string, boolean> = {}
    let gapCount = 0
    for (const c of APM_CATALOG) {
      const covered = broad[c.key] || specific[c.key].has(service)
      metrics[c.key] = covered
      if (!covered) gapCount++
    }
    return { service, metrics, gapCount }
  })
}

export interface CoveragePercentResult {
  coveredCount: number
  totalCount: number
  percent: number | null
}

// % de entidades cobertas para 1 item do catálogo, a partir da matriz
// por-entidade (hostCoverage p/ Infra, serviceCoverage p/ APM — mesmo shape
// {metrics:{<key>:bool}}). Fonte única pros cards (refino: % real em vez de
// "existe ≥1 monitor no ambiente = 100%") e pra qualquer outro uso futuro.
export function coveragePercent(entityRows: (HostCoverageRow | ServiceCoverageRow)[], key: string): CoveragePercentResult {
  const rows = entityRows || []
  const totalCount = rows.length
  if (totalCount === 0) return { coveredCount: 0, totalCount: 0, percent: null }
  const coveredCount = rows.filter(r => r.metrics[key]).length
  return { coveredCount, totalCount, percent: Math.round((coveredCount / totalCount) * 100) }
}

export type PercentBand = 'red' | 'yellow' | 'green' | null

// Faixa de cor a partir do %, faixas de negócio (não CSS — page.js mapeia
// band -> var(--css)): <=40 vermelho, 40-75 amarelo, >=75 verde. Escolhidas
// pra bater com a UI já existente, não derivadas de nenhuma análise
// estatística — por isso são assimétricas (40/35/25 pontos por faixa),
// diferente da escala de 5 níveis iguais (20 em 20) que o ScopeMaturity usa
// (scope-maturity/route.ts, bandLevel) pro score de MATURIDADE. As duas
// ferramentas medem coisas diferentes (cobertura factual vs. maturidade
// composta de várias dimensões) e cada banding foi calibrado pra sua própria
// leitura visual — divergem de propósito, não por descuido (achado da auditoria).
export function percentBand(percent: number | null): PercentBand {
  if (percent == null) return null
  if (percent <= 40) return 'red'
  if (percent < 75) return 'yellow'
  return 'green'
}

export interface SuggestedInfraResult {
  plan: InfraPlanItem[]
  hostCount: number
  monitorCount: number
}

// Monta a lista de monitores de Infra sugeridos pras lacunas, host por host —
// só as métricas REALMENTE faltantes daquele host entram (hosts 100%
// cobertos não geram nenhum item). Reaproveita planInfraPreview (já com
// queryWindow/evaluationDelay corretos) — só orquestra por host.
export function buildSuggestedInfra(hostCoverage: HostCoverageRow[]): SuggestedInfraResult {
  const base = initialInfraDiscovery()
  let plan: InfraPlanItem[] = []
  let hostCount = 0
  for (const hc of (hostCoverage || [])) {
    const gapKinds = INFRA_CATALOG.filter(c => c.infraKind && !hc.metrics[c.key]).map(c => c.infraKind as string)
    if (!gapKinds.length) continue
    hostCount++
    const d = {
      ...base,
      selected: { [hc.host]: true },
      metrics: Object.fromEntries(Object.entries(base.metrics).map(([k, v]) => [k, { ...v, enabled: gapKinds.includes(k) }])),
    }
    plan = plan.concat(planInfraPreview(d))
  }
  return { plan, hostCount, monitorCount: plan.length }
}

export interface SuggestedApmResult {
  plan: PlanItem[]
  serviceCount: number
  monitorCount: number
  operationNote: string
}

// Monta a lista de monitores de APM sugeridos pras lacunas, serviço por
// serviço — só os tipos REALMENTE faltantes daquele serviço entram. Não passa
// por planPreview()/initialDiscovery() (que assumem os MESMOS tipos
// habilitados pra todos os serviços selecionados num único objeto — não dá
// pra expressar "serviço A só falta errorRate, serviço B falta 2 tipos"
// nisso); chama buildMonitorPayload diretamente por (serviço × tipo-em-gap).
// Usa DEFAULT_OPERATION (sem descoberta real de operations — custaria 1
// chamada extra por serviço em gap) — ver operationNote pra avisar na UI.
export function buildSuggestedApm(serviceCoverage: ServiceCoverageRow[]): SuggestedApmResult {
  const plan: PlanItem[] = []
  let serviceCount = 0
  for (const sc of (serviceCoverage || [])) {
    const gapTypes = APM_CATALOG.filter(c => c.apm && !sc.metrics[c.key]).map(c => c.apm as string)
    if (!gapTypes.length) continue
    serviceCount++
    for (const kind of gapTypes) {
      // buildMonitorPayload não tem defaults por TIPO (isso normalmente vem de
      // planPreview, via cfg.algorithm || a.algorithm etc.) — como aqui não
      // passamos por planPreview, os defaults de ALERT_BY_KEY[kind] precisam
      // ser passados explicitamente, senão cai nos defaults genéricos de
      // buildAnomalyQuery (agile/daily/last_4h), errados pro tipo.
      const a = ALERT_BY_KEY[kind]
      const payload = buildMonitorPayload({
        kind, service: sc.service, operation: DEFAULT_OPERATION, groupBy: DEFAULT_GROUP_BY,
        deviations: a.def, direction: a.direction, algorithm: a.algorithm,
        seasonality: a.seasonality, alertWindow: a.alertWindow, queryWindow: a.queryWindow,
        priority: 3, // mesmo default P3 usado em initialDiscovery()
      })
      plan.push({ kind, label: a.label, service: sc.service, operation: DEFAULT_OPERATION, name: payload.name, query: payload.query, message: payload.message, priority: 3, payload })
    }
  }
  return {
    plan,
    serviceCount,
    monitorCount: plan.length,
    operationNote: `Operation usada: ${DEFAULT_OPERATION} (padrão) — para escolher outra, use o MonitorsCreator.`,
  }
}
