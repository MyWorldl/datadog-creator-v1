// src/app/api/datadog/bulk-rename-monitors/route.ts
//
// Renomeação em lote de monitores existentes, por busca/substituição no
// nome — GET monta o preview (quem casa e qual seria o nome novo), POST
// aplica de fato (1 PUT por monitor, só o campo `name`; query/tags/options
// ficam intactos). Fluxo preview -> revisão -> confirmação, mesmo espírito
// do "Criar os que faltam" do AuditMonitors.

import type { NextRequest } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom, ddPut, listMonitors, type DatadogCtx } from '@/lib/datadog-server'
import { computeRenames } from '@/lib/bulk-rename'
import { bulkRenamePreviewSchema, bulkRenameApplySchema, firstIssueMessage } from '@/lib/schemas'

function sleep(ms: number): Promise<void> { return new Promise(res => setTimeout(res, ms)) }

// Retry com backoff em 429, mesmo padrão de createWithRetry
// (monitor-create-server.ts) — chamadas em sequência pra muitos monitores
// podem bater rate limit da API do Datadog.
async function renameWithRetry(ctx: DatadogCtx, id: string | number, name: string, maxAttempts = 3) {
  let last
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await ddPut<{ id?: unknown; errors?: string[] }>(ctx, `/api/v1/monitor/${id}`, { name })
    if (r.ok) return r
    last = r
    if (r.status !== 429) return r
    await sleep(500 * attempt)
  }
  return last!
}

export async function GET(request: NextRequest): Promise<Response> {
  const user = await getServerUser()
  if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 })

  const { apiKey, appKey, site } = await readSessionKeys()
  if (!apiKey || !appKey || !site) {
    return Response.json({ error: 'Sessão sem credenciais do Datadog.' }, { status: 412 })
  }

  const url = new URL(request.url)
  const parsed = bulkRenamePreviewSchema.safeParse({
    search: url.searchParams.get('search') || '',
    replace: url.searchParams.get('replace') || '',
  })
  if (!parsed.success) return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })

  const ctx = ctxFrom({ apiKey, appKey, site })
  const monitorsR = await listMonitors(ctx)
  if (!monitorsR.ok) {
    return Response.json({ error: `Falha ao listar monitores (${monitorsR.status || monitorsR.error}).` }, { status: monitorsR.status === 403 ? 403 : 502 })
  }

  const monitors = (Array.isArray(monitorsR.json) ? monitorsR.json : []) as { id: string | number; name?: string }[]
  const matches = computeRenames(monitors, parsed.data.search, parsed.data.replace)
  return Response.json({ total: matches.length, matches, partial: !!monitorsR.partial })
}

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
  const parsed = bulkRenameApplySchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })

  const ctx = ctxFrom({ apiKey, appKey, site })
  const results: { id: string | number; ok: boolean; name: string; error?: string }[] = []
  for (const { id, name } of parsed.data.renames) {
    const r = await renameWithRetry(ctx, id, name)
    if (!r.ok) {
      const errMsg = (r.json?.errors && r.json.errors.join('; ')) || (r.status ? `HTTP ${r.status}` : r.error)
      results.push({ id, ok: false, name, error: errMsg })
    } else {
      results.push({ id, ok: true, name })
    }
  }

  const renamed = results.filter(r => r.ok).length
  return Response.json({ renamed, total: results.length, results })
}
