// src/app/api/datadog/operations/route.js
//
// Para os serviços informados, descobre as OPERATIONS (spans) e quantas são,
// via Metrics List API (helper traceOperations em datadog-server.js): lista
// as métricas submetidas com a tag service:<svc> e extrai o nome da operation
// dos nomes "trace.<op>.hits". Requer escopo metrics_read na Application key.
//
// Query: /api/datadog/operations?services=a,b,c
// Resposta: { results: { a: { count, operations:[...], primary } , ... } }

import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom, traceOperations } from '@/lib/datadog-server'
import { pickPrimaryOperation } from '@/lib/discovery'

async function operationsForService(ctx, service) {
  const r = await traceOperations(ctx, `service:${service}`)
  if (!r.ok) {
    return { error: r.status ? `Datadog respondeu ${r.status}` : (r.error || 'Falha de rede'), status: r.status, detail: r.detail }
  }
  return { count: r.operations.length, operations: r.operations, primary: pickPrimaryOperation(r.operations) }
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
