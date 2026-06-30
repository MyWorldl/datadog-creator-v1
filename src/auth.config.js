// src/auth.config.js
//
// Configuração "edge-safe" do Auth.js (NextAuth v5).
//
// Por que separar deste jeito? O proxy.js do Next 16 roda no Edge Runtime,
// que NÃO suporta libs como o bcryptjs. Então aqui ficam só as partes que
// rodam em qualquer runtime (páginas, callbacks, estratégia de sessão).
// A parte pesada (Credentials + bcrypt) fica em src/auth.js, que só roda no
// Node (route handlers / server components).
//
// Padrão recomendado pela doc oficial:
// https://authjs.dev/getting-started/migrating-to-v5

export const authConfig = {
  // Sessão via JWT é obrigatória para o provider Credentials
  // (sessões em banco não funcionam com Credentials).
  session: { strategy: 'jwt' },

  // Para onde mandar quem não está logado. No nosso app o login é
  // renderizado "inline" pela AppShell, mas deixamos '/' como destino.
  pages: {
    signIn: '/',
  },

  // Os providers são preenchidos em src/auth.js (Credentials precisa do bcrypt,
  // que não roda no edge). Deixar vazio aqui mantém este arquivo edge-safe.
  providers: [],

  callbacks: {
    // Controle de acesso central. Roda no proxy (edge) e decide quem entra.
    // IMPORTANTE: por causa da CVE-2025-29927, NÃO confiamos só nisto —
    // as rotas de API também validam a sessão com auth() no servidor.
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user
      const { pathname } = request.nextUrl

      // /api/* se autoprotege com auth() dentro de cada rota (defesa em
      // profundidade). Deixamos passar aqui para a rota responder o status
      // correto (401 JSON) em vez de um redirect HTML.
      if (pathname.startsWith('/api')) return true

      // Assets internos do Next
      if (pathname.startsWith('/_next') || pathname === '/favicon.ico') return true

      // Páginas exigem login
      return isLoggedIn
    },
  },
}
