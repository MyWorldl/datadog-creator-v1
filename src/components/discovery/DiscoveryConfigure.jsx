// src/components/discovery/DiscoveryConfigure.jsx
'use client'

import { useState } from 'react'
import { useApp } from '@/context/AppContext'
import { ALERT_TYPES } from '@/lib/discovery'

const s = {
  card: { border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 16 },
  label: { display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 },
  hint: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 },
  input: { width: '100%', fontSize: 13, padding: '9px 12px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  select: { fontSize: 12, padding: '6px 8px', border: '0.5px solid var(--border)', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none' },
  btn: { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  btnGhost: { fontSize: 13, color: 'var(--text-secondary)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  svcList: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto', border: '0.5px solid var(--border)', borderRadius: 8, padding: 8 },
  svcRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 6 },
  selRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)' },
  alertRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)' },
  thr: { width: 90, fontSize: 13, padding: '6px 8px', border: '0.5px solid var(--border)', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none' },
  err: { fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px' },
  actions: { display: 'flex', justifyContent: 'space-between', paddingTop: 4 },
}

export default function DiscoveryConfigure({ config, setConfig, onNext, onBack }) {
  const { keysConfigured, datadogSite } = useApp()
  const d = config.discovery
  const setDisc = (patch) => setConfig(c => ({ ...c, discovery: { ...c.discovery, ...patch } }))

  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')

  const selectedNames = Object.keys(d.selected)

  async function discover() {
    setError(''); setLoading(true)
    try {
      const r = await fetch(`/api/datadog/services?env=${encodeURIComponent(d.env || '*')}`)
      const data = await r.json()
      if (!r.ok) {
        setError((data.error || 'Falha ao descobrir serviços.') + (data.hint ? ' ' + data.hint : ''))
        return
      }
      setDisc({ services: data.services || [] })
      if ((data.services || []).length === 0) setError('Nenhum serviço encontrado para esse ambiente.')
    } catch (e) { setError('Falha de rede: ' + e.message) }
    finally { setLoading(false) }
  }

  function toggleService(svc) {
    const sel = { ...d.selected }
    if (sel[svc]) delete sel[svc]
    else sel[svc] = { operation: '', opsCount: null, operations: [] }
    setDisc({ selected: sel })
  }

  async function analyze() {
    if (selectedNames.length === 0) { setError('Selecione ao menos um serviço.'); return }
    setError(''); setAnalyzing(true)
    try {
      const r = await fetch(`/api/datadog/operations?services=${encodeURIComponent(selectedNames.join(','))}`)
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Falha ao identificar operações.'); return }
      const sel = { ...d.selected }
      for (const svc of selectedNames) {
        const res = data.results?.[svc] || {}
        sel[svc] = {
          opsCount: res.count ?? 0,
          operations: res.operations || [],
          operation: res.primary || sel[svc]?.operation || 'http.request',
          error: res.error || null,
        }
      }
      setDisc({ selected: sel })
    } catch (e) { setError('Falha de rede: ' + e.message) }
    finally { setAnalyzing(false) }
  }

  function setOp(svc, op) {
    setDisc({ selected: { ...d.selected, [svc]: { ...d.selected[svc], operation: op } } })
  }
  function toggleAlert(k) {
    setDisc({ alerts: { ...d.alerts, [k]: { ...d.alerts[k], enabled: !d.alerts[k].enabled } } })
  }
  function setThr(k, v) {
    setDisc({ alerts: { ...d.alerts, [k]: { ...d.alerts[k], threshold: v } } })
  }

  function handleNext() {
    if (selectedNames.length === 0) return setError('Selecione ao menos um serviço.')
    const missing = selectedNames.filter(svc => !d.selected[svc]?.operation)
    if (missing.length) return setError(`Identifique e escolha a operação de: ${missing.join(', ')}.`)
    if (!Object.values(d.alerts).some(a => a.enabled)) return setError('Selecione ao menos um tipo de alerta.')
    setError('')
    onNext()
  }

  if (!keysConfigured) {
    return (
      <div style={s.card}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
          Conecte-se ao Datadog (Etapa 1 ou em Configurações) para descobrir serviços.
        </p>
        <div><button style={s.btnGhost} onClick={onBack}>← Voltar</button></div>
      </div>
    )
  }

  return (
    <div style={s.card}>
      {/* Descoberta */}
      <div>
        <label style={s.label}>Ambiente (env)</label>
        <input style={s.input} value={d.env} onChange={e => setDisc({ env: e.target.value })} placeholder="prod (vazio = todos)" />
        <p style={s.hint}>Filtro de descoberta. Vazio = todos os ambientes.</p>
      </div>

      <div>
        <button style={s.btn} onClick={discover} disabled={loading}>
          {loading ? 'Descobrindo…' : '🔎 Descobrir serviços'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 10 }}>via {datadogSite}</span>
      </div>

      {d.services.length > 0 && (
        <div>
          <label style={s.label}>Serviços ({d.services.length}) — selecione um ou mais</label>
          <div style={s.svcList}>
            {d.services.map(svc => (
              <label key={svc} style={s.svcRow}>
                <input type="checkbox" checked={!!d.selected[svc]} onChange={() => toggleService(svc)} />
                <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{svc}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {selectedNames.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ ...s.label, marginBottom: 0 }}>Selecionados ({selectedNames.length})</label>
            <button style={s.btnGhost} onClick={analyze} disabled={analyzing}>
              {analyzing ? 'Identificando…' : 'Identificar operações'}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {selectedNames.map(svc => {
              const meta = d.selected[svc]
              return (
                <div key={svc} style={s.selRow}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{svc}</span>
                  {meta.error ? (
                    <span style={{ fontSize: 12, color: 'var(--danger)' }}>erro: {meta.error}</span>
                  ) : meta.opsCount == null ? (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                  ) : (
                    <>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{meta.opsCount} operação(ões)</span>
                      <select style={s.select} value={meta.operation} onChange={e => setOp(svc, e.target.value)}>
                        {(meta.operations.length ? meta.operations : [meta.operation || 'http.request']).map(op => (
                          <option key={op} value={op}>{op}</option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
              )
            })}
          </div>
          <p style={s.hint}>Os monitores usam a operação escolhida por serviço (padrão: a principal).</p>
        </div>
      )}

      {selectedNames.length > 0 && (
        <div>
          <label style={s.label}>Alertas a criar</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ALERT_TYPES.map(a => (
              <div key={a.key} style={s.alertRow}>
                <input type="checkbox" checked={d.alerts[a.key].enabled} onChange={() => toggleAlert(a.key)} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{a.label}</span>
                  <p style={{ ...s.hint, marginTop: 2 }}>{a.hint}</p>
                </div>
                <input style={s.thr} type="number" value={d.alerts[a.key].threshold}
                  onChange={e => setThr(a.key, e.target.value)} disabled={!d.alerts[a.key].enabled} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 28 }}>{a.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <div style={s.err}>{error}</div>}

      <div style={s.actions}>
        <button style={s.btnGhost} onClick={onBack}>← Voltar</button>
        <button style={s.btn} onClick={handleNext}>Continuar →</button>
      </div>
    </div>
  )
}
