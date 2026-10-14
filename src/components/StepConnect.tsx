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
      <div className="fill-grid">
        <ConnectKeysCard />
        <aside className="surface aside-card" aria-label="Permissões da App key">
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>O que o app precisa na App key</p>
          <ul>
            <li>Listar e criar monitores: <code>monitors_read</code> e <code>monitors_write</code>.</li>
            <li>Descobrir operações dos serviços e medir consumo estimado: <code>metrics_read</code> / <code>timeseries_query</code>.</li>
            <li>Alertas de SLO: <code>slos_read</code>.</li>
            <li>FinOps (consumo e custo): <code>usage_read</code>.</li>
          </ul>
          <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            As chaves ficam cifradas no banco, nunca no navegador. Você pode conectar várias orgs e trocar a ativa quando quiser.
          </p>
        </aside>
      </div>

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
