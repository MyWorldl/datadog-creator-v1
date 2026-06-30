// src/components/StepPersonalize.jsx
// Step 3 — Personalizar nome, mensagem, tags e prioridade

'use client'

import { useState } from 'react'
import DiscoveryPersonalize from '@/components/discovery/DiscoveryPersonalize'

const s = {
  card: {
    border: '0.5px solid var(--border)',
    borderRadius: 12,
    padding: '1.25rem',
    background: 'var(--bg-surface)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  label: {
    display: 'block',
    fontSize: 13,
    color: 'var(--text-secondary)',
    marginBottom: 6,
    fontWeight: 500,
  },
  hint: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 },
  input: {
    width: '100%',
    fontSize: 13,
    padding: '9px 12px',
    border: '0.5px solid var(--border)',
    borderRadius: 8,
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    outline: 'none',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    fontSize: 13,
    padding: '9px 12px',
    border: '0.5px solid var(--border)',
    borderRadius: 8,
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    outline: 'none',
    boxSizing: 'border-box',
    resize: 'vertical',
    minHeight: 88,
    fontFamily: 'inherit',
    lineHeight: 1.5,
  },
  select: {
    width: '100%',
    fontSize: 13,
    padding: '9px 12px',
    border: '0.5px solid var(--border)',
    borderRadius: 8,
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    outline: 'none',
    boxSizing: 'border-box',
  },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 12,
    padding: '3px 10px',
    background: 'var(--accent-light)',
    color: 'var(--accent)',
    border: '0.5px solid var(--accent)',
    borderRadius: 20,
  },
  tagRemove: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--accent-hover)',
    fontSize: 13,
    padding: 0,
    lineHeight: 1,
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  btnPrimary: {
    fontSize: 13, fontWeight: 500, color: '#fff',
    background: 'var(--accent)', border: 'none',
    borderRadius: 8, padding: '9px 20px', cursor: 'pointer',
  },
  btnGhost: {
    fontSize: 13, color: 'var(--text-secondary)',
    background: 'none', border: '0.5px solid var(--border)',
    borderRadius: 8, padding: '9px 18px', cursor: 'pointer',
  },
  btnAddTag: {
    fontSize: 12, color: 'var(--accent)',
    background: 'none', border: '0.5px solid var(--accent)',
    borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
}

export default function StepPersonalize({ config, setConfig, onNext, onBack }) {
  const [tagInput, setTagInput] = useState('')
  const [errors, setErrors]     = useState({})

  if (config.mode === 'discovery')
    return <DiscoveryPersonalize config={config} setConfig={setConfig} onNext={onNext} onBack={onBack} />

  function validate() {
    const e = {}
    if (!config.name || config.name.trim().length === 0)
      e.name = 'Informe um nome para o monitor.'
    if (!config.message || config.message.trim().length === 0)
      e.message = 'Informe uma mensagem de alerta.'
    return e
  }

  function handleNext() {
    const e = validate()
    if (Object.keys(e).length > 0) { setErrors(e); return }
    setErrors({})
    onNext()
  }

  function addTag() {
    const val = tagInput.trim()
    if (!val) return
    if ((config.tags || []).includes(val)) { setTagInput(''); return }
    setConfig(c => ({ ...c, tags: [...(c.tags || []), val] }))
    setTagInput('')
  }

  function removeTag(tag) {
    setConfig(c => ({ ...c, tags: (c.tags || []).filter(t => t !== tag) }))
  }

  return (
    <div style={s.card}>

      {/* Nome + Prioridade */}
      <div style={s.row2}>
        <div style={{ gridColumn: '1 / 2' }}>
          <label style={s.label}>Nome do monitor</label>
          <input
            style={s.input}
            value={config.name}
            onChange={e => setConfig(c => ({ ...c, name: e.target.value }))}
            placeholder={`Anomaly — ${config.metric || 'system.cpu.user'}`}
          />
          {errors.name && (
            <p style={{ ...s.hint, color: 'var(--danger)', marginTop: 6 }}>{errors.name}</p>
          )}
        </div>
        <div>
          <label style={s.label}>Prioridade</label>
          <select
            style={s.select}
            value={config.priority}
            onChange={e => setConfig(c => ({ ...c, priority: Number(e.target.value) }))}
          >
            <option value={1}>P1 — crítico</option>
            <option value={2}>P2 — alto</option>
            <option value={3}>P3 — médio</option>
            <option value={4}>P4 — baixo</option>
            <option value={5}>P5 — info</option>
          </select>
        </div>
      </div>

      {/* Mensagem */}
      <div>
        <label style={s.label}>Mensagem de alerta</label>
        <textarea
          style={s.textarea}
          value={config.message}
          onChange={e => setConfig(c => ({ ...c, message: e.target.value }))}
          placeholder={`Anomalia detectada em ${config.metric || 'system.cpu.user'}.\nVerifique o host afetado.\n@equipe-ops`}
        />
        {errors.message && (
          <p style={{ ...s.hint, color: 'var(--danger)', marginTop: 6 }}>{errors.message}</p>
        )}
        <p style={s.hint}>
          Use @slack-canal, @email ou @equipe para notificar. Suporta markdown.
        </p>
      </div>

      {/* Notificar sem dados */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="checkbox"
          id="nodata"
          checked={config.notifyNoData}
          onChange={e => setConfig(c => ({ ...c, notifyNoData: e.target.checked }))}
          style={{ width: 14, height: 14, cursor: 'pointer' }}
        />
        <label htmlFor="nodata" style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          Notificar quando a métrica parar de reportar dados
        </label>
      </div>

      {/* Tags */}
      <div>
        <label style={s.label}>Tags</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {(config.tags || []).map(tag => (
            <span key={tag} style={s.tag}>
              {tag}
              <button
                style={s.tagRemove}
                onClick={() => removeTag(tag)}
                aria-label={`Remover tag ${tag}`}
              >
                ×
              </button>
            </span>
          ))}
          {(config.tags || []).length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhuma tag adicionada.</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ ...s.input, flex: 1 }}
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTag()}
            placeholder="env:staging ou service:api"
          />
          <button style={s.btnAddTag} onClick={addTag}>+ Adicionar</button>
        </div>
        <p style={s.hint}>Pressione Enter ou clique para adicionar. Ex: env:prod, team:sre.</p>
      </div>

      {/* Ações */}
      <div style={s.actions}>
        <button style={s.btnGhost} onClick={onBack}>← Voltar</button>
        <button style={s.btnPrimary} onClick={handleNext}>Continuar →</button>
      </div>

    </div>
  )
}
