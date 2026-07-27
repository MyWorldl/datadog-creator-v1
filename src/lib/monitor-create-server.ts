// src/lib/monitor-create-server.ts
//
// Criação idempotente de um plano de monitores (Infra ou APM) — extraído de
// infra-monitors/route.ts pra ser reaproveitado também por apm-monitors/route.ts.
//
// Idempotência: antes de criar, busca os monitores já existentes com a tag
// created_by:monitorscreator e pula (skip) qualquer item do plano cujo NOME
// já exista — evita duplicar tudo se o usuário rodar de novo (wizard ou
// AuditMonitors) para os mesmos hosts/serviços.
// Retry com backoff em 429: chamadas em sequência para muitos itens podem
// bater rate limit da API do Datadog. Um 429 é retentado (até 3x) em vez de
// ser reportado como falha definitiva.

import { ddPost, listMonitors } from './datadog-server.ts'
import type { DatadogCtx } from './datadog-server.ts'

const MONITORSCREATOR_TAG = 'created_by:monitorscreator'

// Formato mínimo comum aos 3 shapes de plano que passam por aqui: o array já
// validado por schemas.ts (Plan, passthrough) vindo do AuditMonitors/wizard,
// e os InfraPlanItem[]/PlanItem[] montados por infra.ts/discovery.ts a partir
// de um discovery bruto. Sem index signature no payload (diferente de Plan)
// de propósito — isso é o que permite qualquer um dos 3 shapes reais ser
// aceito aqui sem cast, já que todos têm pelo menos name/type/query.
export interface MonitorPlanEntry {
  kind?: unknown
  service?: unknown
  operation?: unknown
  query?: unknown
  payload: { name: string; type: string; query: string }
}

function sleep(ms: number): Promise<void> { return new Promise(res => setTimeout(res, ms)) }

async function createWithRetry(ctx: DatadogCtx, payload: unknown, maxAttempts = 3) {
  let lastErr
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await ddPost<{ id?: unknown; errors?: string[] }>(ctx, '/api/v1/monitor', payload)
    if (r.ok) return r
    lastErr = r
    if (r.status !== 429) return r // só retenta rate limit
    await sleep(500 * attempt) // backoff: 500ms, 1000ms, 1500ms
  }
  return lastErr!
}

export interface PlanResultItem {
  kind: unknown
  service: unknown
  operation: unknown
  ok: boolean
  skipped?: boolean
  name?: string
  id?: unknown
  error?: unknown
  query?: unknown
}

export interface CreatePlanResult {
  created: number
  skipped: number
  total: number
  results: PlanResultItem[]
}

export async function createPlanIdempotent(ctx: DatadogCtx, plan: MonitorPlanEntry[]): Promise<CreatePlanResult> {
  // Idempotência: nomes de monitores já existentes criados pelo app. Falha na
  // listagem não bloqueia a criação — só desativa a checagem (melhor criar
  // com risco de duplicar do que travar o usuário).
  const existingR = await listMonitors(ctx)
  const existingNames = new Set(
    existingR.ok
      ? (existingR.json as { tags?: string[]; name?: string }[])
          .filter(m => Array.isArray(m.tags) && m.tags.includes(MONITORSCREATOR_TAG))
          .map(m => m.name)
      : []
  )

  const results: PlanResultItem[] = []
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
      results.push({ kind: item.kind, service: item.service, operation: item.operation, ok: true, id: r.json?.id, name: item.payload.name })
    }
  }

  const created = results.filter(r => r.ok && !r.skipped).length
  const skipped = results.filter(r => r.skipped).length
  return { created, skipped, total: results.length, results }
}
