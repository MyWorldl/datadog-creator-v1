// src/components/discovery/DiscoveryReview.jsx
'use client'

import { planPreview } from '@/lib/discovery'
import { planInfraPreview } from '@/lib/infra'

const s = {
  card: { border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 14 },
  summary: { fontSize: 13, color: 'var(--text-secondary)' },
  item: { border: '0.5px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: 'var(--bg-surface-2)' },
  name: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' },
  qLabel: { fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px' },
  query: { fontFamily: 'var(--font-geist-mono), monospace', fontSize: 11, color: 'var(--accent)', background: 'var(--accent-light)', border: '0.5px solid var(--accent)', borderRadius: 6, padding: '8px 10px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: '0 0 6px' },
  msg: { fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: 0 },
  actions: { display: 'flex', justifyContent: 'space-between', paddingTop: 4 },
  btn: { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  btnGhost: { fontSize: 13, color: 'var(--text-secondary)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
}

export default function DiscoveryReview({ config, onNext, onBack }) {
  const isInfra = config.resourceType === 'infra'
  const d = isInfra ? config.infra : config.discovery
  const plan = isInfra ? planInfraPreview(d) : planPreview(d)
  const entities = isInfra
    ? Object.values(d.selected).filter(Boolean).length
    : Object.keys(d.selected).length
  const entityLabel = isInfra ? 'host(s)' : 'serviço(s)'

  return (
    <div style={s.card}>
      <p style={s.summary}>
        Serão criados <strong>{plan.length}</strong> monitor(es) para <strong>{entities}</strong> {entityLabel},
        agrupados por <strong>{(d.groupBy || []).join(', ') || '—'}</strong>.
        Nada é criado até a Etapa 5.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
        {plan.map((m, i) => (
          <div key={i} style={s.item}>
            <p style={s.name}>{m.name}</p>
            <p style={s.qLabel}>Query</p>
            <pre style={s.query}>{m.query}</pre>
            <p style={s.qLabel}>Mensagem</p>
            <p style={s.msg}>{d.messages[m.kind]}</p>
          </div>
        ))}
      </div>

      <div style={s.actions}>
        <button style={s.btnGhost} onClick={onBack}>← Voltar</button>
        <button style={s.btn} onClick={onNext}>Continuar →</button>
      </div>
    </div>
  )
}
