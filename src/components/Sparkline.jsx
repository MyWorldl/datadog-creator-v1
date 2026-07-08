// src/components/Sparkline.jsx
//
// Mini gráfico de linha (sparkline) para mostrar a TENDÊNCIA de um score ao
// longo do tempo, com um chip de delta ("▲ N" / "▼ N") comparando com a
// medição anterior. Recebe uma lista de números (history) já em ordem
// cronológica. Sem eixos nem legenda — é uma "assinatura visual" da série.

'use client'

import { useId } from 'react'

export default function Sparkline({ values = [], delta = null, width = 132, height = 34, color = 'var(--accent)' }) {
  const rawId = useId()
  const nums = (values || []).filter(v => typeof v === 'number' && !Number.isNaN(v))
  if (nums.length < 2) {
    return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>histórico insuficiente (2+ medições)</span>
  }
  const min = Math.min(...nums), max = Math.max(...nums)
  const range = max - min || 1
  const stepX = width / (nums.length - 1)
  // y invertido: score maior = mais alto (menos pixels do topo)
  const pts = nums.map((v, i) => [i * stepX, height - ((v - min) / range) * height])
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`
  const gid = 'spark' + rawId.replace(/[^a-zA-Z0-9]/g, '')

  const deltaColor = delta == null ? 'var(--text-muted)' : delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--danger)' : 'var(--text-muted)'
  const deltaText = delta == null ? '' : delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${Math.abs(delta)}` : '±0'

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.28" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.6" fill={color} />
      </svg>
      {delta != null && (
        <span style={{ fontSize: 11.5, fontWeight: 700, color: deltaColor, whiteSpace: 'nowrap' }} title="Desde a medição anterior">
          {deltaText}
        </span>
      )}
    </span>
  )
}
