// src/app/api/datadog/log-monitors/route.ts
//
// Cria os Log Monitors planejados a partir das regras montadas na UI (ver
// lib/log-monitors.ts). Aceita { logMonitors: <estado> } (padrão usado pelo
// wizard, mesmo formato de { infra: ... }/{ discovery: ... } nas outras
// rotas) OU o estado direto no corpo. Sem o formato "plano já expandido"
// (não existe um consumidor externo tipo AuditMonitors pra Log Monitor
// ainda). Idempotência + retry em 429: mesmo createPlanIdempotent de
// infra/apm-monitors.
//
// Atrás da feature flag logMonitors (desligada por padrão). Agregações,
// atributo, agrupamento e operador: ver lib/log-monitors.ts.

import type { NextRequest } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { planLogPreview, validateLogRule, type LogMonitorRule, type LogMonitorsState } from '@/lib/log-monitors'
import { ctxFrom } from '@/lib/datadog-server'
import { createPlanIdempotent } from '@/lib/monitor-create-server'
import { logMonitorsBodySchema, firstIssueMessage } from '@/lib/schemas'
import { isFeatureEnabled } from '@/lib/feature-flags'

export async function POST(request: NextRequest): Promise<Response> {
  if (!isFeatureEnabled('logMonitors')) {
    return Response.json({ error: 'Log Monitor ainda não está disponível.' }, { status: 403 })
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

  const parsed = logMonitorsBodySchema.safeParse(body?.logMonitors || body)
  if (!parsed.success) return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })

  // Regras que o Datadog recusaria (atributo faltando, warning do lado errado...)
  // viram 400 claro aqui, em vez de falhar no meio da criação em lote.
  for (const r of (parsed.data.rules || []) as unknown as LogMonitorRule[]) {
    if (!r.label?.trim()) continue
    const problems = validateLogRule(r)
    if (problems.length) return Response.json({ error: `Regra "${r.label}": ${problems.join('; ')}.` }, { status: 400 })
  }

  // Cast igual ao usado em infra-monitors/service-monitors: o schema faz uma
  // validação leve e genérica (campos passthrough), a forma real é
  // responsabilidade de planLogPreview, que já tolera campos ausentes.
  const plan = planLogPreview(parsed.data as unknown as Partial<LogMonitorsState>)
  if (plan.length === 0) {
    return Response.json({ error: 'Nada a criar: adicione ao menos uma regra com nome.' }, { status: 400 })
  }

  const ctx = ctxFrom({ apiKey, appKey, site })
  const result = await createPlanIdempotent(ctx, plan)
  return Response.json(result)
}
