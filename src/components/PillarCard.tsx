// src/components/PillarCard.tsx
//
// Cartão de um pilar da ScopeMaturity: cartão PRÓPRIO (separado do cartão
// principal), sempre aberto — sem expandir/recolher. Visual "Modelo E": acento
// em gradiente sutil da cor de status + ícone + número grande + barra do score.
//
// Acessibilidade: o status é transmitido por COR + NÚMERO + rótulo textual
// (aria-label da região), não só por cor — WCAG 1.4.1. Quando um `icon`
// temático é passado, ele identifica o pilar; sem `icon`, cai no ícone de
// status por forma (StatusIcon).
// https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html

import type { ReactNode } from 'react'
import { IconCheck, IconWarning, IconError, IconNeutral } from '@/components/Icons'

export type CardStatus = 'good' | 'warn' | 'bad' | 'nd'

// status -> cor do texto/ícone + tint (fundo do gradiente e do quadrado do ícone)
const STATUS: Record<CardStatus, { color: string; tint: string | null }> = {
  good: { color: 'var(--success)', tint: 'var(--success-bg)' },
  warn: { color: 'var(--warning)', tint: 'var(--warning-bg)' },
  bad: { color: 'var(--danger)', tint: 'var(--danger-bg)' },
  nd: { color: 'var(--text-muted)', tint: null },
}

const STATUS_LABEL: Record<CardStatus, string> = { good: 'saudável', warn: 'atenção', bad: 'crítico', nd: 'não avaliado' }

function StatusIcon({ status }: { status: CardStatus }) {
  if (status === 'good') return <IconCheck size={18} />
  if (status === 'warn') return <IconWarning size={18} />
  if (status === 'bad') return <IconError size={18} />
  return <IconNeutral size={18} />
}

interface PillarCardProps {
  title: string
  score: number | string | null | undefined
  status?: CardStatus
  icon?: ReactNode
  children?: ReactNode
}

export default function PillarCard({ title, score, status = 'nd', icon = null, children }: PillarCardProps) {
  const st = STATUS[status] || STATUS.nd
  const scoreStr = String(score ?? '')
  const scoreFontPx = scoreStr.length > 5 ? 22 : 34 // valores longos encolhem
  const iconBg = st.tint || 'rgba(148,163,184,0.14)'
  const background = st.tint
    ? `linear-gradient(135deg, ${st.tint} 0%, transparent 55%), var(--bg-surface)`
    : 'var(--bg-surface)'

  return (
    <section
      className="tile"
      aria-label={`${title}: status ${STATUS_LABEL[status] || STATUS_LABEL.nd}, pontuação ${scoreStr || 'não avaliada'}`}
      style={{
        display: 'flex', flexDirection: 'column', minWidth: 0,
        border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        background, boxShadow: 'var(--card-shadow)', overflow: 'hidden',
      }}
    >
      {/* Cabeçalho: ícone + título + score */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '18px 20px 12px' }}>
        <span style={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: 12 }}>
          <span
            aria-hidden="true"
            style={{ width: 40, height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, background: iconBg, color: st.color }}
          >
            {icon || <StatusIcon status={status} />}
          </span>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.3, color: 'var(--text-primary)' }}>{title}</h2>
        </span>
        <span style={{ display: 'flex', flexShrink: 0, alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap' }}>
          <span style={{ color: st.color, fontSize: scoreFontPx, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{score}</span>
          {typeof score === 'number' && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>/100</span>}
        </span>
      </header>

      {/* Barra do score: leitura rápida do pilar */}
      {typeof score === 'number' && (
        <div style={{ padding: '0 20px 14px' }}>
          <div style={{ height: 8, width: '100%', overflow: 'hidden', borderRadius: 999, background: iconBg }}>
            <div style={{ height: '100%', borderRadius: 999, background: st.color, width: `${Math.max(0, Math.min(100, score))}%`, transition: 'width 0.5s var(--ease-out)' }} />
          </div>
        </div>
      )}

      {/* Conteúdo sempre visível */}
      <div style={{ padding: '4px 20px 20px', flex: 1 }}>{children}</div>
    </section>
  )
}
