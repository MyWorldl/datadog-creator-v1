// src/app/api/datadog/hosts/route.ts
//
// Descobre os hosts de infraestrutura do ambiente do usuário.
// Doc: GET /api/v1/hosts  (escopo hosts_read)
//      https://docs.datadoghq.com/api/latest/hosts/
//
// As chaves vêm dos cookies httpOnly da sessão — nunca do browser.
// Query opcional: /api/datadog/hosts?filter=env:prod
// (filter usa a sintaxe de busca de hosts do Datadog; vazio = todos)

import type { NextRequest } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom, listHosts } from '@/lib/datadog-server'
import { hostFilterSchema, firstIssueMessage } from '@/lib/schemas'

interface HostRaw {
  host_name?: string
  name?: string
  up?: boolean
  is_muted?: boolean
  last_reported_time?: number
  tags_by_source?: Record<string, string[]>
}

export async function GET(request: NextRequest): Promise<Response> {
  const user = await getServerUser()
  if (!user) {
    return Response.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const { apiKey, appKey, site } = await readSessionKeys()
  if (!apiKey || !appKey || !site) {
    return Response.json(
      { error: 'Sessão sem credenciais do Datadog. Conecte-se primeiro.' },
      { status: 412 }
    )
  }

  const { searchParams } = new URL(request.url)
  const parsedFilter = hostFilterSchema.safeParse(searchParams.get('filter') || '')
  if (!parsedFilter.success) {
    return Response.json({ error: firstIssueMessage(parsedFilter.error) }, { status: 400 })
  }
  const filter = parsedFilter.data

  const ctx = ctxFrom({ apiKey, appKey, site })
  const r = await listHosts(ctx, filter)

  if (!r.ok) {
    if (!r.status) {
      return Response.json({ error: 'Falha ao contatar o Datadog: ' + (r.error || 'desconhecida') }, { status: 502 })
    }
    let hint
    if (r.status === 401) {
      hint = `API key inválida para ${site}. Confira se a chave é deste site, não foi revogada, ou se não trocou API/App Key de lugar. Use "Testar conexão" em Configurações.`
    } else if (r.status === 403) {
      hint = 'Application key sem permissão/escopo (precisa de hosts_read).'
    }
    const upstream = [401, 403, 429].includes(r.status) ? r.status : 502
    return Response.json(
      { error: `Datadog respondeu ${r.status}.`, status: r.status, detail: r.detail, hint },
      { status: upstream }
    )
  }

  // Formato leve para a UI: nome, se está reportando (up) e tags relevantes.
  // tags_by_source agrega tags por origem (Agent, AWS, etc.) — juntamos tudo
  // num array plano e mantemos só o necessário para exibir/filtrar por env.
  const hosts = (r.json as HostRaw[])
    .map(h => {
      const allTags = Object.values(h.tags_by_source || {}).flat()
      return {
        name: h.host_name || h.name,
        up: !!h.up,
        muted: !!h.is_muted,
        lastReportedAt: h.last_reported_time ? h.last_reported_time * 1000 : null,
        tags: allTags,
      }
    })
    .filter(h => h.name)
    .sort((a, b) => (a.name as string).localeCompare(b.name as string))

  return Response.json({ filter: filter || '*', count: hosts.length, hosts, partial: !!r.partial })
}
