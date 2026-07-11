// src/app/ferramentas/dashboard/page.js
'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSession } from '@/context/SupabaseAuthContext'
import { useApp } from '@/context/AppContext'
import { IconMonitorsCreator, IconAnalytics, IconScope, IconFinops, IconSettings } from '@/components/Icons'

const cards = [
  { href: '/monitor', Icon: IconMonitorsCreator, title: 'MonitorsCreator', desc: 'Descubra serviços e crie monitores de anomalia no Datadog.', cta: 'Abrir wizard' },
  { href: '/ferramentas/audit', Icon: IconAnalytics, title: 'AuditMonitors', desc: 'Cobertura de monitoramento (Infra + APM) e sugestão de lacunas.', cta: 'Auditar' },
  { href: '/ferramentas/analise', Icon: IconScope, title: 'ScopeMaturity', desc: 'Score de governança e cobertura do ambiente.', cta: 'Ver score' },
  { href: '/ferramentas/finops', Icon: IconFinops, title: 'FinOps Insights', desc: 'Consumo por licenciamento, alarme e custo estimado.', cta: 'Ver consumo' },
  { href: '/configuracoes', Icon: IconSettings, title: 'Configurações', desc: 'Tema e conexão da sessão.', cta: 'Ajustar' },
]

const scoreColor = (v) => v == null ? 'var(--text-muted)' : v >= 80 ? 'var(--success)' : v >= 50 ? 'var(--warning)' : 'var(--danger)'

function Ring({ value, size = 88, stroke = 9 }) {
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
  sub: { fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1.25rem' },
  band: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 14 },
  scoreCard: { display: 'flex', alignItems: 'center', gap: 18, background: 'var(--bg-surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', boxShadow: 'var(--card-shadow)', textDecoration: 'none' },
  scoreWrap: { position: 'relative', width: 88, height: 88, flexShrink: 0 },
  scoreNum: (c) => ({ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800, color: c }),
  scoreLabel: { fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 },
  scoreSub: { fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0', lineHeight: 1.5 },
  scoreLink: { fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginTop: 8, display: 'inline-block' },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 },
  card: { display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', textDecoration: 'none', boxShadow: 'var(--card-shadow)' },
  icon: { width: 38, height: 38, borderRadius: 10, background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  cTitle: { fontSize: 14.5, fontWeight: 600, color: 'var(--text-primary)', margin: 0 },
  cDesc: { fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5, flex: 1 },
  cCta: { fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginTop: 2 },
  panel: { background: 'var(--bg-surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', boxShadow: 'var(--card-shadow)', marginBottom: 22 },
}

function ScoreCard({ href, label, score, sub, loading }) {
  return (
    <Link href={href} style={s.scoreCard}>
      <div style={s.scoreWrap}>
        <Ring value={score} />
        <span style={s.scoreNum(scoreColor(score))}>{loading ? '…' : (score ?? '—')}</span>
      </div>
      <div style={{ flex: 1 }}>
        <p style={s.scoreLabel}>{label}</p>
        <p style={s.scoreSub}>{sub}</p>
        <span style={s.scoreLink}>ver detalhes →</span>
      </div>
    </Link>
  )
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const { keysConfigured, keysLoading, datadogSite } = useApp()
  const name = session?.user?.name || 'de volta'

  const [sm, setSm] = useState(null)
  const [ma, setMa] = useState(null)
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

  return (
    <div>
      <h1 style={s.h1}>Olá, {name} 👋</h1>
      <p style={s.sub}>Visão geral do ambiente {keysConfigured ? `· ${datadogSite}` : ''}.</p>

      {keysConfigured && (
        <>
          <div style={s.band}>
            <ScoreCard href="/ferramentas/analise" label="ScopeMaturity" score={sm?.score ?? null} loading={loading && !sm}
              sub={sm ? `Nível ${sm.level} · ${sm.levelLabel}` : 'Governança e cobertura do ambiente'} />
            <ScoreCard href="/ferramentas/audit" label="AuditMonitors" score={ma?.score ?? null} loading={loading && !ma}
              sub={ma ? `${ma.score}% de cobertura · ${ma.gapCount} lacuna(s)` : 'Cobertura de monitoramento (Infra + APM)'} />
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

      <p style={s.sectionTitle}>Ferramentas</p>
      <div style={s.grid}>
        {cards.map(({ href, Icon, title, desc, cta }) => (
          <Link key={href} href={href} style={s.card}>
            <div style={s.icon}><Icon size={19} /></div>
            <p style={s.cTitle}>{title}</p>
            <p style={s.cDesc}>{desc}</p>
            <span style={s.cCta}>{cta} →</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
