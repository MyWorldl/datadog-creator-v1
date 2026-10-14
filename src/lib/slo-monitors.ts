// src/lib/slo-monitors.ts
//
// SLO Alert — monitores type "slo alert" que alertam sobre o consumo do error
// budget de SLOs JÁ existentes (o app não cria SLO, só o alerta em cima dele).
// Sem "descoberta de entidade" no sentido de serviços/hosts: o usuário escolhe
// SLOs (listados via GET /api/v1/slo) e quais alertas quer em cada um.
//
// Sintaxe confirmada com o validador do próprio Datadog (POST /monitor/validate)
// contra SLOs reais do org — e id inexistente é recusado ("Invalid slo_id"):
//   burn_rate("<slo_id>").over("<timeframe>").long_window("1h").short_window("5m") > 14.4
//   error_budget("<slo_id>").over("<timeframe>") > 75     (% do budget CONSUMIDO)
// `timeframe` precisa ser um dos configurados no SLO (7d/30d/90d) — usamos o
// primeiro threshold do SLO.
//
// Presets de burn rate = alertas multi-janela do Google SRE Workbook (janela
// curta = 1/12 da longa, evita falso positivo de pico curto):
//   rápido: 1h/5m  > 14.4  (gasta ~2% do budget de 30d em 1h — pagina)
//   lento : 6h/30m > 6     (gasta ~5% em 6h — ticket/atenção)

import type { MonitorPayload } from './discovery'

export type SloAlertKind = 'burnFast' | 'burnSlow' | 'errorBudget'

export interface SloAlertType {
  key: SloAlertKind
  label: string
  hint: string
  defThreshold: number
  unit: string
  defPriority: number
  longWindow?: string
  shortWindow?: string
}

export const SLO_ALERT_TYPES: SloAlertType[] = [
  { key: 'burnFast', label: 'Burn rate rápido', hint: 'Budget sendo consumido rápido demais (janelas 1h/5m): incidente em andamento.', defThreshold: 14.4, unit: 'x', defPriority: 2, longWindow: '1h', shortWindow: '5m' },
  { key: 'burnSlow', label: 'Burn rate lento', hint: 'Consumo acima do ritmo sustentável ao longo de horas (janelas 6h/30m): degradação silenciosa.', defThreshold: 6, unit: 'x', defPriority: 3, longWindow: '6h', shortWindow: '30m' },
  { key: 'errorBudget', label: 'Error budget consumido', hint: 'Alerta quando o % do error budget já CONSUMIDO na janela do SLO passa do limite.', defThreshold: 75, unit: '%', defPriority: 3 },
]
export const SLO_ALERT_BY_KEY: Record<string, SloAlertType> = Object.fromEntries(SLO_ALERT_TYPES.map(t => [t.key, t]))

export interface SloInfo {
  id: string
  name: string
  type: string
  timeframe: string        // do 1º threshold do SLO (7d/30d/90d)
  target: number | null
}

export interface SloAlertConfig {
  enabled: boolean
  threshold: number
  priority: number | null
}

export interface SloMonitorsState {
  slos: SloInfo[]                      // descobertos (GET /api/v1/slo)
  selected: Record<string, boolean>    // slo id -> escolhido
  alerts: Record<string, SloAlertConfig>
  tags: string[]
  namePrefix: string
  messages: Record<string, string>     // por kind (vazio = mensagem padrão)
  notifyTarget: string
  renotifyInterval: number
}

export function initialSloMonitors(): SloMonitorsState {
  return {
    slos: [],
    selected: {},
    alerts: Object.fromEntries(SLO_ALERT_TYPES.map(t => [t.key, { enabled: t.key === 'burnFast' || t.key === 'burnSlow', threshold: t.defThreshold, priority: t.defPriority }])),
    tags: [],
    namePrefix: '[MonitorsCreator]',
    messages: {},
    notifyTarget: '',
    renotifyInterval: 0,
  }
}

// Escapa aspas/contrabarras antes de interpolar o id dentro de ("...") — o id
// vem da API (hex), mas o body da rota vem do cliente.
const esc = (v: string): string => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')

export function buildSloQuery({ kind, sloId, timeframe, threshold }: { kind: SloAlertKind; sloId: string; timeframe: string; threshold: number }): string {
  const t = SLO_ALERT_BY_KEY[kind]
  if (kind === 'errorBudget') return `error_budget("${esc(sloId)}").over("${esc(timeframe)}") > ${threshold}`
  return `burn_rate("${esc(sloId)}").over("${esc(timeframe)}").long_window("${t.longWindow}").short_window("${t.shortWindow}") > ${threshold}`
}

// Mensagem padrão: usa o nome do SLO (já conhecido) em texto, e só variáveis de
// template básicas e seguras ({{value}}/{{threshold}}).
export function defaultSloMessage(kind: SloAlertKind, sloName: string): string {
  const head = kind === 'errorBudget'
    ? `{{#is_alert}}🔴 [SLO] "${sloName}" — {{value}}% do error budget já consumido (limite: {{threshold}}%).{{/is_alert}}`
    : `{{#is_alert}}🔴 [SLO · ${kind === 'burnFast' ? 'burn rate rápido' : 'burn rate lento'}] "${sloName}" — consumindo o error budget a {{value}}x o ritmo sustentável (limite: {{threshold}}x).{{/is_alert}}`
  const why = kind === 'errorBudget'
    ? 'o quanto do error budget do SLO já foi gasto dentro da janela do SLO. Quando acaba, o objetivo é violado.'
    : 'a velocidade de consumo do error budget, em duas janelas (longa e curta) ao mesmo tempo — só dispara se o problema é sustentado E ainda está acontecendo.'
  return `${head}{{#is_alert_recovery}}✅ [SLO] "${sloName}" — voltou ao normal.{{/is_alert_recovery}}

**O que monitora:** ${why}

**Ação recomendada:** abra o SLO, veja quais requisições/monitores estão consumindo o budget e priorize a correção antes que o objetivo seja violado.

@equipe-ops`
}

export interface BuildSloMonitorArgs {
  kind: SloAlertKind
  slo: SloInfo
  threshold: number
  priority?: number | null
  message?: string
  tags?: string[]
  namePrefix?: string
  notifyTarget?: string
  renotifyInterval?: number
}

export function buildSloMonitorPayload({ kind, slo, threshold, priority, message, tags, namePrefix, notifyTarget, renotifyInterval }: BuildSloMonitorArgs): MonitorPayload {
  const t = SLO_ALERT_BY_KEY[kind]
  const name = `${(namePrefix || '[MonitorsCreator]').trim()} ${slo.name} · ${t.label}`.trim()
  const baseTags = ['created_by:monitorscreator', 'monitor_kind:slo', `slo_id:${slo.id}`, `slo_alert:${kind}`]
  for (const tg of (tags || [])) if (tg && !baseTags.includes(tg)) baseTags.push(tg)

  let resolvedMessage = message || defaultSloMessage(kind, slo.name)
  if (notifyTarget) resolvedMessage = resolvedMessage.replaceAll('@equipe-ops', notifyTarget)

  return {
    name,
    type: 'slo alert',
    query: buildSloQuery({ kind, sloId: slo.id, timeframe: slo.timeframe || '7d', threshold }),
    message: resolvedMessage,
    tags: baseTags,
    ...(priority ? { priority } : {}),
    options: {
      // critical PRECISA bater com o número da query (o validador recusa se divergir).
      thresholds: { critical: threshold },
      notify_no_data: false,
      notify_audit: false,
      require_full_window: false,
      renotify_interval: Number(renotifyInterval) || 0,
      evaluation_delay: 0,
    },
  }
}

export interface SloPlanItem {
  kind: SloAlertKind
  label: string
  service: string      // nome do SLO (campo genérico usado pelas telas de resultado)
  operation: string    // rótulo do alerta
  name: string
  query: string
  message: string
  priority: number | null
  payload: MonitorPayload
}

// 1 monitor por (SLO escolhido × alerta habilitado).
export function planSloPreview(state: Partial<SloMonitorsState>): SloPlanItem[] {
  const { slos = [], selected = {}, alerts = {}, tags = [], namePrefix = '[MonitorsCreator]', messages = {}, notifyTarget = '', renotifyInterval = 0 } = state || {}
  const plan: SloPlanItem[] = []
  for (const slo of slos) {
    if (!selected[slo.id]) continue
    for (const t of SLO_ALERT_TYPES) {
      const cfg = alerts[t.key]
      if (!cfg?.enabled) continue
      const threshold = Number.isFinite(Number(cfg.threshold)) ? Number(cfg.threshold) : t.defThreshold
      const payload = buildSloMonitorPayload({ kind: t.key, slo, threshold, priority: cfg.priority, message: messages[t.key] ? messages[t.key].replaceAll('{{slo_name}}', slo.name) : undefined, tags, namePrefix, notifyTarget, renotifyInterval })
      plan.push({ kind: t.key, label: t.label, service: slo.name, operation: t.label, name: payload.name, query: payload.query, message: payload.message, priority: cfg.priority ?? null, payload })
    }
  }
  return plan
}

// Problemas que o Datadog recusaria (limite <= 0 não faz sentido; % acima de 100).
export function validateSloAlerts(alerts: Record<string, SloAlertConfig>): string[] {
  const problems: string[] = []
  for (const t of SLO_ALERT_TYPES) {
    const c = alerts[t.key]
    if (!c?.enabled) continue
    if (!(Number(c.threshold) > 0)) problems.push(`${t.label}: o limite precisa ser maior que 0`)
    if (t.key === 'errorBudget' && Number(c.threshold) > 100) problems.push(`${t.label}: o limite é um % (no máximo 100)`)
  }
  return problems
}
