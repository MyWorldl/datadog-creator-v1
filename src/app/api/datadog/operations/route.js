// src/app/api/datadog/operations/route.js
//
// Para os serviços informados, descobre as OPERATIONS (spans) e quantas são.
// Estratégia: lista as métricas submetidas com a tag service:<svc>
//   GET /api/v2/metrics?filter[tags]=service:<svc>&window[seconds]=...
// e extrai o nome da operation dos nomes "trace.<op>.hits".
// Requer escopo metrics_read na Application key.
//   https://docs.datadoghq.com/api/latest/metrics/get-a-list-of-metrics/
//
// Query: /api/datadog/operations?services=a,b,c
// Resposta: { results: { a: { count, operations:[...], primary } , ... } }

import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom, ddGet } from '@/lib/datadog-server'

// Escolhe a operation "primária" para os monitores (preferindo entradas web).
function pickPrimary(ops) {
  const pref = ['http.request', 'web.request', 'servlet.request', 'grpc.request', 'rack.request', 'express.request']
  for (const p of pref) if (ops.includes(p)) return p
  return ops[0] || 'http.request'
}

async function operationsForService(ctx, service) {
  const tag = `service:${service}`
  const r = await ddGet(ctx, `/api/v2/metrics?filter[tags]=${encodeURIComponent(tag)}&window[seconds]=86400`)
  if (!r.ok) {
    return { error: r.status ? `Datadog respondeu ${r.status}` : (r.error || 'Falha de rede'), status: r.status, detail: r.detail }
  }
  const names = Array.isArray(r.json?.data) ? r.json.data.map(d => d?.id).filter(Boolean) : []

  // trace.<op>.hits  -> <op>
  const ops = new Set()
  for (const name of names) {
    const m = /^trace\.(.+)\.hits$/.exec(name)
    if (m) ops.add(m[1])
  }
  const operations = [...ops].sort()
  return { count: operations.length, operations, primary: pickPrimary(operations) }
}

export async function GET(request) {
  const user = await getServerUser()
  if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 })

  const { apiKey, appKey, site } = await readSessionKeys()
  if (!apiKey || !appKey || !site) {
    return Response.json({ error: 'Sessão sem credenciais do Datadog.' }, { status: 412 })
  }
  const ctx = ctxFrom({ apiKey, appKey, site })

  const { searchParams } = new URL(request.url)
  const services = (searchParams.get('services') || '')
    .split(',').map(s => s.trim()).filter(Boolean)

  if (services.length === 0) {
    return Response.json({ error: 'Informe ao menos um serviço.' }, { status: 400 })
  }

  const results = {}
  for (const svc of services) {
    try {
      results[svc] = await operationsForService(ctx, svc)
    } catch (e) {
      results[svc] = { error: e.message }
    }
  }

  return Response.json({ results })
}
