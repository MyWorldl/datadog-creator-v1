// src/context/SupabaseAuthContext.js
//
// Substitui o SessionProvider/useSession do next-auth/react. Expõe a MESMA
// forma que os componentes já consumiam ({ data: session, status }, com
// session.user = {id, name, email}) para minimizar o diff em AppShell.js,
// AppContext.js, Sidebar.jsx e ferramentas/dashboard/page.js — só a linha de
// import muda nesses arquivos.
//
// `refresh()` existe porque o login acontece num Route Handler (servidor),
// não no browser client — o onAuthStateChange sozinho não percebe que os
// cookies mudaram, então LoginPage chama refresh() manualmente após o POST
// em /api/auth/login ter sucesso.

'use client'
/* eslint-disable react-hooks/set-state-in-effect --
   Efeito intencional: sincroniza o estado local com a sessão do Supabase
   Auth (sistema externo) no mount + assinatura de onAuthStateChange, mesmo
   padrão já usado em AppContext.js. */

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

const Ctx = createContext({ data: null, status: 'loading', refresh: async () => {} })

function toSessionShape(user) {
  if (!user) return { data: null, status: 'unauthenticated' }
  return {
    data: { user: { id: user.id, email: user.email, name: user.user_metadata?.name || user.email } },
    status: 'authenticated',
  }
}

export function SupabaseAuthProvider({ children }) {
  const [state, setState] = useState({ data: null, status: 'loading' })

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabaseBrowser().auth.getUser()
    setState(toSessionShape(user))
  }, [])

  useEffect(() => {
    refresh()

    const { data: sub } = supabaseBrowser().auth.onAuthStateChange((_event, session) => {
      setState(toSessionShape(session?.user ?? null))
    })
    return () => sub.subscription.unsubscribe()
  }, [refresh])

  return <Ctx.Provider value={{ ...state, refresh }}>{children}</Ctx.Provider>
}

export function useSession() {
  return useContext(Ctx)
}

export async function signOut({ callbackUrl = '/' } = {}) {
  await supabaseBrowser().auth.signOut()
  window.location.href = callbackUrl
}
