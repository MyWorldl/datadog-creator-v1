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

  // Confia no host atual. Necessário para self-host fora da Vercel
  // (sem isto, o Auth.js v5 pode lançar "UntrustedHost" em produção).
  trustHost: true,

  // O login é renderizado "inline" pela AppShell em qualquer rota.
  pages: {
    signIn: '/',
  },

  // Os providers são preenchidos em src/auth.js (Credentials precisa do bcrypt,
  // que não roda no edge). Deixar vazio aqui mantém este arquivo edge-safe.
  providers: [],

  callbacks: {
    // PASS-THROUGH proposital. Este app usa login "inline": a AppShell mostra
    // a tela de login em QUALQUER rota quando não há sessão. Se o proxy
    // redirecionasse páginas para '/', entraria em loop com a raiz, que
    // redireciona para o dashboard (protegido) -> '/' -> dashboard -> ...
    //
    // A proteção real está em duas camadas que NÃO dependem deste callback:
    //   1) AppShell (UX): sem sessão => renderiza o Login, não o conteúdo.
    //   2) Rotas /api: revalidam a sessão com auth() no servidor (inclusive
    //      por causa da CVE-2025-29927). Nada sensível é renderizado no
    //      HTML das páginas — segredos vivem em cookies httpOnly lidos só lá.
    authorized() {
      return true
    },
  },
}
