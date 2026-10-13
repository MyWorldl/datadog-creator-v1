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
import { ctxFrom, traceOperations, mapPaced, METRICS_LIST_GAP_MS, type DatadogCtx } from '@/lib/datadog-server'
import { pickPrimaryOperation } from '@/lib/discovery'
import { parseDqlTokenList } from '@/lib/schemas'

// Chamadas espaçadas (METRICS_LIST_GAP_MS) + retry em 429 dentro de
// traceOperations: o Metrics List v2 limita a 50 req/10s, e um loop sem pausa
// estourava isso e falhava TODOS os serviços seguintes. O cliente também manda
// em lotes pequenos (DiscoveryConfigure.tsx) — esta folga cobre o retry.
export const maxDuration = 60

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
  const settled = await mapPaced(services, async (svc): Promise<OperationResult> => {
    try {
      return await operationsForService(ctx, svc)
    } catch (e) {
      return { error: (e as Error).message }
    }
  }, METRICS_LIST_GAP_MS)
  services.forEach((svc, i) => { results[svc] = settled[i] })

  return Response.json({ results })
}
