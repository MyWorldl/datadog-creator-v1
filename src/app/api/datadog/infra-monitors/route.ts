// src/app/api/datadog/infra-monitors/route.ts
//
// Cria os monitores de INFRAESTRUTURA (CPU/Memória/Disco por host)
// planejados no fluxo de descoberta. Aceita dois formatos de body:
//  - { infra: <objeto de discovery> } — usado pelo wizard (DiscoveryCreate.tsx),
//    roda planInfraPreview() aqui dentro.
//  - { plan: [...] } — plano já expandido, usado pelo AuditMonitors
//    (buildSuggestedInfra em lib/audit.ts já devolve o plan pronto).
// Idempotência + retry em 429: ver createPlanIdempotent em
// lib/monitor-create-server.ts (compartilhado com apm-monitors/route.ts).

import type { NextRequest } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { planInfraPreview, type InfraDiscoveryState } from '@/lib/infra'
import { ctxFrom } from '@/lib/datadog-server'
import { createPlanIdempotent } from '@/lib/monitor-create-server'
import { planSchema, discoveryBodySchema, firstIssueMessage } from '@/lib/schemas'
import { isFeatureEnabled } from '@/lib/feature-flags'

export async function POST(request: NextRequest): Promise<Response> {
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
    // discoveryBodySchema é uma validação leve e genérica (compartilhada com
    // service-monitors); o shape real de InfraDiscoveryState é responsabilidade
    // de planInfraPreview, que já tolera campos ausentes via default.
    const infraInput = parsed.data as unknown as Partial<InfraDiscoveryState>

    // Defesa em profundidade: a UI só mostra o modo 'outlier' atrás da
    // feature flag (ver DiscoveryConfigureInfra.tsx), mas o mode vem do
    // client — reforça aqui pra quem tentar montar o body à mão.
    const hasOutlier = Object.values(infraInput.metrics || {}).some(m => (m as { mode?: string })?.mode === 'outlier')
    if (hasOutlier && !isFeatureEnabled('outlierDetection')) {
      return Response.json({ error: 'Outlier Detection ainda não está disponível.' }, { status: 403 })
    }

    plan = planInfraPreview(infraInput)
  }
  if (plan.length === 0) {
    return Response.json({ error: 'Nada a criar: selecione host(s) e métrica(s) de infra.' }, { status: 400 })
  }

  const ctx = ctxFrom({ apiKey, appKey, site })
  const result = await createPlanIdempotent(ctx, plan)
  return Response.json(result)
}
