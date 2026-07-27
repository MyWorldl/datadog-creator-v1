// src/app/api/datadog/operations/route.ts
//
// Para os serviços informados, descobre as OPERATIONS (spans) e quantas são,
// via Metrics List API (helper traceOperations em datadog-server.ts): lista
// as métricas submetidas com a tag service:<svc> e extrai o nome da operation
// dos nomes "trace.<op>.hits". Requer escopo metrics_read na Application key.
//
// Query: /api/datadog/operations?services=a,b,c
// Resposta: { results: { a: { count, operations:[...], primary } , ... } }

import type { NextRequest } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom, traceOperations, type DatadogCtx } from '@/lib/datadog-server'
import { pickPrimaryOperation } from '@/lib/discovery'
import { parseDqlTokenList } from '@/lib/schemas'

interface OperationResult {
  count?: number
  operations?: string[]
  primary?: string
  error?: string
  status?: number
  detail?: string
}

async function operationsForService(ctx: DatadogCtx, service: string): Promise<OperationResult> {
  const r = await traceOperations(ctx, `service:${service}`)
  if (!r.ok) {
    return { error: r.status ? `Datadog respondeu ${r.status}` : (r.error || 'Falha de rede'), status: r.status, detail: r.detail }
  }
  const operations = r.operations || []
  return { count: operations.length, operations, primary: pickPrimaryOperation(operations) }
}

export async function GET(request: NextRequest): Promise<Response> {
  const user = await getServerUser()
  if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 })

  const { apiKey, appKey, site } = await readSessionKeys()
  if (!apiKey || !appKey || !site) {
    return Response.json({ error: 'Sessão sem credenciais do Datadog.' }, { status: 412 })
  }
  const ctx = ctxFrom({ apiKey, appKey, site })

  const { searchParams } = new URL(request.url)
  const parsed = parseDqlTokenList(searchParams.get('services'), 'serviço')
  if (!parsed.success) {
    return Response.json({ error: parsed.error?.issues[0].message }, { status: 400 })
  }
  const services = parsed.data as string[]

  const results: Record<string, OperationResult> = {}
  for (const svc of services) {
    try {
      results[svc] = await operationsForService(ctx, svc)
    } catch (e) {
      results[svc] = { error: (e as Error).message }
    }
  }

  return Response.json({ results })
}
