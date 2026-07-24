// src/app/api/connections/[id]/route.ts
//
//   PATCH  -> marca esta conexão como ativa (troca de org)
//   DELETE -> remove esta conexão

import type { NextRequest } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { activateConnection, deleteConnection } from '@/lib/connections'
import { connectionIdSchema, firstIssueMessage } from '@/lib/schemas'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<Response> {
  const user = await getServerUser()
  if (!user?.id) {
    return Response.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const { id } = await params
  const parsedId = connectionIdSchema.safeParse(id)
  if (!parsedId.success) {
    return Response.json({ error: firstIssueMessage(parsedId.error) }, { status: 400 })
  }
  try {
    await activateConnection(user.id, parsedId.data)
    return Response.json({ ok: true })
  } catch (e) {
    // "Conexão não encontrada." é uma mensagem segura e específica lançada
    // de propósito (lib/connections.ts) — as demais (prefixo "Falha ao")
    // embutem o erro cru do driver Postgres/Supabase, não repassar ao cliente.
    if ((e as Error).message === 'Conexão não encontrada.') {
      return Response.json({ error: (e as Error).message }, { status: 404 })
    }
    console.error('[connections] falha ao ativar:', e)
    return Response.json({ error: 'Não foi possível trocar de conexão. Tente novamente.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext): Promise<Response> {
  const user = await getServerUser()
  if (!user?.id) {
    return Response.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const { id } = await params
  const parsedId = connectionIdSchema.safeParse(id)
  if (!parsedId.success) {
    return Response.json({ error: firstIssueMessage(parsedId.error) }, { status: 400 })
  }
  try {
    await deleteConnection(user.id, parsedId.data)
    return Response.json({ ok: true })
  } catch (e) {
    console.error('[connections] falha ao remover:', e)
    return Response.json({ error: 'Não foi possível remover a conexão. Tente novamente.' }, { status: 500 })
  }
}
