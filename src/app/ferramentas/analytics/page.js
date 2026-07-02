// src/app/ferramentas/analytics/page.js
'use client'

import { useState } from 'react'
import { useApp } from '@/context/AppContext'

const scoreColor = (v) => v == null ? 'var(--text-muted)' : v >= 80 ? 'var(--success)' : v >= 50 ? 'var(--warning)' : 'var(--danger)'
// cor do KPI conforme "maior é melhor" ou não
const kpiColor = (dim) => {
  if (!dim.measured || dim.value == null) return 'var(--text-muted)'
  const g = dim.higherIsBetter ? dim.value : 100 - dim.value
  return g >= 70 ? 'var(--success)' : g >= 40 ? 'var(--warning)' : 'var(--danger)'
}

function Ring({ value, size = 120, stroke = 10 }) {
  const r = (size / 2) - stroke, circ = 2 * Math.PI * r, dash = ((value ?? 0) / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={scoreColor(value)} strokeWidth={stroke} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
    </svg>
  )
}

const s = {
  h1: { fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' },
  sub: { fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1.5rem' },
  card: { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem', boxShadow: 'var(--card-shadow)' },
  btn: { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer' },
  err: { fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 12px', marginTop: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 12, marginTop: 16 },
  dim: { border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', background: 'var(--bg-surface)' },
  dimHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  dimName: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  bigVal: (c) => ({ fontSize: 24, fontWeight: 800, color: c }),
  detail: { fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 },
  na: { fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' },
  weight: { fontSize: 10, color: 'var(--text-muted)', border: '0.5px solid var(--border)', borderRadius: 999, padding: '1px 7px', marginTop: 8, display: 'inline-block' },
}

export default function MonitorsAnalyticsPage() {
  const { keysConfigured, datadogSite } = useApp()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)

  async function run() {
    setError(''); setLoading(true); setData(null)
    try {
      const r = await fetch('/api/datadog/monitors-analytics')
      const json = await r.json()
      if (!r.ok) { setError(json.error || 'Falha ao analisar.'); return }
      setData(json)
    } catch (e) { setError('Falha de rede: ' + e.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={s.h1}>MonitorsAnalytics</h1>
      <p style={s.sub}>Maturidade dos monitores em um score 0–100 ponderado (falsos positivos têm o maior peso).</p>

      {!keysConfigured ? (
        <div style={s.card}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Conecte-se ao Datadog em Configurações para analisar os monitores.
          </p>
        </div>
      ) : (
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            {data && data.score != null && (
              <div style={{ position: 'relative', width: 120, height: 120 }}>
                <Ring value={data.score} />
                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800, color: scoreColor(data.score) }}>{data.score}</span>
              </div>
            )}
            <div style={{ flex: 1, minWidth: 220 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
                {data
                  ? <>Score de {data.measuredCount} de {data.totalDimensions} KPIs · {data.monitorsCount} monitores · {datadogSite}</>
                  : <>Coleta no servidor via {datadogSite}.</>}
              </p>
              <button style={s.btn} onClick={run} disabled={loading}>
                {loading ? 'Analisando…' : data ? 'Reanalisar' : 'Analisar monitores'}
              </button>
            </div>
          </div>

          {error && <div style={s.err}>{error}</div>}

          {data && (
            <div style={s.grid}>
              {data.dimensions.map(dim => (
                <div key={dim.key} style={s.dim}>
                  <div style={s.dimHead}>
                    <span style={s.dimName}>{dim.label}</span>
                    {dim.measured && dim.value != null
                      ? <span style={s.bigVal(kpiColor(dim))}>{dim.value}%</span>
                      : <span style={s.na}>N/D</span>}
                  </div>
                  <p style={s.detail}>{dim.detail}</p>
                  <span style={s.weight}>peso {dim.weight}{dim.higherIsBetter === false ? ' · menor é melhor' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
