// src/components/StepConnect.tsx
// Step 1 — Conectar ao Datadog (múltiplas orgs, guardadas no Supabase).
//
// As chaves NÃO ficam no estado do wizard. Cada usuário conecta quantas orgs
// quiser (ConnectKeysCard) e uma delas fica marcada como ativa; aqui só
// confirmamos que existe pelo menos uma org ativa antes de avançar.

'use client'

import type { CSSProperties } from 'react'
import { useApp } from '@/context/AppContext'
import ConnectKeysCard from '@/components/ConnectKeysCard'

const s: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 16, animation: 'wzStepIn 0.35s var(--ease-out) both' },
  actions: { display: 'flex', justifyContent: 'flex-end', paddingTop: 4 },
  note: { fontSize: 12, color: 'var(--text-muted)', margin: 0 },
}

export default function StepConnect({ onNext }: { onNext: () => void }) {
  const { keysConfigured } = useApp()

  return (
    <div style={s.wrap}>
      <ConnectKeysCard />

      {!keysConfigured && (
        <p style={s.note}>
          Conecte-se ao Datadog acima para liberar o próximo passo.
        </p>
      )}

      <div style={s.actions}>
        <button className="btn btn-primary" onClick={onNext} disabled={!keysConfigured}>
          Continuar <span className="btn-arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  )
}
