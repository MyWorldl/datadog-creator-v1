// src/components/discovery/styles.ts
//
// Helpers de estilo compartilhados pelos 3 wizards de criação de monitor
// (DiscoveryConfigure, DiscoveryConfigureInfra, DiscoveryConfigureK8sDbm) —
// estavam copiados byte a byte nos 3 arquivos (achado da auditoria). Fonte
// única aqui; cada arquivo mantém seu próprio objeto `s` (estilos que NÃO
// se repetem entre os 3), só esses 5 helpers saem daqui.

import type { CSSProperties } from 'react'

// Estado de uma sub-etapa do mini-wizard interno (Entidades/Operações/
// Alertas em DiscoveryConfigure; Hosts/Métricas em DiscoveryConfigureInfra).
export type SubStepState = 'done' | 'active' | 'pending'

export const subNavItemStyle = (state: SubStepState): CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5,
  fontWeight: state === 'active' ? 700 : 500,
  color: state === 'active' ? 'var(--accent)' : state === 'done' ? 'var(--success)' : 'var(--text-muted)',
})

export const subNavDotStyle = (state: SubStepState): CSSProperties => ({
  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
  background: state === 'active' ? 'var(--accent)' : state === 'done' ? 'var(--success)' : 'var(--border)',
})

// Card de accordion (métrica/alerta habilitável, expande ao clicar).
export const accStyle = (on: boolean): CSSProperties => ({ border: '0.5px solid var(--border)', borderRadius: 10, background: 'var(--bg-surface-2)', overflow: 'hidden', opacity: on ? 1 : 0.7 })

// Seta (chevron) do cabeçalho do accordion — gira 90° quando aberto.
export const chevStyle = (open: boolean): CSSProperties => ({ fontSize: 11, color: 'var(--text-muted)', transition: 'transform .15s', transform: open ? 'rotate(90deg)' : 'none' })

// "last_15m" -> "15m" — janelas do Datadog exibidas sem o prefixo, que ficava
// parecendo um sublinhado colado ao número.
export const winShort = (w: string): string => (w || '').replace('last_', '')
