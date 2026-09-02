// src/components/ScoreRing.tsx
//
// Anel de progresso (SVG) — três implementações quase idênticas viviam
// inline em ferramentas/audit/page.tsx, ferramentas/dashboard/page.tsx e
// ferramentas/analise/page.tsx (achado da auditoria). Extraído aqui como
// componente puro de RENDERIZAÇÃO: a cor entra como prop, não é calculada
// aqui — cada chamador continua com sua própria função de score->cor (elas
// divergem de propósito entre audit.ts e dashboard/analise, ver lib/score.ts).
'use client'

export interface ScoreRingProps {
  value: number | null
  color: string
  size?: number
  stroke?: number
}

export default function ScoreRing({ value, color, size = 120, stroke = 10 }: ScoreRingProps) {
  const r = (size / 2) - stroke
  const circ = 2 * Math.PI * r
  const dash = ((value ?? 0) / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
    </svg>
  )
}
