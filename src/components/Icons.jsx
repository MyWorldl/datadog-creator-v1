// src/components/Icons.jsx
// Ícones SVG modernos (estilo linha), sem dependência externa.
// Todos herdam a cor via currentColor e o tamanho via prop `size`.
'use client'

const base = (size) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
})

export const IconDashboard = ({ size = 18 }) => (
  <svg {...base(size)}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
)
export const IconMonitorsCreator = ({ size = 18 }) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
)
export const IconScope = ({ size = 18 }) => (
  <svg {...base(size)}><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M12 12l4.5-4.5"/><path d="M4 18a9 9 0 1 1 16 0"/></svg>
)
export const IconAnalytics = ({ size = 18 }) => (
  <svg {...base(size)}><path d="M3 3v18h18"/><path d="M7 15l3.5-4 3 2.5L20 7"/></svg>
)
export const IconFinops = ({ size = 18 }) => (
  <svg {...base(size)}><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.66 3.13 3 7 3s7-1.34 7-3V6"/><path d="M5 12v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6"/></svg>
)
export const IconSettings = ({ size = 18 }) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
)
export const IconInfo = ({ size = 18 }) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>
)
export const IconLogout = ({ size = 16 }) => (
  <svg {...base(size)}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>
)
export const IconArrow = ({ size = 16 }) => (
  <svg {...base(size)}><path d="M5 12h14M13 6l6 6-6 6"/></svg>
)
