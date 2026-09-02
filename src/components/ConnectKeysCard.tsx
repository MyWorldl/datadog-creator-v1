// src/components/ConnectKeysCard.tsx
'use client'

// Card de "Conexões Datadog" — agora suporta VÁRIAS orgs por usuário.
// As chaves ficam cifradas no Supabase (nunca no browser); trocar de org é só
// marcar outra conexão salva como ativa, sem digitar as chaves de novo.
// Usado no Dashboard, no wizard (Step 1) e em Configurações.

import { useState, type CSSProperties } from 'react'
import { useApp } from '@/context/AppContext'
import type { PublicConnection } from '@/lib/connections'

const SITES = [
  { value: 'datadoghq.com',    label: 'datadoghq.com — US1 (padrão)' },
  { value: 'us3.datadoghq.com', label: 'us3.datadoghq.com — US3' },
  { value: 'us5.datadoghq.com', label: 'us5.datadoghq.com — US5' },
  { value: 'datadoghq.eu',      label: 'datadoghq.eu — EU' },
  { value: 'ap1.datadoghq.com', label: 'ap1.datadoghq.com — AP1' },
  { value: 'ap2.datadoghq.com', label: 'ap2.datadoghq.com — AP2' },
  { value: 'ddog-gov.com',      label: 'ddog-gov.com — US1-FED' },
]

const s: Record<string, CSSProperties> = {
  card:   { background: 'var(--bg-surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', boxShadow: 'var(--card-shadow)' },
  title:  { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' },
  sub:    { fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' },
  label:  { display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 5, fontWeight: 600 },
  input:  { width: '100%', fontSize: 13, padding: '9px 12px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-geist-mono), monospace' },
  select: { width: '100%', fontSize: 13, padding: '9px 12px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  btn:    { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  btnGhost:{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' },
  btnDanger:{ fontSize: 12, fontWeight: 600, color: 'var(--danger)', background: 'transparent', border: '1px solid var(--danger)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' },
  hint:   { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 },
  err:    { fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px' },
  ok:     { fontSize: 12, color: 'var(--success)', background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 8, padding: '8px 12px' },
  badge:  { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--success)', background: 'var(--success-bg)', borderRadius: 999, padding: '3px 10px' },
  row:    { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-surface-2)' },
  orgName:{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 },
  orgSite:{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-geist-mono), monospace' },
  editBtn:{ fontSize: 12, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 4px', lineHeight: 1, borderRadius: 4 },
  nameInput:{ fontSize: 13, fontWeight: 600, padding: '5px 8px', border: '0.5px solid var(--border)', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none', minWidth: 0, flex: 1 },
  renameErr:{ fontSize: 11, color: 'var(--danger)', margin: '3px 0 0' },
}

interface OrgRowProps {
  conn: PublicConnection
  onActivate: (id: string) => void
  onRemove: (id: string) => void
  onRename: (id: string, name: string) => Promise<void>
  busy: boolean
}

function OrgRow({ conn, onActivate, onRemove, onRename, busy }: OrgRowProps) {
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState(conn.name)
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState('')

  function startEditing() {
    setNameDraft(conn.name); setRenameError(''); setEditing(true)
  }
  function cancelEditing() {
    setEditing(false); setNameDraft(conn.name); setRenameError('')
  }
  async function saveRename() {
    const trimmed = nameDraft.trim()
    if (!trimmed) { setRenameError('Nome não pode ficar vazio.'); return }
    if (trimmed === conn.name) { setEditing(false); return }
    setRenaming(true); setRenameError('')
    try {
      await onRename(conn.id, trimmed)
      setEditing(false)
    } catch (e) {
      setRenameError((e as Error).message)
    } finally {
      setRenaming(false)
    }
  }

  return (
    <div style={s.row}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              aria-label="Novo nome da org"
              className="focus-ring"
              style={s.nameInput}
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') cancelEditing() }}
              disabled={renaming}
              autoFocus
            />
            <button style={s.btnGhost} onClick={saveRename} disabled={renaming}>{renaming ? '…' : 'Salvar'}</button>
            <button style={s.btnGhost} onClick={cancelEditing} disabled={renaming}>Cancelar</button>
          </div>
        ) : (
          <p style={s.orgName}>
            {conn.name}
            <button style={s.editBtn} onClick={startEditing} title="Renomear" aria-label="Renomear org">✎</button>
          </p>
        )}
        <p style={s.orgSite}>{conn.site}</p>
        {renameError && <p style={s.renameErr}>{renameError}</p>}
      </div>
      {conn.isActive ? (
        <span style={s.badge}>● Ativa</span>
      ) : (
        <button style={s.btnGhost} onClick={() => onActivate(conn.id)} disabled={busy}>
          Usar esta org
        </button>
      )}
      {!confirming ? (
        <button style={s.btnDanger} onClick={() => setConfirming(true)} disabled={busy}>
          Remover
        </button>
      ) : (
        <span style={{ display: 'flex', gap: 6 }}>
          <button style={s.btnDanger} onClick={() => onRemove(conn.id)} disabled={busy}>Confirmar</button>
          <button style={s.btnGhost} onClick={() => setConfirming(false)} disabled={busy}>Cancelar</button>
        </span>
      )}
    </div>
  )
}

interface TestResult {
  ok: boolean
  msg: string
}

export default function ConnectKeysCard() {
  const { connections, keysLoading, activateConnection, addConnection, removeConnection, renameConnection } = useApp()

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [appKey, setAppKey] = useState('')
  const [site, setSite] = useState('datadoghq.com')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  async function testConnection() {
    setTesting(true); setTestResult(null)
    try {
      const r = await fetch('/api/datadog/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, appKey, site }),
      })
      const data = await r.json()
      if (data.valid) setTestResult({ ok: true, msg: `Conexão válida com ${data.site}.` })
      else setTestResult({ ok: false, msg: data.reason || data.error || 'Credenciais inválidas.' })
    } catch (e) {
      setTestResult({ ok: false, msg: 'Falha de rede: ' + (e as Error).message })
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
      await addConnection({ name: name.trim() || site, apiKey, appKey, site })
      setName(''); setApiKey(''); setAppKey(''); setTestResult(null)
      setShowForm(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleActivate(id: string) {
    setBusyId(id); setError('')
    try { await activateConnection(id) }
    catch (e) { setError((e as Error).message) }
    finally { setBusyId(null) }
  }

  async function handleRemove(id: string) {
    setBusyId(id); setError('')
    try { await removeConnection(id) }
    catch (e) { setError((e as Error).message) }
    finally { setBusyId(null) }
  }

  return (
    <div style={s.card}>
      <p style={s.title}>Conexões Datadog</p>
      <p style={s.sub}>
        Guarde quantas orgs quiser — as chaves ficam cifradas no banco (Supabase),
        nunca no browser. Trocar de org é só marcar outra como ativa.
      </p>

      {keysLoading ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Verificando…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {connections.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              Nenhuma org conectada ainda.
            </p>
          )}
          {connections.map(conn => (
            <OrgRow
              key={conn.id}
              conn={conn}
              onActivate={handleActivate}
              onRemove={handleRemove}
              onRename={renameConnection}
              busy={busyId === conn.id}
            />
          ))}

          {error && <div style={s.err}>{error}</div>}

          {!showForm ? (
            <div>
              <button style={s.btn} onClick={() => setShowForm(true)}>+ Adicionar org</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div>
                <label style={s.label} htmlFor="conn-name">Nome (pra você reconhecer, ex.: &quot;Produção&quot;, &quot;Cliente X&quot;)</label>
                <input id="conn-name" className="focus-ring" style={s.input} type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Opcional — usa o site se vazio" autoComplete="off" />
              </div>
              <div>
                <label style={s.label} htmlFor="conn-site">Site do Datadog</label>
                <select id="conn-site" className="focus-ring" style={s.select} value={site} onChange={e => setSite(e.target.value)}>
                  {SITES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={s.label} htmlFor="conn-api-key">API Key</label>
                <input id="conn-api-key" className="focus-ring" style={s.input} type={show ? 'text' : 'password'} value={apiKey}
                  onChange={e => setApiKey(e.target.value)} placeholder="••••••••••••••••" autoComplete="off" />
              </div>
              <div>
                <label style={s.label} htmlFor="conn-app-key">Application Key</label>
                <input id="conn-app-key" className="focus-ring" style={s.input} type={show ? 'text' : 'password'} value={appKey}
                  onChange={e => setAppKey(e.target.value)} placeholder="••••••••••••••••" autoComplete="off" />
              </div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} />
                Mostrar chaves
              </label>

              {testResult && (
                <div style={testResult.ok ? s.ok : s.err}>
                  {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={s.btn} onClick={save} disabled={saving}>
                  {saving ? 'Salvando…' : 'Salvar e conectar'}
                </button>
                <button style={s.btnGhost} onClick={testConnection} disabled={testing}>
                  {testing ? 'Testando…' : 'Testar antes de salvar'}
                </button>
                <button style={s.btnGhost} onClick={() => { setShowForm(false); setError(''); setTestResult(null) }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
