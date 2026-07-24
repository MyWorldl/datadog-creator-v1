// instrumentation.js  (raiz do projeto)
//
// Next.js chama register() uma vez, no boot de cada runtime, ANTES de
// qualquer rota — é aqui que o Sentry decide se inicializa no server (Node)
// ou no edge (proxy.js), conforme process.env.NEXT_RUNTIME. Os dois arquivos
// importados (sentry.server.config.js / sentry.edge.config.js) já trazem o
// guarda por DSN — sem NEXT_PUBLIC_SENTRY_DSN, nada é inicializado aqui.
//
// onRequestError: hook nativo do Next.js (chamado em QUALQUER erro não
// tratado do lado servidor — Route Handlers, Server Components) — captura
// automaticamente sem precisar de try/catch manual em cada rota. Sentry.
// captureRequestError() já lida com o caso de Sentry.init() nunca ter
// rodado (sem DSN): não lança, só não envia nada.

import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config.js')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config.js')
  }
}

export const onRequestError = Sentry.captureRequestError
