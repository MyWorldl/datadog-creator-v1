// src/components/CollapsibleCard.jsx
//
// Card colapsável/expansível reutilizável (React + Tailwind) — visual "Modelo E":
// acento em GRADIENTE sutil da cor de status + ÍCONE de status + número grande.
//
// Por padrão (defaultOpen=false) mostra só ícone + título + score; o conteúdo
// descritivo (children) fica escondido e é revelado ao clicar, com transição
// suave de altura (CSS Grid: grid-template-rows 0fr -> 1fr + overflow hidden).
//
// Acessibilidade: o status é transmitido por COR + NÚMERO + rótulo textual
// (aria-label no cabeçalho descreve o status por extenso), não só por cor —
// atende ao WCAG 1.4.1. https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html
// Quando um `icon` temático é passado, ele substitui a forma de status como
// glyph de identidade do card; o status segue transmitido por cor + número +
// aria-label. Sem `icon`, cai no ícone de status por forma (StatusIcon).
// Cabeçalho é um <button> com aria-expanded/aria-controls; corpo com aria-hidden.

'use client'

import { useId, useState } from 'react'

// status -> cor do texto/ícone + tint (fundo do gradiente e do quadrado do ícone)
const STATUS = {
  good: { color: 'var(--success)', tint: 'var(--success-bg)' },
  warn: { color: 'var(--warning)', tint: 'var(--warning-bg)' },
  bad: { color: 'var(--danger)', tint: 'var(--danger-bg)' },
  nd: { color: 'var(--text-muted)', tint: null },
}

function StatusIcon({ status }) {
  const p = {
    width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
  }
  if (status === 'good') return <svg {...p}><path d="M20 6 9 17l-5-5" /></svg>
  if (status === 'warn') return <svg {...p}><path d="M12 3 21 19H3z" /><path d="M12 10v4" /><path d="M12 17h.01" /></svg>
  if (status === 'bad') return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
  return <svg {...p}><path d="M5 12h14" /></svg>
}

const STATUS_LABEL = { good: 'saudável', warn: 'atenção', bad: 'crítico', nd: 'não avaliado' }

export default function CollapsibleCard({ title, score, status = 'nd', icon = null, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()
  const st = STATUS[status] || STATUS.nd
  const scoreStr = String(score ?? '')
  const scoreFontPx = scoreStr.length > 5 ? 20 : 30 // valores longos (ex.: "3,1 disp./mon") encolhem
  const iconBg = st.tint || 'rgba(148,163,184,0.14)'
  const background = st.tint
    ? `linear-gradient(135deg, ${st.tint} 0%, transparent 55%), var(--bg-surface)`
    : 'var(--bg-surface)'

  return (
    <div
      className="overflow-hidden rounded-[14px] border transition-shadow hover:shadow-lg"
      style={{ borderColor: 'var(--border)', background, minWidth: 0 }}
    >
      {/* Cabeçalho sempre visível: ícone + título + score + chevron */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={`${title}: status ${STATUS_LABEL[status] || STATUS_LABEL.nd}, pontuação ${scoreStr || 'não avaliada'}`}
        className="flex w-full cursor-pointer items-center justify-between gap-3 bg-transparent px-5 py-4 text-left"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span
            className="flex shrink-0 items-center justify-center rounded-[11px]"
            style={{ width: 38, height: 38, background: iconBg, color: st.color }}
          >
            {icon || <StatusIcon status={status} />}
          </span>
          <span className="line-clamp-2 text-[13px] font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
            {title}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="whitespace-nowrap font-extrabold tabular-nums" style={{ color: st.color, fontSize: `${scoreFontPx}px` }}>
            {score}
          </span>
          {typeof score === 'number' && <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>/100</span>}
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            className={`shrink-0 transition-transform duration-300 ease-out ${open ? 'rotate-90' : ''}`}
            style={{ color: 'var(--text-muted)' }} aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
      </button>

      {/* Barra de progresso do score (sempre visível — leitura rápida do pilar) */}
      {typeof score === 'number' && (
        <div className="px-5 pb-3.5">
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: iconBg }}>
            <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${Math.max(0, Math.min(100, score))}%`, background: st.color }} />
          </div>
        </div>
      )}

      {/* Corpo animado: 0fr (fechado) -> 1fr (aberto) */}
      <div
        id={bodyId}
        aria-hidden={!open}
        className="grid transition-all duration-300 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-4">{children}</div>
        </div>
      </div>
    </div>
  )
}
