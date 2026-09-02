// src/components/discovery/DiscoveryConfigure.tsx
'use client'

import { useState, useRef, useEffect, type CSSProperties } from 'react'
import { useApp } from '@/context/AppContext'
import { ALERT_TYPES, ALERT_WINDOW_OPTIONS, type ScopeType } from '@/lib/discovery'
import type { DiscoveryStepProps } from './types'
import { type SubStepState, subNavItemStyle, subNavDotStyle, accStyle, chevStyle, winShort } from './styles'

const dirLabel = (d: string): string => (d === 'below' ? 'abaixo' : d === 'both' ? 'ambos' : 'acima')

interface ScopeConfigEntry {
  entityNoun: string
  listLabel: string
  searchPlaceholder: string
  discoverLabel: string
  discoverUrl: (env: string) => string
  listKey: string
  opsUrl: (names: string[]) => string
  discoverHint: (site: string) => string
  opsLabel: string
  allowManualEntry?: boolean
  manualPlaceholder?: string
}

// Parametriza tudo que difere entre os dois modos de escopo — as duas rotas
// de discovery (entidades e operações) e os textos — pra reaproveitar UM
// bloco de UI (descobrir → checkbox list → identificar operações → chips)
// em vez de duplicar o JSX inteiro por modo.
const SCOPE_CONFIG: Record<ScopeType, ScopeConfigEntry> = {
  service: {
    entityNoun: 'serviço',
    listLabel: 'Serviços',
    searchPlaceholder: 'Buscar serviço(s)… ex.: svc1, svc2, svc3',
    discoverLabel: 'Descobrir serviços',
    discoverUrl: (env) => `/api/datadog/services?env=${encodeURIComponent(env || '*')}`,
    listKey: 'services',
    opsUrl: (names) => `/api/datadog/operations?services=${encodeURIComponent(names.join(','))}`,
    discoverHint: (site) => `Clique em "Descobrir serviços" para listar os serviços reportando ao Datadog (via ${site}).`,
    opsLabel: 'Operações por serviço',
  },
  namespace: {
    entityNoun: 'namespace',
    listLabel: 'Namespaces',
    searchPlaceholder: 'Buscar namespace(s)… ex.: ns1, ns2, ns3',
    discoverLabel: 'Descobrir namespaces',
    discoverUrl: (env) => `/api/datadog/namespaces?env=${encodeURIComponent(env || '')}`,
    listKey: 'namespaces',
    opsUrl: (names) => `/api/datadog/namespace-operations?namespaces=${encodeURIComponent(names.join(','))}`,
    discoverHint: (site) => `Clique em "Descobrir namespaces" para listar os kube_namespace com tráfego APM no Datadog (via ${site}). Se algum não aparecer (ex.: namespace sem http), adicione manualmente abaixo.`,
    opsLabel: 'Operações por namespace',
    allowManualEntry: true,
    manualPlaceholder: 'Adicionar namespace manualmente… ex.: payments',
  },
}

// Sub-etapas internas de "Configurar" — a etapa era 1 card só com 3 fases
// empilhadas (entidades → operações → alertas), causando scroll longo e
// scroll-dentro-de-scroll com várias entidades selecionadas. Divide em um
// mini-wizard de 3 fases, cada uma com validação própria (peneira os erros
// mais cedo, perto do campo relevante, em vez de só no fim).
const SUB_STEPS = [
  { key: 'entities', label: 'Entidades' },
  { key: 'operations', label: 'Operações' },
  { key: 'alerts', label: 'Alertas' },
]

const s: Record<string, CSSProperties> = {
  card: { border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 16 },
  label: { display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 },
  miniLabel: { display: 'block', fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.03em' },
  hint: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 },
  input: { width: '100%', fontSize: 13, padding: '9px 12px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  select: { width: '100%', fontSize: 13, padding: '8px 10px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  btn: { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  btnGhost: { fontSize: 13, color: 'var(--text-secondary)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  smallBtn: { fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' },
  addBtn: { fontSize: 13, fontWeight: 600, color: 'var(--accent)', background: 'none', border: '0.5px solid var(--accent)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' },
  // Sub-navegação (Entidades/Operações/Alertas)
  subNav: { display: 'flex', gap: 18, marginBottom: 2 },
  // Serviços/Namespaces
  scopeToggle: { display: 'flex', gap: 6, marginBottom: 10 },
  toolbar: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 },
  search: { flex: 1, minWidth: 180, fontSize: 13, padding: '8px 12px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none' },
  counter: { fontSize: 12, color: 'var(--text-muted)' },
  svcList: { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto', border: '0.5px solid var(--border)', borderRadius: 8, padding: 8 },
  svcRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 6, cursor: 'pointer' },
  selBox: { border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', padding: '10px 12px' },
  // Accordion de alertas
  accHead: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', cursor: 'pointer' },
  pillRow: { display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 },
  pill: { fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-surface)', border: '0.5px solid var(--border)', borderRadius: 999, padding: '2px 8px', fontFamily: 'var(--font-geist-mono), monospace' },
  accBody: { padding: '4px 12px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 },
  err: { fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px' },
  actions: { display: 'flex', justifyContent: 'space-between', paddingTop: 4 },
}

const scopeBtnStyle = (on: boolean): CSSProperties => ({ fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-light)' : 'var(--bg-surface)', color: on ? 'var(--accent)' : 'var(--text-secondary)' })
const opChipStyle = (on: boolean): CSSProperties => ({ fontSize: 11.5, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-light)' : 'var(--bg-surface)', color: on ? 'var(--accent)' : 'var(--text-secondary)', fontFamily: 'var(--font-geist-mono), monospace' })

export default function DiscoveryConfigure({ config, setConfig, onNext, onBack }: DiscoveryStepProps) {
  const { keysConfigured, datadogSite } = useApp()
  const d = config.discovery
  const setDisc = (patch: Partial<typeof d>) => setConfig(c => ({ ...c, discovery: { ...c.discovery, ...patch } }))

  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [manualInput, setManualInput] = useState('')
  const [openAlert, setOpenAlert] = useState<string | null>(ALERT_TYPES[0]?.key || null)
  const [subStep, setSubStep] = useState(0)

  const scopeType = d.scopeType || 'service'
  const cfg = SCOPE_CONFIG[scopeType]
  const selectedNames = Object.keys(d.selected)

  // Sempre aponta pro scopeType mais recente — usado dentro de discover() pra
  // detectar, DEPOIS do await, se o usuário trocou o toggle enquanto a busca
  // estava em andamento (ler `scopeType` direto ali seria o valor capturado
  // no closure da chamada, não o atual).
  const scopeTypeRef = useRef(scopeType)
  useEffect(() => { scopeTypeRef.current = scopeType }, [scopeType])

  function setScopeType(type: ScopeType) {
    if (type === scopeType) return
    // Reseta seleção ao trocar de modo: entradas de um modo não fazem sentido no outro
    // (scopeType é global no planPreview, não por entrada de `selected`).
    setDisc({ scopeType: type, selected: {}, services: [] })
    setSearch('')
    setError('')
    setSubStep(0)
  }

  // Busca aceita VÁRIOS termos separados por vírgula (OU lógico):
  // "a, b, c" casa entradas que contenham qualquer um dos termos.
  const searchTerms = search.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
  const filtered = d.services.filter(name => {
    if (searchTerms.length === 0) return true
    return searchTerms.some(t => name.toLowerCase().includes(t))
  })
  const selectedInFiltered = filtered.filter(name => d.selected[name]).length

  function selectAllFiltered() {
    const sel = { ...d.selected }
    for (const name of filtered) if (!sel[name]) sel[name] = { opsCount: null, operations: [], chosen: [] }
    setDisc({ selected: sel })
  }
  function clearFiltered() {
    const sel = { ...d.selected }
    for (const name of filtered) delete sel[name]
    setDisc({ selected: sel })
  }

  async function discover() {
    const requestedScope = scopeType // trava o modo desta chamada — ver guard abaixo
    setError(''); setLoading(true)
    try {
      const r = await fetch(cfg.discoverUrl(d.env))
      const data = await r.json()
      // Usuário pode trocar o toggle Serviço/Namespace enquanto a busca está em
      // andamento — se trocou, a resposta é de outro escopo e não deve sobrescrever
      // d.services (senão mistura nomes de serviço num modo já trocado pra namespace).
      if (requestedScope !== scopeTypeRef.current) return
      if (!r.ok) { setError((data.error || `Falha ao descobrir ${cfg.entityNoun}s.`) + (data.hint ? ' ' + data.hint : '')); return }
      const names: string[] = data[cfg.listKey] || []
      setDisc({ services: names })
      if (names.length === 0) setError(`Nenhum ${cfg.entityNoun} encontrado.`)
    } catch (e) { setError('Falha de rede: ' + (e as Error).message) }
    finally { setLoading(false) }
  }

  function toggleEntity(name: string) {
    const sel = { ...d.selected }
    if (sel[name]) delete sel[name]
    else sel[name] = { opsCount: null, operations: [], chosen: [] }
    setDisc({ selected: sel })
  }

  // Fallback pra descoberta instável (ex.: kube_namespace via Spans Aggregate
  // API às vezes retorna vazio nesse org por amostragem) — adiciona a entrada
  // já selecionada, direto na mesma lista/formato de uma descoberta bem-sucedida.
  function addManual() {
    const v = manualInput.trim()
    if (!v) return
    const services = d.services.includes(v) ? d.services : [...d.services, v]
    const selected = d.selected[v] ? d.selected : { ...d.selected, [v]: { opsCount: null, operations: [], chosen: [] } }
    setDisc({ services, selected })
    setManualInput('')
  }

  async function analyze() {
    if (selectedNames.length === 0) { setError(`Selecione ao menos um ${cfg.entityNoun}.`); return }
    setError(''); setAnalyzing(true)
    try {
      const r = await fetch(cfg.opsUrl(selectedNames))
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Falha ao identificar operações.'); return }
      const sel = { ...d.selected }
      for (const name of selectedNames) {
        const res = data.results?.[name] || {}
        const operations: string[] = res.operations || []
        const primary = res.primary || operations[0] || 'http.request'
        sel[name] = {
          opsCount: res.count ?? operations.length,
          operations,
          chosen: [primary],
          error: res.error || null,
        }
      }
      setDisc({ selected: sel })
    } catch (e) { setError('Falha de rede: ' + (e as Error).message) }
    finally { setAnalyzing(false) }
  }

  function toggleOp(name: string, op: string) {
    const meta = d.selected[name]
    const chosen = (meta.chosen || []).includes(op) ? (meta.chosen || []).filter(o => o !== op) : [...(meta.chosen || []), op]
    setDisc({ selected: { ...d.selected, [name]: { ...meta, chosen } } })
  }
  function selectAllOps(name: string) {
    const meta = d.selected[name]
    setDisc({ selected: { ...d.selected, [name]: { ...meta, chosen: [...(meta.operations || [])] } } })
  }
  function clearOps(name: string) {
    const meta = d.selected[name]
    setDisc({ selected: { ...d.selected, [name]: { ...meta, chosen: [] } } })
  }
  function toggleAlert(k: string) {
    setDisc({ alerts: { ...d.alerts, [k]: { ...d.alerts[k], enabled: !d.alerts[k].enabled } } })
  }
  function setAlertParam(k: string, field: string, v: unknown) {
    setDisc({ alerts: { ...d.alerts, [k]: { ...d.alerts[k], [field]: v } } })
  }

  function handleNext() {
    if (selectedNames.length === 0) return setError(`Selecione ao menos um ${cfg.entityNoun}.`)
    const noOps = selectedNames.filter(name => !(d.selected[name]?.chosen?.length))
    if (noOps.length) return setError(`Escolha ao menos uma operação para: ${noOps.join(', ')}.`)
    if (!Object.values(d.alerts).some(a => a.enabled)) return setError('Selecione ao menos um tipo de alerta.')
    setError('')
    onNext()
  }

  // Navegação entre as 3 sub-fases — valida só o que pertence à fase atual,
  // peneirando os erros mais cedo (handleNext(), acima, revalida tudo de
  // novo no fim como salvaguarda, ex.: usuário volta e desmarca algo).
  function goSubNext() {
    if (subStep === 0) {
      if (selectedNames.length === 0) return setError(`Selecione ao menos um ${cfg.entityNoun}.`)
    } else if (subStep === 1) {
      const noOps = selectedNames.filter(name => !(d.selected[name]?.chosen?.length))
      if (noOps.length) return setError(`Escolha ao menos uma operação para: ${noOps.join(', ')}.`)
    }
    setError('')
    setSubStep(sub => Math.min(sub + 1, SUB_STEPS.length - 1))
  }
  function goSubBack() {
    setError('')
    if (subStep === 0) { onBack(); return }
    setSubStep(sub => Math.max(sub - 1, 0))
  }

  if (!keysConfigured) {
    return (
      <div style={s.card}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
          Conecte-se ao Datadog (Etapa 1 ou em Configurações) para descobrir {cfg.entityNoun}s.
        </p>
        <div><button style={s.btnGhost} onClick={onBack}>← Voltar</button></div>
      </div>
    )
  }

  return (
    <div style={s.card}>
      <div style={s.subNav}>
        {SUB_STEPS.map((ss, i) => {
          const state: SubStepState = i < subStep ? 'done' : i === subStep ? 'active' : 'pending'
          return (
            <span key={ss.key} style={subNavItemStyle(state)}>
              <span style={subNavDotStyle(state)} />
              {ss.label}
            </span>
          )
        })}
      </div>

      {subStep === 0 && (
        <>
          <div>
            <label style={s.label}>Escopo do filtro</label>
            {/* Namespace removido da UI (agora vive na aba "APM e Infraestrutura",
                junto de Pod Restarts) — scopeType/SCOPE_CONFIG.namespace continuam
                no código pra facilitar reativar isso aqui no futuro, se necessário. */}
            <div style={s.scopeToggle}>
              <button style={scopeBtnStyle(scopeType !== 'namespace')} onClick={() => setScopeType('service')}>Por Serviço</button>
            </div>
            <p style={s.hint}>Um monitor por serviço, escopado por service:.</p>
          </div>

          <div>
            <label style={s.label}>{cfg.listLabel}</label>
            <div style={s.toolbar}>
              <input aria-label={cfg.searchPlaceholder} className="focus-ring" style={s.search} value={search} onChange={e => setSearch(e.target.value)} placeholder={cfg.searchPlaceholder} />
              <button style={s.btnGhost} onClick={discover} disabled={loading}>
                {loading ? 'Descobrindo…' : cfg.discoverLabel}
              </button>
            </div>

            {d.services.length > 0 && (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button style={s.smallBtn} onClick={selectAllFiltered}>
                    Selecionar {filtered.length}{search ? ' (filtrados)' : ''}
                  </button>
                  <button style={s.smallBtn} onClick={clearFiltered} disabled={selectedInFiltered === 0}>Limpar seleção</button>
                  <span style={s.counter}>{selectedNames.length} selecionado(s) · mostrando {filtered.length} de {d.services.length}</span>
                </div>

                <div style={s.svcList}>
                  {filtered.map(name => {
                    const on = !!d.selected[name]
                    return (
                      <label key={name} style={{ ...s.svcRow, background: on ? 'var(--accent-light)' : 'transparent' }}>
                        <input type="checkbox" checked={on} onChange={() => toggleEntity(name)} />
                        <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{name}</span>
                      </label>
                    )
                  })}
                  {filtered.length === 0 && <p style={{ ...s.hint, textAlign: 'center', padding: 12 }}>Nenhum {cfg.entityNoun} para esse filtro.</p>}
                </div>
              </>
            )}
            {d.services.length === 0 && !loading && (
              <p style={s.hint}>{cfg.discoverHint(datadogSite)}</p>
            )}

            {cfg.allowManualEntry && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input
                  aria-label={cfg.manualPlaceholder}
                  className="focus-ring"
                  style={s.search}
                  value={manualInput}
                  onChange={e => setManualInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManual() } }}
                  placeholder={cfg.manualPlaceholder}
                />
                <button style={s.addBtn} onClick={addManual}>+ Adicionar</button>
              </div>
            )}
          </div>
        </>
      )}

      {subStep === 1 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ ...s.label, marginBottom: 0 }}>{cfg.opsLabel}</label>
            <button style={s.btnGhost} onClick={analyze} disabled={analyzing}>
              {analyzing ? 'Identificando…' : 'Identificar operações'}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selectedNames.map(name => {
              const meta = d.selected[name]
              const chosen = meta.chosen || []
              const operations = meta.operations || []
              return (
                <div key={name} style={s.selBox}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{name}</span>
                    {meta.error ? <span style={{ fontSize: 12, color: 'var(--danger)' }}>erro: {meta.error}</span>
                      : meta.opsCount == null ? <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>— clique em Identificar</span>
                      : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{meta.opsCount} operação(ões) · {chosen.length} selecionada(s)</span>}
                  </div>
                  {meta.opsCount != null && !meta.error && operations.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      <button style={s.smallBtn} onClick={() => selectAllOps(name)} disabled={chosen.length === operations.length}>
                        Selecionar todas
                      </button>
                      <button style={s.smallBtn} onClick={() => clearOps(name)} disabled={chosen.length === 0}>
                        Limpar
                      </button>
                    </div>
                  )}
                  {meta.opsCount != null && !meta.error && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(operations.length ? operations : chosen).map(op => (
                        <button key={op} style={opChipStyle(chosen.includes(op))} onClick={() => toggleOp(name, op)}>
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

      {subStep === 2 && (
        <div>
          <label style={s.label}>Alertas (anomaly detection) — parâmetros por tipo</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ALERT_TYPES.map(a => {
              const cfgAlert = d.alerts[a.key]
              const on = cfgAlert.enabled
              const open = openAlert === a.key
              return (
                <div key={a.key} style={accStyle(on)}>
                  <div style={s.accHead} onClick={() => setOpenAlert(open ? null : a.key)}>
                    <input type="checkbox" checked={on} onClick={e => e.stopPropagation()} onChange={() => toggleAlert(a.key)} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{a.label}</span>
                    <div style={s.pillRow}>
                      <span style={s.pill}>{cfgAlert.algorithm}</span>
                      {cfgAlert.algorithm !== 'basic' && <span style={s.pill}>{cfgAlert.seasonality}</span>}
                      <span style={s.pill}>{winShort(cfgAlert.alertWindow)}</span>
                      <span style={s.pill}>{dirLabel(cfgAlert.direction)}</span>
                      <span style={s.pill}>{cfgAlert.deviations}σ</span>
                    </div>
                    <span style={chevStyle(open)}>▶</span>
                  </div>
                  {open && (
                    <div style={s.accBody}>
                      <div>
                        <label style={s.miniLabel} htmlFor={`${a.key}-algo`}>Algoritmo</label>
                        <select id={`${a.key}-algo`} className="focus-ring" style={s.select} value={cfgAlert.algorithm} disabled={!on} onChange={e => setAlertParam(a.key, 'algorithm', e.target.value)}>
                          <option value="basic">basic</option><option value="agile">agile</option><option value="robust">robust</option>
                        </select>
                      </div>
                      <div>
                        <label style={s.miniLabel} htmlFor={`${a.key}-seasonality`}>Sazonalidade</label>
                        <select id={`${a.key}-seasonality`} className="focus-ring" style={s.select} value={cfgAlert.seasonality} disabled={!on || cfgAlert.algorithm === 'basic'} onChange={e => setAlertParam(a.key, 'seasonality', e.target.value)}>
                          <option value="hourly">hourly</option><option value="daily">daily</option><option value="weekly">weekly</option>
                        </select>
                      </div>
                      <div>
                        <label style={s.miniLabel} htmlFor={`${a.key}-window`}>Alert window</label>
                        <select id={`${a.key}-window`} className="focus-ring" style={s.select} value={cfgAlert.alertWindow} disabled={!on} onChange={e => setAlertParam(a.key, 'alertWindow', e.target.value)}>
                          {ALERT_WINDOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={s.miniLabel} htmlFor={`${a.key}-direction`}>Direção</label>
                        <select id={`${a.key}-direction`} className="focus-ring" style={s.select} value={cfgAlert.direction || 'above'} disabled={!on} onChange={e => setAlertParam(a.key, 'direction', e.target.value)}>
                          <option value="above">acima</option><option value="below">abaixo</option><option value="both">ambos</option>
                        </select>
                      </div>
                      <div>
                        <label style={s.miniLabel} htmlFor={`${a.key}-deviations`}>Anomalies</label>
                        <input id={`${a.key}-deviations`} className="focus-ring" style={s.select} type="number" min="1" max="10" value={cfgAlert.deviations} disabled={!on} onChange={e => setAlertParam(a.key, 'deviations', e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p style={s.hint}>
            Sazonalidade é ignorada no algoritmo basic. A alert window vira o trigger_window do monitor. A Datadog
            recomenda pelo menos 3x o período de sazonalidade de histórico pro algoritmo calibrar bem (ex.: ~3
            semanas pra weekly) — monitores muito novos podem levar alguns dias pra ficar precisos.
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
