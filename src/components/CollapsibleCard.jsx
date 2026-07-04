// src/components/CollapsibleCard.jsx
//
// Card colapsável/expansível reutilizável (React + Tailwind).
//
// Visual "borda de acento lateral" (Modelo 3): uma faixa colorida de 3px à
// esquerda indica o status (verde/amarelo/vermelho) via prop accentColor —
// facilita varrer a lista e achar os problemas. A cor é REDUNDANTE (o score e
// o texto de detalhe carregam a mesma informação), então atende ao WCAG 1.4.1
// (não depender só de cor). https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html
//
// Por padrão (defaultOpen=false) mostra só o título e o score; o conteúdo
// descritivo (children) fica escondido e é revelado ao clicar, com transição
// SUAVE de altura.
//
// Técnica de animação: CSS Grid com grid-template-rows 0fr → 1fr + um wrapper
// interno com overflow hidden. O browser interpola entre 0 e a altura natural
// do conteúdo, sem precisar de altura fixa nem de JS medindo o height.
// Ref.: https://www.stefanjudis.com/snippets/how-to-animate-height-with-css-grid/
//       https://css-tricks.com/css-grid-can-do-auto-height-transitions/
// Acessibilidade (aria-expanded/controls/hidden): o cabeçalho é um <button>.

'use client'

import { useId, useState } from 'react'

export default function CollapsibleCard({
  title,
  score,
  scoreColor = 'var(--text-primary)',
  accentColor = 'var(--border)',
  defaultOpen = false,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()
  const scoreStr = String(score ?? '')
  const scoreFontPx = scoreStr.length > 5 ? 15 : 20

  return (
    <div
      className="overflow-hidden rounded-[10px] border transition-shadow hover:shadow-md"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--bg-surface)',
        borderLeft: `3px solid ${accentColor}`,
        minWidth: 0,
      }}
    >
      {/* Cabeçalho sempre visível: título + score + chevron */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full cursor-pointer items-start justify-between gap-2 bg-transparent px-4 py-3 text-left"
      >
        <span className="flex min-w-0 items-start gap-2">
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            className={`mt-[3px] shrink-0 transition-transform duration-300 ease-out ${open ? 'rotate-90' : ''}`}
            style={{ color: 'var(--text-muted)' }}
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          <span className="line-clamp-2 text-[13px] font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
            {title}
          </span>
        </span>
        <span
          className="shrink-0 whitespace-nowrap text-right font-extrabold tabular-nums"
          style={{ color: scoreColor, fontSize: `${scoreFontPx}px` }}
        >
          {score}
        </span>
      </button>

      {/* Corpo animado: 0fr (fechado) → 1fr (aberto) */}
      <div
        id={bodyId}
        aria-hidden={!open}
        className="grid transition-all duration-300 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-3">{children}</div>
        </div>
      </div>
    </div>
  )
}
