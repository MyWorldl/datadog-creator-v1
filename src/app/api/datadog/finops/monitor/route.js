// src/app/api/datadog/finops/monitor/route.js
//
// Cria um monitor de ANOMALY DETECTION sobre uma métrica de licenciamento
// (datadog.estimated_usage.*), com direction='both' para alarmar tanto
// aumento quanto queda anormal do consumo.
//
// Regras de anomaly detection (confirmadas na doc):
//  - direction ∈ above | below | both  (aqui: both)
//  - o trigger_window (options.threshold_windows) DEVE casar com o
//    alert_window da query.  https://docs.datadoghq.com/monitors/types/anomaly/

import { auth } from '@/auth'
import { readSessionKeys } from '@/lib/session-keys'

const ALGORITHMS = ['basic', 'agile', 'robust']
const SEASONS = ['hourly', 'daily', 'weekly']
const WINDOWS = ['last_5m', 'last_15m', 'last_30m', 'last_1h', 'last_4h']

export async function POST(request) {
  const session = await auth()
  if (!session?.user) return Response.json({ error: 'Não autenticado.' }, { status: 401 })

  const { apiKey, appKey, site } = await readSessionKeys()
  if (!apiKey || !appKey || !site) {
    return Response.json({ error: 'Sessão sem credenciais do Datadog.' }, { status: 412 })
  }

  let body
  try { body = await request.json() } catch { return Response.json({ error: 'JSON inválido.' }, { status: 400 }) }

  const metric = (body?.metric || '').trim()
  if (!metric) return Response.json({ error: 'Informe a métrica de licenciamento.' }, { status: 400 })

  const deviations = Number(body?.deviations) > 0 ? Number(body.deviations) : 3
  const algorithm = ALGORITHMS.includes(body?.algorithm) ? body.algorithm : 'agile'
  const seasonality = SEASONS.includes(body?.seasonality) ? body.seasonality : 'weekly'
  const alertWindow = WINDOWS.includes(body?.alertWindow) ? body.alertWindow : 'last_4h'
  const queryWindow = 'last_1d'

  const seas = algorithm !== 'basic' ? `, seasonality='${seasonality}'` : ''
  const query =
    `avg(${queryWindow}):anomalies(avg:${metric}{*}, '${algorithm}', ${deviations}, ` +
    `direction='both', alert_window='${alertWindow}', interval=60, ` +
    `count_default_zero='true'${seas}) >= 1`

  const payload = {
    name: `[FinOps] Consumo anômalo · ${metric}`,
    type: 'query alert',
    query,
    message: `⚠️ [FinOps · Anomalia de consumo] \`${metric}\` fora do padrão histórico (aumento ou queda anormal). Verifique impacto de licenciamento/custo.\n@equipe-finops`,
    tags: ['created_by:finops_insights', 'team:finops'],
    options: {
      threshold_windows: { trigger_window: alertWindow, recovery_window: alertWindow },
      thresholds: { critical: 1.0 },
      notify_no_data: false,
      notify_audit: false,
      require_full_window: false,
      renotify_interval: 0,
    },
  }

  try {
    const r = await fetch(`https://api.${site}/api/v1/monitor`, {
      method: 'POST',
      headers: { 'DD-API-KEY': apiKey, 'DD-APPLICATION-KEY': appKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })
    const json = await r.json().catch(() => ({}))
    if (!r.ok) {
      return Response.json({ error: json?.errors?.join('; ') || `Falha ao criar monitor (${r.status}).`, query }, { status: 502 })
    }
    return Response.json({ ok: true, id: json.id, name: payload.name, query, url: `https://app.${site}/monitors/${json.id}` })
  } catch (e) {
    return Response.json({ error: 'Falha de rede: ' + e.message, query }, { status: 502 })
  }
}
