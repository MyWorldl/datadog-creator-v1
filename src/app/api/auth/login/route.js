// src/app/api/auth/login/route.js
//
// Login via Supabase Auth. Fica num Route Handler (em vez de chamar
// signInWithPassword direto do browser) para preservar o rate-limit por IP
// que já existia no next-auth (src/lib/rate-limit.js) — se o login fosse
// feito só no client, essa checagem ficaria de fora do caminho.
//
// Roda no servidor: usa o client de src/lib/supabase-server.js, que já seta
// os cookies de sessão na resposta via @supabase/ssr.
//
// ⚠️ LIMITE DESSA PROTEÇÃO: NEXT_PUBLIC_SUPABASE_URL/ANON_KEY são públicas
// (vão pro bundle do browser) — nada impede alguém de chamar
// "${SUPABASE_URL}/auth/v1/token?grant_type=password" DIRETO, sem passar
// por esta rota, contornando o rate-limit por IP abaixo. Isso é diferente
// do modelo antigo (next-auth), onde authorize() só rodava no servidor sem
// endpoint público equivalente. Mitigação real: configurar o rate-limit
// nativo do projeto (Supabase Dashboard -> Authentication -> Rate Limits,
// limite de "Sign in with password" / token endpoint) como camada extra —
// o lockout por IP aqui é só a parte com mensagem amigável pro usuário.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getClientIp, checkLoginRateLimit, recordFailedLogin, resetLoginAttempts } from '@/lib/rate-limit'

export async function POST(request) {
  const ip = getClientIp(request)
  const rl = await checkLoginRateLimit(ip)
  if (!rl.allowed) {
    return Response.json({ ok: false, code: 'rate_limited' }, { status: 429 })
  }

  const body = await request.json().catch(() => ({}))
  const email = String(body?.email || '').trim().toLowerCase()
  const password = String(body?.password || '')
  if (!email || !password) {
    return Response.json({ ok: false, code: 'invalid_credentials' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (!url || !key) {
    console.error('[api/auth/login] NEXT_PUBLIC_SUPABASE_URL/ANON_KEY não configurados.')
    return Response.json({ ok: false, code: 'server_error' }, { status: 500 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
      },
    },
  })

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    await recordFailedLogin(ip)
    return Response.json({ ok: false, code: 'invalid_credentials' }, { status: 401 })
  }

  await resetLoginAttempts(ip)
  return Response.json({ ok: true })
}
