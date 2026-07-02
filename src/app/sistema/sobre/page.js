// src/app/sistema/sobre/page.js
'use client'

import { APP_VERSION, COMMIT_SHA, VERSION_HISTORY } from '@/lib/app-version'
import { IconMonitorsCreator, IconAnalytics, IconScope, IconFinops } from '@/components/Icons'

const FEATURES = [
  { Icon: IconMonitorsCreator, name: 'MonitorsCreator', desc: 'Descobre serviços e cria monitores de anomaly detection com parâmetros por tipo de alerta.' },
  { Icon: IconAnalytics, name: 'MonitorsAnalytics', desc: 'Score 0–100 ponderado da maturidade dos monitores (falsos positivos com maior peso).' },
  { Icon: IconScope, name: 'ScopeMaturity', desc: 'Score de governança e cobertura do ambiente, de tags a error budget de SLO.' },
  { Icon: IconFinops, name: 'FinOps Insights', desc: 'Consumo por licenciamento, alarme de anomalia de consumo e custo estimado.' },
]

const s = {
  h1: { fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' },
  sub: { fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1.25rem' },
  hero: { background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)', borderRadius: 14, padding: '1.5rem 1.5rem', color: '#fff', marginBottom: 18, boxShadow: 'var(--card-shadow)' },
  heroTop: { display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 8 },
  heroName: { fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' },
  heroVer: { fontSize: 13, fontWeight: 700, background: 'rgba(255,255,255,0.2)', borderRadius: 999, padding: '2px 10px' },
  heroText: { fontSize: 13.5, lineHeight: 1.65, margin: 0, color: 'rgba(255,255,255,0.92)' },
  commit: { fontSize: 12, color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font-geist-mono), monospace' },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: 22 },
  feat: { display: 'flex', gap: 12, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem', boxShadow: 'var(--card-shadow)' },
  featIcon: { color: 'var(--accent)', flexShrink: 0, marginTop: 2 },
  featName: { fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' },
  featDesc: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 },
  item: { position: 'relative', paddingLeft: 18, paddingBottom: 16, borderLeft: '2px solid var(--border)', marginLeft: 4 },
  dot: { position: 'absolute', left: -7, top: 2, width: 12, height: 12, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--bg-base)' },
  itemHead: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  ver: { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' },
  date: { fontSize: 12, color: 'var(--text-muted)' },
  title: { fontSize: 13, color: 'var(--text-secondary)', margin: '2px 0 6px' },
  noteList: { margin: 0, paddingLeft: 18 },
  note: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 },
}

export default function SobrePage() {
  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={s.h1}>Sobre</h1>
      <p style={s.sub}>O que é o Datadog Creator, para que serve e o histórico de versões.</p>

      <div style={s.hero}>
        <div style={s.heroTop}>
          <span style={s.heroName}>Datadog Creator</span>
          <span style={s.heroVer}>v{APP_VERSION}</span>
          {COMMIT_SHA && <span style={s.commit}>commit {COMMIT_SHA}</span>}
        </div>
        <p style={s.heroText}>
          Um conjunto de ferramentas internas para Engenharia de Vendas focada em Datadog. Nasceu para
          acelerar o trabalho no dia a dia: padronizar a criação de monitores, medir a maturidade do
          monitoramento de um ambiente e dar visibilidade de consumo e custo — tudo a partir das próprias
          chaves de API do cliente, com a coleta feita no servidor e as análises resumidas em scores
          simples de comunicar.
        </p>
      </div>

      <p style={s.sectionTitle}>O que ele faz</p>
      <div style={s.grid}>
        {FEATURES.map(f => (
          <div key={f.name} style={s.feat}>
            <span style={s.featIcon}><f.Icon size={22} /></span>
            <div>
              <p style={s.featName}>{f.name}</p>
              <p style={s.featDesc}>{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <p style={s.sectionTitle}>Histórico</p>
      <div>
        {VERSION_HISTORY.map((entry, i) => (
          <div key={entry.version} style={{ ...s.item, borderLeft: i === VERSION_HISTORY.length - 1 ? '2px solid transparent' : s.item.borderLeft }}>
            <span style={s.dot} />
            <div style={s.itemHead}>
              <span style={s.ver}>v{entry.version}</span>
              <span style={s.date}>{entry.date}</span>
            </div>
            {entry.title && <p style={s.title}>{entry.title}</p>}
            <ul style={s.noteList}>
              {entry.notes.map((n, j) => (
                <li key={j} style={s.note}>{n}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
