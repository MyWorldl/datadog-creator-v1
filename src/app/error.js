// src/app/error.js
//
// Error Boundary do App Router: captura qualquer erro não tratado dentro de
// uma página/rota (renderização de componente, não erro de API — aquilo já
// vira JSON de erro tratado pelas próprias rotas). Sem isso, um erro de
// render White-screen'ava a aplicação inteira sem nenhum log nem forma de
// o usuário se recuperar sem um F5 manual.
//
// Precisa ser Client Component (o App Router exige) e loga com o mesmo
// logger estruturado usado no backend, pra aparecer correlacionado nos logs
// do deploy (Vercel) em vez de só no console do navegador do usuário.

'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { logError } from '@/lib/logger'

export default function Error({ error, reset }) {
  useEffect(() => {
    logError('app/error-boundary', error, { digest: error?.digest })
    // Sem NEXT_PUBLIC_SENTRY_DSN, Sentry.init() nunca rodou — captureException
    // não lança nesse caso, só não envia nada (SDK já trata isso sozinho).
    Sentry.captureException(error)
  }, [error])

  return (
    <div style={{
      minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 14, padding: '2rem', textAlign: 'center',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, background: 'var(--danger-bg)', color: 'var(--danger)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800,
      }}>!</div>
      <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Algo deu errado nesta página</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 440, margin: 0 }}>
        O erro já foi registrado. Tente novamente — se persistir, volte para a Home.
      </p>
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button
          onClick={reset}
          style={{
            fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)',
            border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer',
          }}
        >
          Tentar novamente
        </button>
        <a
          href="/ferramentas/dashboard"
          style={{
            fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-surface)',
            border: '0.5px solid var(--border)', borderRadius: 8, padding: '9px 18px', textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center',
          }}
        >
          Voltar para a Home
        </a>
      </div>
    </div>
  )
}
