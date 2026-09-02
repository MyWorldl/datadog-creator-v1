// src/components/discovery/types.ts
//
// Shape compartilhado do estado do wizard MonitorsCreator (src/app/monitor/page.tsx),
// consumido pelos 5 steps de descoberta (DiscoveryConfigure*, DiscoveryPersonalize,
// DiscoveryReview, DiscoveryCreate) — extraído aqui pra não duplicar a mesma
// interface em cada arquivo.

import type { Dispatch, SetStateAction } from 'react'
import type { DiscoveryState } from '@/lib/discovery'
import type { InfraDiscoveryState } from '@/lib/infra'
import type { LogMonitorsState } from '@/lib/log-monitors'

export type ResourceType = 'services' | 'infra' | 'k8sDbm' | 'logs'

export interface WizardConfig {
  mode: 'discovery'
  resourceType: ResourceType
  discovery: DiscoveryState
  infra: InfraDiscoveryState
  // Aba dedicada "APM e Infraestrutura" (Kubernetes/DBM, atrás da flag
  // k8sDbmCoverage) — reaproveita os MESMOS dois shapes de estado (infra-like
  // pra Node Ready/DB, discovery-like pra Pod Restarts/Pod Pending) em vez de
  // um 3º shape novo, pra reaproveitar planInfraPreview/planPreview e as
  // rotas infra-monitors/service-monitors sem duplicar lógica de criação.
  k8sInfra: InfraDiscoveryState
  k8sDiscovery: DiscoveryState
  // Aba "Logs" (atrás da flag logMonitors) — shape PRÓPRIO (não reaproveita
  // discovery/infra): não existe "entidade descoberta" aqui, cada regra já
  // é o monitor inteiro (filtro + índice + janela + limite). Ver
  // lib/log-monitors.ts.
  logMonitors: LogMonitorsState
}

export type SetWizardConfig = Dispatch<SetStateAction<WizardConfig>>

export interface DiscoveryStepProps {
  config: WizardConfig
  setConfig: SetWizardConfig
  onNext: () => void
  onBack: () => void
}

// Chave de estado + shape de dado por resourceType, usado por
// DiscoveryPersonalize/Review/Create pra não hardcodar mais um "isInfra"
// binário — 'services'/'infra' continuam com 1 fonte só (comportamento
// idêntico a antes), 'k8sDbm' tem DUAS fontes (host-like + namespace/global-
// like) que entram juntas no plano/criação, cada uma com sua própria seção
// de personalização.
export interface PersonalizeSource {
  stateKey: 'discovery' | 'infra' | 'k8sInfra' | 'k8sDiscovery' | 'logMonitors'
  dataKind: 'infra' | 'discovery' | 'log'
  heading?: string
}

export function sourcesFor(resourceType: ResourceType): PersonalizeSource[] {
  if (resourceType === 'infra') return [{ stateKey: 'infra', dataKind: 'infra' }]
  if (resourceType === 'k8sDbm') return [
    { stateKey: 'k8sInfra', dataKind: 'infra', heading: 'Host — Node Ready / Banco de Dados' },
    { stateKey: 'k8sDiscovery', dataKind: 'discovery', heading: 'Namespace / Global — Pod Restarts / Pod Pending' },
  ]
  if (resourceType === 'logs') return [{ stateKey: 'logMonitors', dataKind: 'log' }]
  return [{ stateKey: 'discovery', dataKind: 'discovery' }]
}
