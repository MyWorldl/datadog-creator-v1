// src/components/discovery/DiscoveryReview.jsx
'use client'

import { planPreview } from '@/lib/discovery'
import { planInfraPreview } from '@/lib/infra'
import MonitorPlanList from './MonitorPlanList'

const s = {
  card: { border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 14 },
  summary: { fontSize: 13, color: 'var(--text-secondary)' },
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
  const entityLabel = isInfra ? 'host(s)' : (d.scopeType === 'namespace' ? 'namespace(s)' : 'serviço(s)')

  return (
    <div style={s.card}>
      <p style={s.summary}>
        Serão criados <strong>{plan.length}</strong> monitor(es) para <strong>{entities}</strong> {entityLabel},
        agrupados por <strong>{(d.groupBy || []).join(', ') || '—'}</strong>.
        Nada é criado até a Etapa 5.
      </p>

      <MonitorPlanList plan={plan} />

      <div style={s.actions}>
        <button style={s.btnGhost} onClick={onBack}>← Voltar</button>
        <button style={s.btn} onClick={onNext}>Continuar →</button>
      </div>
    </div>
  )
}
