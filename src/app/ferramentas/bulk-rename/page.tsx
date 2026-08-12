// src/app/ferramentas/bulk-rename/page.tsx
'use client'

import { useState, type CSSProperties } from 'react'
import { useApp } from '@/context/AppContext'

interface RenameMatch {
  id: string | number
  oldName: string
  newName: string
}

interface RenameResultItem {
  id: string | number
  ok: boolean
  name: string
  error?: string
}

interface RenameResult {
  renamed: number
  total: number
  results: RenameResultItem[]
}

const s: Record<string, CSSProperties> = {
  h1: { fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' },
  sub: { fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1.25rem' },
  card: { background: 'var(--bg-surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', boxShadow: 'var(--card-shadow)', marginBottom: 16 },
  label: { display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 },
  input: { width: '100%', fontSize: 13, padding: '9px 12px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  btn: { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', whiteSpace: 'nowrap' },
  smallBtn: { fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' },
  err: { fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 12px', marginTop: 12 },
  ok: { fontSize: 12.5, color: 'var(--success)', background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 8, padding: '10px 12px' },
  counter: { fontSize: 12.5, color: 'var(--text-secondary)' },
  list: { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 420, overflowY: 'auto', marginTop: 12 },
  row: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 10px', borderRadius: 8, border: '0.5px solid var(--border)', background: 'var(--bg-surface-2)' },
  oldName: { fontSize: 12.5, color: 'var(--text-muted)', textDecoration: 'line-through', wordBreak: 'break-word' },
  newName: { fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, wordBreak: 'break-word' },
  resItem: { fontSize: 12, padding: '7px 10px', borderRadius: 6, border: '0.5px solid var(--border)', fontFamily: 'var(--font-geist-mono), monospace', wordBreak: 'break-word' },
}

export default function BulkRenamePage() {
  const { keysConfigured, datadogSite } = useApp()
  const [search, setSearch] = useState('')
  const [replace, setReplace] = useState('')
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const [matches, setMatches] = useState<RenameMatch[] | null>(null)
  const [excluded, setExcluded] = useState<Set<string | number>>(new Set())
  const [result, setResult] = useState<RenameResult | null>(null)

  const selected = (matches || []).filter(m => !excluded.has(m.id))

  async function preview() {
    if (!search.trim()) { setError('Informe o texto a buscar no nome do monitor.'); return }
    setError(''); setLoading(true); setMatches(null); setResult(null); setExcluded(new Set())
    try {
      const qs = new URLSearchParams({ search, replace })
      const r = await fetch(`/api/datadog/bulk-rename-monitors?${qs.toString()}`)
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Falha ao buscar monitores.'); return }
      const found: RenameMatch[] = data.matches || []
      setMatches(found)
      if (found.length === 0) setError('Nenhum monitor com esse texto no nome.')
    } catch (e) { setError('Falha de rede: ' + (e as Error).message) }
    finally { setLoading(false) }
  }

  function toggleExclude(id: string | number) {
    setExcluded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function apply() {
    if (selected.length === 0) return
    setApplying(true); setError(''); setResult(null)
    try {
      const r = await fetch('/api/datadog/bulk-rename-monitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renames: selected.map(m => ({ id: m.id, name: m.newName })) }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Falha ao renomear.'); return }
      setResult(data)
      setMatches(null)
    } catch (e) { setError('Falha de rede: ' + (e as Error).message) }
    finally { setApplying(false) }
  }

  return (
    <div>
      <h1 style={s.h1}>Renomear Monitores em Lote</h1>
      <p style={s.sub}>
        Busca um trecho no nome dos monitores e substitui em todos de uma vez · coleta no servidor via {datadogSite}.
      </p>

      {!keysConfigured ? (
        <div style={s.card}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Conecte-se ao Datadog em Configurações para renomear monitores.</p>
        </div>
      ) : (
        <>
          <div style={s.card}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={s.label}>Buscar no nome</label>
                <input style={s.input} value={search} onChange={e => setSearch(e.target.value)} placeholder="ex.: [MonitorsCreator]" />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={s.label}>Substituir por</label>
                <input style={s.input} value={replace} onChange={e => setReplace(e.target.value)} placeholder="ex.: [Monitors]" />
              </div>
              <button style={s.btn} onClick={preview} disabled={loading}>
                {loading ? 'Buscando…' : 'Buscar'}
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              Substituição literal (não é regex) — troca exatamente o texto buscado em qualquer parte do nome. Deixe
              &quot;Substituir por&quot; em branco para apenas remover o trecho buscado. Só o nome muda; query, tags e outras opções do monitor ficam intactas.
            </p>
            {error && <div style={s.err}>{error}</div>}
          </div>

          {matches && matches.length > 0 && (
            <div style={s.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span style={s.counter}>{selected.length} de {matches.length} selecionado(s)</span>
                <button style={s.btn} onClick={apply} disabled={applying || selected.length === 0}>
                  {applying ? 'Renomeando…' : `Renomear ${selected.length} monitor(es)`}
                </button>
              </div>
              <div style={s.list}>
                {matches.map(m => (
                  <label key={m.id} style={{ ...s.row, cursor: 'pointer', opacity: excluded.has(m.id) ? 0.5 : 1 }}>
                    <input type="checkbox" checked={!excluded.has(m.id)} onChange={() => toggleExclude(m.id)} style={{ marginTop: 3 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={s.oldName}>{m.oldName}</div>
                      <div style={s.newName}>{m.newName}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {result && (
            <div style={s.card}>
              <div style={result.renamed === result.total ? s.ok : s.err}>
                {result.renamed} de {result.total} monitor(es) renomeado(s).
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto', marginTop: 12 }}>
                {result.results.map((r, i) => (
                  <div key={i} style={{ ...s.resItem, color: r.ok ? 'var(--success)' : 'var(--danger)', borderColor: r.ok ? 'var(--success)' : 'var(--danger)' }}>
                    {r.ok ? '✓' : '✗'} {r.name}{r.error ? ` · ${r.error}` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
