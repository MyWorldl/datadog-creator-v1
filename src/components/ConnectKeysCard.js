// src/components/ConnectKeysCard.js
'use client'

// Card de "Conexão Datadog" da sessão.
// Mostra se as chaves já estão configuradas (cookie httpOnly no servidor) e
// permite (re)configurar ou desconectar. Usado no Dashboard e em Configurações.

import { useState } from 'react'
import { useApp } from '@/context/AppContext'

const SITES = [
  { value: 'datadoghq.com',    label: 'datadoghq.com — US1 (padrão)' },
  { value: 'us3.datadoghq.com', label: 'us3.datadoghq.com — US3' },
  { value: 'us5.datadoghq.com', label: 'us5.datadoghq.com — US5' },
  { value: 'datadoghq.eu',      label: 'datadoghq.eu — EU' },
  { value: 'ap1.datadoghq.com', label: 'ap1.datadoghq.com — AP1' },
  { value: 'ap2.datadoghq.com', label: 'ap2.datadoghq.com — AP2' },
  { value: 'ddog-gov.com',      label: 'ddog-gov.com — US1-FED' },
]

const s = {
  card:   { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem', boxShadow: 'var(--card-shadow)' },
  title:  { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' },
  sub:    { fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' },
  label:  { display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 5, fontWeight: 600 },
  input:  { width: '100%', fontSize: 13, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-geist-mono), monospace' },
  select: { width: '100%', fontSize: 13, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  btn:    { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  btnGhost:{ fontSize: 12, fontWeight: 600, color: 'var(--danger)', background: 'transparent', border: '1px solid var(--danger)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' },
  hint:   { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 },
  err:    { fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px' },
  badge:  { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--success)', background: 'var(--success-bg)', borderRadius: 999, padding: '4px 12px' },
}

export default function ConnectKeysCard() {
  const { keysConfigured, keysLoading, datadogSite, refreshKeys, setKeysConfigured } = useApp()

  const [editing, setEditing] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [appKey, setAppKey] = useState('')
  const [site, setSite] = useState(datadogSite || 'datadoghq.com')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null) // {ok, msg}

  async function testConnection() {
    setTesting(true); setTestResult(null)
    try {
      const r = await fetch('/api/datadog/validate')
      const data = await r.json()
      if (data.valid) {
        setTestResult({ ok: true, msg: `Conexão válida com ${data.site}.` })
      } else {
        setTestResult({ ok: false, msg: data.reason || data.error || 'Credenciais inválidas.' })
      }
    } catch (e) {
      setTestResult({ ok: false, msg: 'Falha de rede: ' + e.message })
    } finally {
      setTesting(false)
    }
  }

  async function save() {
    setError('')
    if (apiKey.trim().length < 10) return setError('API Key parece inválida.')
    if (appKey.trim().length < 10) return setError('Application Key parece inválida.')

    setSaving(true)
    try {
      const r = await fetch('/api/session/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, appKey, site }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Falha ao salvar.'); return }
      setApiKey(''); setAppKey('')
      setEditing(false)
      await refreshKeys()
    } catch (e) {
      setError('Falha de rede: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function disconnect() {
    try { await fetch('/api/session/keys', { method: 'DELETE' }) } catch {}
    setKeysConfigured(false)
    setEditing(false)
  }

  return (
    <div style={s.card}>
      <p style={s.title}>Conexão Datadog (sessão)</p>
      <p style={s.sub}>
        As chaves valem por toda a sessão e ficam em cookie httpOnly no servidor —
        o browser nunca as lê.
      </p>

      {keysLoading ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Verificando…</p>
      ) : keysConfigured && !editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={s.badge}>● Conectado</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Site: <strong>{datadogSite}</strong>
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button style={s.btn} onClick={() => { setTestResult(null); setEditing(true) }}>Reconfigurar</button>
              <button style={s.btnGhost} onClick={testConnection} disabled={testing}>
                {testing ? 'Testando…' : 'Testar conexão'}
              </button>
              <button style={s.btnGhost} onClick={disconnect}>Desconectar</button>
            </div>
          </div>
          {testResult && (
            <div style={testResult.ok
              ? { fontSize: 12, color: 'var(--success)', background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 8, padding: '8px 12px' }
              : s.err}>
              {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={s.label}>Site do Datadog</label>
            <select style={s.select} value={site} onChange={e => setSite(e.target.value)}>
              {SITES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={s.label}>API Key</label>
            <input style={s.input} type={show ? 'text' : 'password'} value={apiKey}
              onChange={e => setApiKey(e.target.value)} placeholder="••••••••••••••••" autoComplete="off" />
          </div>
          <div>
            <label style={s.label}>Application Key</label>
            <input style={s.input} type={show ? 'text' : 'password'} value={appKey}
              onChange={e => setAppKey(e.target.value)} placeholder="••••••••••••••••" autoComplete="off" />
          </div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} />
            Mostrar chaves
          </label>

          {error && <div style={s.err}>{error}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button style={s.btn} onClick={save} disabled={saving}>
              {saving ? 'Salvando…' : 'Conectar'}
            </button>
            {editing && (
              <button style={{ ...s.btnGhost, color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                onClick={() => setEditing(false)}>Cancelar</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
