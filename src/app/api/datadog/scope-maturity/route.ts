// src/app/api/datadog/scope-maturity/route.ts
//
// Calcula um score de maturidade (0-100) do ambiente Datadog a partir de
// dados coletados NO SERVIDOR (via chaves da sessão) — sem chamadas do
// browser, o que evita o erro de CORS ("Failed to fetch").
//
// Cada dimensão é calculada de forma defensiva: se a chamada à API falhar,
// a dimensão fica "não avaliada" (measured=false) e NÃO entra na média,
// para não distorcer o score. Algumas dimensões dependem de dados de logs/
// histórico que não são obtidos aqui e ficam marcadas como não avaliadas.

import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom, ddGet, logsCount, sloBudget, alertEvents, listMonitors, queryMetric } from '@/lib/datadog-server'
import { analyzeHostCoverage, INFRA_CATALOG, type DatadogMonitor } from '@/lib/audit'
import { cacheKey, cacheGet, cacheSet } from '@/lib/route-cache'
import { recordScore, computeDelta } from '@/lib/score-history'

// Tags reservadas do Unified Service Tagging da Datadog: env, service, version
// (version habilita deployment tracking). `team` NÃO é tag reservada — vira um
// KPI próprio de ownership. https://docs.datadoghq.com/getting_started/tagging/unified_service_tagging/
const REQUIRED_TAGS = ['env', 'service', 'version']
const CACHE_TTL_MS = 2 * 60 * 1000 // 2 min — suficiente pra absorver refreshes/múltiplos usuários

function pct(n: number, d: number): number { return d > 0 ? Math.round((n / d) * 100) : 0 }
function clamp(n: number): number { return Math.max(0, Math.min(100, Math.round(n))) }

interface HostRaw {
  host_name?: string
  name?: string
  sources?: string[]
  tags_by_source?: Record<string, string[]>
}

interface DimensionEntry {
  key: string
  label: string
  measured: boolean
  score: number | null
  detail: string
}

interface ApmServicesResponse {
  data?: { id?: string; attributes?: { services?: string[] } }[] | { attributes?: { services?: string[] } }
}

export async function GET(): Promise<Response> {
  const user = await getServerUser()
  if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 })

  const { apiKey, appKey, site } = await readSessionKeys()
  if (!apiKey || !appKey || !site) {
    return Response.json({ error: 'Sessão sem credenciais do Datadog. Conecte-se primeiro.' }, { status: 412 })
  }
  const ctx = ctxFrom({ apiKey, appKey, site })

  // Cache curto: essa rota faz ~14 chamadas ao Datadog por carregamento.
  // Evita refazer tudo em refreshes seguidos ou várias pessoas na mesma conta.
  const key = cacheKey(['scope-maturity', site, apiKey, appKey])
  const cached = await cacheGet(key)
  if (cached) return Response.json({ ...cached, cached: true })

  // Coletas (em paralelo)
  const [monitorsR, hostsR, totalsR, apmR, dashR, sloR, awsR, gcpR, azureR] = await Promise.all([
    listMonitors(ctx),
    ddGet<{ host_list?: HostRaw[] }>(ctx, '/api/v1/hosts?count=1000'),
    ddGet<{ total_active?: number; total_up?: number }>(ctx, '/api/v1/hosts/totals'),
    ddGet<ApmServicesResponse>(ctx, '/api/v2/apm/services?filter[env]=*'),
    ddGet<{ dashboards?: unknown[] }>(ctx, '/api/v1/dashboard'),
    ddGet<{ data?: unknown[] }>(ctx, '/api/v1/slo?limit=1000'),
    ddGet<unknown[]>(ctx, '/api/v1/integration/aws'),
    ddGet<unknown[]>(ctx, '/api/v1/integration/gcp'),
    ddGet<unknown[]>(ctx, '/api/v1/integration/azure'),
  ])

  // Se nem os monitores nem os hosts vierem, provavelmente é auth/site.
  if (!monitorsR.ok && !hostsR.ok) {
    return Response.json(
      { error: `Não foi possível coletar dados do Datadog (${monitorsR.status || monitorsR.error || 's/status'}). Verifique as permissões da App key e o site.` },
      { status: 502 }
    )
  }

  const monitors = (Array.isArray(monitorsR.json) ? monitorsR.json : []) as DatadogMonitor[]
  const hosts = hostsR.json?.host_list || []
  const hostNames = hosts.map(h => h.host_name || h.name).filter(Boolean) as string[]
  const totals = totalsR.json || {}
  const apmServices = (() => {
    const data = apmR.json?.data
    if (Array.isArray(data)) return data.map(d => d?.attributes?.services || d?.id).flat().filter(Boolean) as string[]
    if (data?.attributes?.services) return data.attributes.services
    return [] as string[]
  })()
  const servicesCount = new Set(apmServices).size
  const dashboards = dashR.json?.dashboards || []
  const slos = sloR.json?.data || []

  // Helpers de tags
  const hostTags = (h: HostRaw): string[] => Object.values(h.tags_by_source || {}).flat()
  const hasTagKey = (tags: string[], key: string): boolean => (tags || []).some(t => t.startsWith(key + ':'))

  const dims: DimensionEntry[] = []
  const add = (key: string, label: string, measured: boolean, score: number, detail: string): number =>
    dims.push({ key, label, measured, score: measured ? clamp(score) : null, detail })

  // Coletas adicionais (logs, SLO history, eventos) para evoluir os N/D.
  const toMs = Date.now(), fromMs = toMs - 24 * 3600 * 1000
  const [logsTotal, logsTrace, logsWithSvc, budget, ev] = await Promise.all([
    logsCount(ctx, '*', fromMs, toMs),
    logsCount(ctx, '@dd.trace_id:*', fromMs, toMs),
    logsCount(ctx, 'service:*', fromMs, toMs),
    sloBudget(ctx),
    alertEvents(ctx, 7),
  ])

  // 1. Unified Service Tagging (hosts com env/service/version) — as 3 tags
  // reservadas da Datadog. Detalhe por tag, com destaque do gargalo.
  if (hostsR.ok && hosts.length) {
    const per = REQUIRED_TAGS.map(k => ({ tag: k, pct: pct(hosts.filter(h => hasTagKey(hostTags(h), k)).length, hosts.length) }))
    const avg = per.reduce((a, b) => a + b.pct, 0) / per.length
    const worst = per.reduce((a, b) => b.pct < a.pct ? b : a, per[0])
    const breakdown = per.map(p => `${p.tag} ${p.pct}%`).join(', ')
    add('tagCompliance', 'Unified Service Tagging', true, avg,
      `Infra (${hosts.length} hosts) com as tags reservadas env/service/version: ${breakdown}. Gargalo: "${worst.tag}" (${worst.pct}%). version é o que costuma faltar e habilita deployment tracking.`)
  } else add('tagCompliance', 'Unified Service Tagging', false, 0, 'Sem dados de hosts (requer leitura de infraestrutura).')

  // 1b. Ownership (hosts com tag team) — team não é tag reservada do unified
  // tagging, mas é a chave de governança para roteamento e responsabilidade.
  if (hostsR.ok && hosts.length) {
    const withTeam = hosts.filter(h => hasTagKey(hostTags(h), 'team')).length
    add('ownership', 'Ownership (tag team)', true, pct(withTeam, hosts.length),
      `${withTeam} de ${hosts.length} hosts com tag team (dono definido). Datadog: team habilita rotear alertas e atribuir responsabilidade por recurso.`)
  } else add('ownership', 'Ownership (tag team)', false, 0, 'Sem dados de hosts.')

  // 2. Hosts Monitorados = COBERTURA REAL de monitores-chave de infra por host
  // (reaproveita a matriz por-host do AuditMonitors), não apenas liveness — um
  // host "no ar" sem nenhum monitor não deveria contar como monitorado.
  if (monitorsR.ok && hostNames.length) {
    const nInfra = INFRA_CATALOG.length || 1
    const hostCov = analyzeHostCoverage(monitors, hostNames)
    const avgCov = hostCov.reduce((a, h) => a + (nInfra - h.gapCount) / nInfra, 0) / hostCov.length * 100
    const full = hostCov.filter(h => h.gapCount === 0).length
    add('hostsMonitorados', 'Hosts Monitorados', true, avgCov,
      `Cobertura média de ${avgCov.toFixed(0)}% dos ${nInfra} monitores-chave de infra por host (${full} de ${hostCov.length} hosts totalmente cobertos). Detalhe por host no AuditMonitors.`)
  } else if (totalsR.ok && (totals.total_active || totals.total_up)) {
    add('hostsMonitorados', 'Hosts Monitorados', true, pct(totals.total_up || 0, totals.total_active || totals.total_up || 1), `Sem monitores para cruzar — fallback de liveness: ${totals.total_up || 0} de ${totals.total_active || 0} hosts reportando.`)
  } else add('hostsMonitorados', 'Hosts Monitorados', false, 0, 'Sem dados de hosts/monitores.')

  // 3. Aplicações com APM = % dos serviços CONHECIDOS que têm APM. O universo
  // de serviços é a união de (serviços com APM) ∪ (tag service:<x> nos hosts) —
  // serviços que a infra conhece mas não emitem traces contam como lacuna.
  // Ratio de cobertura escala com o ambiente (o antigo limiar fixo "≥6 = 100"
  // dava nota máxima tanto para 6 serviços quanto para 6 de 309).
  if (apmR.ok) {
    const apmSet = new Set(apmServices)
    const svcFromHosts = new Set<string>()
    for (const h of hosts) for (const t of hostTags(h)) if (t.startsWith('service:')) svcFromHosts.add(t.slice('service:'.length))
    const universe = new Set([...apmSet, ...svcFromHosts])
    const apmScore = universe.size ? pct(apmSet.size, universe.size) : (apmSet.size > 0 ? 100 : 0)
    add('apm', 'Aplicações com APM', true, apmScore,
      `${apmSet.size} de ${universe.size || apmSet.size} serviços conhecidos com APM (universo = serviços com APM ∪ tag service em hosts). Instrumente os serviços sem traces para subir.`)
  } else add('apm', 'Aplicações com APM', false, 0, 'apm_read indisponível na App key.')

  // 4. Logs Correlacionados — requer análise de logs (não coletado aqui)
  // 4. Logs Correlacionados (com trace_id) — via Logs Analytics
  if (logsTotal != null && logsTotal > 0 && logsTrace != null) {
    add('logsCorrelated', 'Logs Correlacionados', true, (logsTrace / logsTotal) * 100, `${logsTrace} de ${logsTotal} logs (24h) com @dd.trace_id (correlação APM).`)
  } else if (logsTotal === 0) {
    add('logsCorrelated', 'Logs Correlacionados', false, 0, 'Nenhum log no período (24h).')
  } else {
    add('logsCorrelated', 'Logs Correlacionados', false, 0, 'Requer Logs Analytics (logs_read).')
  }

  // 5. Monitores roteados = têm destino de notificação. Datadog define alerta
  // acionável pelo ROTEAMENTO (o @handle no message que notifica um time/canal),
  // não por quem criou — por isso creator.email NÃO conta mais (todo monitor tem
  // criador, o que inflava o KPI). Vale @notificação no aviso ou tag team/owner.
  if (monitorsR.ok && monitors.length) {
    const NOTIFY_RE = /@[\w.-]+/ // @slack-…, @pagerduty-…, @team-…, @user@dominio
    const routed = monitors.filter(m => NOTIFY_RE.test(String(m.message || '')) || ((m.tags as string[]) || []).some(t => t.startsWith('team:') || t.startsWith('owner:'))).length
    add('monitorsOwner', 'Monitores roteados (dono/notificação)', true, pct(routed, monitors.length), `${routed} de ${monitors.length} monitores roteiam para um dono (@notificação no aviso ou tag team/owner). creator não conta — o que importa é o alerta chegar a quem age.`)
  } else add('monitorsOwner', 'Monitores roteados (dono/notificação)', false, 0, 'Sem dados de monitores.')

  // 6. Dashboards por Serviço — densidade dashboards/serviços. É um PROXY: a
  // API de resumo não associa dashboard→serviço sem inspecionar cada um (custo
  // de N chamadas), então medimos densidade, não cobertura real por serviço.
  if (dashR.ok && apmR.ok && servicesCount > 0) {
    add('dashPerService', 'Dashboards por Serviço', true, pct(dashboards.length, servicesCount), `${dashboards.length} dashboards para ${servicesCount} serviços (densidade — proxy; cobertura real por serviço exigiria inspecionar cada dashboard).`)
  } else add('dashPerService', 'Dashboards por Serviço', false, 0, 'Requer dashboards e serviços APM.')

  // 7. Serviços com SLO — a Datadog recomenda SLO nos serviços CRÍTICOS/
  // jornadas de usuário, não em todos (https://www.datadoghq.com/blog/establishing-service-level-objectives/),
  // mas o corte de "~20%" abaixo é HEURÍSTICA DESTE APP, não um número
  // documentado pela Datadog — satura em 20% pra não punir injustamente
  // ambientes com centenas de serviços (o antigo /todos-os-serviços fazia
  // isso). Deixe isso claro no texto exibido, pra não soar como benchmark oficial.
  if (sloR.ok && apmR.ok && servicesCount > 0) {
    const sloScore = slos.length === 0 ? 0 : Math.min(100, (slos.length / servicesCount) * 100 * 5)
    add('servicesSLO', 'Serviços com SLO', true, sloScore, `${slos.length} SLO(s) para ${servicesCount} serviços. Heurística deste app (não um número oficial da Datadog): cobrir ~20% dos serviços já pontua cheio, partindo da recomendação de focar SLO nos serviços críticos, não em todos.`)
  } else if (sloR.ok) {
    add('servicesSLO', 'Serviços com SLO', true, slos.length > 0 ? 60 : 0, `${slos.length} SLO(s) configurado(s).`)
  } else add('servicesSLO', 'Serviços com SLO', false, 0, 'Sem dados de SLO.')

  // 8. Cloud Integrations — maturidade aqui é "a cloud que você USA está bem
  // integrada", não "quantos provedores". O antigo ×40 travava single-cloud em
  // 40 para sempre. Agora ≥1 provedor integrado já é maduro (base 80), +10 por
  // provedor adicional; nº de contas entra no detalhe como sinal de completude.
  {
    const acct = (r: { ok: boolean; json?: unknown[] }): number => r.ok && Array.isArray(r.json) ? r.json.length : 0
    const providers = [{ name: 'AWS', n: acct(awsR) }, { name: 'GCP', n: acct(gcpR) }, { name: 'Azure', n: acct(azureR) }]
    const integrated = providers.filter(p => p.n > 0)
    const cloudScore = integrated.length === 0 ? 0 : Math.min(100, 80 + (integrated.length - 1) * 10)
    const desc = integrated.length ? integrated.map(p => `${p.name} (${p.n} conta(s))`).join(', ') : 'nenhum'
    add('cloud', 'Cloud Integrations', true, cloudScore, `Integrado: ${desc}. Maturidade = a cloud que você usa está integrada — single-cloud não é penalizado.`)
  }

  // 9. Hosts sem Agent (score = % COM agent)
  if (hostsR.ok && hosts.length) {
    const withAgent = hosts.filter(h => (h.sources || []).includes('agent')).length
    add('hostsAgent', 'Hosts com Agent', true, pct(withAgent, hosts.length), `${withAgent} de ${hosts.length} hosts com Agent instalado.`)
  } else add('hostsAgent', 'Hosts com Agent', false, 0, 'Sem dados de hosts.')

  // Logs sem Service (score = % COM service) — via Logs Analytics
  if (logsTotal != null && logsTotal > 0 && logsWithSvc != null) {
    add('logsNoService', 'Logs sem Service', true, (logsWithSvc / logsTotal) * 100, `${logsTotal - logsWithSvc} de ${logsTotal} logs (24h) sem tag service.`)
  } else if (logsTotal === 0) {
    add('logsNoService', 'Logs sem Service', false, 0, 'Nenhum log no período (24h).')
  } else {
    add('logsNoService', 'Logs sem Service', false, 0, 'Requer Logs Analytics (logs_read).')
  }

  // 13. Alertas Falsos (score = 100 - flapping) — via Events (auto-recuperação rápida)
  if (ev.measured && ev.flappingRate != null) {
    add('falseAlerts', 'Alertas Falsos', true, 100 - ev.flappingRate, `${ev.flapping} de ${ev.cycles} ciclos recuperaram em <10min (flapping, 7d). Datadog recomenda alertar em sintomas e usar recovery threshold + janela de avaliação para cortar disparos transitórios.`)
  } else {
    add('falseAlerts', 'Alertas Falsos', false, 0, ev.measured ? 'Sem ciclos de alerta pareáveis no período.' : 'Requer Events API.')
  }

  // 14. Error Budget respeitado — via SLO history
  if (budget.measured) {
    add('errorBudget', 'Error Budget respeitado', true, budget.pct ?? 0, budget.detail ?? '')
  } else {
    add('errorBudget', 'Error Budget respeitado', false, 0, budget.detail || 'Requer histórico de SLO.')
  }

  // ── Pilar Observabilidade: quantos "pilares de sinal" estão ativos ──
  // Métricas/Logs/APM saem de dados que já temos; RUM/Synthetics/Profiling/DBM
  // são detectados pela presença de uso nas métricas datadog.estimated_usage.*
  // (funcionam por org). Score = nº de pilares ativos / 7.
  // Doc: https://docs.datadoghq.com/account_management/billing/usage_metrics/
  const daySec = 24 * 3600
  const dTo = Math.floor(toMs / 1000), dFrom = dTo - daySec
  const active = async (q: string): Promise<boolean> => { const r = await queryMetric(ctx, q, dFrom, dTo); return r.ok && !!r.points?.some(p => p > 0) }
  const [rumOn, synthOn, profOn, dbmOn] = await Promise.all([
    active('sum:datadog.estimated_usage.rum.sessions{*}.as_count()'),
    active('sum:datadog.estimated_usage.synthetics.api_test_runs{*}.as_count()'),
    active('max:datadog.estimated_usage.profiling.hosts{*}'),
    active('max:datadog.estimated_usage.dbm.hosts{*}'),
  ])
  // Sinais PONDERADOS: os fundacionais (Métricas/Logs/APM) pesam 2; os avançados
  // (RUM/Synthetics/Profiling/DBM) pesam 1 — faltar APM não pode valer o mesmo
  // que faltar DBM (que pode ser N/A no stack). Fundacionais completos = 60;
  // cada avançado soma ~10. Peso total = 3×2 + 4×1 = 10.
  const obsSignals = [
    { label: 'Métricas', on: hostsR.ok && hosts.length > 0, w: 2 },
    { label: 'Logs', on: (logsTotal || 0) > 0, w: 2 },
    { label: 'APM', on: servicesCount > 0, w: 2 },
    { label: 'RUM', on: rumOn, w: 1 },
    { label: 'Synthetics', on: synthOn, w: 1 },
    { label: 'Profiling', on: profOn, w: 1 },
    { label: 'Database Monitoring', on: dbmOn, w: 1 },
  ]
  const totalW = obsSignals.reduce((a, s) => a + s.w, 0)
  const gotW = obsSignals.filter(s => s.on).reduce((a, s) => a + s.w, 0)
  const obsActive = obsSignals.filter(s => s.on).map(s => s.label)
  const obsMissing = obsSignals.filter(s => !s.on).map(s => s.label)
  add('observabilidade', 'Observabilidade (sinais ativos)', true, (gotW / totalW) * 100,
    `${obsActive.length}/7 sinais ativos (fundacionais Métricas/Logs/APM pesam mais): ${obsActive.join(', ') || 'nenhum'}.${obsMissing.length ? ` Faltam: ${obsMissing.join(', ')} — RUM/Profiling/DBM podem ser N/A no seu stack.` : ''}`)

  const measured = dims.filter(d => d.measured)

  // ── 5 pilares de maturidade (tabela do usuário) ──
  // Score do pilar = média das dimensões medidas que o compõem.
  const PILLARS = [
    { key: 'cobertura', label: 'Cobertura', dims: ['hostsAgent', 'hostsMonitorados', 'apm', 'cloud'],
      maduro: 'Monitora infraestrutura, aplicações, banco de dados, cloud, containers, Kubernetes, logs, traces e usuários finais.',
      imaturo: 'Cobertura parcial: apenas alguns servidores com Agent, sem APM nas aplicações e sem integração de cloud — grandes áreas do ambiente ficam invisíveis (blind spots).' },
    { key: 'qualidade', label: 'Qualidade dos Monitores', dims: ['falseAlerts', 'monitorsOwner'],
      maduro: 'Alertas acionáveis baseados em sintomas (não em causas), com thresholds de disparo e recuperação calibrados, tratamento de "no data", prioridades definidas, runbook no corpo do alerta, composite monitors para reduzir ruído e cada monitor com dono e canal de notificação.',
      imaturo: 'Alertas em excesso ou por causa (não sintoma), com flapping e sem dono — gera fadiga de alerta (alert fatigue) e o time passa a ignorar notificações críticas.' },
    { key: 'observabilidade', label: 'Observabilidade', dims: ['observabilidade'],
      maduro: 'Métricas + Logs + APM + RUM + Synthetics + Profiling + Database Monitoring.',
      imaturo: 'Só coleta métricas de infraestrutura, sem correlacionar logs e traces — diante de um incidente dá pra ver QUE algo quebrou, mas não POR QUE.' },
    { key: 'processos', label: 'Processos', dims: ['dashPerService', 'servicesSLO', 'errorBudget'],
      maduro: 'Dashboards usados em operação diária, incidentes, capacity planning e SLA/SLO.',
      imaturo: 'Dashboards só para consulta pontual, sem SLOs nem error budget — a operação é reativa (apaga incêndios) em vez de guiada por objetivos de confiabilidade.' },
    { key: 'governanca', label: 'Governança', dims: ['tagCompliance', 'ownership', 'logsCorrelated', 'logsNoService'],
      maduro: 'Unified Service Tagging (env/service/version), ownership por time, RBAC, naming convention e custos controlados.',
      imaturo: 'Sem as tags reservadas env/service/version nem dono (team) — dificulta filtrar, atribuir responsabilidade e controlar custo, e quebra a correlação entre métricas, logs e traces.' },
  ]
  const dimByKey = Object.fromEntries(dims.map(d => [d.key, d]))
  const pillars = PILLARS.map(p => {
    const members = p.dims.map(k => dimByKey[k]).filter(Boolean)
    const mm = members.filter(m => m.measured)
    const pScore = mm.length ? clamp(mm.reduce((a, m) => a + (m.score ?? 0), 0) / mm.length) : null
    return { key: p.key, label: p.label, score: pScore, measured: mm.length > 0, maduro: p.maduro, imaturo: p.imaturo, dimensions: members }
  })

  // Score geral (círculo) = média dos pilares medidos.
  const measuredPillars = pillars.filter(p => p.measured)
  const score = measuredPillars.length ? clamp(measuredPillars.reduce((a, p) => a + (p.score ?? 0), 0) / measuredPillars.length) : 0

  // Nível 1-5 por faixa de 20 pontos, mas TRAVADO PELO ELO MAIS FRACO: um pilar
  // forte não pode mascarar um crítico. O nível não passa de (nível do pior
  // pilar + 1), então enquanto houver pilar muito atrás o ambiente não "sobe".
  // Mesma filosofia do refino do AuditMonitors (média não infla o resultado).
  const bandLevel = (v: number): number => Math.max(1, Math.min(5, Math.floor(v / 20) + 1))
  const LEVEL_LABELS: Record<number, string> = { 1: 'Inicial', 2: 'Reativo', 3: 'Gerenciado', 4: 'Proativo', 5: 'Otimizado' }
  const levelFromScore = bandLevel(score)
  const weakest = measuredPillars.length ? measuredPillars.reduce((a, p) => (p.score ?? 0) < (a.score ?? 0) ? p : a, measuredPillars[0]) : null
  const levelCap = weakest ? bandLevel(weakest.score ?? 0) + 1 : 5
  const level = measuredPillars.length ? Math.min(levelFromScore, levelCap) : 1
  // Se o teto do elo mais fraco rebaixou o nível, informa qual pilar segurou.
  const levelNote = weakest && level < levelFromScore
    ? `Nível limitado pelo pilar mais fraco: ${weakest.label} (${weakest.score}). Suba-o para destravar o próximo nível.`
    : null

  // Histórico do score geral (sparkline + delta). Grava só em compute fresco
  // (cache hit retorna antes daqui), então no máximo 1 ponto por dia/conta.
  const histId = cacheKey(['sm-hist', site, apiKey, appKey])
  const hist = await recordScore('scope-maturity', histId, score)

  const payload = {
    score,
    level,
    levelLabel: LEVEL_LABELS[level],
    levelNote,
    pillars,
    site,
    generatedAt: new Date().toISOString(),
    measuredCount: measured.length,
    totalDimensions: dims.length,
    dimensions: dims,
    history: hist.map(h => h.score),
    delta: computeDelta(hist),
  }
  await cacheSet(key, payload, CACHE_TTL_MS)
  return Response.json(payload)
}
