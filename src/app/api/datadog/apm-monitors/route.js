// src/app/api/datadog/apm-monitors/route.js
//
// Cria os monitores de APM sugeridos pelo AuditMonitors pras lacunas de
// cobertura por serviço (buildSuggestedApm, lib/audit.js já devolve o plan
// pronto — mesmo formato de item que planPreview()).
//
// Diferente de service-monitors/route.js (usada pelo wizard, sem
// idempotência — é a "Etapa 5", nunca roda 2x pro mesmo plano): a criação
// pelo AuditMonitors PRECISA ser idempotente, porque reauditar depois de
// criar parcialmente não pode duplicar. Por isso espelha infra-monitors/
// route.js via createPlanIdempotent (lib/monitor-create-server.ts) em vez de
// reaproveitar service-monitors/route.js.

import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom } from '@/lib/datadog-server'
import { createPlanIdempotent } from '@/lib/monitor-create-server'
import { planSchema, firstIssueMessage } from '@/lib/schemas'

export async function POST(request) {
  const user = await getServerUser()
  if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 })

  const { apiKey, appKey, site } = await readSessionKeys()
  if (!apiKey || !appKey || !site) {
    return Response.json({ error: 'Sessão sem credenciais do Datadog.' }, { status: 412 })
  }

  let body
  try { body = await request.json() } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  if (!Array.isArray(body?.plan) || body.plan.length === 0) {
    return Response.json({ error: 'Nada a criar: nenhum monitor de APM no plano.' }, { status: 400 })
  }
  const parsed = planSchema.safeParse(body.plan)
  if (!parsed.success) return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
  const plan = parsed.data

  const ctx = ctxFrom({ apiKey, appKey, site })
  const result = await createPlanIdempotent(ctx, plan)
  return Response.json(result)
}
