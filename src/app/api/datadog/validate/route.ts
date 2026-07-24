// src/app/api/datadog/validate/route.ts
//
// Sonda de autenticação: confere se a API key + Application key da sessão são
// válidas para o site configurado.
// Doc: GET /api/v2/validate_keys  -> {"status":"ok"} ou 401/403
//      https://docs.datadoghq.com/api/latest/key-management/validate-api-and-application-keys/
//
// 401 normalmente = API key inválida/expirada/de outro site.
// 403 normalmente = Application key sem permissão/escopo.

import type { NextRequest } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom, ddGet, type DdResult } from '@/lib/datadog-server'
import { datadogKeysSchema, firstIssueMessage } from '@/lib/schemas'

function friendlyReason(r: DdResult, site: string): string {
  if (!r.status) return 'Falha de rede: ' + (r.error || 'desconhecida')
  if (r.status === 401) {
    return `API key inválida para o site ${site} (401). Verifique se a chave é deste site e não foi revogada, ou se você não trocou API Key e Application Key de lugar.`
  }
  if (r.status === 403) {
    return `Application key sem permissão (403). Confira o escopo/permissões da Application key.`
  }
  if (r.status === 429) {
    return 'Limite de requisições atingido (429). Tente de novo em instantes.'
  }
  return `Datadog respondeu ${r.status}.`
}

export async function GET(): Promise<Response> {
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

  const ctx = ctxFrom({ apiKey, appKey, site })
  const r = await ddGet(ctx, '/api/v2/validate_keys')

  if (r.ok) {
    return Response.json({ valid: true, site })
  }

  // Falha de rede (sem status HTTP do Datadog)
  if (!r.status) {
    return Response.json({ valid: false, reason: 'Falha de rede: ' + (r.error || 'desconhecida') }, { status: 502 })
  }

  // Mensagem amigável por status
  const reason = friendlyReason(r, site)
  return Response.json({ valid: false, status: r.status, site, reason }, { status: 200 })
}

// POST — valida chaves ainda não salvas (usado no formulário "Adicionar org",
// antes de gravar a conexão no Supabase). Não persiste nada.
export async function POST(request: NextRequest): Promise<Response> {
  const user = await getServerUser()
  if (!user) {
    return Response.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const parsed = datadogKeysSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ valid: false, reason: firstIssueMessage(parsed.error) })
  }
  const { apiKey, appKey, site } = parsed.data

  const ctx = ctxFrom({ apiKey, appKey, site })
  const r = await ddGet(ctx, '/api/v2/validate_keys')

  if (r.ok) return Response.json({ valid: true, site })
  return Response.json({ valid: false, status: r.status, site, reason: friendlyReason(r, site) })
}
