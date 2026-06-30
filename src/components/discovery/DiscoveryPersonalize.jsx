// src/components/discovery/DiscoveryPersonalize.jsx
'use client'

import { ALERT_TYPES, ALERT_BY_KEY } from '@/lib/discovery'

const COMMON_GROUP_BY = ['service', 'resource_name', 'env', 'version', 'http.status_code']

const s = {
  card: { border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 18 },
  label: { display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 },
  hint: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 },
  chip: (on) => ({ fontSize: 12, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-light)' : 'var(--bg-surface-2)', color: on ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: on ? 600 : 400 }),
  textarea: { width: '100%', fontSize: 12.5, padding: '9px 12px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', minHeight: 72, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical' },
  msgHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  reset: { fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' },
  btn: { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  btnGhost: { fontSize: 13, color: 'var(--text-secondary)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  actions: { display: 'flex', justifyContent: 'space-between', paddingTop: 4 },
  input: { width: '100%', fontSize: 13, padding: '8px 10px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
}

export default function DiscoveryPersonalize({ config, setConfig, onNext, onBack }) {
  const d = config.discovery
  const setDisc = (patch) => setConfig(c => ({ ...c, discovery: { ...c.discovery, ...patch } }))

  const enabled = ALERT_TYPES.filter(a => d.alerts[a.key]?.enabled)

  function toggleGroup(tag) {
    const has = d.groupBy.includes(tag)
    setDisc({ groupBy: has ? d.groupBy.filter(t => t !== tag) : [...d.groupBy, tag] })
  }
  function setMessage(key, value) {
    setDisc({ messages: { ...d.messages, [key]: value } })
  }
  function resetMessage(key) {
    setDisc({ messages: { ...d.messages, [key]: ALERT_BY_KEY[key].message } })
  }

  return (
    <div style={s.card}>
      {/* Group By */}
      <div>
        <label style={s.label}>Group By (dimensões do monitor)</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[...new Set([...COMMON_GROUP_BY, ...d.groupBy])].map(tag => (
            <button key={tag} style={s.chip(d.groupBy.includes(tag))} onClick={() => toggleGroup(tag)}>
              {tag}
            </button>
          ))}
        </div>
        <p style={s.hint}>
          Padrão: service e resource_name. Cada combinação vira um grupo avaliado
          separadamente (ex.: alerta por endpoint).
        </p>
      </div>

      {/* Mensagens por tipo */}
      <div>
        <label style={s.label}>Mensagens dos monitores</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {enabled.map(a => (
            <div key={a.key}>
              <div style={s.msgHead}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{a.label}</span>
                <button style={s.reset} onClick={() => resetMessage(a.key)}>restaurar padrão</button>
              </div>
              <textarea
                style={s.textarea}
                value={d.messages[a.key] ?? ''}
                onChange={e => setMessage(a.key, e.target.value)}
              />
            </div>
          ))}
        </div>
        <p style={s.hint}>
          Variáveis: {'{{service.name}}'}, {'{{value}}'}, {'{{threshold}}'}. Use @ para notificar (ex.: @slack-canal).
        </p>
      </div>

      <div style={s.actions}>
        <button style={s.btnGhost} onClick={onBack}>← Voltar</button>
        <button style={s.btn} onClick={onNext}>Continuar →</button>
      </div>
    </div>
  )
}
