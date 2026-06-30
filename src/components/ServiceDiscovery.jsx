// src/components/ServiceDiscovery.jsx
// Descoberta automática de serviços APM + criação de alertas
// (latência, taxa de erro, baixo volume, alto volume).

'use client'

import { useState } from 'react'
import { useApp } from '@/context/AppContext'

const ALERT_TYPES = [
  { key: 'latency',    label: 'Latência (p95)',  unit: 's', def: 1,     hint: 'Dispara se a latência p95 passar do valor (segundos).' },
  { key: 'errorRate',  label: 'Taxa de Erro',    unit: '%', def: 5,     hint: 'Dispara se (erros / requisições) passar do valor (%).' },
  { key: 'lowVolume',  label: 'Baixo volume',    unit: 'req', def: 1,    hint: 'Dispara se as requisições em 15min caírem abaixo do valor.' },
  { key: 'highVolume', label: 'Alto volume',     unit: 'req', def: 10000, hint: 'Dispara se as requisições em 15min passarem do valor.' },
]

const s = {
  card:   { border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 16 },
  label:  { display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 },
  hint:   { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 },
  input:  { width: '100%', fontSize: 13, padding: '9px 12px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  select: { width: '100%', fontSize: 13, padding: '9px 12px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  row2:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  btn:    { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  btnGhost:{ fontSize: 13, color: 'var(--text-secondary)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  alertRow:{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)' },
  thr:    { width: 90, fontSize: 13, padding: '6px 8px', border: '0.5px solid var(--border)', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none' },
  err:    { fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px' },
  okBox:  { fontSize: 12, color: 'var(--success)', background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 8, padding: '8px 12px' },
  resItem:{ fontSize: 12, padding: '8px 10px', borderRadius: 6, border: '0.5px solid var(--border)', marginBottom: 6, fontFamily: 'var(--font-geist-mono), monospace', wordBreak: 'break-all' },
}

export default function ServiceDiscovery({ onBack }) {
  const { keysConfigured, datadogSite } = useApp()

  const [env, setEnv] = useState('')
  const [operation, setOperation] = useState('http.request')
  const [services, setServices] = useState([])
  const [service, setService] = useState('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState(null)

  // estado dos 4 alertas: { latency: {enabled, threshold}, ... }
  const [alerts, setAlerts] = useState(
    Object.fromEntries(ALERT_TYPES.map(a => [a.key, { enabled: a.key === 'latency' || a.key === 'errorRate', threshold: a.def }]))
  )

  function toggle(key) {
    setAlerts(a => ({ ...a, [key]: { ...a[key], enabled: !a[key].enabled } }))
  }
  function setThreshold(key, value) {
    setAlerts(a => ({ ...a, [key]: { ...a[key], threshold: value } }))
  }

  async function discover() {
    setError(''); setResults(null); setLoading(true); setServices([]); setService('')
    try {
      const r = await fetch(`/api/datadog/services?env=${encodeURIComponent(env || '*')}`)
      const data = await r.json()
      if (!r.ok) {
        const extra = data.hint ? ` ${data.hint}` : (data.detail ? ` ${data.detail}` : '')
        setError((data.error || 'Falha ao descobrir serviços.') + extra)
        return
      }
      setServices(data.services || [])
      if ((data.services || []).length === 0) setError('Nenhum serviço encontrado para esse ambiente.')
      else setService(data.services[0])
    } catch (e) {
      setError('Falha de rede: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function createAlerts() {
    setError(''); setResults(null)
    if (!service) { setError('Selecione um serviço.'); return }
    const anySelected = Object.values(alerts).some(a => a.enabled)
    if (!anySelected) { setError('Selecione ao menos um tipo de alerta.'); return }

    setCreating(true)
    try {
      const r = await fetch('/api/datadog/service-monitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service, env, operation, alerts }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Falha ao criar alertas.'); return }
      setResults(data)
    } catch (e) {
      setError('Falha de rede: ' + e.message)
    } finally {
      setCreating(false)
    }
  }

  if (!keysConfigured) {
    return (
      <div style={s.card}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
          Conecte-se ao Datadog (passo anterior ou em Configurações) para descobrir serviços.
        </p>
        <div><button style={s.btnGhost} onClick={onBack}>← Voltar</button></div>
      </div>
    )
  }

  return (
    <div style={s.card}>
      {/* Descoberta */}
      <div style={s.row2}>
        <div>
          <label style={s.label}>Ambiente (env)</label>
          <input style={s.input} value={env} onChange={e => setEnv(e.target.value)} placeholder="prod (vazio = todos)" />
          <p style={s.hint}>Filtro de descoberta. Vazio = todos os ambientes.</p>
        </div>
        <div>
          <label style={s.label}>Operação (span)</label>
          <input style={s.input} value={operation} onChange={e => setOperation(e.target.value)} placeholder="http.request" />
          <p style={s.hint}>Nome do span. http.request cobre a maioria dos serviços web.</p>
        </div>
      </div>

      <div>
        <button style={s.btn} onClick={discover} disabled={loading}>
          {loading ? 'Descobrindo…' : '🔎 Descobrir serviços'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 10 }}>
          via {datadogSite}
        </span>
      </div>

      {services.length > 0 && (
        <>
          <div>
            <label style={s.label}>Serviço descoberto ({services.length})</label>
            <select style={s.select} value={service} onChange={e => setService(e.target.value)}>
              {services.map(svc => <option key={svc} value={svc}>{svc}</option>)}
            </select>
          </div>

          <div>
            <label style={s.label}>Alertas a criar</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ALERT_TYPES.map(a => (
                <div key={a.key} style={s.alertRow}>
                  <input type="checkbox" checked={alerts[a.key].enabled} onChange={() => toggle(a.key)} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{a.label}</span>
                    <p style={{ ...s.hint, marginTop: 2 }}>{a.hint}</p>
                  </div>
                  <input
                    style={s.thr}
                    type="number"
                    value={alerts[a.key].threshold}
                    onChange={e => setThreshold(a.key, e.target.value)}
                    disabled={!alerts[a.key].enabled}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 28 }}>{a.unit}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {error && <div style={s.err}>{error}</div>}

      {results && (
        <div>
          <div style={results.created === results.total ? s.okBox : s.err}>
            {results.created} de {results.total} alerta(s) criado(s).
          </div>
          <div style={{ marginTop: 10 }}>
            {results.results.map((r, i) => (
              <div key={i} style={{ ...s.resItem, color: r.ok ? 'var(--success)' : 'var(--danger)', borderColor: r.ok ? 'var(--success)' : 'var(--danger)' }}>
                {r.ok ? '✓' : '✗'} {r.kind}{r.id ? ` · id ${r.id}` : ''}{r.error ? ` · ${r.error}` : ''}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ações */}
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
        <button style={s.btnGhost} onClick={onBack}>← Voltar</button>
        {services.length > 0 && (
          <button style={s.btn} onClick={createAlerts} disabled={creating}>
            {creating ? 'Criando…' : 'Criar alertas selecionados'}
          </button>
        )}
      </div>
    </div>
  )
}
