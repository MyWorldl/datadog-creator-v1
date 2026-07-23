/** @type {import('next').NextConfig} */

// Origem do Supabase: o browser fala DIRETO com ela pra login/sessão
// (createBrowserClient em src/lib/supabase-browser.js) — precisa entrar em
// connect-src. Lida do mesmo env público que o client já usa, nunca desalinha.
function supabaseOrigin() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').origin
  } catch {
    return ''
  }
}

const isDev = process.env.NODE_ENV !== 'production'

// CSP com 'unsafe-inline' em script/style — não é o ideal (a app inteira usa
// style={{}} inline em vez de classes, e o bootstrap do Next injeta script
// inline), então isso NÃO bloqueia execução de script injetado via XSS (a
// proteção mais forte da CSP). O que ainda vale, mesmo com 'unsafe-inline':
// frame-ancestors (clickjacking, independente disso) e connect-src (limita
// PARA ONDE um script malicioso conseguiria exfiltrar dados via fetch/XHR,
// mesmo que consiga rodar). Endurecer script-src exigiria migrar a
// estilização pra classes/nonce — fora do escopo desta rodada.
function csp() {
  const connectSrc = ["'self'", supabaseOrigin()].filter(Boolean).join(' ')
  const scriptSrc = ["'self'", "'unsafe-inline'", isDev ? "'unsafe-eval'" : null].filter(Boolean).join(' ')
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')
}

const nextConfig = {
  /* config options here */
  reactCompiler: true,

  // Headers de segurança aplicados a toda resposta (páginas e API). Nenhum
  // domínio externo é chamado do browser além de 'self' e do próprio
  // Supabase (fontes via next/font são self-hospedadas em build time;
  // Analytics/Speed Insights usam os entrypoints /next, que roteiam pelo
  // próprio domínio) — ver src/app/layout.js e src/lib/supabase-browser.js.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp() },
          // frame-ancestors 'none' (acima) já cobre navegadores modernos;
          // X-Frame-Options é o fallback pra navegadores mais antigos.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Só faz sentido em produção (HTTPS real); navegadores ignoram
          // HSTS recebido sobre HTTP simples de qualquer forma, mas evita
          // até o dev tooling ficar confuso durante `npm run dev`.
          ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]),
        ],
      },
    ]
  },
};

export default nextConfig;
