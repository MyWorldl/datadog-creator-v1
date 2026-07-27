// src/app/ferramentas/dashboard/page.tsx
'use client'

import Link from 'next/link'
import { useEffect, useState, type CSSProperties, type ComponentType } from 'react'
import { useSession } from '@/context/SupabaseAuthContext'
import { useApp } from '@/context/AppContext'
import { coveragePercent, type HostCoverageRow, type ServiceCoverageRow } from '@/lib/audit'
import { IconMonitorsCreator, IconAnalytics, IconScope, IconFinops } from '@/components/Icons'

interface ToolItem {
  href: string
  Icon: ComponentType<{ size?: number }>
  title: string
  desc: string
  cta: string
}

// Grade de ferramentas da Home — Observabilidade e Financeiro. "Sistema"
// (Configurações/Sobre) fica só na sidebar, não repete aqui.
const sections: { title: string; items: ToolItem[] }[] = [
  {
    title: 'Observabilidade',
    items: [
      { href: '/monitor', Icon: IconMonitorsCreator, title: 'MonitorsCreator', desc: 'Descubra serviços e crie monitores de anomalia no Datadog.', cta: 'Abrir wizard' },
      { href: '/ferramentas/audit', Icon: IconAnalytics, title: 'AuditMonitors', desc: 'Cobertura de monitoramento (Infra + APM) e sugestão de lacunas.', cta: 'Auditar' },
      { href: '/ferramentas/analise', Icon: IconScope, title: 'ScopeMaturity', desc: 'Score de governança e cobertura do ambiente.', cta: 'Ver score' },
    ],
  },
  {
    title: 'Financeiro',
    items: [
      { href: '/ferramentas/finops', Icon: IconFinops, title: 'FinOps Insights', desc: 'Consumo por licenciamento, alarme e custo estimado.', cta: 'Ver consumo' },
    ],
  },
]

const scoreColor = (v: number | null | undefined): string => v == null ? 'var(--text-muted)' : v >= 80 ? 'var(--success)' : v >= 50 ? 'var(--warning)' : 'var(--danger)'

// Rótulo curto de cada pilar do ScopeMaturity para as mini-barras do card.
const PILLAR_SHORT: Record<string, string> = { cobertura: 'Cob', qualidade: 'Qual', observabilidade: 'Obs', processos: 'Proc', governanca: 'Gov' }

interface MetricRef {
  key: string
  label: string
}

// Média das % de cobertura (host/serviço) de um grupo de métricas — mesma
// fonte dos cards do AuditMonitors, para o split Infra/APM do card-herói.
function avgGroupPct(rows: (HostCoverageRow | ServiceCoverageRow)[], metrics: MetricRef[]): number | null {
  const vals = (metrics || []).map(m => coveragePercent(rows || [], m.key).percent).filter((v): v is number => v != null)
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
}

function Ring({ value, size = 66, stroke = 8 }: { value: number | null; size?: number; stroke?: number }) {
  const r = (size / 2) - stroke, circ = 2 * Math.PI * r, dash = ((value ?? 0) / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={scoreColor(value)} strokeWidth={stroke} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
    </svg>
  )
}

const s: Record<string, CSSProperties> = {
  h1: { fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' },
  sub: { fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1.5rem' },
  metricStrip: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 },
  metricTile: { background: 'var(--bg-surface-2)', borderRadius: 10, padding: '12px 14px' },
  metricNum: { fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 },
  metricLbl: { fontSize: 12, color: 'var(--text-muted)', marginTop: 2 },
  band: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginBottom: 22 },
  hero: { display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', boxShadow: 'var(--card-shadow)', textDecoration: 'none' },
  heroTop: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 },
  heroLabel: { fontSize: 14.5, fontWeight: 700, color: 'var(--text-primary)', margin: 0 },
  heroMeta: { fontSize: 12.5, color: 'var(--text-secondary)', margin: '3px 0 0', lineHeight: 1.5 },
  heroLink: { fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginTop: 'auto', paddingTop: 4 },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 },
  card: { display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', textDecoration: 'none', boxShadow: 'var(--card-shadow)' },
  icon: { width: 38, height: 38, borderRadius: 10, background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  cTitle: { fontSize: 14.5, fontWeight: 600, color: 'var(--text-primary)', margin: 0 },
  cDesc: { fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5, flex: 1 },
  cCta: { fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginTop: 2 },
  panel: { background: 'var(--bg-surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', boxShadow: 'var(--card-shadow)', marginBottom: 22 },
}

const ringWrapStyle = (size: number): CSSProperties => ({ position: 'relative', width: size, height: size, flexShrink: 0 })
const ringNumStyle = (c: string, size: number): CSSProperties => ({ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size >= 80 ? 24 : 20, fontWeight: 800, color: c })
const chipStyle = (c: string, bg: string): CSSProperties => ({ display: 'inline-block', marginTop: 7, fontSize: 11, fontWeight: 600, color: c, background: bg, padding: '2px 9px', borderRadius: 999 })
const splitTileStyle = (bg: string): CSSProperties => ({ flex: 1, background: bg, borderRadius: 8, padding: '8px 10px' })

interface PillarSummary {
  key: string
  label: string
  score: number | null
  measured: boolean
}

interface ScopeMaturitySummary {
  score: number | null
  level: number
  levelLabel: string
  pillars: PillarSummary[]
}

interface AuditMonitorsSummary {
  score: number
  gapCount: number
  hostCoverage: HostCoverageRow[]
  serviceCoverage: ServiceCoverageRow[]
  infraMetrics: MetricRef[]
  apmMetrics: MetricRef[]
  suggestedInfra?: { monitorCount: number }
  suggestedApm?: { monitorCount: number }
  environment: { hostCount: number; serviceCount: number; monitorCount: number }
}

// Mini-barras dos 5 pilares do ScopeMaturity (proporcional + cor por status).
function PillarBars({ pillars }: { pillars: PillarSummary[] }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {pillars.map(p => {
        const c = p.measured ? scoreColor(p.score) : 'var(--text-muted)'
        return (
          <div key={p.key} style={{ flex: 1, minWidth: 0 }}>
            <div style={{ height: 5, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{ width: `${p.measured && p.score != null ? Math.max(0, Math.min(100, p.score)) : 0}%`, height: '100%', background: c, borderRadius: 999 }} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {PILLAR_SHORT[p.key] || p.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const { keysConfigured, keysLoading, datadogSite, activeConnection } = useApp()
  const name = session?.user?.name || 'de volta'
  // Título: nome da ORG ativa (conexão em uso). Sem org conectada, saúda o usuário.
  const heading = activeConnection?.name || `Olá, ${name}`

  const [sm, setSm] = useState<ScopeMaturitySummary | null>(null)
  const [ma, setMa] = useState<AuditMonitorsSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Sincroniza com o servidor: busca ScopeMaturity + AuditMonitors ao conectar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!keysConfigured) { setSm(null); setMa(null); return }
    let cancel = false
    setLoading(true); setError('')
    Promise.all([
      fetch('/api/datadog/scope-maturity').then(r => r.json().then(j => ({ ok: r.ok, j }))),
      fetch('/api/datadog/audit-monitors').then(r => r.json().then(j => ({ ok: r.ok, j }))),
    ])
      .then(([smR, maR]) => {
        if (cancel) return
        if (smR.ok) setSm(smR.j); else setError(smR.j.error || 'Falha ao calcular ScopeMaturity.')
        if (maR.ok) setMa(maR.j)
      })
      .catch(e => { if (!cancel) setError('Falha de rede: ' + e.message) })
      .finally(() => { if (!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [keysConfigured])

  // Derivados dos cards-herói (sem chamadas novas — só reusa o que já veio).
  const pillars = Array.isArray(sm?.pillars) ? sm.pillars : []
  const measuredPillars = pillars.filter(p => p.measured)
  const weakest = measuredPillars.length ? measuredPillars.reduce((a, p) => (p.score ?? 0) < (a.score ?? 0) ? p : a, measuredPillars[0]) : null
  const infraPct = ma ? avgGroupPct(ma.hostCoverage, ma.infraMetrics) : null
  const apmPct = ma ? avgGroupPct(ma.serviceCoverage, ma.apmMetrics) : null
  const suggested = ma ? (ma.suggestedInfra?.monitorCount || 0) + (ma.suggestedApm?.monitorCount || 0) : 0
  const env = ma?.environment

  return (
    <div>
      <h1 style={s.h1}>{heading}</h1>
      <p style={s.sub}>Visão geral do ambiente {keysConfigured ? `· ${datadogSite}` : ''}.</p>

      {keysConfigured && (
        <>
          <div style={s.metricStrip}>
            <div style={s.metricTile}><div style={s.metricNum}>{env ? env.hostCount : '—'}</div><div style={s.metricLbl}>hosts</div></div>
            <div style={s.metricTile}><div style={s.metricNum}>{env ? env.serviceCount : '—'}</div><div style={s.metricLbl}>serviços APM</div></div>
            <div style={s.metricTile}><div style={s.metricNum}>{env ? env.monitorCount.toLocaleString('pt-BR') : '—'}</div><div style={s.metricLbl}>monitores</div></div>
            <div style={s.metricTile}><div style={{ ...s.metricNum, color: ma == null ? undefined : ma.gapCount === 0 ? 'var(--success)' : ma.gapCount <= 5 ? 'var(--warning)' : 'var(--danger)' }}>{ma ? ma.gapCount : '—'}</div><div style={s.metricLbl}>lacunas</div></div>
          </div>

          <div style={s.band}>
            {/* ScopeMaturity */}
            <Link href="/ferramentas/analise" style={s.hero}>
              <div style={s.heroTop}>
                <div style={ringWrapStyle(66)}>
                  <Ring value={sm?.score ?? null} />
                  <span style={ringNumStyle(scoreColor(sm?.score ?? null), 66)}>{loading && !sm ? '…' : (sm?.score ?? '—')}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={s.heroLabel}>ScopeMaturity</p>
                  <p style={s.heroMeta}>{sm ? `Nível ${sm.level} · ${sm.levelLabel}` : 'Governança e cobertura do ambiente'}</p>
                  {weakest && (
                    <span style={chipStyle(scoreColor(weakest.score), (weakest.score ?? 0) <= 40 ? 'var(--danger-bg)' : 'var(--warning-bg)')}>
                      Elo fraco: {weakest.label} {weakest.score}
                    </span>
                  )}
                </div>
              </div>
              {measuredPillars.length > 0 && <PillarBars pillars={pillars} />}
              <span style={s.heroLink}>Ver score →</span>
            </Link>

            {/* AuditMonitors */}
            <Link href="/ferramentas/audit" style={s.hero}>
              <div style={s.heroTop}>
                <div style={ringWrapStyle(66)}>
                  <Ring value={ma?.score ?? null} />
                  <span style={ringNumStyle(scoreColor(ma?.score ?? null), 66)}>{loading && !ma ? '…' : (ma?.score ?? '—')}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={s.heroLabel}>AuditMonitors</p>
                  <p style={s.heroMeta}>{ma ? `${ma.score}% de cobertura · ${ma.gapCount} lacuna(s)` : 'Cobertura de monitoramento (Infra + APM)'}</p>
                  {suggested > 0 && <span style={chipStyle('var(--accent)', 'var(--accent-light)')}>{suggested} monitores sugeridos</span>}
                </div>
              </div>
              {ma && (infraPct != null || apmPct != null) && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={splitTileStyle(infraPct != null && infraPct >= 75 ? 'var(--success-bg)' : infraPct != null && infraPct > 40 ? 'var(--warning-bg)' : 'var(--danger-bg)')}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: scoreColor(infraPct) }}>{infraPct != null ? `${infraPct}%` : '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Infra</div>
                  </div>
                  <div style={splitTileStyle(apmPct != null && apmPct >= 75 ? 'var(--success-bg)' : apmPct != null && apmPct > 40 ? 'var(--warning-bg)' : 'var(--danger-bg)')}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: scoreColor(apmPct) }}>{apmPct != null ? `${apmPct}%` : '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>APM</div>
                  </div>
                </div>
              )}
              <span style={s.heroLink}>Auditar →</span>
            </Link>
          </div>

          {error && <div style={{ ...s.panel, color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
        </>
      )}

      {!keysConfigured && !keysLoading && (
        <div style={s.panel}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Conecte a API e a App Key em <Link href="/configuracoes" style={{ color: 'var(--accent)' }}>Configurações</Link> para ver os scores do ambiente automaticamente aqui.
          </p>
        </div>
      )}

      {sections.map(section => (
        <div key={section.title} style={{ marginBottom: 22 }}>
          <p style={s.sectionTitle}>{section.title}</p>
          <div style={s.grid}>
            {section.items.map(({ href, Icon, title, desc, cta }) => (
              <Link key={href} href={href} style={s.card}>
                <div style={s.icon}><Icon size={19} /></div>
                <p style={s.cTitle}>{title}</p>
                <p style={s.cDesc}>{desc}</p>
                <span style={s.cCta}>{cta} →</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
