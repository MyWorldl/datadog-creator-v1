// src/app/api/datadog/infra-monitors/route.js
//
// Cria os monitores de INFRAESTRUTURA (CPU/Memória/Disco por host)
// planejados no fluxo de descoberta. Aceita dois formatos de body:
//  - { infra: <objeto de discovery> } — usado pelo wizard (DiscoveryCreate.jsx),
//    roda planInfraPreview() aqui dentro.
//  - { plan: [...] } — plano já expandido, usado pelo AuditMonitors
//    (buildSuggestedInfra em lib/audit.js já devolve o plan pronto).
// Idempotência + retry em 429: ver createPlanIdempotent em
// lib/monitor-create-server.js (compartilhado com apm-monitors/route.js).

import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { planInfraPreview } from '@/lib/infra'
import { ctxFrom } from '@/lib/datadog-server'
import { createPlanIdempotent } from '@/lib/monitor-create-server'
import { planSchema, discoveryBodySchema, firstIssueMessage } from '@/lib/schemas'

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

  let plan
  if (Array.isArray(body?.plan)) {
    const parsed = planSchema.safeParse(body.plan)
    if (!parsed.success) return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
    plan = parsed.data
  } else {
    const parsed = discoveryBodySchema.safeParse(body?.infra || body)
    if (!parsed.success) return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
    plan = planInfraPreview(parsed.data)
  }
  if (plan.length === 0) {
    return Response.json({ error: 'Nada a criar: selecione host(s) e métrica(s) de infra.' }, { status: 400 })
  }

  const ctx = ctxFrom({ apiKey, appKey, site })
  const result = await createPlanIdempotent(ctx, plan)
  return Response.json(result)
}
