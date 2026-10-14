// src/components/discovery/DiscoveryReview.tsx
'use client'

import type { CSSProperties } from 'react'
import { planPreview, type DiscoveryState } from '@/lib/discovery'
import { planInfraPreview, type InfraDiscoveryState } from '@/lib/infra'
import { planLogPreview, type LogMonitorsState } from '@/lib/log-monitors'
import { planSloPreview, type SloMonitorsState } from '@/lib/slo-monitors'
import MonitorPlanList from './MonitorPlanList'
import { sourcesFor, type DiscoveryStepProps } from './types'

const s: Record<string, CSSProperties> = {
  summary: { fontSize: 13, color: 'var(--text-secondary)' },
  actions: { display: 'flex', justifyContent: 'space-between', paddingTop: 4 },
}

type DiscoveryReviewProps = Omit<DiscoveryStepProps, 'setConfig'>

export default function DiscoveryReview({ config, onNext, onBack }: DiscoveryReviewProps) {
  const sources = sourcesFor(config.resourceType)

  // resourceType 'k8sDbm' tem 2 fontes (host-like + namespace/global-like) —
  // o plano final e o resumo de entidades juntam as duas, sem duplicar a
  // lógica de planInfraPreview/planPreview que já existe.
  const plan = sources.flatMap(src => {
    if (src.dataKind === 'infra') return planInfraPreview(config[src.stateKey] as InfraDiscoveryState)
    if (src.dataKind === 'log') return planLogPreview(config[src.stateKey] as LogMonitorsState)
    if (src.dataKind === 'slo') return planSloPreview(config[src.stateKey] as SloMonitorsState)
    return planPreview(config[src.stateKey] as DiscoveryState)
  })

  const entityParts = sources
    .map(src => {
      const state = config[src.stateKey]
      if (src.dataKind === 'infra') {
        const count = Object.values((state as InfraDiscoveryState).selected).filter(Boolean).length
        return count > 0 ? `${count} host(s)` : null
      }
      if (src.dataKind === 'log') {
        const count = (state as LogMonitorsState).rules.length
        return count > 0 ? `${count} regra(s)` : null
      }
      if (src.dataKind === 'slo') {
        const count = Object.values((state as SloMonitorsState).selected).filter(Boolean).length
        return count > 0 ? `${count} SLO(s)` : null
      }
      const disc = state as DiscoveryState
      const count = Object.keys(disc.selected).length
      const label = disc.scopeType === 'namespace' ? 'namespace(s)' : 'serviço(s)'
      return count > 0 ? `${count} ${label}` : null
    })
    .filter((p): p is string => !!p)

  const groupByAll = [...new Set(sources.flatMap(src => (config[src.stateKey] as { groupBy: string[] }).groupBy || []))]

  return (
    <div className="wz-card">
      <p style={s.summary}>
        Serão criados <strong>{plan.length}</strong> monitor(es){entityParts.length > 0 && <> para <strong>{entityParts.join(', ')}</strong></>}
        {groupByAll.length > 0 ? <>, agrupados por <strong>{groupByAll.join(', ')}</strong>. </> : '. '}
        Nada é criado até a Etapa 5.
      </p>

      <MonitorPlanList plan={plan} />

      <div style={s.actions}>
        <button className="btn btn-ghost" onClick={onBack}><span className="btn-arrow-back" aria-hidden="true">←</span> Voltar</button>
        <button className="btn btn-primary" onClick={onNext}>Continuar <span className="btn-arrow" aria-hidden="true">→</span></button>
      </div>
    </div>
  )
}
