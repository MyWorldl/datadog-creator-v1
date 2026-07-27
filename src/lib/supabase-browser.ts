// src/lib/supabase-browser.ts
//
// Client Supabase pro browser (client components). Usa a chave `anon`
// (client-safe, diferente da service_role usada em supabase-admin.ts) —
// gerencia a sessão via cookies legíveis por JS, para SupabaseAuthContext.tsx
// e a rota de login conseguirem se manter sincronizados.

'use client'

import { createBrowserClient } from '@supabase/ssr'

let cached: ReturnType<typeof createBrowserClient> | null = null

export function supabaseBrowser(): ReturnType<typeof createBrowserClient> {
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
