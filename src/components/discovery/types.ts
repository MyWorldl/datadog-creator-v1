// src/components/discovery/types.ts
//
// Shape compartilhado do estado do wizard MonitorsCreator (src/app/monitor/page.tsx),
// consumido pelos 5 steps de descoberta (DiscoveryConfigure*, DiscoveryPersonalize,
// DiscoveryReview, DiscoveryCreate) — extraído aqui pra não duplicar a mesma
// interface em cada arquivo.

import type { Dispatch, SetStateAction } from 'react'
import type { DiscoveryState } from '@/lib/discovery'
import type { InfraDiscoveryState } from '@/lib/infra'

export type ResourceType = 'services' | 'infra'

export interface WizardConfig {
  mode: 'discovery'
  resourceType: ResourceType
  discovery: DiscoveryState
  infra: InfraDiscoveryState
}

export type SetWizardConfig = Dispatch<SetStateAction<WizardConfig>>

export interface DiscoveryStepProps {
  config: WizardConfig
  setConfig: SetWizardConfig
  onNext: () => void
  onBack: () => void
}
