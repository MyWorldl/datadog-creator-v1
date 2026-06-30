// src/app/api/datadog/service-monitors/route.js
//
// Cria monitores de alerta para um ou mais serviços APM.
// Chamado apenas na ETAPA 5 (Criar) do wizard.
//
// Body:
// {
//   services: [{ name, operation }],   // 1+ serviços, cada um com a operation escolhida
//   env: 'prod' | '',
//   groupBy: ['service','resource_name'],
//   alerts:   { latency:{enabled,threshold}, errorRate:{...}, lowVolume:{...}, highVolume:{...} },
//   messages: { latency:'...', errorRate:'...', ... }   // templates editáveis
// }
//
// Métricas (doc Datadog APM): p95:trace.<op>{...} (latência DDSketch);
// trace.<op>.hits / .errors (.as_count()).

import { auth } from '@/auth'
import { readSessionKeys } from '@/lib/session-keys'

function scopeOf(service, env) {
  const parts = [`service:${service}`]
  if (env && env !== '*') parts.push(`env:${env}`)
  return parts.join(',')
}

function byClauseOf(groupBy) {
  const g = (groupBy || []).filter(Boolean)
  return g.length ? ` by {${g.join(',')}}` : ''
}

function buildMonitor(kind, { service, env, operation, threshold, message, groupBy }) {
  const sc = scopeOf(service, env)
  const by = byClauseOf(groupBy)
  const op = operation || 'http.request'
  const tags = ['created_by:monitorscreator', `service:${service}`]
  if (env && env !== '*') tags.push(`env:${env}`)

  const base = {
    message: message || '',
    tags,
    options: {
      thresholds: { critical: Number(threshold) },
      notify_no_data: false,
      renotify_interval: 0,
      include_tags: true,
    },
  }

  switch (kind) {
    case 'latency':
      return {
        ...base,
        name: `[MonitorsCreator] ${service} · Latência p95`,
        type: 'metric alert',
        query: `avg(last_15m):p95:trace.${op}{${sc}}${by} > ${threshold}`,
      }
    case 'errorRate':
      return {
        ...base,
        name: `[MonitorsCreator] ${service} · Taxa de Erro`,
        type: 'query alert',
        query: `avg(last_15m):( sum:trace.${op}.errors{${sc}}${by}.as_count() / sum:trace.${op}.hits{${sc}}${by}.as_count() ) * 100 > ${threshold}`,
      }
    case 'lowVolume':
      return {
        ...base,
        name: `[MonitorsCreator] ${service} · Baixo volume`,
        type: 'metric alert',
        query: `sum(last_15m):sum:trace.${op}.hits{${sc}}${by}.as_count() < ${threshold}`,
      }
    case 'highVolume':
      return {
        ...base,
        name: `[MonitorsCreator] ${service} · Alto volume`,
        type: 'metric alert',
        query: `sum(last_15m):sum:trace.${op}.hits{${sc}}${by}.as_count() > ${threshold}`,
      }
    default:
      return null
  }
}

// Monta a lista de monitores (serviço × tipo habilitado). Exportável p/ preview no servidor? Não:
// rotas só exportam métodos. O preview do cliente usa a mesma lógica via /lib se precisar.
function planMonitors(body) {
  const services = Array.isArray(body?.services) ? body.services : []
  const env = String(body?.env || '').trim()
  const groupBy = Array.isArray(body?.groupBy) ? body.groupBy : []
  const alerts = body?.alerts || {}
  const messages = body?.messages || {}

  const plan = []
  for (const svc of services) {
    const service = String(svc?.name || '').trim()
    const operation = String(svc?.operation || 'http.request').trim() || 'http.request'
    if (!service) continue
    for (const [kind, cfg] of Object.entries(alerts)) {
      if (!cfg?.enabled) continue
      const payload = buildMonitor(kind, {
        service, env, operation,
        threshold: cfg.threshold,
        message: messages[kind],
        groupBy,
      })
      if (payload) plan.push({ kind, service, payload })
    }
  }
  return plan
}

export async function POST(request) {
  const session = await auth()
  if (!session?.user) return Response.json({ error: 'Não autenticado.' }, { status: 401 })

  const { apiKey, appKey, site } = await readSessionKeys()
  if (!apiKey || !appKey || !site) {
    return Response.json({ error: 'Sessão sem credenciais do Datadog.' }, { status: 412 })
  }

  let body
  try { body = await request.json() } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const plan = planMonitors(body)
  if (plan.length === 0) {
    return Response.json({ error: 'Nada a criar: selecione serviço(s) e tipo(s) de alerta.' }, { status: 400 })
  }

  const monitorUrl = `https://api.${site}/api/v1/monitor`
  const results = []

  for (const item of plan) {
    try {
      const r = await fetch(monitorUrl, {
        method: 'POST',
        headers: {
          'DD-API-KEY': apiKey,
          'DD-APPLICATION-KEY': appKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(item.payload),
        cache: 'no-store',
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        results.push({ kind: item.kind, service: item.service, ok: false, error: (j?.errors && j.errors.join('; ')) || `HTTP ${r.status}`, query: item.payload.query })
      } else {
        results.push({ kind: item.kind, service: item.service, ok: true, id: j.id, name: item.payload.name, query: item.payload.query })
      }
    } catch (e) {
      results.push({ kind: item.kind, service: item.service, ok: false, error: e.message, query: item.payload.query })
    }
  }

  const created = results.filter(r => r.ok).length
  return Response.json({ created, total: results.length, results })
}
