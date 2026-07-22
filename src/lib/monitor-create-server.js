// src/lib/monitor-create-server.js
//
// Criação idempotente de um plano de monitores (Infra ou APM) — extraído de
// infra-monitors/route.js pra ser reaproveitado também por apm-monitors/route.js.
//
// Idempotência: antes de criar, busca os monitores já existentes com a tag
// created_by:monitorscreator e pula (skip) qualquer item do plano cujo NOME
// já exista — evita duplicar tudo se o usuário rodar de novo (wizard ou
// AuditMonitors) para os mesmos hosts/serviços.
// Retry com backoff em 429: chamadas em sequência para muitos itens podem
// bater rate limit da API do Datadog. Um 429 é retentado (até 3x) em vez de
// ser reportado como falha definitiva.

import { ddPost, listMonitors } from './datadog-server.js'

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

export async function createPlanIdempotent(ctx, plan) {
  // Idempotência: nomes de monitores já existentes criados pelo app. Falha na
  // listagem não bloqueia a criação — só desativa a checagem (melhor criar
  // com risco de duplicar do que travar o usuário).
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
  return { created, skipped, total: results.length, results }
}
