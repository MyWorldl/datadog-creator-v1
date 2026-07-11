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
    return Response.json({ error: e.message }, { status: 400 })
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
    return Response.json({ error: e.message }, { status: 400 })
  }
}
