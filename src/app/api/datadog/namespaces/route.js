// src/app/api/datadog/namespaces/route.js
//
// Descobre os valores de kube_namespace COM TRÁFEGO APM, via Metrics Query
// API: agrupa métricas de trace por kube_namespace e enumera os valores
// distintos das séries retornadas.
//   GET /api/v1/query?query=sum:trace.<op>.hits{*} by {kube_namespace}, ...
// Escopo timeseries_query.
//
// Por que Metrics e não a Spans Analytics Aggregate API: a Aggregate API é
// amostrada e o group_by kube_namespace volta VAZIO de forma imprevisível
// (confirmado em smoke-test contra o Datadog real — 0 namespaces em toda
// repetição). A Metrics Query API é pré-agregada e não amostrada — enumera
// os namespaces de forma consistente. Ver metricTagValues em datadog-server.js.
//
// Por que VÁRIAS métricas-sonda (não só http.request): um namespace só aparece
// se emitir a métrica consultada. http.request cobre a maioria, mas serviços
// só-mensageria/kafka (sem http) ficariam de fora — confirmado no smoke-test
// (freeflow-sorocabana-* só apareciam ao incluir sondas não-http). Consultamos
// as operações de ENTRADA mais comuns numa única query (métricas separadas por
// vírgula = 1 request), o que recuperou todos os 18 namespaces reais. Mesmo
// assim o client (DiscoveryConfigure.jsx) mantém entrada manual como
// complemento, pra cobrir qualquer operação de entrada exótica fora da lista.
//
// As chaves vêm dos cookies httpOnly da sessão — nunca do browser.

import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom, metricTagValues, isSafeDqlToken } from '@/lib/datadog-server'
import { NAMESPACE_PROBE_OPERATIONS } from '@/lib/discovery'

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
  const env = (searchParams.get('env') || '').trim()
  if (env && !isSafeDqlToken(env)) {
    return Response.json({ error: 'Valor de env inválido (use apenas letras, dígitos, ponto, underscore, hífen ou barra).' }, { status: 400 })
  }

  const ctx = ctxFrom({ apiKey, appKey, site })
  const toSec = Math.floor(Date.now() / 1000)
  const fromSec = toSec - 86400 // últimas 24h
  const scope = env ? `env:${env}` : '*'
  const query = NAMESPACE_PROBE_OPERATIONS
    .map(op => `sum:trace.${op}.hits{${scope}} by {kube_namespace}`)
    .join(', ')
  const r = await metricTagValues(ctx, query, 'kube_namespace', fromSec, toSec)

  if (!r.ok) {
    // Falha de rede (sem status HTTP do Datadog)
    if (!r.status) {
      return Response.json({ error: 'Falha ao contatar o Datadog: ' + (r.error || 'desconhecida') }, { status: 502 })
    }

    let hint
    if (r.status === 401) {
      hint = `API key inválida para ${site}. Confira se a chave é deste site, não foi revogada, ou se não trocou API/App Key de lugar. Use "Testar conexão" em Configurações.`
    } else if (r.status === 403) {
      hint = 'Application key sem permissão/escopo (precisa de timeseries_query).'
    }
    const upstream = [401, 403, 429].includes(r.status) ? r.status : 502
    return Response.json(
      { error: `Datadog respondeu ${r.status}.`, status: r.status, detail: r.detail, hint },
      { status: upstream }
    )
  }

  const namespaces = [...new Set(r.values)].sort()

  return Response.json({ env, count: namespaces.length, namespaces })
}
