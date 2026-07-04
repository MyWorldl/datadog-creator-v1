// src/components/discovery/DiscoveryConfigure.jsx
'use client'

import { useState } from 'react'
import { useApp } from '@/context/AppContext'
import { ALERT_TYPES } from '@/lib/discovery'

const ENV_META = {
  dev: { label: 'dev', c: 'var(--accent)', bg: 'var(--accent-light)' },
  hml: { label: 'hml', c: 'var(--warning)', bg: 'var(--warning-bg)' },
  prd: { label: 'prd', c: 'var(--success)', bg: 'var(--success-bg)' },
}
// Deduz o ambiente pelo sufixo do nome do serviço (nomenclatura freeflow-*-dev/hml/prd).
function envOf(svc) {
  const n = String(svc).toLowerCase()
  if (/(^|[-_.])(dev|desenv|develop|development)$/.test(n)) return 'dev'
  if (/(^|[-_.])(hml|hmg|hom|homolog|homologacao|staging|stg)$/.test(n)) return 'hml'
  if (/(^|[-_.])(prd|prod|production)$/.test(n)) return 'prd'
  return null
}
const winShort = (w) => (w || '').replace('last_', '')
const dirLabel = (d) => (d === 'below' ? 'abaixo' : d === 'both' ? 'ambos' : 'acima')

const s = {
  card: { border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 16 },
  label: { display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 },
  miniLabel: { display: 'block', fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.03em' },
  hint: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 },
  input: { width: '100%', fontSize: 13, padding: '9px 12px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  select: { width: '100%', fontSize: 13, padding: '8px 10px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  btn: { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  btnGhost: { fontSize: 13, color: 'var(--text-secondary)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  smallBtn: { fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' },
  // Serviços
  toolbar: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 },
  search: { flex: 1, minWidth: 180, fontSize: 13, padding: '8px 12px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none' },
  chip: (on, c, bg) => ({ fontSize: 11.5, fontWeight: 600, padding: '5px 11px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? c : 'var(--border)'}`, background: on ? bg : 'var(--bg-surface)', color: on ? c : 'var(--text-secondary)' }),
  counter: { fontSize: 12, color: 'var(--text-muted)' },
  svcList: { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto', border: '0.5px solid var(--border)', borderRadius: 8, padding: 8 },
  svcRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 6, cursor: 'pointer' },
  envTag: (c, bg) => ({ fontSize: 10, fontWeight: 700, color: c, background: bg, borderRadius: 5, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.03em' }),
  selBox: { border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', padding: '10px 12px' },
  opChip: (on) => ({ fontSize: 11.5, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-light)' : 'var(--bg-surface)', color: on ? 'var(--accent)' : 'var(--text-secondary)', fontFamily: 'var(--font-geist-mono), monospace' }),
  // Accordion de alertas
  acc: (on) => ({ border: '0.5px solid var(--border)', borderRadius: 10, background: 'var(--bg-surface-2)', overflow: 'hidden', opacity: on ? 1 : 0.7 }),
  accHead: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', cursor: 'pointer' },
  pillRow: { display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 },
  pill: { fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-surface)', border: '0.5px solid var(--border)', borderRadius: 999, padding: '2px 8px', fontFamily: 'var(--font-geist-mono), monospace' },
  chev: (open) => ({ fontSize: 11, color: 'var(--text-muted)', transition: 'transform .15s', transform: open ? 'rotate(90deg)' : 'none' }),
  accBody: { padding: '4px 12px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 },
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
  const [svcSearch, setSvcSearch] = useState('')
  const [envFilter, setEnvFilter] = useState([]) // ['dev','hml','prd']
  const [openAlert, setOpenAlert] = useState(ALERT_TYPES[0]?.key || null)

  const selectedNames = Object.keys(d.selected)

  // Serviços filtrados por busca + chips de ambiente.
  // Busca aceita VÁRIOS termos separados por vírgula (OU lógico):
  // "svc1, svc2, svc3" casa serviços que contenham qualquer um dos termos.
  const searchTerms = svcSearch.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
  const filtered = d.services.filter(svc => {
    const name = svc.toLowerCase()
    if (searchTerms.length > 0 && !searchTerms.some(t => name.includes(t))) return false
    if (envFilter.length > 0) { const e = envOf(svc); if (!e || !envFilter.includes(e)) return false }
    return true
  })
  const selectedInFiltered = filtered.filter(svc => d.selected[svc]).length

  function toggleEnv(e) {
    setEnvFilter(cur => cur.includes(e) ? cur.filter(x => x !== e) : [...cur, e])
  }
  function selectAllFiltered() {
    const sel = { ...d.selected }
    for (const svc of filtered) if (!sel[svc]) sel[svc] = { opsCount: null, operations: [], chosen: [] }
    setDisc({ selected: sel })
  }
  function clearFiltered() {
    const sel = { ...d.selected }
    for (const svc of filtered) delete sel[svc]
    setDisc({ selected: sel })
  }

  async function discover() {
    setError(''); setLoading(true)
    try {
      const r = await fetch(`/api/datadog/services?env=${encodeURIComponent(d.env || '*')}`)
      const data = await r.json()
      if (!r.ok) { setError((data.error || 'Falha ao descobrir serviços.') + (data.hint ? ' ' + data.hint : '')); return }
      setDisc({ services: data.services || [] })
      if ((data.services || []).length === 0) setError('Nenhum serviço encontrado para esse ambiente.')
    } catch (e) { setError('Falha de rede: ' + e.message) }
    finally { setLoading(false) }
  }

  function toggleService(svc) {
    const sel = { ...d.selected }
    if (sel[svc]) delete sel[svc]
    else sel[svc] = { opsCount: null, operations: [], chosen: [] }
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
        const operations = res.operations || []
        const primary = res.primary || operations[0] || 'http.request'
        sel[svc] = {
          opsCount: res.count ?? operations.length,
          operations,
          chosen: operations.length ? [primary] : [primary],
          error: res.error || null,
        }
      }
      setDisc({ selected: sel })
    } catch (e) { setError('Falha de rede: ' + e.message) }
    finally { setAnalyzing(false) }
  }

  function toggleOp(svc, op) {
    const meta = d.selected[svc]
    const chosen = meta.chosen.includes(op) ? meta.chosen.filter(o => o !== op) : [...meta.chosen, op]
    setDisc({ selected: { ...d.selected, [svc]: { ...meta, chosen } } })
  }
  function toggleAlert(k) {
    setDisc({ alerts: { ...d.alerts, [k]: { ...d.alerts[k], enabled: !d.alerts[k].enabled } } })
  }
  function setAlertParam(k, field, v) {
    setDisc({ alerts: { ...d.alerts, [k]: { ...d.alerts[k], [field]: v } } })
  }

  function handleNext() {
    if (selectedNames.length === 0) return setError('Selecione ao menos um serviço.')
    const noOps = selectedNames.filter(svc => !(d.selected[svc]?.chosen?.length))
    if (noOps.length) return setError(`Escolha ao menos uma operação para: ${noOps.join(', ')}.`)
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
      <div>
        <button style={s.btn} onClick={discover} disabled={loading}>
          {loading ? 'Descobrindo…' : '🔎 Descobrir serviços'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 10 }}>via {datadogSite}</span>
      </div>

      {d.services.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <label style={{ ...s.label, marginBottom: 0 }}>Serviços</label>
            <span style={s.counter}>
              {selectedNames.length} selecionado(s) · mostrando {filtered.length} de {d.services.length}
            </span>
          </div>

          <div style={s.toolbar}>
            <input style={s.search} value={svcSearch} onChange={e => setSvcSearch(e.target.value)} placeholder="Buscar serviço(s)… ex.: svc1, svc2, svc3" />
            {['dev', 'hml', 'prd'].map(e => (
              <button key={e} style={s.chip(envFilter.includes(e), ENV_META[e].c, ENV_META[e].bg)} onClick={() => toggleEnv(e)}>
                {ENV_META[e].label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button style={s.smallBtn} onClick={selectAllFiltered}>
              Selecionar {filtered.length}{svcSearch || envFilter.length ? ' (filtrados)' : ''}
            </button>
            <button style={s.smallBtn} onClick={clearFiltered} disabled={selectedInFiltered === 0}>Limpar seleção</button>
          </div>

          <div style={s.svcList}>
            {filtered.map(svc => {
              const env = envOf(svc)
              const on = !!d.selected[svc]
              return (
                <label key={svc} style={{ ...s.svcRow, background: on ? 'var(--accent-light)' : 'transparent' }}>
                  <input type="checkbox" checked={on} onChange={() => toggleService(svc)} />
                  <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{svc}</span>
                  {env && <span style={s.envTag(ENV_META[env].c, ENV_META[env].bg)}>{ENV_META[env].label}</span>}
                </label>
              )
            })}
            {filtered.length === 0 && <p style={{ ...s.hint, textAlign: 'center', padding: 12 }}>Nenhum serviço para esse filtro.</p>}
          </div>
        </div>
      )}

      {selectedNames.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ ...s.label, marginBottom: 0 }}>Operações por serviço</label>
            <button style={s.btnGhost} onClick={analyze} disabled={analyzing}>
              {analyzing ? 'Identificando…' : 'Identificar operações'}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selectedNames.map(svc => {
              const meta = d.selected[svc]
              return (
                <div key={svc} style={s.selBox}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{svc}</span>
                    {meta.error ? <span style={{ fontSize: 12, color: 'var(--danger)' }}>erro: {meta.error}</span>
                      : meta.opsCount == null ? <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>— clique em Identificar</span>
                      : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{meta.opsCount} operação(ões) · {meta.chosen.length} selecionada(s)</span>}
                  </div>
                  {meta.opsCount != null && !meta.error && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(meta.operations.length ? meta.operations : meta.chosen).map(op => (
                        <button key={op} style={s.opChip(meta.chosen.includes(op))} onClick={() => toggleOp(svc, op)}>
                          {op}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p style={s.hint}>Cada operação selecionada gera um monitor por tipo de alerta.</p>
        </div>
      )}

      {selectedNames.length > 0 && (
        <div>
          <label style={s.label}>Alertas (anomaly detection) — parâmetros por tipo</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ALERT_TYPES.map(a => {
              const cfg = d.alerts[a.key]
              const on = cfg.enabled
              const open = openAlert === a.key
              return (
                <div key={a.key} style={s.acc(on)}>
                  <div style={s.accHead} onClick={() => setOpenAlert(open ? null : a.key)}>
                    <input type="checkbox" checked={on} onClick={e => e.stopPropagation()} onChange={() => toggleAlert(a.key)} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{a.label}</span>
                    <div style={s.pillRow}>
                      <span style={s.pill}>{cfg.algorithm}</span>
                      {cfg.algorithm !== 'basic' && <span style={s.pill}>{cfg.seasonality}</span>}
                      <span style={s.pill}>{winShort(cfg.alertWindow)}</span>
                      <span style={s.pill}>{dirLabel(cfg.direction)}</span>
                      <span style={s.pill}>{cfg.deviations}σ</span>
                    </div>
                    <span style={s.chev(open)}>▶</span>
                  </div>
                  {open && (
                    <div style={s.accBody}>
                      <div>
                        <label style={s.miniLabel}>Algoritmo</label>
                        <select style={s.select} value={cfg.algorithm} disabled={!on} onChange={e => setAlertParam(a.key, 'algorithm', e.target.value)}>
                          <option value="basic">basic</option><option value="agile">agile</option><option value="robust">robust</option>
                        </select>
                      </div>
                      <div>
                        <label style={s.miniLabel}>Sazonalidade</label>
                        <select style={s.select} value={cfg.seasonality} disabled={!on || cfg.algorithm === 'basic'} onChange={e => setAlertParam(a.key, 'seasonality', e.target.value)}>
                          <option value="hourly">hourly</option><option value="daily">daily</option><option value="weekly">weekly</option>
                        </select>
                      </div>
                      <div>
                        <label style={s.miniLabel}>Alert window</label>
                        <select style={s.select} value={cfg.alertWindow} disabled={!on} onChange={e => setAlertParam(a.key, 'alertWindow', e.target.value)}>
                          <option value="last_5m">last_5m</option><option value="last_15m">last_15m</option><option value="last_30m">last_30m</option><option value="last_1h">last_1h</option><option value="last_4h">last_4h</option>
                        </select>
                      </div>
                      <div>
                        <label style={s.miniLabel}>Direção</label>
                        <select style={s.select} value={cfg.direction || 'above'} disabled={!on} onChange={e => setAlertParam(a.key, 'direction', e.target.value)}>
                          <option value="above">acima</option><option value="below">abaixo</option><option value="both">ambos</option>
                        </select>
                      </div>
                      <div>
                        <label style={s.miniLabel}>Desvios</label>
                        <input style={s.select} type="number" min="1" max="10" value={cfg.deviations} disabled={!on} onChange={e => setAlertParam(a.key, 'deviations', e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p style={s.hint}>Sazonalidade é ignorada no algoritmo basic. A alert window vira o trigger_window do monitor.</p>
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
