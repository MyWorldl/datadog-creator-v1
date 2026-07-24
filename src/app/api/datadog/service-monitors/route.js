// src/app/api/datadog/service-monitors/route.js
//
// Cria os monitores de ANOMALY DETECTION planejados no fluxo de descoberta.
// Chamado apenas na ETAPA 5. Recebe o estado de descoberta e usa o mesmo
// planejador do preview (src/lib/discovery.js) para não haver divergência.

import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { planPreview } from '@/lib/discovery'
import { ctxFrom, ddPost } from '@/lib/datadog-server'
import { discoveryBodySchema, firstIssueMessage } from '@/lib/schemas'

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

  const parsed = discoveryBodySchema.safeParse(body?.discovery || body)
  if (!parsed.success) return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
  const plan = planPreview(parsed.data)
  if (plan.length === 0) {
    return Response.json({ error: 'Nada a criar: selecione serviço(s), operação(ões) e tipo(s) de alerta.' }, { status: 400 })
  }

  const ctx = ctxFrom({ apiKey, appKey, site })
  const results = []

  for (const item of plan) {
    const r = await ddPost(ctx, '/api/v1/monitor', item.payload)
    if (!r.ok) {
      const errMsg = (r.json?.errors && r.json.errors.join('; ')) || (r.status ? `HTTP ${r.status}` : r.error)
      results.push({ kind: item.kind, service: item.service, operation: item.operation, ok: false, error: errMsg, query: item.query })
    } else {
      results.push({ kind: item.kind, service: item.service, operation: item.operation, ok: true, id: r.json.id, name: item.name })
    }
  }

  const created = results.filter(r => r.ok).length
  return Response.json({ created, total: results.length, results })
}
