/** @type {import('next').NextConfig} */
import { withSentryConfig } from '@sentry/nextjs'

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

// Mesma lógica pro Sentry: SEM NEXT_PUBLIC_SENTRY_DSN (ver
// instrumentation-client.js), Sentry.init() nunca roda, então isto retorna
// '' e não muda a CSP em nada. COM DSN configurado, o browser passa a
// reportar erros pro domínio de ingest do Sentry — sem liberar isso aqui, a
// própria CSP bloquearia o SDK de enviar os eventos.
function sentryOrigin() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SENTRY_DSN || '').origin
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
  const connectSrc = ["'self'", supabaseOrigin(), sentryOrigin()].filter(Boolean).join(' ')
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

  // Não anuncia "X-Powered-By: Next.js" (fingerprint inútil pra quem ataca).
  poweredByHeader: false,

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
          // Isola o contexto de navegação (mitiga ataques cross-window tipo
          // Spectre / window.opener) — o app não abre popups de terceiros.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
      {
        // Respostas de API carregam dados da conta Datadog do usuário (hosts,
        // monitores, consumo) — nunca devem ficar em cache de browser/proxy.
        source: '/api/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
    ]
  },
};

// Upload de source maps é OPCIONAL e só ativa se SENTRY_ORG/SENTRY_PROJECT/
// SENTRY_AUTH_TOKEN estiverem definidas (dados da conta Sentry do usuário —
// não posso preencher isso por ele). Sem elas, withSentryConfig ainda
// funciona normalmente (captura de erro via DSN continua ativa se
// configurada) — só pula o upload, sem quebrar o build. `silent: true`
// evita ruído no log de build enquanto não estiver configurado.
const sentryBuildOptions = {
  ...(process.env.SENTRY_ORG ? { org: process.env.SENTRY_ORG } : {}),
  ...(process.env.SENTRY_PROJECT ? { project: process.env.SENTRY_PROJECT } : {}),
  ...(process.env.SENTRY_AUTH_TOKEN ? { authToken: process.env.SENTRY_AUTH_TOKEN } : {}),
  silent: true,
  widenClientFileUpload: true,
}

export default withSentryConfig(nextConfig, sentryBuildOptions);
