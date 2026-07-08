// src/app/api/datadog/scope-maturity/route.js
//
// Calcula um score de maturidade (0-100) do ambiente Datadog a partir de
// dados coletados NO SERVIDOR (via chaves da sessão) — sem chamadas do
// browser, o que evita o erro de CORS ("Failed to fetch").
//
// Cada dimensão é calculada de forma defensiva: se a chamada à API falhar,
// a dimensão fica "não avaliada" (measured=false) e NÃO entra na média,
// para não distorcer o score. Algumas dimensões dependem de dados de logs/
// histórico que não são obtidos aqui e ficam marcadas como não avaliadas.

import { auth } from '@/auth'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom, ddGet, logsCount, sloBudget, alertEvents, listMonitors, queryMetric } from '@/lib/datadog-server'
import { cacheKey, cacheGet, cacheSet } from '@/lib/route-cache'
import { recordScore, computeDelta } from '@/lib/score-history'

const REQUIRED_TAGS = ['env', 'service', 'team']
const CACHE_TTL_MS = 2 * 60 * 1000 // 2 min — suficiente pra absorver refreshes/múltiplos usuários

function pct(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0 }
function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))) }

export async function GET() {
  const session = await auth()
  if (!session?.user) return Response.json({ error: 'Não autenticado.' }, { status: 401 })

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
    ddGet(ctx, '/api/v1/hosts?count=1000'),
    ddGet(ctx, '/api/v1/hosts/totals'),
    ddGet(ctx, '/api/v2/apm/services?filter[env]=*'),
    ddGet(ctx, '/api/v1/dashboard'),
    ddGet(ctx, '/api/v1/slo?limit=1000'),
    ddGet(ctx, '/api/v1/integration/aws'),
    ddGet(ctx, '/api/v1/integration/gcp'),
    ddGet(ctx, '/api/v1/integration/azure'),
  ])

  // Se nem os monitores nem os hosts vierem, provavelmente é auth/site.
  if (!monitorsR.ok && !hostsR.ok) {
    return Response.json(
      { error: `Não foi possível coletar dados do Datadog (${monitorsR.status || monitorsR.error || 's/status'}). Verifique as permissões da App key e o site.` },
      { status: 502 }
    )
  }

  const monitors = Array.isArray(monitorsR.json) ? monitorsR.json : []
  const hosts = hostsR.json?.host_list || []
  const totals = totalsR.json || {}
  const apmServices = (() => {
    const data = apmR.json?.data
    if (Array.isArray(data)) return data.map(d => d?.attributes?.services || d?.id).flat().filter(Boolean)
    if (data?.attributes?.services) return data.attributes.services
    return []
  })()
  const servicesCount = new Set(apmServices).size
  const dashboards = dashR.json?.dashboards || []
  const slos = sloR.json?.data || []
  const cloudCount = [awsR, gcpR, azureR].filter(r => r.ok && Array.isArray(r.json) ? r.json.length > 0 : r.ok).length

  // Helpers de tags
  const hostTags = (h) => Object.values(h.tags_by_source || {}).flat()
  const hasTagKey = (tags, key) => (tags || []).some(t => t.startsWith(key + ':'))

  const dims = []
  const add = (key, label, measured, score, detail) => dims.push({ key, label, measured, score: measured ? clamp(score) : null, detail })

  // Coletas adicionais (logs, SLO history, eventos) para evoluir os N/D.
  const toMs = Date.now(), fromMs = toMs - 24 * 3600 * 1000
  const [logsTotal, logsTrace, logsWithSvc, budget, ev] = await Promise.all([
    logsCount(ctx, '*', fromMs, toMs),
    logsCount(ctx, '@dd.trace_id:*', fromMs, toMs),
    logsCount(ctx, 'service:*', fromMs, toMs),
    sloBudget(ctx),
    alertEvents(ctx, 7),
  ])

  // 1. Tag Compliance (hosts com env/service/team) — detalhe por tag (item 7)
  if (hostsR.ok && hosts.length) {
    const per = REQUIRED_TAGS.map(k => ({ tag: k, pct: pct(hosts.filter(h => hasTagKey(hostTags(h), k)).length, hosts.length) }))
    const avg = per.reduce((a, b) => a + b.pct, 0) / per.length
    const worst = per.reduce((a, b) => b.pct < a.pct ? b : a, per[0])
    const breakdown = per.map(p => `${p.tag} ${p.pct}%`).join(', ')
    add('tagCompliance', 'Tag Compliance', true, avg,
      `Infra (${hosts.length} hosts): ${breakdown}. Gargalo: tag "${worst.tag}" (${worst.pct}%) — priorize corrigi-la para subir o score.`)
  } else add('tagCompliance', 'Tag Compliance', false, 0, 'Sem dados de hosts (requer leitura de infraestrutura).')

  // 2. Hosts Monitorados
  if (totalsR.ok && (totals.total_active || totals.total_up)) {
    add('hostsMonitorados', 'Hosts Monitorados', true, pct(totals.total_up || 0, totals.total_active || totals.total_up || 1), `${totals.total_up || 0} de ${totals.total_active || 0} hosts reportando.`)
  } else if (hostsR.ok) {
    const up = hosts.filter(h => h.up).length
    add('hostsMonitorados', 'Hosts Monitorados', true, pct(up, hosts.length || 1), `${up} de ${hosts.length} hosts ativos.`)
  } else add('hostsMonitorados', 'Hosts Monitorados', false, 0, 'Sem dados de hosts.')

  // 3. Aplicações com APM (heurística por contagem)
  if (apmR.ok) {
    const score = servicesCount === 0 ? 0 : servicesCount >= 6 ? 100 : servicesCount >= 3 ? 70 : 40
    add('apm', 'Aplicações com APM', true, score, `${servicesCount} serviço(s) com APM (faixas: 0→0, 1-2→40, 3-5→70, ≥6→100). Instrumente mais serviços para subir.`)
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

  // 5. Monitores com Owner (tag team:/owner: ou creator)
  if (monitorsR.ok && monitors.length) {
    const withOwner = monitors.filter(m => (m.tags || []).some(t => t.startsWith('team:') || t.startsWith('owner:')) || m.creator?.email).length
    add('monitorsOwner', 'Monitores com Owner', true, pct(withOwner, monitors.length), `${withOwner} de ${monitors.length} monitores com team/owner.`)
  } else add('monitorsOwner', 'Monitores com Owner', false, 0, 'Sem dados de monitores.')

  // 6. Dashboards por Serviço (ratio dashboards / serviços)
  if (dashR.ok && apmR.ok && servicesCount > 0) {
    add('dashPerService', 'Dashboards por Serviço', true, pct(dashboards.length, servicesCount), `${dashboards.length} dashboards para ${servicesCount} serviços.`)
  } else add('dashPerService', 'Dashboards por Serviço', false, 0, 'Requer dashboards e serviços APM.')

  // 7. Serviços com SLO
  if (sloR.ok && apmR.ok && servicesCount > 0) {
    add('servicesSLO', 'Serviços com SLO', true, pct(slos.length, servicesCount), `${slos.length} SLO(s) para ${servicesCount} serviços.`)
  } else if (sloR.ok) {
    add('servicesSLO', 'Serviços com SLO', true, slos.length > 0 ? 60 : 0, `${slos.length} SLO(s) configurado(s).`)
  } else add('servicesSLO', 'Serviços com SLO', false, 0, 'Sem dados de SLO.')

  // 8. Cloud Integrations
  add('cloud', 'Cloud Integrations', true, cloudCount === 0 ? 0 : Math.min(100, cloudCount * 40), `${cloudCount} provedor(es) de nuvem integrado(s) — AWS/GCP/Azure (cada um vale +40, máx. 100).`)

  // 9. Hosts sem Agent (score = % COM agent)
  if (hostsR.ok && hosts.length) {
    const withAgent = hosts.filter(h => (h.sources || []).includes('agent')).length
    add('hostsAgent', 'Hosts com Agent', true, pct(withAgent, hosts.length), `${withAgent} de ${hosts.length} hosts com Agent instalado.`)
  } else add('hostsAgent', 'Hosts com Agent', false, 0, 'Sem dados de hosts.')

  // 11-14. Dependem de logs/histórico — não avaliados nesta versão
  // 11. Alta Cardinalidade — segue N/D (requer dados de cardinalidade de métricas)
  add('highCardinality', 'Alta Cardinalidade', false, 0, 'Requer dados de cardinalidade de métricas (não exposto pela API padrão).')

  // 12. Logs sem Service (score = % COM service) — via Logs Analytics
  if (logsTotal != null && logsTotal > 0 && logsWithSvc != null) {
    add('logsNoService', 'Logs sem Service', true, (logsWithSvc / logsTotal) * 100, `${logsTotal - logsWithSvc} de ${logsTotal} logs (24h) sem tag service.`)
  } else if (logsTotal === 0) {
    add('logsNoService', 'Logs sem Service', false, 0, 'Nenhum log no período (24h).')
  } else {
    add('logsNoService', 'Logs sem Service', false, 0, 'Requer Logs Analytics (logs_read).')
  }

  // 13. Alertas Falsos (score = 100 - flapping) — via Events (auto-recuperação rápida)
  if (ev.measured && ev.flappingRate != null) {
    add('falseAlerts', 'Alertas Falsos', true, 100 - ev.flappingRate, `${ev.flapping} de ${ev.cycles} ciclos recuperaram em <10min (flapping, 7d).`)
  } else {
    add('falseAlerts', 'Alertas Falsos', false, 0, ev.measured ? 'Sem ciclos de alerta pareáveis no período.' : 'Requer Events API.')
  }

  // 14. Error Budget respeitado — via SLO history
  if (budget.measured) {
    add('errorBudget', 'Error Budget respeitado', true, budget.pct, budget.detail)
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
  const active = async (q) => { const r = await queryMetric(ctx, q, dFrom, dTo); return r.ok && r.points.some(p => p > 0) }
  const [rumOn, synthOn, profOn, dbmOn] = await Promise.all([
    active('sum:datadog.estimated_usage.rum.sessions{*}.as_count()'),
    active('sum:datadog.estimated_usage.synthetics.api_test_runs{*}.as_count()'),
    active('max:datadog.estimated_usage.profiling.hosts{*}'),
    active('max:datadog.estimated_usage.dbm.hosts{*}'),
  ])
  const obsSignals = [
    { label: 'Métricas', on: hostsR.ok && hosts.length > 0 },
    { label: 'Logs', on: (logsTotal || 0) > 0 },
    { label: 'APM', on: servicesCount > 0 },
    { label: 'RUM', on: rumOn },
    { label: 'Synthetics', on: synthOn },
    { label: 'Profiling', on: profOn },
    { label: 'Database Monitoring', on: dbmOn },
  ]
  const obsActive = obsSignals.filter(s => s.on).map(s => s.label)
  const obsMissing = obsSignals.filter(s => !s.on).map(s => s.label)
  add('observabilidade', 'Observabilidade (sinais ativos)', true, (obsActive.length / obsSignals.length) * 100,
    `${obsActive.length}/7 sinais ativos: ${obsActive.join(', ') || 'nenhum'}.${obsMissing.length ? ` Faltam: ${obsMissing.join(', ')}.` : ''}`)

  const measured = dims.filter(d => d.measured)

  // ── 5 pilares de maturidade (tabela do usuário) ──
  // Score do pilar = média das dimensões medidas que o compõem.
  const PILLARS = [
    { key: 'cobertura', label: 'Cobertura', dims: ['hostsAgent', 'hostsMonitorados', 'apm', 'cloud'],
      maduro: 'Monitora infraestrutura, aplicações, banco de dados, cloud, containers, Kubernetes, logs, traces e usuários finais.',
      imaturo: 'Monitora apenas alguns servidores.' },
    { key: 'qualidade', label: 'Qualidade dos Monitores', dims: ['falseAlerts', 'monitorsOwner'],
      maduro: 'Alertas relevantes, thresholds ajustados, composite monitors e monitor templates.',
      imaturo: 'Muitos alertas falsos ou inexistentes.' },
    { key: 'observabilidade', label: 'Observabilidade', dims: ['observabilidade'],
      maduro: 'Métricas + Logs + APM + RUM + Synthetics + Profiling + Database Monitoring.',
      imaturo: 'Apenas métricas.' },
    { key: 'processos', label: 'Processos', dims: ['dashPerService', 'servicesSLO', 'errorBudget'],
      maduro: 'Dashboards usados em operação diária, incidentes, capacity planning e SLA/SLO.',
      imaturo: 'Dashboards apenas para consulta.' },
    { key: 'governanca', label: 'Governança', dims: ['tagCompliance', 'logsCorrelated', 'logsNoService'],
      maduro: 'Tags padronizadas, RBAC, naming convention, custos controlados e ownership definido.',
      imaturo: 'Sem padrão.' },
  ]
  const dimByKey = Object.fromEntries(dims.map(d => [d.key, d]))
  const pillars = PILLARS.map(p => {
    const members = p.dims.map(k => dimByKey[k]).filter(Boolean)
    const mm = members.filter(m => m.measured)
    const pScore = mm.length ? clamp(mm.reduce((a, m) => a + m.score, 0) / mm.length) : null
    return { key: p.key, label: p.label, score: pScore, measured: mm.length > 0, maduro: p.maduro, imaturo: p.imaturo, dimensions: members }
  })

  // Score geral = média dos pilares medidos. Nível 1-5 por faixa de 20 pontos.
  const measuredPillars = pillars.filter(p => p.measured)
  const score = measuredPillars.length ? clamp(measuredPillars.reduce((a, p) => a + p.score, 0) / measuredPillars.length) : 0
  const level = Math.min(5, Math.floor(score / 20) + 1)
  const LEVEL_LABELS = { 1: 'Inicial', 2: 'Reativo', 3: 'Gerenciado', 4: 'Proativo', 5: 'Otimizado' }

  // Histórico do score geral (sparkline + delta). Grava só em compute fresco
  // (cache hit retorna antes daqui), então no máximo 1 ponto por dia/conta.
  const histId = cacheKey(['sm-hist', site, apiKey, appKey])
  const hist = await recordScore('scope-maturity', histId, score)

  const payload = {
    score,
    level,
    levelLabel: LEVEL_LABELS[level],
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
