// src/app/api/datadog/naming-convention/route.ts
//
// Sugere o prefixo de nome dos novos monitores a partir da convenção já usada
// no org (ver lib/naming-convention.ts). Só LEITURA — nunca cria/altera nada.
//
// Query: /api/datadog/naming-convention?hints=svc-a,svc-b  (hints opcionais:
// nomes das entidades escolhidas, pra priorizar monitores relacionados a elas)
// Resposta: { suggestion: { prefix, matched, total, source } | null }

import type { NextRequest } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom, listMonitors } from '@/lib/datadog-server'
import { detectNamingConvention, type MonitorNameLike } from '@/lib/naming-convention'
import { cacheKey, cacheGet, cacheSet } from '@/lib/route-cache'

const CACHE_TTL_MS = 60 * 1000
const MAX_HINTS = 300

export async function GET(request: NextRequest): Promise<Response> {
  const user = await getServerUser()
  if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 })

  const { apiKey, appKey, site } = await readSessionKeys()
  if (!apiKey || !appKey || !site) {
    return Response.json({ error: 'Sessão sem credenciais do Datadog.' }, { status: 412 })
  }

  const hints = (new URL(request.url).searchParams.get('hints') || '')
    .split(',').map(s => s.trim()).filter(s => s && s.length <= 100).slice(0, MAX_HINTS)

  // Só a lista enxuta (name+tags) fica em cache — a busca em si é barata.
  const key = cacheKey(['naming-monitors', site, apiKey, appKey])
  let monitors = (await cacheGet(key)) as MonitorNameLike[] | null
  if (!monitors) {
    const r = await listMonitors(ctxFrom({ apiKey, appKey, site }))
    if (!r.ok) {
      // Sugestão é um extra: falha não deve atrapalhar o wizard.
      return Response.json({ suggestion: null, error: `Datadog respondeu ${r.status || r.error || 'erro'}.` })
    }
    monitors = (Array.isArray(r.json) ? r.json : []).map(m => {
      const mm = m as { name?: unknown; tags?: unknown }
      return { name: mm.name, tags: mm.tags }
    })
    await cacheSet(key, monitors, CACHE_TTL_MS)
  }

  return Response.json({ suggestion: detectNamingConvention(monitors, hints) })
}
