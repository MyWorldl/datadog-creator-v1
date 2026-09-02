// src/components/Icons.tsx
// Ícones SVG modernos (estilo linha), sem dependência externa.
// Todos herdam a cor via currentColor e o tamanho via prop `size`.
'use client'

import type { SVGProps } from 'react'

const base = (size: number): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
})

interface IconProps {
  size?: number
}

export const IconDashboard = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
)
export const IconMonitorsCreator = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
)
export const IconScope = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M12 12l4.5-4.5"/><path d="M4 18a9 9 0 1 1 16 0"/></svg>
)
export const IconAnalytics = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><path d="M3 3v18h18"/><path d="M7 15l3.5-4 3 2.5L20 7"/></svg>
)
export const IconFinops = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.66 3.13 3 7 3s7-1.34 7-3V6"/><path d="M5 12v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6"/></svg>
)
export const IconSettings = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
)
export const IconInfo = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>
)
export const IconRename = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><path d="M17 3a2.83 2.83 0 0 1 4 4L7 21l-4 1 1-4z"/></svg>
)
export const IconLogout = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>
)
export const IconArrow = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}><path d="M5 12h14M13 6l6 6-6 6"/></svg>
)
export const IconMenu = ({ size = 20 }: IconProps) => (
  <svg {...base(size)}><path d="M3 6h18M3 12h18M3 18h18"/></svg>
)
export const IconClose = ({ size = 20 }: IconProps) => (
  <svg {...base(size)}><path d="M18 6 6 18M6 6l12 12"/></svg>
)
export const IconEye = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
)
export const IconEyeOff = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><path d="M2 12s3.5-7 10-7c1.6 0 3 .34 4.24.9M22 12s-3.5 7-10 7c-1.6 0-3-.34-4.24-.9"/><path d="M6.6 6.6C4.2 8.1 2 12 2 12M17.4 17.4C19.8 15.9 22 12 22 12"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M2 2l20 20"/></svg>
)

// ── Ícones de status (achado da auditoria: StatusIcon em CollapsibleCard.tsx
// e o triângulo de aviso em ferramentas/analise/page.tsx eram inline/
// duplicados — path idêntico em 2 lugares. Fonte única aqui. ──
export const IconCheck = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><path d="M20 6 9 17l-5-5"/></svg>
)
export const IconWarning = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><path d="M12 3 21 19H3z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg>
)
export const IconError = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
)
export const IconNeutral = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><path d="M5 12h14"/></svg>
)

// ── Ícones temáticos dos pilares do ScopeMaturity (movidos de
// ferramentas/analise/page.tsx, mesmo motivo — fonte única). ──
export const IconLayers = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg>
)
export const IconBell = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
)
export const IconPulse = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
)
export const IconChecklist = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>
)
export const IconShieldCheck = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z"/><path d="m9 12 2 2 4-4"/></svg>
)

// ── Ícones de domínio Infra/K8s/DBM (achado da auditoria: essas seções eram
// só texto, sem glifo, diferente do resto do catálogo — cobertura de
// produto/finanças/sistema/serviço já tinha ícone próprio). ──
export const IconServer = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><rect x="2" y="3" width="20" height="8" rx="2"/><rect x="2" y="13" width="20" height="8" rx="2"/><path d="M6 7h.01"/><path d="M6 17h.01"/></svg>
)
export const IconCluster = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
)
export const IconDatabase = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>
)
// Log Monitor (aba Logs do MonitorsCreator, atrás da flag logMonitors) —
// documento com linhas de texto, mesmo glifo universal de "log/registro".
export const IconLogs = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>
)
