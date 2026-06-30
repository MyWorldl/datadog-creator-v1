// src/app/ferramentas/dashboard/page.js
'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useApp } from '@/context/AppContext'
import ConnectKeysCard from '@/components/ConnectKeysCard'

const cards = [
  {
    href: '/monitor',
    icon: '◈',
    title: 'MonitorsCreator',
    desc: 'Wizard guiado para criar monitores de anomalia no Datadog.',
    cta: 'Abrir wizard',
  },
  {
    href: '/ferramentas/analise',
    icon: '◎',
    title: 'Análise do Ambiente',
    desc: 'Inspecione e investigue o estado do seu ambiente Datadog.',
    cta: 'Analisar',
  },
  {
    href: '/configuracoes',
    icon: '⚙',
    title: 'Configurações',
    desc: 'Tema, conexão padrão e valores padrão do wizard.',
    cta: 'Ajustar',
  },
]

const s = {
  h1:    { fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' },
  sub:   { fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1.5rem' },
  grid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, marginBottom: 20 },
  card:  { display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem', textDecoration: 'none', boxShadow: 'var(--card-shadow)', transition: 'border-color 0.15s, transform 0.15s' },
  icon:  { width: 40, height: 40, borderRadius: 10, background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 },
  cTitle:{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 },
  cDesc: { fontSize: 12.5, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5, flex: 1 },
  cCta:  { fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginTop: 4 },
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const { datadogSite, keysConfigured } = useApp()
  const name = session?.user?.name || 'de volta'

  return (
    <div>
      <h1 style={s.h1}>Olá, {name} 👋</h1>
      <p style={s.sub}>Visão geral da sua aplicação. Acesse as ferramentas pelas caixas abaixo.</p>

      <div style={s.grid}>
        {cards.map(c => (
          <Link key={c.href} href={c.href} style={s.card}>
            <div style={s.icon}>{c.icon}</div>
            <p style={s.cTitle}>{c.title}</p>
            <p style={s.cDesc}>{c.desc}</p>
            <span style={s.cCta}>{c.cta} →</span>
          </Link>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, maxWidth: 560 }}>
        <ConnectKeysCard />
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Status: {keysConfigured
            ? <>conectado ao <strong>{datadogSite}</strong>.</>
            : <>sem conexão Datadog ativa nesta sessão.</>}
        </div>
      </div>
    </div>
  )
}
