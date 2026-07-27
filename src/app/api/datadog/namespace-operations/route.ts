// src/app/api/datadog/namespace-operations/route.ts
//
// Para os namespaces informados, descobre as OPERATIONS (spans) reportadas
// dentro de cada kube_namespace.
//
// Estratégia (2 passos, não filtro direto por kube_namespace): confirmado em
// smoke-test contra o Datadog real que a tag kube_namespace NÃO é propagada
// com a mesma cobertura que service nas métricas de trace — filtrar
// `/api/v2/metrics?filter[tags]=kube_namespace:<ns>` direto perdia a maioria
// das operations (ex.: achava 5 de 22 reais num caso real). Como `service:`
// é 100% confiável (mesma base de operations/route.ts), o caminho é:
//   1. Descobre os SERVIÇOS do namespace via Metrics Query API
//      (sum:trace.<sonda>.hits{kube_namespace:<ns>} by {service}).
//   2. Busca operations de CADA serviço achado (traceOperations, já provado
//      confiável) e une os resultados.
// Requer escopo metrics_read (passo 2) e timeseries_query (passo 1).
//
// Query: /api/datadog/namespace-operations?namespaces=a,b,c
// Resposta: { results: { a: { count, operations:[...], primary } , ... } }

import type { NextRequest } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom, traceOperations, metricTagValues, isSafeDqlToken, type DatadogCtx } from '@/lib/datadog-server'
import { pickPrimaryOperation, NAMESPACE_PROBE_OPERATIONS } from '@/lib/discovery'

interface NamespaceOperationResult {
  count?: number
  operations?: string[]
  primary?: string
  error?: string
  status?: number
  detail?: string
}

async function servicesForNamespace(ctx: DatadogCtx, namespace: string, fromSec: number, toSec: number): Promise<string[]> {
  const query = NAMESPACE_PROBE_OPERATIONS
    .map(op => `sum:trace.${op}.hits{kube_namespace:${namespace}} by {service}`)
    .join(', ')
  const r = await metricTagValues(ctx, query, 'service', fromSec, toSec)
  if (!r.ok) return []
  return [...new Set(r.values)]
}

async function operationsForNamespace(ctx: DatadogCtx, namespace: string, fromSec: number, toSec: number): Promise<NamespaceOperationResult> {
  const services = await servicesForNamespace(ctx, namespace, fromSec, toSec)

  const windowSeconds = toSec - fromSec

  // Fallback: nenhum serviço achado (namespace muito recente/baixo volume
  // nas sondas, ou nome digitado manualmente sem correlação) — tenta o
  // filtro direto por kube_namespace mesmo sabendo que é menos completo,
  // em vez de devolver vazio.
  if (services.length === 0) {
    const r = await traceOperations(ctx, `kube_namespace:${namespace}`, windowSeconds)
    if (!r.ok) return { error: r.status ? `Datadog respondeu ${r.status}` : (r.error || 'Falha de rede'), status: r.status, detail: r.detail }
    const operations = r.operations || []
    return { count: operations.length, operations, primary: pickPrimaryOperation(operations) }
  }

  const perService = await Promise.all(services.map(svc => traceOperations(ctx, `service:${svc}`, windowSeconds)))
  const ops = new Set<string>()
  let anyOk = false
  for (const r of perService) {
    if (!r.ok) continue
    anyOk = true
    for (const op of (r.operations || [])) ops.add(op)
  }
  if (!anyOk) return { error: 'Falha ao buscar operations dos serviços do namespace.' }

  const operations = [...ops].sort()
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
  const namespaces = (searchParams.get('namespaces') || '')
    .split(',').map(s => s.trim()).filter(Boolean)

  if (namespaces.length === 0) {
    return Response.json({ error: 'Informe ao menos um namespace.' }, { status: 400 })
  }
  const invalid = namespaces.filter(ns => !isSafeDqlToken(ns))
  if (invalid.length > 0) {
    return Response.json({ error: `Namespace inválido: ${invalid.join(', ')} (use apenas letras, dígitos, ponto, underscore, hífen ou barra).` }, { status: 400 })
  }

  const toSec = Math.floor(Date.now() / 1000)
  const fromSec = toSec - 30 * 86400 // 30d — namespaces de baixo volume podem não ter tráfego em janelas curtas

  const results: Record<string, NamespaceOperationResult> = {}
  for (const ns of namespaces) {
    try {
      results[ns] = await operationsForNamespace(ctx, ns, fromSec, toSec)
    } catch (e) {
      results[ns] = { error: (e as Error).message }
    }
  }

  return Response.json({ results })
}
