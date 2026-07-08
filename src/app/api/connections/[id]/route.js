// src/app/api/connections/[id]/route.js
//
//   PATCH  -> marca esta conexão como ativa (troca de org)
//   DELETE -> remove esta conexão

import { auth } from '@/auth'
import { activateConnection, deleteConnection } from '@/lib/connections'

export async function PATCH(request, { params }) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const { id } = await params
  try {
    await activateConnection(session.user.id, id)
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 })
  }
}

export async function DELETE(request, { params }) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const { id } = await params
  try {
    await deleteConnection(session.user.id, id)
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 })
  }
}
