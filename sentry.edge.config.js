// sentry.edge.config.js  (raiz do projeto)
//
// Inicialização do Sentry no runtime Edge (proxy.js roda aqui). Mesmo guarda
// por DSN dos outros dois — ver instrumentation-client.js. Importado por
// instrumentation.js -> register(), nunca diretamente.

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  })
}
