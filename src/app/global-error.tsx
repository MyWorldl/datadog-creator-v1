// src/app/global-error.tsx
//
// Error Boundary de ÚLTIMA instância: só dispara se o erro acontecer no
// PRÓPRIO root layout (src/app/layout.tsx) ou nos Providers — error.tsx não
// cobre esse caso, pois ele vive DENTRO do layout. Por isso este arquivo
// precisa renderizar <html>/<body> do zero (substitui o layout inteiro
// quando ativo) e usa cores fixas em vez de var(--...): não há garantia de
// que globals.css tenha sido aplicado se o próprio layout falhou.

'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { logError } from '@/lib/logger'

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    logError('app/global-error-boundary', error, { digest: error?.digest })
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: '#0F0F1A', color: '#EDEDED', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 14, padding: '2rem', textAlign: 'center',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: '#3A211E', color: '#E8968D',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800,
          }}>!</div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>A aplicação encontrou um erro crítico</h1>
          <p style={{ fontSize: 13, color: '#AAAAAA', maxWidth: 440, margin: 0 }}>
            O erro já foi registrado. Recarregar a página costuma resolver.
          </p>
          <button
            onClick={reset}
            style={{
              fontSize: 13, fontWeight: 600, color: '#fff', background: '#534AB7',
              border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', marginTop: 4,
            }}
          >
            Recarregar
          </button>
        </div>
      </body>
    </html>
  )
}
