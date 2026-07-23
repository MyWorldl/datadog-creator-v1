// proxy.js  (raiz do projeto)
//
// No Next.js 16 o antigo "middleware.ts" passou a se chamar "proxy.ts/js".
// Aqui ele faz duas coisas a cada request: (1) refresca o cookie de sessão
// do Supabase Auth (chamando getUser(), que revalida o token) e (2) aplica um
// throttle geral nas rotas /api/connections/* e /api/datadog/* — ver
// checkApiRateLimit em lib/rate-limit.js pro raciocínio do limite escolhido.
//
// ⚠️ Segurança: por causa da CVE-2025-29927 (bypass de middleware via header
// forjado), este proxy é apenas a PRIMEIRA camada. As rotas de API que mexem
// com dados sensíveis revalidam a sessão com getServerUser() no servidor
// (src/lib/supabase-server.js) — o rate limit aqui é defesa em profundidade
// (reduz abuso antes de chegar na rota), não a única barreira de auth. A UI
// (AppShell) só renderiza conteúdo autenticado quando SupabaseAuthContext
// confirma a sessão.

import { updateSupabaseSession } from './src/lib/supabase-middleware'
import { checkApiRateLimit, getClientIp } from './src/lib/rate-limit'

// Prefixos sujos de rate limit — NÃO inclui /api/auth/login, que já tem seu
// próprio limitador (checkLoginRateLimit, semântica de força-bruta/lockout,
// diferente deste throttle geral).
const RATE_LIMITED_PREFIXES = ['/api/connections', '/api/datadog']

export default async function proxy(request) {
  const { supabase, response } = updateSupabaseSession(request)
  let userId = null
  if (supabase) {
    // getUser() força a revalidação/refresh do token e persiste os cookies
    // atualizados na response acima. Reaproveitamos o user.id (se houver)
    // como chave do rate limit abaixo, pra não fazer uma segunda chamada.
    //
    // Precisa de try/catch: um cookie de sessão apontando pra um usuário já
    // apagado (ex: conta removida no Supabase Auth) faz getUser() FALHAR
    // (não só retornar erro — lança), o que sem isso derruba o middleware
    // inteiro em TODA request (Internal Server Error), até o cookie expirar
    // ou o usuário limpar o site data. Sem sessão válida = segue como
    // requisição anônima, que é o comportamento correto aqui de qualquer forma.
    try {
      const { data } = await supabase.auth.getUser()
      userId = data?.user?.id || null
    } catch {
      // ignora — segue anônimo, só o refresh de cookie era best-effort
    }
  }

  const { pathname } = request.nextUrl
  if (RATE_LIMITED_PREFIXES.some((p) => pathname.startsWith(p))) {
    // Por usuário quando autenticado (não pune todo mundo atrás do mesmo IP/
    // escritório); cai pra IP só pra requisição anônima, que a rota rejeita
    // com 401 de qualquer forma.
    const rateKey = userId ? `u:${userId}` : `ip:${getClientIp(request)}`
    const { allowed, retryAfterSeconds } = await checkApiRateLimit(rateKey)
    if (!allowed) {
      return Response.json(
        { error: 'Muitas requisições em pouco tempo. Aguarde alguns segundos e tente novamente.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds || 60) } }
      )
    }
  }

  return response
}

export const config = {
  // Roda em tudo, menos arquivos estáticos e assets internos do Next.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
