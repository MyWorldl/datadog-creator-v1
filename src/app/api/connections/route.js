// src/app/api/connections/route.js
//
// Gerencia as conexões Datadog (múltiplas orgs) do usuário logado.
// As chaves ficam cifradas no Supabase — nunca voltam pro browser.
//
//   GET  -> lista as conexões do usuário (id, nome, site, ativa?) — sem chaves
//   POST -> cria uma nova conexão (valida as chaves contra o Datadog antes de salvar)

import { getServerUser } from '@/lib/supabase-server'
import { listConnections, createConnection } from '@/lib/connections'
import { VALID_SITES } from '@/lib/session-keys'
import { ctxFrom, ddGet } from '@/lib/datadog-server'

export async function GET() {
  const user = await getServerUser()
  if (!user?.id) {
    return Response.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  try {
    const connections = await listConnections(user.id)
    return Response.json({ connections })
  } catch (e) {
    // Detalhe completo (pode incluir mensagem do driver Postgres/Supabase)
    // só no log do servidor — o cliente recebe uma mensagem genérica.
    console.error('[connections] falha ao listar:', e)
    return Response.json({ error: 'Não foi possível carregar suas conexões. Tente novamente.' }, { status: 500 })
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

  const name = String(body?.name || '').trim()
  const apiKey = String(body?.apiKey || '').trim()
  const appKey = String(body?.appKey || '').trim()
  const site = String(body?.site || '').trim()

  if (apiKey.length < 10) return Response.json({ error: 'API Key parece inválida.' }, { status: 400 })
  if (appKey.length < 10) return Response.json({ error: 'Application Key parece inválida.' }, { status: 400 })
  if (!VALID_SITES.includes(site)) return Response.json({ error: 'Site do Datadog inválido.' }, { status: 400 })

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
    console.error('[connections] falha ao criar:', e)
    return Response.json({ error: 'Não foi possível salvar a conexão. Tente novamente.' }, { status: 500 })
  }
}
