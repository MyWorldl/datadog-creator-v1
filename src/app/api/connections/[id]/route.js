// src/app/api/connections/[id]/route.js
//
//   PATCH  -> marca esta conexão como ativa (troca de org)
//   DELETE -> remove esta conexão

import { getServerUser } from '@/lib/supabase-server'
import { activateConnection, deleteConnection } from '@/lib/connections'

export async function PATCH(request, { params }) {
  const user = await getServerUser()
  if (!user?.id) {
    return Response.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const { id } = await params
  try {
    await activateConnection(user.id, id)
    return Response.json({ ok: true })
  } catch (e) {
    // "Conexão não encontrada." é uma mensagem segura e específica lançada
    // de propósito (lib/connections.js) — as demais (prefixo "Falha ao")
    // embutem o erro cru do driver Postgres/Supabase, não repassar ao cliente.
    if (e.message === 'Conexão não encontrada.') {
      return Response.json({ error: e.message }, { status: 404 })
    }
    console.error('[connections] falha ao ativar:', e)
    return Response.json({ error: 'Não foi possível trocar de conexão. Tente novamente.' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  const user = await getServerUser()
  if (!user?.id) {
    return Response.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const { id } = await params
  try {
    await deleteConnection(user.id, id)
    return Response.json({ ok: true })
  } catch (e) {
    console.error('[connections] falha ao remover:', e)
    return Response.json({ error: 'Não foi possível remover a conexão. Tente novamente.' }, { status: 500 })
  }
}
