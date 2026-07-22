'use client'

import { useState } from 'react'
import { useApp } from '@/context/AppContext'
import CollapsibleCard from '@/components/CollapsibleCard'
import Sparkline from '@/components/Sparkline'

function ScoreRing({ value, color, size = 120, stroke = 10 }) {
  const r = (size / 2) - stroke
  const circ = 2 * Math.PI * r
  const dash = (value / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
    </svg>
  )
}

const scoreColor = (v) => v == null ? 'var(--text-muted)' : v >= 80 ? 'var(--success)' : v >= 50 ? 'var(--warning)' : 'var(--danger)'
// status da dimensão para o card (Modelo E): good | warn | bad | nd
const smStatus = (dim) => !dim.measured ? 'nd' : dim.score >= 80 ? 'good' : dim.score >= 50 ? 'warn' : 'bad'
// cor + tint por status, para o badge numérico do KPI
const STATUS_TINT = {
  good: { c: 'var(--success)', bg: 'var(--success-bg)' },
  warn: { c: 'var(--warning)', bg: 'var(--warning-bg)' },
  bad: { c: 'var(--danger)', bg: 'var(--danger-bg)' },
  nd: { c: 'var(--text-muted)', bg: 'var(--bg-surface-2)' },
}

// Ícones temáticos por pilar (linha, estilo lucide — sinérgicos com o tema
// escuro): cada pilar ganha um glyph de identidade em vez da forma de status.
const ICON_PROPS = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }
const PILLAR_ICON = {
  // Cobertura → camadas (infra/apps/cloud empilhadas)
  cobertura: <svg {...ICON_PROPS}><path d="m12 2 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></svg>,
  // Qualidade dos Monitores → sino (alertas)
  qualidade: <svg {...ICON_PROPS}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>,
  // Observabilidade → pulso (sinais/telemetria)
  observabilidade: <svg {...ICON_PROPS}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>,
  // Processos → checklist/prancheta (operação, runbooks, SLO)
  processos: <svg {...ICON_PROPS}><rect width="8" height="4" x="8" y="2" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></svg>,
  // Governança → escudo com check (padrões, RBAC, ownership)
  governanca: <svg {...ICON_PROPS}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" /><path d="m9 12 2 2 4-4" /></svg>,
}

const s = {
  h1: { fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' },
  sub: { fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1.5rem' },
  card: { background: 'var(--bg-surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', boxShadow: 'var(--card-shadow)' },
  btn: { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer' },
  err: { fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 12px', marginTop: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', alignItems: 'start', gap: 12, marginTop: 16 },
  dim: { border: '0.5px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: 'var(--bg-surface)' },
  dimHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dimName: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  dimVal: (c) => ({ fontSize: 14, fontWeight: 800, color: c }),
  dimDetail: { fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 },
  na: { fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' },
}

export default function ScopeMaturityPage() {
  const { keysConfigured, datadogSite } = useApp()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)

  async function run() {
    setError(''); setLoading(true); setData(null)
    try {
      const r = await fetch('/api/datadog/scope-maturity')
      const json = await r.json()
      if (!r.ok) { setError(json.error || 'Falha ao calcular o score.'); return }
      setData(json)
    } catch (e) { setError('Falha de rede: ' + e.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={s.h1}>ScopeMaturity</h1>
      <p style={s.sub}>Score de maturidade do ambiente Datadog (0–100) por dimensões de governança e cobertura.</p>

      {!keysConfigured ? (
        <div style={s.card}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Conecte-se ao Datadog em Configurações para calcular o score.
          </p>
        </div>
      ) : (
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            {data ? (
              <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
                <ScoreRing value={data.score} color={scoreColor(data.score)} />
                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800, color: scoreColor(data.score) }}>
                  {data.score}
                </span>
              </div>
            ) : null}
            <div style={{ flex: 1, minWidth: 200 }}>
              {data && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: scoreColor(data.score) }}>Nível {data.level}</span>
                  <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{data.levelLabel}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>(1–5)</span>
                </div>
              )}
              {data && data.levelNote && (
                <p style={{ fontSize: 11.5, color: 'var(--warning)', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M12 3 21 19H3z" /><path d="M12 10v4" /><path d="M12 17h.01" /></svg>
                  {data.levelNote}
                </p>
              )}
              {data && (
                <div style={{ marginBottom: 8 }}>
                  <Sparkline values={data.history} delta={data.delta} color={scoreColor(data.score)} />
                </div>
              )}
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
                {data
                  ? <>Score {data.score}/100 · média de {data.pillars.filter(p => p.measured).length} de {data.pillars.length} pilares · site {datadogSite}.</>
                  : <>Coleta feita no servidor, usando as chaves da sessão (site {datadogSite}).</>}
              </p>
              <button style={s.btn} onClick={run} disabled={loading}>
                {loading ? 'Calculando…' : data ? 'Recalcular' : 'Calcular score'}
              </button>
            </div>
          </div>

          {error && <div style={s.err}>{error}</div>}

          {data && (
            <>
              <div style={{ display: 'flex', gap: 6, margin: '18px 0 6px', flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <div key={n} style={{
                    flex: 1, minWidth: 60, height: 6, borderRadius: 999,
                    background: n <= data.level ? scoreColor(data.score) : 'var(--border)',
                  }} title={`Nível ${n}`} />
                ))}
              </div>
              <div style={s.grid}>
                {data.pillars.map(p => (
                  <CollapsibleCard
                    key={p.key}
                    title={p.label}
                    score={p.measured ? p.score : 'N/D'}
                    status={smStatus(p)}
                    icon={PILLAR_ICON[p.key] || null}
                  >
                    <div style={{ background: 'var(--bg-surface-2)', border: '0.5px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 11 }}>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <span style={{ width: 3, flexShrink: 0, borderRadius: 2, background: 'var(--success)' }} />
                        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                          <span style={{ color: 'var(--success)', fontWeight: 600 }}>Maduro </span>— {p.maduro}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <span style={{ width: 3, flexShrink: 0, borderRadius: 2, background: 'var(--danger)' }} />
                        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                          <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Imaturo </span>— {p.imaturo}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                      {p.dimensions.map(dim => {
                        const tint = STATUS_TINT[smStatus(dim)]
                        return (
                          <div key={dim.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                            <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 9, background: tint.bg, color: tint.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: dim.measured ? 12.5 : 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                              {dim.measured ? dim.score : 'N/D'}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{dim.label}</div>
                              <p style={{ ...s.dimDetail, margin: '2px 0 0' }}>{dim.detail}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </CollapsibleCard>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
