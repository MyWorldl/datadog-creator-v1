// src/app/ferramentas/bulk-rename/page.tsx
'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { useApp } from '@/context/AppContext'
import { computeRenames, type MonitorRef, type RenameCandidate } from '@/lib/bulk-rename'

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
  btnGhost: { fontSize: 13, color: 'var(--text-secondary)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', whiteSpace: 'nowrap' },
  smallBtn: { fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' },
  err: { fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 12px', marginTop: 12 },
  ok: { fontSize: 12.5, color: 'var(--success)', background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 8, padding: '10px 12px' },
  counter: { fontSize: 12.5, color: 'var(--text-secondary)' },
  toolbar: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  list: { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 380, overflowY: 'auto', marginTop: 12 },
  row: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 10px', borderRadius: 8, cursor: 'pointer' },
  name: { fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-word' },
  oldName: { fontSize: 12.5, color: 'var(--text-muted)', textDecoration: 'line-through', wordBreak: 'break-word' },
  newName: { fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, wordBreak: 'break-word' },
  hint: { fontSize: 11, color: 'var(--text-muted)' },
  resItem: { fontSize: 12, padding: '7px 10px', borderRadius: 6, border: '0.5px solid var(--border)', fontFamily: 'var(--font-geist-mono), monospace', wordBreak: 'break-word' },
}

export default function BulkRenamePage() {
  const { keysConfigured, datadogSite } = useApp()
  const [allMonitors, setAllMonitors] = useState<MonitorRef[] | null>(null)
  const [loadingList, setLoadingList] = useState(false)
  const [listError, setListError] = useState('')

  const [filterText, setFilterText] = useState('')
  const [selected, setSelected] = useState<Set<string | number>>(new Set())

  const [renameSearch, setRenameSearch] = useState('')
  const [renameReplace, setRenameReplace] = useState('')
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState('')
  const [result, setResult] = useState<RenameResult | null>(null)

  const filtered = useMemo(() => {
    if (!allMonitors) return []
    const terms = filterText.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    if (terms.length === 0) return allMonitors
    return allMonitors.filter(m => {
      const name = (m.name || '').toLowerCase()
      return terms.some(t => name.includes(t))
    })
  }, [allMonitors, filterText])

  const selectedInFiltered = filtered.filter(m => selected.has(m.id)).length

  // Preview calculado 100% no cliente, só pros monitores marcados — nenhum
  // round trip por tentativa de busca (a lista inteira já está carregada).
  const candidates: RenameCandidate[] = useMemo(() => {
    if (!allMonitors || !renameSearch) return []
    const chosen = allMonitors.filter(m => selected.has(m.id))
    return computeRenames(chosen, renameSearch, renameReplace)
  }, [allMonitors, selected, renameSearch, renameReplace])
  const candidatesById = useMemo(() => new Map(candidates.map(c => [c.id, c])), [candidates])

  async function loadMonitors() {
    setListError(''); setLoadingList(true); setResult(null)
    try {
      const r = await fetch('/api/datadog/bulk-rename-monitors')
      const data = await r.json()
      if (!r.ok) { setListError(data.error || 'Falha ao listar monitores.'); return }
      setAllMonitors(data.monitors || [])
      setSelected(new Set())
      if ((data.monitors || []).length === 0) setListError('Nenhum monitor encontrado nesta conta.')
    } catch (e) { setListError('Falha de rede: ' + (e as Error).message) }
    finally { setLoadingList(false) }
  }

  function toggle(id: string | number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function selectAllFiltered() {
    setSelected(prev => {
      const next = new Set(prev)
      for (const m of filtered) next.add(m.id)
      return next
    })
  }

  function clearFiltered() {
    setSelected(prev => {
      const next = new Set(prev)
      for (const m of filtered) next.delete(m.id)
      return next
    })
  }

  async function apply() {
    if (candidates.length === 0) return
    setApplying(true); setApplyError(''); setResult(null)
    try {
      const r = await fetch('/api/datadog/bulk-rename-monitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renames: candidates.map(c => ({ id: c.id, name: c.newName })) }),
      })
      const data = await r.json()
      if (!r.ok) { setApplyError(data.error || 'Falha ao renomear.'); return }
      setResult(data)
      setSelected(new Set())
    } catch (e) { setApplyError('Falha de rede: ' + (e as Error).message) }
    finally { setApplying(false) }
  }

  return (
    <div>
      <h1 style={s.h1}>SwitchName</h1>
      <p style={s.sub}>
        Carregue os monitores, selecione quais quer renomear e troque um trecho do nome em todos de uma vez · coleta no servidor via {datadogSite}.
      </p>

      {!keysConfigured ? (
        <div style={s.card}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Conecte-se ao Datadog em Configurações para renomear monitores.</p>
        </div>
      ) : (
        <>
          {!allMonitors && (
            <div style={s.card}>
              <button style={s.btn} onClick={loadMonitors} disabled={loadingList}>
                {loadingList ? 'Carregando…' : 'Carregar monitores'}
              </button>
              {listError && <div style={s.err}>{listError}</div>}
            </div>
          )}

          {allMonitors && (
            <div style={s.card}>
              <div style={s.toolbar}>
                <input
                  aria-label="Filtrar monitores por trecho do nome"
                  className="focus-ring"
                  style={{ ...s.input, flex: 1, minWidth: 200 }}
                  value={filterText}
                  onChange={e => setFilterText(e.target.value)}
                  placeholder="Filtrar por trecho do nome (aceita vários termos separados por vírgula)"
                />
                <button style={s.btnGhost} onClick={loadMonitors} disabled={loadingList}>
                  {loadingList ? 'Recarregando…' : 'Recarregar'}
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button style={s.smallBtn} onClick={selectAllFiltered} disabled={filtered.length === 0}>
                  Selecionar {filtered.length}{filterText ? ' (filtrados)' : ''}
                </button>
                <button style={s.smallBtn} onClick={clearFiltered} disabled={selectedInFiltered === 0}>Limpar seleção</button>
                <span style={s.counter}>{selected.size} de {allMonitors.length} selecionado(s)</span>
              </div>

              {listError && <div style={s.err}>{listError}</div>}

              <div style={s.list}>
                {filtered.map(m => {
                  const on = selected.has(m.id)
                  const cand = candidatesById.get(m.id)
                  return (
                    <label key={m.id} style={{ ...s.row, background: on ? 'var(--accent-light)' : 'transparent' }}>
                      <input type="checkbox" checked={on} onChange={() => toggle(m.id)} style={{ marginTop: 3 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {cand ? (
                          <>
                            <div style={s.oldName}>{cand.oldName}</div>
                            <div style={s.newName}>{cand.newName}</div>
                          </>
                        ) : (
                          <div style={s.name}>{m.name}</div>
                        )}
                      </div>
                    </label>
                  )
                })}
                {filtered.length === 0 && <p style={{ ...s.hint, textAlign: 'center', padding: 12 }}>Nenhum monitor para esse filtro.</p>}
              </div>
            </div>
          )}

          {allMonitors && (
            <div style={s.card}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={s.label} htmlFor="bulk-rename-search">Buscar no nome</label>
                  <input id="bulk-rename-search" className="focus-ring" style={s.input} value={renameSearch} onChange={e => setRenameSearch(e.target.value)} placeholder="ex.: [MonitorsCreator]" />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={s.label} htmlFor="bulk-rename-replace">Substituir por</label>
                  <input id="bulk-rename-replace" className="focus-ring" style={s.input} value={renameReplace} onChange={e => setRenameReplace(e.target.value)} placeholder="ex.: [Monitors]" />
                </div>
                <button style={s.btn} onClick={apply} disabled={applying || candidates.length === 0}>
                  {applying ? 'Renomeando…' : `Renomear ${candidates.length} monitor(es)`}
                </button>
              </div>
              <p style={{ ...s.hint, marginTop: 8 }}>
                Aplica só nos monitores selecionados acima cujo nome contém o texto buscado (substituição literal, não é regex — diferencia
                maiúsculas/minúsculas). Deixe &quot;Substituir por&quot; em branco para apenas remover o trecho buscado. Só o nome muda; query, tags e
                outras opções do monitor ficam intactas.
              </p>
              {applyError && <div style={s.err}>{applyError}</div>}
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
