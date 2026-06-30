// src/app/api/datadog/services/route.js
//
// Descobre os serviços APM do ambiente do usuário.
// Doc: GET /api/v2/apm/services?filter[env]=*  (escopo apm_read)
//      https://docs.datadoghq.com/api/latest/apm/
//
// As chaves vêm dos cookies httpOnly da sessão — nunca do browser.

import { auth } from '@/auth'
import { readSessionKeys } from '@/lib/session-keys'

export async function GET(request) {
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

  const { searchParams } = new URL(request.url)
  const env = (searchParams.get('env') || '*').trim() || '*'

  const url = `https://api.${site}/api/v2/apm/services?filter[env]=${encodeURIComponent(env)}`

  let ddResp
  try {
    ddResp = await fetch(url, {
      headers: {
        'DD-API-KEY': apiKey,
        'DD-APPLICATION-KEY': appKey,
        'Accept': 'application/json',
      },
      cache: 'no-store',
    })
  } catch (e) {
    return Response.json({ error: 'Falha ao contatar o Datadog: ' + e.message }, { status: 502 })
  }

  if (!ddResp.ok) {
    const text = await ddResp.text().catch(() => '')
    let hint
    if (ddResp.status === 401) {
      hint = `API key inválida para ${site}. Confira se a chave é deste site, não foi revogada, ou se não trocou API/App Key de lugar. Use "Testar conexão" em Configurações.`
    } else if (ddResp.status === 403) {
      hint = 'Application key sem permissão/escopo (precisa de apm_read).'
    }
    const upstream = [401, 403, 429].includes(ddResp.status) ? ddResp.status : 502
    return Response.json(
      { error: `Datadog respondeu ${ddResp.status}.`, status: ddResp.status, detail: text.slice(0, 300), hint },
      { status: upstream }
    )
  }

  const json = await ddResp.json().catch(() => null)

  // A resposta traz data.attributes.services (lista de nomes).
  // Fazemos parsing defensivo para tolerar variações de formato.
  let services = []
  const data = json?.data
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
