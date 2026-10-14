// src/app/api/datadog/slo-monitors/route.ts
//
// Cria os monitores "slo alert" planejados na aba SLO do MonitorsCreator (ver
// lib/slo-monitors.ts). Aceita { sloMonitors: <estado> } (padrão do wizard) ou
// o estado direto. Idempotência + retry em 429: createPlanIdempotent, igual
// às demais rotas de criação. Atrás da feature flag sloAlerts.

import type { NextRequest } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { planSloPreview, validateSloAlerts, type SloMonitorsState } from '@/lib/slo-monitors'
import { ctxFrom } from '@/lib/datadog-server'
import { createPlanIdempotent, selectBatch } from '@/lib/monitor-create-server'
import { sloMonitorsBodySchema, firstIssueMessage } from '@/lib/schemas'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const maxDuration = 60 // literal (o Next não aceita constante importada); lote de 25 leva poucos segundos

export async function POST(request: NextRequest): Promise<Response> {
  if (!isFeatureEnabled('sloAlerts')) {
    return Response.json({ error: 'Alertas de SLO ainda não estão disponíveis.' }, { status: 403 })
  }

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

  const parsed = sloMonitorsBodySchema.safeParse(body?.sloMonitors || body)
  if (!parsed.success) return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })

  const problems = validateSloAlerts(parsed.data.alerts as SloMonitorsState['alerts'])
  if (problems.length) return Response.json({ error: problems.join('; ') + '.' }, { status: 400 })

  const plan = planSloPreview(parsed.data as unknown as Partial<SloMonitorsState>)
  if (plan.length === 0) {
    return Response.json({ error: 'Nada a criar: escolha ao menos um SLO e um tipo de alerta.' }, { status: 400 })
  }

  const sel = selectBatch(body?.batch, plan)
  if (!sel.ok) return Response.json({ error: sel.error }, { status: 400 })

  const result = await createPlanIdempotent(ctxFrom({ apiKey, appKey, site }), sel.plan, sel.options)
  return Response.json(result)
}
