// src/lib/supabase-middleware.js
//
// Client Supabase específico do proxy.js (Edge Runtime, NextRequest/
// NextResponse — não a API cookies() do next/headers usada em
// supabase-server.js). Único job: refrescar o cookie de sessão a cada
// request. Não bloqueia nada (mesmo modelo de segurança de hoje — ver
// comentário em proxy.js sobre a CVE-2025-29927).
//
// Ponto de atenção: dentro de setAll, a response PRECISA ser recriada a
// partir do request já atualizado (não reaproveitar a response criada antes
// das mudanças) — inverter essa ordem é a causa mais comum de sessão que não
// persiste nessa integração.

import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export function updateSupabaseSession(request) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (!url || !key) {
    return { supabase: null, response }
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  return { supabase, response }
}
