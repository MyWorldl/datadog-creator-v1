// src/components/ProgressBar.tsx
//
// Barra de progresso única do app. `value` 0..1 = determinada (progresso REAL
// vindo do servidor via job-stream); `null` = indeterminada (operação de uma
// chamada só, sem como medir quanto falta). Mostra o que está acontecendo, a
// porcentagem e o tempo decorrido. Tema/animação em globals.css (.wz-progress*).

'use client'

import { useCallback, useEffect, useState } from 'react'
import type { JobProgressInfo } from '@/lib/job-client'

interface ProgressBarProps {
  value: number | null
  label?: string
  /** Texto extra à direita da porcentagem (ex.: "12 de 40"). */
  detail?: string
  className?: string
}

function useElapsed(): number {
  const [s, setS] = useState(0)
  useEffect(() => {
    const t0 = Date.now()
    const id = setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])
  return s
}

export default function ProgressBar({ value, label, detail, className }: ProgressBarProps) {
  const elapsed = useElapsed()
  const pct = value == null ? null : Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div className={`wz-progress${className ? ' ' + className : ''}`} role="status" aria-live="polite">
      <div className="wz-progress-head">
        <span className="wz-progress-label">{label || 'Carregando…'}</span>
        <span className="wz-progress-meta">
          {pct != null && <strong>{pct}%</strong>}
          {detail && <span>{detail}</span>}
          {elapsed >= 3 && <span>{elapsed}s</span>}
        </span>
      </div>
      <div
        className="wz-progress-track"
        role="progressbar"
        aria-label={label || 'Progresso'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
      >
        <div
          className={`wz-progress-bar is-active${pct == null ? ' is-indeterminate' : ''}`}
          style={pct == null ? undefined : { width: `${Math.max(pct, 3)}%` }}
        />
      </div>
    </div>
  )
}

export interface JobProgressState { value: number | null; label: string; detail?: string }

// Estado da barra a partir dos eventos do fetchJob. A porcentagem NUNCA volta
// pra trás (se o servidor aumentar o total no meio, a barra só espera).
export function useJobProgress() {
  const [progress, setProgress] = useState<JobProgressState | null>(null)
  const start = useCallback((label = 'Conectando ao Datadog…') => setProgress({ value: null, label }), [])
  const onProgress = useCallback((i: JobProgressInfo) => {
    setProgress(prev => ({
      value: i.fraction == null ? prev?.value ?? null : Math.max(prev?.value ?? 0, i.fraction),
      label: i.label,
      detail: i.total > 1 ? `${Math.min(i.done, i.total)} de ${i.total}` : undefined,
    }))
  }, [])
  const reset = useCallback(() => setProgress(null), [])
  return { progress, start, onProgress, reset }
}
