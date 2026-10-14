// src/components/ProgressBar.tsx
//
// Barra de progresso única do app — sempre em PORCENTAGEM.
//  - ProgressBar: `value` 0..1 REAL (etapas concluídas / total, vindo do
//    servidor via job-stream, ou lotes do cliente).
//  - EstimatedProgressBar: pra operações de uma chamada só (o Datadog não
//    informa o andamento): porcentagem ESTIMADA pela duração das últimas
//    execuções, exibida como "~42%" e limitada a 95% até a operação terminar.
// Tema/animação em globals.css (.wz-progress*).

'use client'

import { useCallback, useEffect, useState } from 'react'
import type { JobProgressInfo } from '@/lib/job-client'
import { estimateFraction, nextExpected, clampExpected } from '@/lib/progress-estimate'

interface ProgressBarProps {
  /** 0..1 */
  value: number
  label?: string
  /** Texto extra ao lado da porcentagem (ex.: "12 de 40"). */
  detail?: string
  /** Porcentagem estimada (mostra "~"). */
  approx?: boolean
  className?: string
}

export default function ProgressBar({ value, label, detail, approx, className }: ProgressBarProps) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div className={`wz-progress${className ? ' ' + className : ''}`} role="status" aria-live="polite">
      <div className="wz-progress-head">
        <span className="wz-progress-label">{label || 'Carregando…'}</span>
        <span className="wz-progress-meta">
          <strong>{approx ? '~' : ''}{pct}%</strong>
          {detail && <span>{detail}</span>}
        </span>
      </div>
      <div
        className="wz-progress-track"
        role="progressbar"
        aria-label={label || 'Progresso'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="wz-progress-bar is-active" style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </div>
  )
}

// ── Estimativa pra operações de uma chamada só ──

const KEY = (op: string) => `dd_op_ms_${op}`

function readExpected(op: string, fallbackMs: number): number {
  try {
    const v = Number(localStorage.getItem(KEY(op)))
    return v > 0 ? clampExpected(v) : clampExpected(fallbackMs)
  } catch { return clampExpected(fallbackMs) }
}

function saveDuration(op: string, ms: number, fallbackMs: number) {
  if (ms < 300) return // desmontou quase na hora (troca de tela/cancelou): não representa a operação
  try {
    const prev = Number(localStorage.getItem(KEY(op))) || null
    localStorage.setItem(KEY(op), String(Math.round(nextExpected(prev ?? fallbackMs, ms))))
  } catch { /* storage bloqueado: segue sem aprender */ }
}

interface EstimatedProgressBarProps {
  /** Identifica a operação (aprende a duração típica de cada uma). */
  op: string
  label?: string
  /** Duração esperada na 1ª vez, antes de ter histórico. */
  defaultMs?: number
  className?: string
}

// Monte QUANDO a operação começar e desmonte quando terminar ({loading && <… />}):
// ao desmontar, a duração real alimenta a estimativa das próximas vezes.
export function EstimatedProgressBar({ op, label, defaultMs = 4000, className }: EstimatedProgressBarProps) {
  const [fraction, setFraction] = useState(0)

  useEffect(() => {
    const start = Date.now()
    const expected = readExpected(op, defaultMs)
    const id = setInterval(() => setFraction(estimateFraction(Date.now() - start, expected)), 200)
    return () => {
      clearInterval(id)
      saveDuration(op, Date.now() - start, defaultMs)
    }
  }, [op, defaultMs])

  return <ProgressBar value={fraction} label={label} approx className={className} />
}

export interface JobProgressState { value: number; label: string; detail?: string }

// Estado da barra a partir dos eventos do fetchJob. A porcentagem NUNCA volta
// pra trás (se o servidor aumentar o total no meio, a barra só espera).
export function useJobProgress() {
  const [progress, setProgress] = useState<JobProgressState | null>(null)
  const start = useCallback((label = 'Conectando ao Datadog…') => setProgress({ value: 0, label }), [])
  const onProgress = useCallback((i: JobProgressInfo) => {
    setProgress(prev => ({
      value: Math.max(prev?.value ?? 0, i.fraction ?? 0),
      label: i.label,
      detail: i.total > 1 ? `${Math.min(i.done, i.total)} de ${i.total}` : undefined,
    }))
  }, [])
  const reset = useCallback(() => setProgress(null), [])
  return { progress, start, onProgress, reset }
}
