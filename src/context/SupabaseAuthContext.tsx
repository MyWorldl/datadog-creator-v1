// src/context/SupabaseAuthContext.tsx
//
// Substitui o SessionProvider/useSession do next-auth/react. Expõe a MESMA
// forma que os componentes já consumiam ({ data: session, status }, com
// session.user = {id, name, email}) para minimizar o diff em AppShell.tsx,
// AppContext.tsx, Sidebar.tsx e ferramentas/dashboard/page.tsx — só a linha de
// import muda nesses arquivos.
//
// `refresh()` existe porque o login acontece num Route Handler (servidor),
// não no browser client — o onAuthStateChange sozinho não percebe que os
// cookies mudaram, então LoginPage chama refresh() manualmente após o POST
// em /api/auth/login ter sucesso.
//
// ⚠️ Links gerados pela Admin API (convite, recovery — ver
// scripts/create-supabase-user.mjs / scripts/migrate-users-to-supabase-auth.mjs)
// sempre voltam com os tokens em #access_token=...&refresh_token=... (hash),
// nunca em ?code=. O client do browser (@supabase/ssr) usa flowType "pkce"
// fixo, que só sabe processar ?code= — sozinho, ele IGNORA esse hash e
// nenhuma sessão é criada (a pessoa clica no link, cai no app, e continua
// deslogada). Por isso processamos o hash manualmente abaixo, com
// setSession(), antes de qualquer outra coisa.

'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { logError } from '@/lib/logger'

export interface SessionUser {
  id: string
  email: string | undefined
  name: string
}

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface SessionState {
  data: { user: SessionUser } | null
  status: SessionStatus
}

interface SessionContextValue extends SessionState {
  refresh: () => Promise<void>
}

const Ctx = createContext<SessionContextValue>({ data: null, status: 'loading', refresh: async () => {} })

function toSessionShape(user: User | null | undefined): SessionState {
  if (!user) return { data: null, status: 'unauthenticated' }
  return {
    data: { user: { id: user.id, email: user.email, name: user.user_metadata?.name || user.email } },
    status: 'authenticated',
  }
}

// Processa manualmente #access_token=...&refresh_token=... (link de
// convite/recovery gerado pela Admin API) — ver aviso acima. Retorna true se
// achou e tentou aplicar um hash desse tipo (chamador não precisa mais
// checar getUser() antes, onAuthStateChange já vai disparar).
async function consumeAuthHashIfPresent(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.location.hash) return false
  const params = new URLSearchParams(window.location.hash.slice(1))
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (!accessToken || !refreshToken) return false

  try {
    await supabaseBrowser().auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
  } catch (err) {
    // Token expirado/inválido (link de convite velho, já usado, etc.) — cai
    // pra tela de login normalmente em vez de travar a página.
    logError('auth', err, { hint: 'falha ao aplicar sessão do link (token expirado/inválido/já usado)' })
  }
  // Limpa o hash da URL (tokens/erro não devem ficar visíveis/persistidos ali).
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  return true
}

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ data: null, status: 'loading' })

  const refresh = useCallback(async () => {
    try {
      const { data: { user } } = await supabaseBrowser().auth.getUser()
      setState(toSessionShape(user))
    } catch {
      setState(toSessionShape(null))
    }
  }, [])

  useEffect(() => {
    consumeAuthHashIfPresent().then(() => refresh())

    const { data: sub } = supabaseBrowser().auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setState(toSessionShape(session?.user ?? null))
    })
    return () => sub.subscription.unsubscribe()
  }, [refresh])

  return <Ctx.Provider value={{ ...state, refresh }}>{children}</Ctx.Provider>
}

export function useSession(): SessionContextValue {
  return useContext(Ctx)
}

export async function signOut({ callbackUrl = '/' }: { callbackUrl?: string } = {}): Promise<void> {
  await supabaseBrowser().auth.signOut()
  window.location.href = callbackUrl
}
