// src/components/discovery/DiscoveryConfigureSlo.tsx
//
// Etapa "Configurar" da aba SLO — lista os SLOs que já existem no org
// (GET /api/datadog/slos), o usuário marca em quais quer alerta e quais tipos
// de alerta (burn rate rápido/lento, error budget consumido) valem pra todos
// os marcados. O app não cria SLO, só o monitor em cima dele. Ver
// lib/slo-monitors.ts.

'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { SLO_ALERT_TYPES, validateSloAlerts, type SloInfo, type SloAlertConfig } from '@/lib/slo-monitors'
import { EstimatedProgressBar } from '@/components/ProgressBar'
import type { DiscoveryStepProps } from './types'

const s: Record<string, CSSProperties> = {
  label: { display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 },
  miniLabel: { display: 'block', fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.03em' },
  hint: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 },
  input: { width: '100%', fontSize: 13, padding: '9px 12px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  num: { width: 90, fontSize: 13, padding: '7px 10px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  select: { fontSize: 12, padding: '7px 8px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none' },
  link: { fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
  err: { fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px' },
  actions: { display: 'flex', justifyContent: 'space-between', paddingTop: 4 },
  empty: { fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 12px', border: '1px dashed var(--border)', borderRadius: 10 },
  list: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' },
  pill: { fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-surface)', border: '0.5px solid var(--border)', borderRadius: 999, padding: '2px 8px', fontFamily: 'var(--font-geist-mono), monospace' },
  alertBox: { border: '0.5px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--bg-surface-2)', display: 'flex', flexDirection: 'column', gap: 8 },
}

export default function DiscoveryConfigureSlo({ config, setConfig, onNext, onBack }: DiscoveryStepProps) {
  const d = config.sloMonitors
  const setSlo = useCallback((patch: Partial<typeof d>) => setConfig(c => ({ ...c, sloMonitors: { ...c.sloMonitors, ...patch } })), [setConfig])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setLoadError('')
    try {
      const r = await fetch('/api/datadog/slos')
      const data = await r.json()
      if (!r.ok) { setLoadError([data.error, data.hint].filter(Boolean).join(' ') || 'Falha ao listar SLOs.'); return }
      const slos: SloInfo[] = data.slos || []
      // Mantém só as seleções que ainda existem (o SLO pode ter sido apagado).
      setConfig(c => {
        const ids = new Set(slos.map(x => x.id))
        const selected = Object.fromEntries(Object.entries(c.sloMonitors.selected).filter(([id, on]) => on && ids.has(id)))
        return { ...c, sloMonitors: { ...c.sloMonitors, slos, selected } }
      })
    } catch (e) { setLoadError('Falha de rede: ' + (e as Error).message) }
    finally { setLoading(false) }
  }, [setConfig])

  // Carrega uma vez ao abrir a aba (sem lista ainda) — sincroniza com a API do
  // Datadog (sistema externo); "Recarregar" refaz.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => { if (d.slos.length === 0) void load() }, [])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return q ? d.slos.filter(x => x.name.toLowerCase().includes(q)) : d.slos
  }, [d.slos, filter])
  const selectedCount = Object.values(d.selected).filter(Boolean).length

  function toggle(id: string) { setSlo({ selected: { ...d.selected, [id]: !d.selected[id] } }) }
  function setVisible(on: boolean) {
    const next = { ...d.selected }
    for (const x of visible) next[x.id] = on
    setSlo({ selected: next })
  }
  function patchAlert(key: string, patch: Partial<SloAlertConfig>) {
    setSlo({ alerts: { ...d.alerts, [key]: { ...d.alerts[key], ...patch } } })
  }

  function handleNext() {
    if (selectedCount === 0) return setError('Escolha ao menos um SLO.')
    if (!SLO_ALERT_TYPES.some(t => d.alerts[t.key]?.enabled)) return setError('Habilite ao menos um tipo de alerta.')
    const problems = validateSloAlerts(d.alerts)
    if (problems.length) return setError(problems.join('; ') + '.')
    setError('')
    onNext()
  }

  return (
    <div className="wz-card">
      <div>
        <label style={s.label}>SLOs</label>
        <p style={s.hint}>
          Escolha os SLOs que já existem no Datadog. O alerta usa a janela configurada em cada SLO — o app não cria nem altera SLOs.
        </p>
      </div>

      {loadError && <div className="wz-msg" style={s.err}>{loadError} <button style={s.link} onClick={load}>Tentar de novo</button></div>}

      {loading && <EstimatedProgressBar op="slos" label="Carregando SLOs do Datadog…" defaultMs={3000} />}

      {!loadError && !loading && d.slos.length === 0 && (
        <p className="wz-msg" style={s.empty}>Nenhum SLO encontrado neste org. Crie um SLO no Datadog e recarregue.</p>
      )}

      {d.slos.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="focus-ring" style={{ ...s.input, flex: 1, minWidth: 160 }} value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filtrar SLOs por nome…" aria-label="Filtrar SLOs por nome" />
            <button style={s.link} onClick={() => setVisible(true)}>Marcar visíveis</button>
            <button style={s.link} onClick={() => setVisible(false)}>Limpar visíveis</button>
            <button style={s.link} onClick={load} disabled={loading}>{loading ? 'Recarregando…' : 'Recarregar'}</button>
          </div>
          <div style={s.list}>
            {visible.map(x => (
              <label key={x.id} className={`row-select${d.selected[x.id] ? ' is-on' : ''}`}>
                <input type="checkbox" checked={!!d.selected[x.id]} onChange={() => toggle(x.id)} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{x.name}</span>
                <span style={s.pill}>{x.type || 'slo'}</span>
                <span style={s.pill}>{x.timeframe}</span>
                {x.target != null && <span style={s.pill}>meta {x.target}%</span>}
              </label>
            ))}
            {visible.length === 0 && <p className="wz-msg" style={s.empty}>Nenhum SLO com esse nome.</p>}
          </div>
          <p style={s.hint}>{selectedCount} de {d.slos.length} selecionado(s).</p>
        </>
      )}

      <div>
        <label style={s.label}>Alertas (valem para todos os SLOs marcados)</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SLO_ALERT_TYPES.map(t => {
            const c = d.alerts[t.key]
            return (
              <div key={t.key} style={s.alertBox}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={!!c?.enabled} onChange={e => patchAlert(t.key, { enabled: e.target.checked })} />
                  {t.label}
                </label>
                <p style={{ ...s.hint, marginTop: 0 }}>{t.hint}</p>
                {c?.enabled && (
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div>
                      <label style={s.miniLabel} htmlFor={`slo-${t.key}-thr`}>Dispara acima de ({t.unit})</label>
                      <input id={`slo-${t.key}-thr`} className="focus-ring" style={s.num} type="number" min="0" step="any" value={c.threshold} onChange={e => patchAlert(t.key, { threshold: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label style={s.miniLabel} htmlFor={`slo-${t.key}-prio`}>Prioridade</label>
                      <select id={`slo-${t.key}-prio`} className="focus-ring" style={s.select} value={c.priority ?? ''} onChange={e => patchAlert(t.key, { priority: e.target.value ? Number(e.target.value) : null })}>
                        <option value="">Sem prioridade</option>
                        <option value="1">P1</option><option value="2">P2</option><option value="3">P3</option><option value="4">P4</option><option value="5">P5</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {error && <div className="wz-msg" style={s.err}>{error}</div>}

      <div style={s.actions}>
        <button className="btn btn-ghost" onClick={onBack}><span className="btn-arrow-back" aria-hidden="true">←</span> Voltar</button>
        <button className="btn btn-primary" onClick={handleNext}>Continuar <span className="btn-arrow" aria-hidden="true">→</span></button>
      </div>
    </div>
  )
}
