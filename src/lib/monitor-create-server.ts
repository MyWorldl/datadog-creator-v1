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

// Nomes dos monitores já criados pelo app (tag created_by:monitorscreator).
// null = não deu pra listar (a checagem de duplicados fica desligada — melhor
// criar com risco de duplicar do que travar o usuário).
export async function listExistingMonitorNames(ctx: DatadogCtx): Promise<Set<string> | null> {
  const r = await listMonitors(ctx)
  if (!r.ok) return null
  return new Set(
    (r.json as { tags?: string[]; name?: string }[])
      .filter(m => Array.isArray(m.tags) && m.tags.includes(MONITORSCREATOR_TAG) && typeof m.name === 'string')
      .map(m => m.name as string)
  )
}

// Criações simultâneas por requisição: acelera lotes grandes sem estourar o
// rate limit (429 ainda é retentado em createWithRetry).
const CREATE_CONCURRENCY = 4

export interface CreatePlanOptions {
  // Se informado, é usado no lugar de listar os monitores existentes (o wizard
  // lista UMA vez e manda os lotes já filtrados — listar a cada lote de 25
  // seria desperdício em orgs com milhares de monitores).
  existingNames?: Set<string> | null
}

export async function createPlanIdempotent(ctx: DatadogCtx, plan: MonitorPlanEntry[], opts: CreatePlanOptions = {}): Promise<CreatePlanResult> {
  const existingNames = opts.existingNames !== undefined ? opts.existingNames : await listExistingMonitorNames(ctx)

  // Resultado por ÍNDICE: a ordem de saída é sempre a do plano, mesmo com
  // criações em paralelo (o cliente alinha plan[i] <-> results[i]).
  const results: PlanResultItem[] = new Array(plan.length)
  let next = 0
  async function worker() {
    while (next < plan.length) {
      const i = next++
      const item = plan[i]
      if (existingNames?.has(item.payload.name)) {
        results[i] = { kind: item.kind, service: item.service, operation: item.operation, ok: true, skipped: true, name: item.payload.name }
        continue
      }
      const r = await createWithRetry(ctx, item.payload)
      if (!r.ok) {
        const errMsg = (r.json?.errors && r.json.errors.join('; ')) || (r.status ? `HTTP ${r.status}` : r.error)
        results[i] = { kind: item.kind, service: item.service, operation: item.operation, ok: false, error: errMsg, query: item.query }
      } else {
        results[i] = { kind: item.kind, service: item.service, operation: item.operation, ok: true, id: r.json?.id, name: item.payload.name }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CREATE_CONCURRENCY, plan.length) }, worker))

  const created = results.filter(r => r.ok && !r.skipped).length
  const skipped = results.filter(r => r.skipped).length
  return { created, skipped, total: results.length, results }
}

// Criação em LOTES (wizard): o cliente manda o mesmo estado de sempre mais
// batch = { only: [índices do plano] } e a rota cria só essas posições, sem
// listar os monitores existentes (o cliente já filtrou os duplicados). Sem
// `batch`, comportamento antigo: plano inteiro + checagem de duplicados.
// Plano calculado no servidor a partir do estado continua sendo a fonte da
// verdade (validação e feature flags das rotas seguem valendo).
export const MAX_BATCH = 50

export type BatchSelection<T> =
  | { ok: true; plan: T[]; options: CreatePlanOptions }
  | { ok: false; error: string }

export function selectBatch<T>(batch: unknown, plan: T[]): BatchSelection<T> {
  if (batch === undefined || batch === null) return { ok: true, plan, options: {} }
  const only = (batch as { only?: unknown })?.only
  if (!Array.isArray(only) || only.length === 0 || only.length > MAX_BATCH
    || !only.every(i => Number.isInteger(i) && i >= 0 && i < plan.length)) {
    return { ok: false, error: `Lote inválido (até ${MAX_BATCH} itens, dentro do plano).` }
  }
  return { ok: true, plan: (only as number[]).map(i => plan[i]), options: { existingNames: new Set<string>() } }
}

