// src/app/api/datadog/infra-monitors/route.js
//
// Cria os monitores de INFRAESTRUTURA (CPU/Memória/Disco por host)
// planejados no fluxo de descoberta. Espelha service-monitors/route.js,
// com duas diferenças propositais:
//
//  1) Idempotência: antes de criar, busca os monitores já existentes com a
//     tag created_by:monitorscreator e pula (skip) qualquer item do plano
//     cujo NOME já exista — evita duplicar tudo se o usuário rodar o wizard
//     de novo para os mesmos hosts.
//  2) Retry com backoff em 429: chamadas em sequência para muitos hosts ×
//     métricas podem bater rate limit da API do Datadog. Um 429 é
//     retentado (até 3x) em vez de ser reportado como falha definitiva.

import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { planInfraPreview } from '@/lib/infra'
import { ctxFrom, ddPost, listMonitors } from '@/lib/datadog-server'

const MONITORSCREATOR_TAG = 'created_by:monitorscreator'

function sleep(ms) { return new Promise(res => setTimeout(res, ms)) }

async function createWithRetry(ctx, payload, maxAttempts = 3) {
  let lastErr
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await ddPost(ctx, '/api/v1/monitor', payload)
    if (r.ok) return r
    lastErr = r
    if (r.status !== 429) return r // só retenta rate limit
    await sleep(500 * attempt) // backoff: 500ms, 1000ms, 1500ms
  }
  return lastErr
}

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

  const infra = body?.infra || body
  const plan = planInfraPreview(infra)
  if (plan.length === 0) {
    return Response.json({ error: 'Nada a criar: selecione host(s) e métrica(s) de infra.' }, { status: 400 })
  }

  const ctx = ctxFrom({ apiKey, appKey, site })

  // Idempotência: nomes de monitores já existentes criados pelo wizard.
  // Falha na listagem não bloqueia a criação — só desativa a checagem
  // (melhor criar com risco de duplicar do que travar o usuário).
  const existingR = await listMonitors(ctx)
  const existingNames = new Set(
    existingR.ok
      ? existingR.json
          .filter(m => Array.isArray(m.tags) && m.tags.includes(MONITORSCREATOR_TAG))
          .map(m => m.name)
      : []
  )

  const results = []
  for (const item of plan) {
    if (existingNames.has(item.payload.name)) {
      results.push({ kind: item.kind, service: item.service, operation: item.operation, ok: true, skipped: true, name: item.payload.name })
      continue
    }
    const r = await createWithRetry(ctx, item.payload)
    if (!r.ok) {
      const errMsg = (r.json?.errors && r.json.errors.join('; ')) || (r.status ? `HTTP ${r.status}` : r.error)
      results.push({ kind: item.kind, service: item.service, operation: item.operation, ok: false, error: errMsg, query: item.query })
    } else {
      results.push({ kind: item.kind, service: item.service, operation: item.operation, ok: true, id: r.json.id, name: item.payload.name })
    }
  }

  const created = results.filter(r => r.ok && !r.skipped).length
  const skipped = results.filter(r => r.skipped).length
  return Response.json({ created, skipped, total: results.length, results })
}
