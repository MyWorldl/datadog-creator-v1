// proxy.js  (raiz do projeto)
//
// No Next.js 16 o antigo "middleware.ts" passou a se chamar "proxy.ts/js".
// Aqui ele só refresca o cookie de sessão do Supabase Auth a cada request
// (chamando getUser(), que revalida o token) — não bloqueia nada.
//
// ⚠️ Segurança: por causa da CVE-2025-29927 (bypass de middleware via header
// forjado), este proxy é apenas a PRIMEIRA camada. As rotas de API que mexem
// com dados sensíveis revalidam a sessão com getServerUser() no servidor
// (src/lib/supabase-server.js). A UI (AppShell) só renderiza conteúdo
// autenticado quando SupabaseAuthContext confirma a sessão.

import { updateSupabaseSession } from './src/lib/supabase-middleware'

export default async function proxy(request) {
  const { supabase, response } = updateSupabaseSession(request)
  if (supabase) {
    // getUser() força a revalidação/refresh do token e persiste os cookies
    // atualizados na response acima. O resultado em si não é usado aqui.
    await supabase.auth.getUser()
  }
  return response
}

export const config = {
  // Roda em tudo, menos arquivos estáticos e assets internos do Next.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
