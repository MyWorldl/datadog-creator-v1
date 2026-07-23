// instrumentation-client.js  (raiz do projeto — convenção do Next.js 15+)
//
// Inicialização do Sentry no BROWSER. Guardado explicitamente por DSN: sem
// NEXT_PUBLIC_SENTRY_DSN definida, Sentry.init() nem é chamado — zero
// requisição de rede, zero mudança de comportamento. Só liga de verdade
// quando o usuário configurar sua própria conta/projeto Sentry.
//
// Escopo deliberadamente mínimo: só exceções + performance básica. Session
// Replay/Feedback widget (que gravam a tela do usuário) foram deixados de
// fora de propósito — são uma decisão de privacidade própria, não algo pra
// ligar por padrão numa app que lida com o ambiente Datadog de clientes.

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
