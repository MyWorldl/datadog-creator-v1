// src/app/api/datadog/service-monitors/route.js
//
// Cria os monitores de ANOMALY DETECTION planejados no fluxo de descoberta.
// Chamado apenas na ETAPA 5. Recebe o estado de descoberta e usa o mesmo
// planejador do preview (src/lib/discovery.js) para não haver divergência.

import { auth } from '@/auth'
import { readSessionKeys } from '@/lib/session-keys'
import { planPreview } from '@/lib/discovery'

export async function POST(request) {
  const session = await auth()
  if (!session?.user) return Response.json({ error: 'Não autenticado.' }, { status: 401 })

  const { apiKey, appKey, site } = await readSessionKeys()
  if (!apiKey || !appKey || !site) {
    return Response.json({ error: 'Sessão sem credenciais do Datadog.' }, { status: 412 })
  }

  let body
  try { body = await request.json() } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const discovery = body?.discovery || body
  const plan = planPreview(discovery)
  if (plan.length === 0) {
    return Response.json({ error: 'Nada a criar: selecione serviço(s), operação(ões) e tipo(s) de alerta.' }, { status: 400 })
  }

  const monitorUrl = `https://api.${site}/api/v1/monitor`
  const results = []

  for (const item of plan) {
    try {
      const r = await fetch(monitorUrl, {
        method: 'POST',
        headers: {
          'DD-API-KEY': apiKey,
          'DD-APPLICATION-KEY': appKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(item.payload),
        cache: 'no-store',
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        results.push({ kind: item.kind, service: item.service, operation: item.operation, ok: false, error: (j?.errors && j.errors.join('; ')) || `HTTP ${r.status}`, query: item.query })
      } else {
        results.push({ kind: item.kind, service: item.service, operation: item.operation, ok: true, id: j.id, name: item.name })
      }
    } catch (e) {
      results.push({ kind: item.kind, service: item.service, operation: item.operation, ok: false, error: e.message, query: item.query })
    }
  }

  const created = results.filter(r => r.ok).length
  return Response.json({ created, total: results.length, results })
}
