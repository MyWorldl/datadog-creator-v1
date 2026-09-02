// src/components/discovery/DiscoveryConfigureK8sDbm.tsx
//
// Aba "APM e Infraestrutura" (Kubernetes/DBM, atrás da flag k8sDbmCoverage) —
// dedicada aos 4 monitores de K8s/DBM, que não cabem limpo nem em Infra (host)
// nem em APM (serviço/operação) puros: 3 modelos de entidade diferentes,
// organizados em 3 seções empilhadas na MESMA tela (sem sub-abas):
//   1. Por HOST  — Node Ready + métricas de banco (config.k8sInfra)
//   2. Por NAMESPACE — Pod Restarts (config.k8sDiscovery, scopeType fixo em
//      'namespace'; sem etapa de "operações", Pod Restarts não usa isso)
//   3. GLOBAL — Pod Pending (config.k8sDiscovery.podPending, sem seleção
//      de entidade nenhuma — 1 monitor único pro cluster inteiro)
//
// Reaproveita os MESMOS dois shapes de estado de sempre (InfraDiscoveryState
// e DiscoveryState) em vez de inventar um 3º — assim Personalizar/Revisar/
// Criar seguem funcionando via planInfraPreview/planPreview e as rotas
// infra-monitors/service-monitors, sem lógica de criação duplicada.

'use client'

import { useState, type CSSProperties } from 'react'
import { INFRA_TYPES, type InfraMetricConfig, type InfraMetricType } from '@/lib/infra'
import { ALERT_WINDOW_OPTIONS, POD_RESTARTS_TYPE, POD_PENDING_TYPE } from '@/lib/discovery'
import type { DiscoveryStepProps } from './types'
import { accStyle, chevStyle, winShort } from './styles'

const s: Record<string, CSSProperties> = {
  card: { border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 20 },
  section: { display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 4, borderBottom: '0.5px solid var(--border)' },
  sectionHead: { display: 'flex', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' },
  sectionSub: { fontSize: 11, color: 'var(--text-muted)', margin: 0 },
  label: { display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 },
  miniLabel: { display: 'block', fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.03em' },
  hint: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 },
  select: { width: '100%', fontSize: 13, padding: '8px 10px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  btn: { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  btnGhost: { fontSize: 13, color: 'var(--text-secondary)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  smallBtn: { fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' },
  toolbar: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  search: { flex: 1, minWidth: 180, fontSize: 13, padding: '8px 12px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none' },
  counter: { fontSize: 12, color: 'var(--text-muted)' },
  list: { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto', border: '0.5px solid var(--border)', borderRadius: 8, padding: 8 },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 6, cursor: 'pointer' },
  accHead: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', cursor: 'pointer' },
  pillRow: { display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 },
  pill: { fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-surface)', border: '0.5px solid var(--border)', borderRadius: 999, padding: '2px 8px', fontFamily: 'var(--font-geist-mono), monospace' },
  accBody: { padding: '4px 12px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 },
  err: { fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px' },
  actions: { display: 'flex', justifyContent: 'space-between', paddingTop: 4 },
}

const K8S_INFRA_TYPES = INFRA_TYPES.filter(t => t.flag === 'k8sDbmCoverage') as InfraMetricType[]

export default function DiscoveryConfigureK8sDbm({ config, setConfig, onNext, onBack }: DiscoveryStepProps) {
  const infra = config.k8sInfra
  const disc = config.k8sDiscovery
  const setInfra = (patch: Partial<typeof infra>) => setConfig(c => ({ ...c, k8sInfra: { ...c.k8sInfra, ...patch } }))
  const setDisc = (patch: Partial<typeof disc>) => setConfig(c => ({ ...c, k8sDiscovery: { ...c.k8sDiscovery, ...patch } }))

  const [error, setError] = useState('')
  const [hostSearch, setHostSearch] = useState('')
  const [nsSearch, setNsSearch] = useState('')
  const [manualNs, setManualNs] = useState('')
  const [loadingHosts, setLoadingHosts] = useState(false)
  const [loadingNs, setLoadingNs] = useState(false)
  const [openMetric, setOpenMetric] = useState<string | null>(K8S_INFRA_TYPES[0]?.key || null)

  const selectedHosts = Object.keys(infra.selected).filter(h => infra.selected[h])
  const hostSearchTerms = hostSearch.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
  const filteredHosts = infra.hosts.filter(h => hostSearchTerms.length === 0 || hostSearchTerms.some(t => h.name.toLowerCase().includes(t)))

  const selectedNamespaces = Object.keys(disc.selected)
  const nsSearchTerms = nsSearch.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
  const filteredNs = disc.services.filter(name => nsSearchTerms.length === 0 || nsSearchTerms.some(t => name.toLowerCase().includes(t)))

  async function discoverHosts() {
    setError(''); setLoadingHosts(true)
    try {
      const r = await fetch('/api/datadog/hosts')
      const data = await r.json()
      if (!r.ok) { setError((data.error || 'Falha ao descobrir hosts.') + (data.hint ? ' ' + data.hint : '')); return }
      setInfra({ hosts: data.hosts || [] })
    } catch (e) { setError('Falha de rede: ' + (e as Error).message) }
    finally { setLoadingHosts(false) }
  }
  function toggleHost(name: string) {
    const sel = { ...infra.selected }
    if (sel[name]) delete sel[name]
    else sel[name] = true
    setInfra({ selected: sel })
  }

  async function discoverNamespaces() {
    setError(''); setLoadingNs(true)
    try {
      const r = await fetch('/api/datadog/namespaces?env=')
      const data = await r.json()
      if (!r.ok) { setError((data.error || 'Falha ao descobrir namespaces.') + (data.hint ? ' ' + data.hint : '')); return }
      setDisc({ services: data.namespaces || [] })
    } catch (e) { setError('Falha de rede: ' + (e as Error).message) }
    finally { setLoadingNs(false) }
  }
  function toggleNamespace(name: string) {
    const sel = { ...disc.selected }
    if (sel[name]) delete sel[name]
    else sel[name] = { opsCount: null, operations: [], chosen: [] }
    setDisc({ selected: sel })
  }
  function addManualNs() {
    const v = manualNs.trim()
    if (!v) return
    const services = disc.services.includes(v) ? disc.services : [...disc.services, v]
    const selected = disc.selected[v] ? disc.selected : { ...disc.selected, [v]: { opsCount: null, operations: [], chosen: [] } }
    setDisc({ services, selected })
    setManualNs('')
  }

  function toggleMetric(key: string) {
    setInfra({ metrics: { ...infra.metrics, [key]: { ...infra.metrics[key], enabled: !infra.metrics[key].enabled } } })
  }
  function setMetricParam(key: string, field: string, value: unknown) {
    setInfra({ metrics: { ...infra.metrics, [key]: { ...infra.metrics[key], [field]: value } } })
  }
  function setMetricThreshold(key: string, level: 'critical' | 'warning', value: string) {
    const cfg = infra.metrics[key] as InfraMetricConfig
    setInfra({ metrics: { ...infra.metrics, [key]: { ...cfg, thresholds: { ...cfg.thresholds, [level]: Number(value) } } } })
  }

  function togglePodRestarts() {
    setDisc({ podRestarts: { ...disc.podRestarts, enabled: !disc.podRestarts.enabled } })
  }
  function setPodRestartsParam(field: string, v: unknown) {
    setDisc({ podRestarts: { ...disc.podRestarts, [field]: v } })
  }
  function togglePodPending() {
    setDisc({ podPending: { ...disc.podPending, enabled: !disc.podPending.enabled } })
  }
  function setPodPendingParam(field: string, v: unknown) {
    setDisc({ podPending: { ...disc.podPending, [field]: v } })
  }

  const anyHostMetricEnabled = K8S_INFRA_TYPES.some(t => infra.metrics[t.key]?.enabled)

  function handleNext() {
    if (!anyHostMetricEnabled && !disc.podRestarts.enabled && !disc.podPending.enabled) {
      return setError('Habilite ao menos um monitor (Node Ready, banco de dados, Pod Restarts ou Pod Pending).')
    }
    if (anyHostMetricEnabled && selectedHosts.length === 0) {
      return setError('Selecione ao menos um host para Node Ready/banco de dados.')
    }
    if (disc.podRestarts.enabled && selectedNamespaces.length === 0) {
      return setError('Selecione ao menos um namespace para Pod Restarts.')
    }
    setError('')
    onNext()
  }

  return (
    <div style={s.card}>
      {/* Seção 1 — por HOST */}
      <div style={s.section}>
        <div style={s.sectionHead}>
          <span style={s.sectionTitle}>Node Ready &amp; Banco de Dados (por host)</span>
        </div>
        <p style={s.sectionSub}>Selecione os hosts e habilite as métricas que fazem sentido para cada um.</p>

        <div style={s.toolbar}>
          <input aria-label="Filtrar hosts" className="focus-ring" style={s.search} placeholder="Filtrar hosts (vírgula = vários termos)" value={hostSearch} onChange={e => setHostSearch(e.target.value)} />
          <button style={s.btnGhost} onClick={discoverHosts} disabled={loadingHosts}>{loadingHosts ? 'Descobrindo…' : 'Descobrir hosts'}</button>
        </div>

        {infra.hosts.length > 0 ? (
          <>
            <span style={s.counter}>{selectedHosts.length} host(s) selecionado(s) · mostrando {filteredHosts.length} de {infra.hosts.length}</span>
            <div style={s.list}>
              {filteredHosts.map(h => (
                <label key={h.name} style={{ ...s.row, background: infra.selected[h.name] ? 'var(--accent-light)' : 'transparent' }}>
                  <input type="checkbox" checked={!!infra.selected[h.name]} onChange={() => toggleHost(h.name)} />
                  <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{h.name}</span>
                </label>
              ))}
              {filteredHosts.length === 0 && <p style={{ ...s.hint, textAlign: 'center', padding: 12 }}>Nenhum host para esse filtro.</p>}
            </div>
          </>
        ) : (
          <p style={s.hint}>Clique em &quot;Descobrir hosts&quot; para listar os hosts reportando ao Datadog.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {K8S_INFRA_TYPES.map(t => {
            const cfg = infra.metrics[t.key] as InfraMetricConfig
            const on = cfg.enabled
            const open = openMetric === t.key
            return (
              <div key={t.key} style={accStyle(on)}>
                <div style={s.accHead} onClick={() => setOpenMetric(open ? null : t.key)}>
                  <input type="checkbox" checked={on} onClick={e => e.stopPropagation()} onChange={() => toggleMetric(t.key)} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{t.label}</span>
                  <div style={s.pillRow}>
                    <span style={s.pill}>crit {cfg.thresholds.critical}{t.unit} / warn {cfg.thresholds.warning}{t.unit}</span>
                    {t.requiresEngine && <span style={s.pill}>{cfg.dbEngine || 'postgres'}</span>}
                  </div>
                  <span style={chevStyle(open)}>▶</span>
                </div>
                {open && (
                  <div style={s.accBody}>
                    {t.requiresEngine && (
                      <div>
                        <label style={s.miniLabel} htmlFor={`${t.key}-engine`}>Engine do banco</label>
                        <select id={`${t.key}-engine`} className="focus-ring" style={s.select} value={cfg.dbEngine || 'postgres'} disabled={!on} onChange={e => setMetricParam(t.key, 'dbEngine', e.target.value)}>
                          <option value="postgres">Postgres</option>
                          <option value="mysql">MySQL</option>
                        </select>
                      </div>
                    )}
                    <div>
                      <label style={s.miniLabel} htmlFor={`${t.key}-thr-critical`}>Critical ({t.unit})</label>
                      <input id={`${t.key}-thr-critical`} className="focus-ring" style={s.select} type="number" value={cfg.thresholds.critical} disabled={!on} onChange={e => setMetricThreshold(t.key, 'critical', e.target.value)} />
                    </div>
                    <div>
                      <label style={s.miniLabel} htmlFor={`${t.key}-thr-warning`}>Warning ({t.unit})</label>
                      <input id={`${t.key}-thr-warning`} className="focus-ring" style={s.select} type="number" value={cfg.thresholds.warning} disabled={!on} onChange={e => setMetricThreshold(t.key, 'warning', e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Seção 2 — por NAMESPACE */}
      <div style={s.section}>
        <div style={s.sectionHead}>
          <span style={s.sectionTitle}>{POD_RESTARTS_TYPE.label} (por namespace)</span>
        </div>
        <p style={s.sectionSub}>{POD_RESTARTS_TYPE.hint}</p>

        <div style={s.toolbar}>
          <input aria-label="Filtrar namespaces" className="focus-ring" style={s.search} placeholder="Filtrar namespaces (vírgula = vários termos)" value={nsSearch} onChange={e => setNsSearch(e.target.value)} />
          <button style={s.btnGhost} onClick={discoverNamespaces} disabled={loadingNs}>{loadingNs ? 'Descobrindo…' : 'Descobrir namespaces'}</button>
        </div>

        {disc.services.length > 0 ? (
          <>
            <span style={s.counter}>{selectedNamespaces.length} namespace(s) selecionado(s) · mostrando {filteredNs.length} de {disc.services.length}</span>
            <div style={s.list}>
              {filteredNs.map(name => (
                <label key={name} style={{ ...s.row, background: disc.selected[name] ? 'var(--accent-light)' : 'transparent' }}>
                  <input type="checkbox" checked={!!disc.selected[name]} onChange={() => toggleNamespace(name)} />
                  <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{name}</span>
                </label>
              ))}
              {filteredNs.length === 0 && <p style={{ ...s.hint, textAlign: 'center', padding: 12 }}>Nenhum namespace para esse filtro.</p>}
            </div>
          </>
        ) : (
          <p style={s.hint}>Clique em &quot;Descobrir namespaces&quot; para listar os kube_namespace com tráfego no Datadog. Se algum não aparecer, adicione manualmente abaixo.</p>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <input aria-label="Adicionar namespace manualmente" className="focus-ring" style={s.search} value={manualNs} onChange={e => setManualNs(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualNs() } }} placeholder="Adicionar namespace manualmente… ex.: payments" />
          <button style={s.smallBtn} onClick={addManualNs}>+ Adicionar</button>
        </div>

        <div style={accStyle(disc.podRestarts.enabled)}>
          <div style={s.accHead}>
            <input type="checkbox" checked={disc.podRestarts.enabled} onChange={togglePodRestarts} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Habilitar Pod Restarts</span>
            <div style={s.pillRow}>
              <span style={s.pill}>change()</span>
              <span style={s.pill}>limite {disc.podRestarts.threshold}</span>
              <span style={s.pill}>{winShort(disc.podRestarts.changeWindow)}</span>
            </div>
          </div>
          <div style={s.accBody}>
            <div>
              <label style={s.miniLabel} htmlFor="pod-restarts-threshold">Limite (restarts na janela)</label>
              <input id="pod-restarts-threshold" className="focus-ring" style={s.select} type="number" min="1" max="1000" value={disc.podRestarts.threshold} disabled={!disc.podRestarts.enabled} onChange={e => setPodRestartsParam('threshold', Number(e.target.value))} />
            </div>
            <div>
              <label style={s.miniLabel} htmlFor="pod-restarts-window">Janela (change window)</label>
              <select id="pod-restarts-window" className="focus-ring" style={s.select} value={disc.podRestarts.changeWindow} disabled={!disc.podRestarts.enabled} onChange={e => setPodRestartsParam('changeWindow', e.target.value)}>
                {ALERT_WINDOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Seção 3 — GLOBAL (sem entidade) */}
      <div style={{ ...s.section, borderBottom: 'none', paddingBottom: 0 }}>
        <div style={s.sectionHead}>
          <span style={s.sectionTitle}>{POD_PENDING_TYPE.label} (monitor único, sem seleção)</span>
        </div>
        <p style={s.sectionSub}>{POD_PENDING_TYPE.hint}</p>

        <div style={accStyle(disc.podPending.enabled)}>
          <div style={s.accHead}>
            <input type="checkbox" checked={disc.podPending.enabled} onChange={togglePodPending} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Habilitar Pods pendentes</span>
            <div style={s.pillRow}>
              <span style={s.pill}>limite {disc.podPending.threshold}</span>
              <span style={s.pill}>{winShort(disc.podPending.window)}</span>
            </div>
          </div>
          <div style={s.accBody}>
            <div>
              <label style={s.miniLabel} htmlFor="pod-pending-threshold">Limite (pods pendentes)</label>
              <input id="pod-pending-threshold" className="focus-ring" style={s.select} type="number" min="0" max="1000" value={disc.podPending.threshold} disabled={!disc.podPending.enabled} onChange={e => setPodPendingParam('threshold', Number(e.target.value))} />
            </div>
            <div>
              <label style={s.miniLabel} htmlFor="pod-pending-window">Janela</label>
              <select id="pod-pending-window" className="focus-ring" style={s.select} value={disc.podPending.window} disabled={!disc.podPending.enabled} onChange={e => setPodPendingParam('window', e.target.value)}>
                {ALERT_WINDOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {error && <div style={s.err}>{error}</div>}

      <div style={s.actions}>
        <button style={s.btnGhost} onClick={onBack}>← Voltar</button>
        <button style={s.btn} onClick={handleNext}>Continuar →</button>
      </div>
    </div>
  )
}
