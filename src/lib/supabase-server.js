// src/lib/supabase-server.js
//
// Client Supabase pro servidor (Route Handlers / Server Components), usando
// a chave `anon` + cookies() do App Router — diferente de supabase-admin.js
// (service_role, sem cookies, só para CRUD administrativo de conexões).
//
// getServerUser() substitui o antigo auth() do next-auth: usa getUser()
// (nunca getSession()) porque revalida o JWT contra o servidor do Supabase
// em vez de só decodificar o cookie — é a chamada correta pra decisões de
// autorização no servidor. Erros são sempre engolidos (retorna null) pra
// preservar o comportamento atual das rotas: "falha ao checar sessão" =
// tratar como não autenticado, não deixar a exceção propagar como 500.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { logError } from './logger.ts'

async function buildClient() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

  if (!url || !key) {
    throw new Error(
      'Supabase (server) não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    )
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // set() fora de um Route Handler/Server Action (ex: durante render
          // de Server Component) lança — inofensivo, o proxy.js já cuida de
          // refrescar/persistir a sessão a cada request.
        }
      },
    },
  })
}

export async function supabaseServer() {
  return buildClient()
}

export async function getServerUser() {
  try {
    const supabase = await buildClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return null
    return { id: user.id, email: user.email, name: user.user_metadata?.name || user.email }
  } catch (err) {
    logError('supabase-server', err)
    return null
  }
}
