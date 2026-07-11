// src/lib/supabase-browser.js
//
// Client Supabase pro browser (client components). Usa a chave `anon`
// (client-safe, diferente da service_role usada em supabase-admin.js) —
// gerencia a sessão via cookies legíveis por JS, para SupabaseAuthContext.js
// e a rota de login conseguirem se manter sincronizados.

'use client'

import { createBrowserClient } from '@supabase/ssr'

let cached = null

export function supabaseBrowser() {
  if (cached) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

  if (!url || !key) {
    throw new Error(
      'Supabase (client) não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    )
  }

  cached = createBrowserClient(url, key)
  return cached
}
