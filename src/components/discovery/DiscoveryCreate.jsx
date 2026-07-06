// src/components/discovery/DiscoveryCreate.jsx
'use client'

import { useState } from 'react'
import { planPreview } from '@/lib/discovery'
import { planInfraPreview } from '@/lib/infra'

const s = {
  card: { border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 14 },
  summary: { fontSize: 13, color: 'var(--text-secondary)' },
  err: { fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px' },
  okBox: { fontSize: 13, color: 'var(--success)', background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 8, padding: '10px 12px' },
  resItem: { fontSize: 12, padding: '8px 10px', borderRadius: 6, border: '0.5px solid var(--border)', fontFamily: 'var(--font-geist-mono), monospace', wordBreak: 'break-all' },
  actions: { display: 'flex', justifyContent: 'space-between', paddingTop: 4 },
  btn: { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px 20px', cursor: 'pointer' },
  btnGhost: { fontSize: 13, color: 'var(--text-secondary)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
}

export default function DiscoveryCreate({ config, onBack }) {
  const isInfra = config.resourceType === 'infra'
  const d = isInfra ? config.infra : config.discovery
  const plan = isInfra ? planInfraPreview(d) : planPreview(d)
  const endpoint = isInfra ? '/api/datadog/infra-monitors' : '/api/datadog/service-monitors'
  const bodyKey = isInfra ? 'infra' : 'discovery'
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState(null)

  async function create() {
    setError(''); setResults(null); setCreating(true)
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [bodyKey]: d }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Falha ao criar.'); return }
      setResults(data)
    } catch (e) { setError('Falha de rede: ' + e.message) }
    finally { setCreating(false) }
  }

  return (
    <div style={s.card}>
      {!results && (
        <p style={s.summary}>
          Pronto para criar <strong>{plan.length}</strong> monitor(es). Clique abaixo para enviar ao Datadog.
        </p>
      )}

      {error && <div style={s.err}>{error}</div>}

      {results && (
        <>
          <div style={results.results.every(r => r.ok) ? s.okBox : s.err}>
            {results.created} de {results.total} monitor(es) criado(s)
            {typeof results.skipped === 'number' && results.skipped > 0 ? ` · ${results.skipped} já existia(m) (pulado)` : ''}.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
            {results.results.map((r, i) => (
              <div key={i} style={{ ...s.resItem, color: r.ok ? (r.skipped ? 'var(--text-muted)' : 'var(--success)') : 'var(--danger)', borderColor: r.ok ? (r.skipped ? 'var(--border)' : 'var(--success)') : 'var(--danger)' }}>
                {r.ok ? (r.skipped ? '↷' : '✓') : '✗'} {r.service} · {r.operation} · {r.kind}
                {r.id ? ` · id ${r.id}` : ''}{r.skipped ? ' · já existia' : ''}{r.error ? ` · ${r.error}` : ''}
              </div>
            ))}
          </div>
        </>
      )}

      <div style={s.actions}>
        <button style={s.btnGhost} onClick={onBack} disabled={creating}>← Voltar</button>
        {!results && (
          <button style={s.btn} onClick={create} disabled={creating}>
            {creating ? 'Criando…' : `Criar ${plan.length} monitor(es)`}
          </button>
        )}
      </div>
    </div>
  )
}
