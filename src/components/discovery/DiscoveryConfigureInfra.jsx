// src/components/discovery/DiscoveryConfigureInfra.jsx
'use client'

import { useState } from 'react'
import { INFRA_TYPES } from '@/lib/infra'
import { ALERT_WINDOW_OPTIONS } from '@/lib/discovery'

// Sub-etapas internas de "Configurar" (infra) — mesmo padrão usado em
// DiscoveryConfigure.jsx (fluxo de serviços/namespace), por consistência
// visual entre os dois fluxos: divide a tela em fases menores, cada uma com
// validação própria, em vez de um card único com tudo empilhado.
const SUB_STEPS = [
  { key: 'hosts', label: 'Hosts' },
  { key: 'metrics', label: 'Métricas' },
]

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
  // Sub-navegação (Hosts/Métricas)
  subNav: { display: 'flex', gap: 18, marginBottom: 2 },
  subNavItem: (state) => ({
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5,
    fontWeight: state === 'active' ? 700 : 500,
    color: state === 'active' ? 'var(--accent)' : state === 'done' ? 'var(--success)' : 'var(--text-muted)',
  }),
  subNavDot: (state) => ({
    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
    background: state === 'active' ? 'var(--accent)' : state === 'done' ? 'var(--success)' : 'var(--border)',
  }),
  toolbar: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 },
  search: { flex: 1, minWidth: 180, fontSize: 13, padding: '8px 12px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none' },
  counter: { fontSize: 12, color: 'var(--text-muted)' },
  hostList: { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto', border: '0.5px solid var(--border)', borderRadius: 8, padding: 8 },
  hostRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 6, cursor: 'pointer' },
  statusTag: (up) => ({ fontSize: 10, fontWeight: 700, color: up ? 'var(--success)' : 'var(--danger)', background: up ? 'var(--success-bg)' : 'var(--danger-bg)', borderRadius: 5, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.03em' }),
  acc: (on) => ({ border: '0.5px solid var(--border)', borderRadius: 10, background: 'var(--bg-surface-2)', overflow: 'hidden', opacity: on ? 1 : 0.7 }),
  accHead: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', cursor: 'pointer' },
  pillRow: { display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 },
  pill: { fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-surface)', border: '0.5px solid var(--border)', borderRadius: 999, padding: '2px 8px', fontFamily: 'var(--font-geist-mono), monospace' },
  chev: (open) => ({ fontSize: 11, color: 'var(--text-muted)', transition: 'transform .15s', transform: open ? 'rotate(90deg)' : 'none' }),
  accBody: { padding: '4px 12px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 },
  err: { fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px' },
  actions: { display: 'flex', justifyContent: 'space-between', paddingTop: 4 },
}

export default function DiscoveryConfigureInfra({ config, setConfig, onNext, onBack }) {
  const d = config.infra
  const setInfra = (patch) => setConfig(c => ({ ...c, infra: { ...c.infra, ...patch } }))

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hostSearch, setHostSearch] = useState('')
  const [openMetric, setOpenMetric] = useState(INFRA_TYPES[0]?.key || null)
  const [subStep, setSubStep] = useState(0)

  const selectedNames = Object.keys(d.selected).filter(h => d.selected[h])

  const searchTerms = hostSearch.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
  const filtered = d.hosts.filter(h => {
    if (searchTerms.length === 0) return true
    const name = h.name.toLowerCase()
    return searchTerms.some(t => name.includes(t))
  })
  const selectedInFiltered = filtered.filter(h => d.selected[h.name]).length

  async function discover() {
    setError(''); setLoading(true)
    try {
      const r = await fetch('/api/datadog/hosts')
      const data = await r.json()
      if (!r.ok) { setError((data.error || 'Falha ao descobrir hosts.') + (data.hint ? ' ' + data.hint : '')); return }
      setInfra({ hosts: data.hosts || [] })
      if ((data.hosts || []).length === 0) setError('Nenhum host encontrado.')
    } catch (e) { setError('Falha de rede: ' + e.message) }
    finally { setLoading(false) }
  }

  function toggleHost(name) {
    const sel = { ...d.selected }
    if (sel[name]) delete sel[name]
    else sel[name] = true
    setInfra({ selected: sel })
  }
  function selectAllFiltered() {
    const sel = { ...d.selected }
    for (const h of filtered) sel[h.name] = true
    setInfra({ selected: sel })
  }
  function clearFiltered() {
    const sel = { ...d.selected }
    for (const h of filtered) delete sel[h.name]
    setInfra({ selected: sel })
  }

  function toggleMetric(key) {
    setInfra({ metrics: { ...d.metrics, [key]: { ...d.metrics[key], enabled: !d.metrics[key].enabled } } })
  }
  function setMetricParam(key, field, value) {
    setInfra({ metrics: { ...d.metrics, [key]: { ...d.metrics[key], [field]: value } } })
  }
  function setMetricThreshold(key, level, value) {
    const cfg = d.metrics[key]
    setInfra({ metrics: { ...d.metrics, [key]: { ...cfg, thresholds: { ...cfg.thresholds, [level]: Number(value) } } } })
  }
  // Contagens do monitor de service check (ex.: Agent Down) — nº de
  // reportes com aquele status dentro da janela `window` para disparar.
  function setMetricCount(key, level, value) {
    const cfg = d.metrics[key]
    setInfra({ metrics: { ...d.metrics, [key]: { ...cfg, counts: { ...cfg.counts, [level]: Number(value) } } } })
  }

  function handleNext() {
    if (selectedNames.length === 0) { setError('Selecione ao menos um host.'); return }
    const anyEnabled = INFRA_TYPES.some(t => d.metrics[t.key]?.enabled)
    if (!anyEnabled) { setError('Habilite ao menos uma métrica (CPU/Memória/Disco).'); return }
    setError('')
    onNext()
  }

  // Navegação entre as 2 sub-fases — valida só o que pertence à fase atual.
  // handleNext(), acima, revalida tudo de novo no fim como salvaguarda.
  function goSubNext() {
    if (subStep === 0) {
      if (selectedNames.length === 0) return setError('Selecione ao menos um host.')
    }
    setError('')
    setSubStep(sub => Math.min(sub + 1, SUB_STEPS.length - 1))
  }
  function goSubBack() {
    setError('')
    if (subStep === 0) { onBack(); return }
    setSubStep(sub => Math.max(sub - 1, 0))
  }

  return (
    <div style={s.card}>
      <div style={s.subNav}>
        {SUB_STEPS.map((ss, i) => {
          const state = i < subStep ? 'done' : i === subStep ? 'active' : 'pending'
          return (
            <span key={ss.key} style={s.subNavItem(state)}>
              <span style={s.subNavDot(state)} />
              {ss.label}
            </span>
          )
        })}
      </div>

      {subStep === 0 && (
        <div>
          <label style={s.label}>Hosts</label>
          <div style={s.toolbar}>
            <input
              style={s.search}
              placeholder="Filtrar hosts (aceita vários termos separados por vírgula)"
              value={hostSearch}
              onChange={e => setHostSearch(e.target.value)}
            />
            <button style={s.btnGhost} onClick={discover} disabled={loading}>
              {loading ? 'Descobrindo…' : 'Descobrir hosts'}
            </button>
          </div>

          {d.hosts.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <button style={s.smallBtn} onClick={selectAllFiltered}>
                  Selecionar {filtered.length}{hostSearch ? ' (filtrados)' : ''}
                </button>
                <button style={s.smallBtn} onClick={clearFiltered} disabled={selectedInFiltered === 0}>Limpar seleção</button>
                <span style={s.counter}>{selectedNames.length} host(s) selecionado(s)</span>
              </div>

              <div style={s.hostList}>
                {filtered.map(h => {
                  const on = !!d.selected[h.name]
                  return (
                    <label key={h.name} style={{ ...s.hostRow, background: on ? 'var(--accent-light)' : 'transparent' }}>
                      <input type="checkbox" checked={on} onChange={() => toggleHost(h.name)} />
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{h.name}</span>
                      <span style={s.statusTag(h.up)}>{h.up ? 'up' : 'down'}</span>
                    </label>
                  )
                })}
                {filtered.length === 0 && <p style={{ ...s.hint, textAlign: 'center', padding: 12 }}>Nenhum host para esse filtro.</p>}
              </div>
            </>
          )}
          {d.hosts.length === 0 && !loading && (
            <p style={s.hint}>Clique em &quot;Descobrir hosts&quot; para listar os hosts reportando ao Datadog.</p>
          )}
        </div>
      )}

      {subStep === 1 && (
        <div>
          <label style={s.label}>Métricas — parâmetros por tipo</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {INFRA_TYPES.map(t => {
              const cfg = d.metrics[t.key]
              const on = cfg.enabled
              const open = openMetric === t.key
              const isCheck = t.kind === 'check'
              const isThreshold = !isCheck && cfg.mode === 'threshold'
              return (
                <div key={t.key} style={s.acc(on)}>
                  <div style={s.accHead} onClick={() => setOpenMetric(open ? null : t.key)}>
                    <input type="checkbox" checked={on} onClick={e => e.stopPropagation()} onChange={() => toggleMetric(t.key)} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{t.label}</span>
                    <div style={s.pillRow}>
                      {isCheck ? (
                        <>
                          <span style={s.pill}>service check</span>
                          <span style={s.pill}>{cfg.counts.critical}/{cfg.window} down</span>
                        </>
                      ) : (
                        <>
                          <span style={s.pill}>{cfg.mode}</span>
                          {isThreshold
                            ? <span style={s.pill}>crit {cfg.thresholds.critical}{t.unit} / warn {cfg.thresholds.warning}{t.unit}</span>
                            : <span style={s.pill}>{cfg.deviations}σ · {cfg.algorithm}</span>}
                        </>
                      )}
                    </div>
                    <span style={s.chev(open)}>▶</span>
                  </div>
                  {open && isCheck && (
                    <div style={s.accBody}>
                      <div>
                        <label style={s.miniLabel}>Janela (últimos N reportes)</label>
                        <input style={s.select} type="number" min="1" max="20" value={cfg.window} disabled={!on} onChange={e => setMetricParam(t.key, 'window', Number(e.target.value))} />
                      </div>
                      <div>
                        <label style={s.miniLabel}>Critical (nº &quot;down&quot;)</label>
                        <input style={s.select} type="number" min="1" max="20" value={cfg.counts.critical} disabled={!on} onChange={e => setMetricCount(t.key, 'critical', e.target.value)} />
                      </div>
                      <div>
                        <label style={s.miniLabel}>Warning (nº &quot;down&quot;)</label>
                        <input style={s.select} type="number" min="0" max="20" value={cfg.counts.warning} disabled={!on} onChange={e => setMetricCount(t.key, 'warning', e.target.value)} />
                      </div>
                    </div>
                  )}
                  {open && !isCheck && (
                    <div style={s.accBody}>
                      <div>
                        <label style={s.miniLabel}>Modo</label>
                        <select style={s.select} value={cfg.mode} disabled={!on} onChange={e => setMetricParam(t.key, 'mode', e.target.value)}>
                          <option value="threshold">threshold</option>
                          <option value="anomaly">anomaly</option>
                        </select>
                      </div>

                      {isThreshold ? (
                        <>
                          <div>
                            <label style={s.miniLabel}>Critical ({t.unit})</label>
                            <input style={s.select} type="number" min="1" max="100" value={cfg.thresholds.critical} disabled={!on} onChange={e => setMetricThreshold(t.key, 'critical', e.target.value)} />
                          </div>
                          <div>
                            <label style={s.miniLabel}>Warning ({t.unit})</label>
                            <input style={s.select} type="number" min="1" max="100" value={cfg.thresholds.warning} disabled={!on} onChange={e => setMetricThreshold(t.key, 'warning', e.target.value)} />
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <label style={s.miniLabel}>Algoritmo</label>
                            <select style={s.select} value={cfg.algorithm} disabled={!on} onChange={e => setMetricParam(t.key, 'algorithm', e.target.value)}>
                              <option value="basic">basic</option><option value="agile">agile</option><option value="robust">robust</option>
                            </select>
                          </div>
                          <div>
                            <label style={s.miniLabel}>Sazonalidade</label>
                            <select style={s.select} value={cfg.seasonality} disabled={!on || cfg.algorithm === 'basic'} onChange={e => setMetricParam(t.key, 'seasonality', e.target.value)}>
                              <option value="hourly">hourly</option><option value="daily">daily</option><option value="weekly">weekly</option>
                            </select>
                          </div>
                          <div>
                            <label style={s.miniLabel}>Alert window</label>
                            <select style={s.select} value={cfg.alertWindow} disabled={!on} onChange={e => setMetricParam(t.key, 'alertWindow', e.target.value)}>
                              {ALERT_WINDOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={s.miniLabel}>Anomalies</label>
                            <input style={s.select} type="number" min="1" max="10" value={cfg.deviations} disabled={!on} onChange={e => setMetricParam(t.key, 'deviations', Number(e.target.value))} />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p style={s.hint}>
            Sazonalidade é ignorada no algoritmo basic. A alert window vira o trigger_window do monitor. Ausência de
            dados e renotificação seguem o padrão do Datadog.
          </p>
        </div>
      )}

      {error && <div style={s.err}>{error}</div>}

      <div style={s.actions}>
        <button style={s.btnGhost} onClick={goSubBack}>← Voltar</button>
        {subStep < SUB_STEPS.length - 1
          ? <button style={s.btn} onClick={goSubNext}>Próximo →</button>
          : <button style={s.btn} onClick={handleNext}>Continuar →</button>}
      </div>
    </div>
  )
}
