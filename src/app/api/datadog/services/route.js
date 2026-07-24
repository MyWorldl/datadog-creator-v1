// src/app/api/datadog/services/route.js
//
// Descobre os serviços APM do ambiente do usuário.
// Doc: GET /api/v2/apm/services?filter[env]=*  (escopo apm_read)
//      https://docs.datadoghq.com/api/latest/apm/
//
// As chaves vêm dos cookies httpOnly da sessão — nunca do browser.

import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom, ddGet } from '@/lib/datadog-server'
import { envQuerySchema, firstIssueMessage } from '@/lib/schemas'

export async function GET(request) {
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
  const parsedEnv = envQuerySchema.safeParse(searchParams.get('env')?.trim() || undefined)
  if (!parsedEnv.success) {
    return Response.json({ error: firstIssueMessage(parsedEnv.error) }, { status: 400 })
  }
  const env = parsedEnv.data

  const ctx = ctxFrom({ apiKey, appKey, site })
  const r = await ddGet(ctx, `/api/v2/apm/services?filter[env]=${encodeURIComponent(env)}`)

  if (!r.ok) {
    // Falha de rede (sem status HTTP do Datadog)
    if (!r.status) {
      return Response.json({ error: 'Falha ao contatar o Datadog: ' + (r.error || 'desconhecida') }, { status: 502 })
    }

    let hint
    if (r.status === 401) {
      hint = `API key inválida para ${site}. Confira se a chave é deste site, não foi revogada, ou se não trocou API/App Key de lugar. Use "Testar conexão" em Configurações.`
    } else if (r.status === 403) {
      hint = 'Application key sem permissão/escopo (precisa de apm_read).'
    }
    const upstream = [401, 403, 429].includes(r.status) ? r.status : 502
    return Response.json(
      { error: `Datadog respondeu ${r.status}.`, status: r.status, detail: r.detail, hint },
      { status: upstream }
    )
  }

  // A resposta traz data.attributes.services (lista de nomes).
  // Fazemos parsing defensivo para tolerar variações de formato.
  let services = []
  const data = r.json?.data
  if (Array.isArray(data)) {
    services = data
      .map(d => d?.attributes?.services || d?.id)
      .flat()
      .filter(Boolean)
  } else if (data?.attributes?.services) {
    services = data.attributes.services
  }
  services = [...new Set(services)].sort()

  return Response.json({ env, count: services.length, services })
}
