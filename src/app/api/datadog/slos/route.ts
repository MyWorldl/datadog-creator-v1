// src/app/api/datadog/slos/route.ts
//
// Lista os SLOs do org (GET /api/v1/slo) no formato enxuto que o wizard usa
// pra escolher onde criar alertas de burn rate / error budget. Só LEITURA.
// Escopo: slos_read. Atrás da flag sloAlerts (mesma do MonitorsCreator/SLO).

import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom, ddGet } from '@/lib/datadog-server'
import { isFeatureEnabled } from '@/lib/feature-flags'
import type { SloInfo } from '@/lib/slo-monitors'

interface SloRawFull {
  id?: string
  name?: string
  type?: string
  thresholds?: { timeframe?: string; target?: number }[]
}

export async function GET(): Promise<Response> {
  if (!isFeatureEnabled('sloAlerts')) {
    return Response.json({ error: 'Alertas de SLO ainda não estão disponíveis.' }, { status: 403 })
  }
  const user = await getServerUser()
  if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 })

  const { apiKey, appKey, site } = await readSessionKeys()
  if (!apiKey || !appKey || !site) {
    return Response.json({ error: 'Sessão sem credenciais do Datadog. Conecte-se primeiro.' }, { status: 412 })
  }

  const r = await ddGet<{ data?: SloRawFull[] }>(ctxFrom({ apiKey, appKey, site }), '/api/v1/slo?limit=1000')
  if (!r.ok) {
    if (!r.status) return Response.json({ error: 'Falha ao contatar o Datadog: ' + (r.error || 'desconhecida') }, { status: 502 })
    const hint = r.status === 403 ? 'Application key sem permissão/escopo (precisa de slos_read).' : r.status === 401 ? `API key inválida para ${site}.` : undefined
    return Response.json({ error: `Datadog respondeu ${r.status}.`, status: r.status, hint }, { status: [401, 403, 429].includes(r.status) ? r.status : 502 })
  }

  const slos: SloInfo[] = (Array.isArray(r.json?.data) ? r.json.data : [])
    .filter((s): s is SloRawFull & { id: string; name: string } => !!s.id && !!s.name)
    .map(s => ({
      id: s.id,
      name: s.name,
      type: s.type || '',
      // O alerta precisa usar uma janela que o próprio SLO tem configurada.
      timeframe: s.thresholds?.[0]?.timeframe || '7d',
      target: typeof s.thresholds?.[0]?.target === 'number' ? s.thresholds[0].target : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return Response.json({ count: slos.length, slos })
}
