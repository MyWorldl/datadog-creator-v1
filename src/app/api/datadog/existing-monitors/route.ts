// src/app/api/datadog/existing-monitors/route.ts
//
// Nomes dos monitores já criados pelo app (tag created_by:monitorscreator).
// O wizard chama UMA vez antes de criar em lotes, pra pular o que já existe
// (idempotência) sem listar o org inteiro a cada lote. Só LEITURA.

import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom } from '@/lib/datadog-server'
import { listExistingMonitorNames } from '@/lib/monitor-create-server'

export const maxDuration = 60

export async function GET(): Promise<Response> {
  const user = await getServerUser()
  if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 })

  const { apiKey, appKey, site } = await readSessionKeys()
  if (!apiKey || !appKey || !site) {
    return Response.json({ error: 'Sessão sem credenciais do Datadog.' }, { status: 412 })
  }

  const names = await listExistingMonitorNames(ctxFrom({ apiKey, appKey, site }))
  if (!names) return Response.json({ error: 'Não foi possível listar os monitores existentes no Datadog.' }, { status: 502 })
  return Response.json({ names: [...names] })
}
