// src/app/api/connections/route.js
//
// Gerencia as conexões Datadog (múltiplas orgs) do usuário logado.
// As chaves ficam cifradas no Supabase — nunca voltam pro browser.
//
//   GET  -> lista as conexões do usuário (id, nome, site, ativa?) — sem chaves
//   POST -> cria uma nova conexão (valida as chaves contra o Datadog antes de salvar)

import { getServerUser } from '@/lib/supabase-server'
import { listConnections, createConnection } from '@/lib/connections'
import { ctxFrom, ddGet } from '@/lib/datadog-server'
import { createConnectionSchema, firstIssueMessage } from '@/lib/schemas'

export async function GET() {
  const user = await getServerUser()
  if (!user?.id) {
    return Response.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  try {
    const connections = await listConnections(user.id)
    return Response.json({ connections })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request) {
  const user = await getServerUser()
  if (!user?.id) {
    return Response.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const parsed = createConnectionSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
  }
  const { name, apiKey, appKey, site } = parsed.data

  // Confere as chaves no Datadog ANTES de gravar — evita salvar credencial inválida.
  const ctx = ctxFrom({ apiKey, appKey, site })
  const probe = await ddGet(ctx, '/api/v2/validate_keys')
  if (!probe.ok) {
    const reason = probe.status === 401
      ? 'API key inválida para esse site (401).'
      : probe.status === 403
        ? 'Application key sem permissão (403).'
        : probe.status
          ? `Datadog respondeu ${probe.status}.`
          : `Falha de rede: ${probe.error || 'desconhecida'}.`
    return Response.json({ error: `Não foi possível validar as chaves: ${reason}` }, { status: 422 })
  }

  try {
    const connection = await createConnection(user.id, { name, apiKey, appKey, site })
    return Response.json({ connection })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
