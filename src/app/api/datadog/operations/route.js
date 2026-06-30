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

import { auth } from '@/auth'
import { readSessionKeys } from '@/lib/session-keys'

// Escolhe a operation "primária" para os monitores (preferindo entradas web).
function pickPrimary(ops) {
  const pref = ['http.request', 'web.request', 'servlet.request', 'grpc.request', 'rack.request', 'express.request']
  for (const p of pref) if (ops.includes(p)) return p
  return ops[0] || 'http.request'
}

async function operationsForService(site, apiKey, appKey, service) {
  const tag = `service:${service}`
  const url = `https://api.${site}/api/v2/metrics?filter[tags]=${encodeURIComponent(tag)}&window[seconds]=86400`
  const r = await fetch(url, {
    headers: { 'DD-API-KEY': apiKey, 'DD-APPLICATION-KEY': appKey, 'Accept': 'application/json' },
    cache: 'no-store',
  })
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    return { error: `Datadog respondeu ${r.status}`, status: r.status, detail: text.slice(0, 200) }
  }
  const json = await r.json().catch(() => null)
  const names = Array.isArray(json?.data) ? json.data.map(d => d?.id).filter(Boolean) : []

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
  const session = await auth()
  if (!session?.user) return Response.json({ error: 'Não autenticado.' }, { status: 401 })

  const { apiKey, appKey, site } = await readSessionKeys()
  if (!apiKey || !appKey || !site) {
    return Response.json({ error: 'Sessão sem credenciais do Datadog.' }, { status: 412 })
  }

  const { searchParams } = new URL(request.url)
  const services = (searchParams.get('services') || '')
    .split(',').map(s => s.trim()).filter(Boolean)

  if (services.length === 0) {
    return Response.json({ error: 'Informe ao menos um serviço.' }, { status: 400 })
  }

  const results = {}
  for (const svc of services) {
    try {
      results[svc] = await operationsForService(site, apiKey, appKey, svc)
    } catch (e) {
      results[svc] = { error: e.message }
    }
  }

  return Response.json({ results })
}
