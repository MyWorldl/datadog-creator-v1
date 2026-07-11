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
    //
    // Precisa de try/catch: um cookie de sessão apontando pra um usuário já
    // apagado (ex: conta removida no Supabase Auth) faz getUser() FALHAR
    // (não só retornar erro — lança), o que sem isso derruba o middleware
    // inteiro em TODA request (Internal Server Error), até o cookie expirar
    // ou o usuário limpar o site data. Sem sessão válida = segue como
    // requisição anônima, que é o comportamento correto aqui de qualquer forma.
    try {
      await supabase.auth.getUser()
    } catch {
      // ignora — resultado não é usado, só o refresh de cookie (best-effort)
    }
  }
  return response
}

export const config = {
  // Roda em tudo, menos arquivos estáticos e assets internos do Next.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
