// src/components/StepConnect.jsx
// Step 1 — Conectar ao Datadog (agora via sessão httpOnly).
//
// As chaves NÃO ficam mais no estado do wizard. Elas são configuradas uma vez
// por sessão (cookie httpOnly no servidor) e reaproveitadas em todo lugar.
// Aqui só confirmamos que a sessão está conectada antes de avançar.

'use client'

import { useApp } from '@/context/AppContext'
import ConnectKeysCard from '@/components/ConnectKeysCard'

const s = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 16 },
  actions: { display: 'flex', justifyContent: 'flex-end', paddingTop: 4 },
  btnPrimary: {
    fontSize: 13, fontWeight: 600, color: '#fff',
    background: 'var(--accent)', border: 'none', borderRadius: 8,
    padding: '9px 20px', cursor: 'pointer',
  },
  btnDisabled: {
    fontSize: 13, fontWeight: 600, color: '#fff',
    background: 'var(--text-muted)', border: 'none', borderRadius: 8,
    padding: '9px 20px', cursor: 'not-allowed',
  },
  note: { fontSize: 12, color: 'var(--text-muted)', margin: 0 },
}

export default function StepConnect({ onNext }) {
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
        <button
          style={keysConfigured ? s.btnPrimary : s.btnDisabled}
          onClick={keysConfigured ? onNext : undefined}
          disabled={!keysConfigured}
        >
          Continuar
        </button>
      </div>
    </div>
  )
}
