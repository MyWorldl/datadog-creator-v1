// src/components/discovery/DiscoveryPersonalize.jsx
'use client'

import { useState } from 'react'
import { ALERT_TYPES, ALERT_BY_KEY } from '@/lib/discovery'

const COMMON_GROUP_BY = ['service', 'resource_name', 'env', 'version', 'http.status_code']

const s = {
  card: { border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 18 },
  label: { display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 },
  hint: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 },
  input: { width: '100%', fontSize: 13, padding: '8px 10px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  chip: (on) => ({ fontSize: 12, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-light)' : 'var(--bg-surface-2)', color: on ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: on ? 600 : 400 }),
  tag: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 10px', borderRadius: 999, background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent)' },
  tagX: { cursor: 'pointer', fontWeight: 700, border: 'none', background: 'none', color: 'var(--accent)', fontSize: 13, lineHeight: 1 },
  textarea: { width: '100%', fontSize: 12.5, padding: '9px 12px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', minHeight: 72, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical' },
  msgHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  reset: { fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' },
  btn: { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  btnGhost: { fontSize: 13, color: 'var(--text-secondary)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  addBtn: { fontSize: 13, fontWeight: 600, color: 'var(--accent)', background: 'none', border: '0.5px solid var(--accent)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' },
  actions: { display: 'flex', justifyContent: 'space-between', paddingTop: 4 },
}

export default function DiscoveryPersonalize({ config, setConfig, onNext, onBack }) {
  const d = config.discovery
  const setDisc = (patch) => setConfig(c => ({ ...c, discovery: { ...c.discovery, ...patch } }))
  const [tagInput, setTagInput] = useState('')

  const enabled = ALERT_TYPES.filter(a => d.alerts[a.key]?.enabled)

  function toggleGroup(tag) {
    const has = d.groupBy.includes(tag)
    setDisc({ groupBy: has ? d.groupBy.filter(t => t !== tag) : [...d.groupBy, tag] })
  }
  function addTag() {
    const v = tagInput.trim()
    if (!v) return
    if ((d.tags || []).includes(v)) { setTagInput(''); return }
    setDisc({ tags: [...(d.tags || []), v] })
    setTagInput('')
  }
  function removeTag(t) { setDisc({ tags: (d.tags || []).filter(x => x !== t) }) }
  function setMessage(key, value) { setDisc({ messages: { ...d.messages, [key]: value } }) }
  function resetMessage(key) { setDisc({ messages: { ...d.messages, [key]: ALERT_BY_KEY[key].message } }) }

  return (
    <div style={s.card}>
      {/* Nome do monitor */}
      <div>
        <label style={s.label}>Nome do monitor (prefixo)</label>
        <input style={s.input} value={d.namePrefix} onChange={e => setDisc({ namePrefix: e.target.value })} placeholder="[MonitorsCreator]" />
        <p style={s.hint}>
          Cada monitor recebe: <strong>{(d.namePrefix || '[MonitorsCreator]')} &lt;serviço&gt; · &lt;tipo&gt;</strong>.
        </p>
      </div>

      {/* Tags */}
      <div>
        <label style={s.label}>Tags (aplicadas a todos os monitores)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={s.input}
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
            placeholder="team:payments"
          />
          <button style={s.addBtn} onClick={addTag}>+ Adicionar</button>
        </div>
        {(d.tags || []).length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {d.tags.map(t => (
              <span key={t} style={s.tag}>{t}<button style={s.tagX} onClick={() => removeTag(t)}>×</button></span>
            ))}
          </div>
        )}
        <p style={s.hint}>Além destas, cada monitor recebe created_by:monitorscreator e service:&lt;serviço&gt;.</p>
      </div>

      {/* Group By */}
      <div>
        <label style={s.label}>Group By (dimensões do monitor)</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[...new Set([...COMMON_GROUP_BY, ...d.groupBy])].map(tag => (
            <button key={tag} style={s.chip(d.groupBy.includes(tag))} onClick={() => toggleGroup(tag)}>{tag}</button>
          ))}
        </div>
        <p style={s.hint}>Padrão: service e resource_name. Cada combinação vira um grupo avaliado separadamente.</p>
      </div>

      {/* Mensagens */}
      <div>
        <label style={s.label}>Mensagens dos monitores</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {enabled.map(a => (
            <div key={a.key}>
              <div style={s.msgHead}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{a.label}</span>
                <button style={s.reset} onClick={() => resetMessage(a.key)}>restaurar padrão</button>
              </div>
              <textarea style={s.textarea} value={d.messages[a.key] ?? ''} onChange={e => setMessage(a.key, e.target.value)} />
            </div>
          ))}
        </div>
        <p style={s.hint}>Variáveis: {'{{service.name}}'}, {'{{value}}'}. Use @ para notificar (ex.: @slack-canal).</p>
      </div>

      <div style={s.actions}>
        <button style={s.btnGhost} onClick={onBack}>← Voltar</button>
        <button style={s.btn} onClick={onNext}>Continuar →</button>
      </div>
    </div>
  )
}
