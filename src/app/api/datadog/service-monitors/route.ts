// src/app/api/datadog/service-monitors/route.ts
//
// Cria os monitores de ANOMALY DETECTION planejados no fluxo de descoberta.
// Chamado apenas na ETAPA 5. Recebe o estado de descoberta e usa o mesmo
// planejador do preview (src/lib/discovery.ts) para não haver divergência.

import type { NextRequest } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { planPreview, type DiscoveryState } from '@/lib/discovery'
import { ctxFrom } from '@/lib/datadog-server'
import { createPlanIdempotent, selectBatch, CREATE_MAX_DURATION } from '@/lib/monitor-create-server'
import { discoveryBodySchema, firstIssueMessage } from '@/lib/schemas'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const maxDuration = CREATE_MAX_DURATION

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

  const parsed = discoveryBodySchema.safeParse(body?.discovery || body)
  if (!parsed.success) return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
  // discoveryBodySchema é uma validação leve e genérica (compartilhada com
  // infra-monitors); o shape real de DiscoveryState é responsabilidade de
  // planPreview, que já tolera campos ausentes via default.
  const discoveryInput = parsed.data as unknown as Partial<DiscoveryState>

  // Defesa em profundidade: a UI só mostra Pod Restarts/Pod Pending atrás da
  // feature flag (ver DiscoveryConfigureK8sDbm.tsx), mas o body vem do
  // client — reforça aqui pra quem tentar montar a requisição à mão (mesmo
  // padrão do outlier em infra-monitors/route.ts).
  if ((discoveryInput.podRestarts?.enabled || discoveryInput.podPending?.enabled) && !isFeatureEnabled('k8sDbmCoverage')) {
    return Response.json({ error: 'Cobertura de Kubernetes/Database Monitoring ainda não está disponível.' }, { status: 403 })
  }

  const plan = planPreview(discoveryInput)
  if (plan.length === 0) {
    return Response.json({ error: 'Nada a criar: selecione serviço(s)/namespace(s), operação(ões) e tipo(s) de alerta (ou habilite Pod Restarts/Pod Pending).' }, { status: 400 })
  }

  // Lote do wizard (batch.only): cria só essas posições do plano, sem relistar.
  const sel = selectBatch(body?.batch, plan)
  if (!sel.ok) return Response.json({ error: sel.error }, { status: 400 })

  // Idempotente + retry em 429 (mesmo createPlanIdempotent de infra/log/slo).
  const ctx = ctxFrom({ apiKey, appKey, site })
  const result = await createPlanIdempotent(ctx, sel.plan, sel.options)
  return Response.json(result)
}
