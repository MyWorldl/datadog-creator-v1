// src/app/sistema/sobre/page.js
'use client'

import { APP_VERSION, COMMIT_SHA, VERSION_HISTORY } from '@/lib/app-version'

const s = {
  h1:      { fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' },
  sub:     { fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1.5rem' },
  current: { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem', boxShadow: 'var(--card-shadow)', marginBottom: 18, display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' },
  vBadge:  { fontSize: 22, fontWeight: 700, color: 'var(--accent)' },
  commit:  { fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-geist-mono), monospace' },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' },
  item:    { position: 'relative', paddingLeft: 18, paddingBottom: 16, borderLeft: '2px solid var(--border)', marginLeft: 4 },
  dot:     { position: 'absolute', left: -7, top: 2, width: 12, height: 12, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--bg-base)' },
  itemHead:{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  ver:     { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' },
  date:    { fontSize: 12, color: 'var(--text-muted)' },
  title:   { fontSize: 13, color: 'var(--text-secondary)', margin: '2px 0 6px' },
  noteList:{ margin: 0, paddingLeft: 18 },
  note:    { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 },
}

export default function SobrePage() {
  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={s.h1}>Sobre</h1>
      <p style={s.sub}>Versão da aplicação e histórico de mudanças por deploy.</p>

      <div style={s.current}>
        <span style={s.vBadge}>v{APP_VERSION}</span>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Datadog Creator</span>
        {COMMIT_SHA && <span style={s.commit}>commit {COMMIT_SHA}</span>}
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
