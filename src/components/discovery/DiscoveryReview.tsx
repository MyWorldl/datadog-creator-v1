// src/components/discovery/DiscoveryReview.tsx
'use client'

import type { CSSProperties } from 'react'
import { planPreview, type DiscoveryState } from '@/lib/discovery'
import { planInfraPreview, type InfraDiscoveryState } from '@/lib/infra'
import MonitorPlanList from './MonitorPlanList'
import { sourcesFor, type DiscoveryStepProps } from './types'

const s: Record<string, CSSProperties> = {
  card: { border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 14 },
  summary: { fontSize: 13, color: 'var(--text-secondary)' },
  actions: { display: 'flex', justifyContent: 'space-between', paddingTop: 4 },
  btn: { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  btnGhost: { fontSize: 13, color: 'var(--text-secondary)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
}

type DiscoveryReviewProps = Omit<DiscoveryStepProps, 'setConfig'>

export default function DiscoveryReview({ config, onNext, onBack }: DiscoveryReviewProps) {
  const sources = sourcesFor(config.resourceType)

  // resourceType 'k8sDbm' tem 2 fontes (host-like + namespace/global-like) —
  // o plano final e o resumo de entidades juntam as duas, sem duplicar a
  // lógica de planInfraPreview/planPreview que já existe.
  const plan = sources.flatMap(src => src.dataKind === 'infra'
    ? planInfraPreview(config[src.stateKey] as InfraDiscoveryState)
    : planPreview(config[src.stateKey] as DiscoveryState))

  const entityParts = sources
    .map(src => {
      const state = config[src.stateKey]
      if (src.dataKind === 'infra') {
        const count = Object.values((state as InfraDiscoveryState).selected).filter(Boolean).length
        return count > 0 ? `${count} host(s)` : null
      }
      const disc = state as DiscoveryState
      const count = Object.keys(disc.selected).length
      const label = disc.scopeType === 'namespace' ? 'namespace(s)' : 'serviço(s)'
      return count > 0 ? `${count} ${label}` : null
    })
    .filter((p): p is string => !!p)

  const groupByAll = [...new Set(sources.flatMap(src => (config[src.stateKey] as { groupBy: string[] }).groupBy || []))]

  return (
    <div style={s.card}>
      <p style={s.summary}>
        Serão criados <strong>{plan.length}</strong> monitor(es){entityParts.length > 0 && <> para <strong>{entityParts.join(', ')}</strong></>},
        agrupados por <strong>{groupByAll.join(', ') || '—'}</strong>.
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
