'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { useApp } from '@/context/AppContext'
import PillarCard, { type CardStatus } from '@/components/PillarCard'
import Sparkline from '@/components/Sparkline'
import ScoreRing from '@/components/ScoreRing'
import ProgressBar, { useJobProgress } from '@/components/ProgressBar'
import { fetchJob } from '@/lib/job-client'
import { scoreColor } from '@/lib/score'
import { IconLayers, IconBell, IconPulse, IconChecklist, IconShieldCheck, IconWarning } from '@/components/Icons'

interface DimensionView {
  key: string
  label: string
  measured: boolean
  score: number | null
  detail: string
}

interface PillarView {
  key: string
  label: string
  score: number | null
  measured: boolean
  maduro: string
  imaturo: string
  dimensions: DimensionView[]
}

interface ScopeMaturityData {
  score: number
  level: number
  levelLabel: string
  levelNote: string | null
  pillars: PillarView[]
  site: string
  generatedAt: string
  measuredCount: number
  totalDimensions: number
  dimensions: DimensionView[]
  history: number[]
  delta: number | null
}

// status da dimensão para o card (Modelo E): good | warn | bad | nd
const smStatus = (dim: { measured: boolean; score: number | null }): CardStatus => !dim.measured || dim.score == null ? 'nd' : dim.score >= 80 ? 'good' : dim.score >= 50 ? 'warn' : 'bad'
// cor + tint por status, para o badge numérico do KPI
const STATUS_TINT: Record<CardStatus, { c: string; bg: string }> = {
  good: { c: 'var(--success)', bg: 'var(--success-bg)' },
  warn: { c: 'var(--warning)', bg: 'var(--warning-bg)' },
  bad: { c: 'var(--danger)', bg: 'var(--danger-bg)' },
  nd: { c: 'var(--text-muted)', bg: 'var(--bg-surface-2)' },
}

// Ícones temáticos por pilar — de Icons.tsx (achado da auditoria: viviam
// inline aqui, fonte única agora). Cada pilar ganha um glyph de identidade
// em vez da forma de status (ver PillarCard, que já cuida do aria-hidden
// no wrapper que consome esses ícones).
const PILLAR_ICON: Record<string, ReactNode> = {
  cobertura: <IconLayers size={18} />,        // camadas (infra/apps/cloud empilhadas)
  qualidade: <IconBell size={18} />,          // sino (alertas)
  observabilidade: <IconPulse size={18} />,   // pulso (sinais/telemetria)
  processos: <IconChecklist size={18} />,     // checklist/prancheta (operação, runbooks, SLO)
  governanca: <IconShieldCheck size={18} />,  // escudo com check (padrões, RBAC, ownership)
}

const s: Record<string, CSSProperties> = {
  err: { fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 12px', marginTop: 12 },
  dimDetail: { fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 },
}

export default function ScopeMaturityPage() {
  const { keysConfigured, datadogSite } = useApp()
  const [loading, setLoading] = useState(false)
  const { progress, start, onProgress } = useJobProgress()
  const [error, setError] = useState('')
  const [data, setData] = useState<ScopeMaturityData | null>(null)

  async function run() {
    // setData(null) removido de propósito (achado da auditoria): apagava o
    // painel inteiro mesmo com dado válido já na tela, até a resposta nova
    // chegar. Mantém o dado anterior visível durante o reload — o botão já
    // indica loading via texto, mesmo padrão de ferramentas/audit/page.tsx.
    setError(''); setLoading(true); start()
    try {
      const r = await fetchJob<ScopeMaturityData>('/api/datadog/scope-maturity', { onProgress })
      if (!r.ok) { setError(r.data.error || 'Falha ao calcular o score.'); return }
      setData(r.data)
    } catch (e) { setError('Falha de rede: ' + (e as Error).message) }
    finally { setLoading(false) }
  }

  return (
    <div>
      <h1 className="page-h1">ScopeMaturity</h1>
      <p className="page-sub">Score de maturidade do ambiente Datadog (0–100) por dimensões de governança e cobertura.</p>

      {!keysConfigured ? (
        <div className="surface">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Conecte-se ao Datadog em Configurações para calcular o score.
          </p>
        </div>
      ) : (
        <>
        <div className="surface">
          <div className="hero-grid">
            {data ? (
              <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
                <ScoreRing value={data.score} color={scoreColor(data.score)} />
                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800, color: scoreColor(data.score) }}>
                  {data.score}
                </span>
              </div>
            ) : null}
            <div style={{ minWidth: 0 }}>
              {data && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: scoreColor(data.score) }}>Nível {data.level}</span>
                  <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{data.levelLabel}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>(1–5)</span>
                </div>
              )}
              {data && data.levelNote && (
                <p style={{ fontSize: 11.5, color: 'var(--warning)', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span aria-hidden="true" style={{ display: 'inline-flex', flexShrink: 0 }}><IconWarning size={13} /></span>
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
              <button className="btn btn-primary" onClick={run} disabled={loading}>
                {loading ? 'Calculando…' : data ? 'Recalcular' : 'Calcular score'}
              </button>
            </div>
            <aside className="hero-side" aria-label="Resumo dos pilares">
              <p className="side-title">{data ? 'Pilares' : 'O que é avaliado'}</p>
              {data
                ? data.pillars.map(p => {
                    const st = smStatus(p)
                    const color = st === 'good' ? 'var(--success)' : st === 'warn' ? 'var(--warning)' : st === 'bad' ? 'var(--danger)' : 'var(--text-muted)'
                    return (
                      <div key={p.key} className="side-row">
                        <span className="side-name" title={p.label}>{p.label}</span>
                        <span className="side-track"><span className="side-fill" style={{ display: 'block', width: `${p.measured ? p.score : 0}%`, background: color }} /></span>
                        <span className="side-val" style={{ color }}>{p.measured ? p.score : 'N/D'}</span>
                      </div>
                    )
                  })
                : ['Cobertura', 'Qualidade dos Monitores', 'Observabilidade', 'Processos', 'Governança'].map(n => (
                    <div key={n} className="side-row"><span className="side-name">{n}</span><span className="side-track" /><span className="side-val" style={{ color: 'var(--text-muted)' }}>—</span></div>
                  ))}
            </aside>
          </div>

          {loading && progress && <ProgressBar className="is-block wz-msg" value={progress.value} label={progress.label} detail={progress.detail} />}

          {error && <div className="wz-msg" style={s.err}>{error}</div>}

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
            </>
          )}
        </div>
        {data && (
          <div className="pillar-wrap"><div className="stagger pillar-grid">
            {data.pillars.map(p => (
              <PillarCard
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
              </PillarCard>
            ))}
          </div></div>
        )}
        </>
      )}
    </div>
  )
}
