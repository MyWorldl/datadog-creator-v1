// src/app/api/datadog/validate/route.js
//
// Sonda de autenticação: confere se a API key + Application key da sessão são
// válidas para o site configurado.
// Doc: GET /api/v2/validate_keys  -> {"status":"ok"} ou 401/403
//      https://docs.datadoghq.com/api/latest/key-management/validate-api-and-application-keys/
//
// 401 normalmente = API key inválida/expirada/de outro site.
// 403 normalmente = Application key sem permissão/escopo.

import { auth } from '@/auth'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom, ddGet } from '@/lib/datadog-server'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
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
  let reason
  if (r.status === 401) {
    reason = `API key inválida para o site ${site} (401). Verifique se a chave é deste site e não foi revogada, ou se você não trocou API Key e Application Key de lugar.`
  } else if (r.status === 403) {
    reason = `Application key sem permissão (403). Confira o escopo/permissões da Application key.`
  } else if (r.status === 429) {
    reason = 'Limite de requisições atingido (429). Tente de novo em instantes.'
  } else {
    reason = `Datadog respondeu ${r.status}.`
  }

  return Response.json({ valid: false, status: r.status, site, reason }, { status: 200 })
}
