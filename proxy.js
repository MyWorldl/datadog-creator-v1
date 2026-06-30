// proxy.js  (raiz do projeto)
//
// No Next.js 16 o antigo "middleware.ts" passou a se chamar "proxy.ts/js".
// Aqui ele faz a primeira barreira de acesso usando o callback "authorized"
// definido em src/auth.config.js.
//
// ⚠️ Segurança: por causa da CVE-2025-29927 (bypass de middleware via header
// forjado), este proxy é apenas a PRIMEIRA camada. As rotas de API que mexem
// com dados sensíveis revalidam a sessão com auth() no servidor.

import NextAuth from 'next-auth'
import { authConfig } from './src/auth.config'

export const { auth: proxy } = NextAuth(authConfig)

export default proxy((req) => {
  // O callback "authorized" (em auth.config.js) já decide o acesso.
  // Nada extra é necessário aqui.
})

export const config = {
  // Roda em tudo, menos arquivos estáticos e assets internos do Next.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
