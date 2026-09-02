// src/components/discovery/DiscoveryConfigureLogs.tsx
//
// Etapa "Configurar" da aba Logs — diferente de DiscoveryConfigure*.tsx
// (serviços/hosts), não existe uma API pra "descobrir" filtros de log
// possíveis: o usuário monta uma ou mais REGRAS diretamente (nome + filtro +
// índice + janela + limite), cada uma virando 1 monitor. Ver
// lib/log-monitors.ts pro porquê do escopo (só contagem, sem measure/by).

'use client'

import { useState, type CSSProperties } from 'react'
import { LOG_WINDOW_OPTIONS, DEFAULT_LOG_INDEX, newLogMonitorRule, type LogMonitorRule } from '@/lib/log-monitors'
import type { DiscoveryStepProps } from './types'
import { accStyle, chevStyle } from './styles'

const s: Record<string, CSSProperties> = {
  card: { border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 16 },
  label: { display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 },
  miniLabel: { display: 'block', fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.03em' },
  hint: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 },
  input: { width: '100%', fontSize: 13, padding: '9px 12px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  select: { width: '100%', fontSize: 13, padding: '8px 10px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  btn: { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  btnGhost: { fontSize: 13, color: 'var(--text-secondary)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  addBtn: { fontSize: 13, fontWeight: 600, color: 'var(--accent)', background: 'none', border: '0.5px solid var(--accent)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', alignSelf: 'flex-start' },
  removeBtn: { fontSize: 12, fontWeight: 600, color: 'var(--danger)', background: 'none', border: '0.5px solid var(--danger)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' },
  accHead: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', cursor: 'pointer' },
  pillRow: { display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 },
  pill: { fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-surface)', border: '0.5px solid var(--border)', borderRadius: 999, padding: '2px 8px', fontFamily: 'var(--font-geist-mono), monospace' },
  accBody: { padding: '4px 12px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 },
  err: { fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px' },
  actions: { display: 'flex', justifyContent: 'space-between', paddingTop: 4 },
  empty: { fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 12px', border: '1px dashed var(--border)', borderRadius: 10 },
}

// IDs client-side (não vão pro payload do monitor) — só precisam ser únicos
// dentro desta sessão do wizard, um contador simples resolve sem depender de
// crypto.randomUUID() (nem sempre disponível em todo runtime/teste).
let nextRuleSeq = 1
function newRuleId(): string {
  return `rule-${Date.now()}-${nextRuleSeq++}`
}

export default function DiscoveryConfigureLogs({ config, setConfig, onNext, onBack }: DiscoveryStepProps) {
  const d = config.logMonitors
  const setLog = (patch: Partial<typeof d>) => setConfig(c => ({ ...c, logMonitors: { ...c.logMonitors, ...patch } }))
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<string | null>(d.rules[0]?.id ?? null)

  function addRule() {
    const rule = newLogMonitorRule(newRuleId())
    setLog({ rules: [...d.rules, rule] })
    setOpenId(rule.id)
    setError('')
  }
  function removeRule(id: string) {
    setLog({ rules: d.rules.filter(r => r.id !== id) })
  }
  function patchRule(id: string, patch: Partial<LogMonitorRule>) {
    setLog({ rules: d.rules.map(r => (r.id === id ? { ...r, ...patch } : r)) })
  }

  function handleNext() {
    if (d.rules.length === 0) return setError('Adicione ao menos uma regra.')
    const semNome = d.rules.filter(r => !r.label.trim())
    if (semNome.length) return setError('Toda regra precisa de um nome.')
    setError('')
    onNext()
  }

  return (
    <div style={s.card}>
      <div>
        <label style={s.label}>Regras de Log Monitor</label>
        <p style={s.hint}>
          Cada regra vira 1 monitor: conta os logs que casam o filtro (sintaxe do Log Explorer — deixe em branco
          para contar todos os logs do índice) dentro da janela, e dispara quando passa do limite.
        </p>
      </div>

      {d.rules.length === 0 && <p style={s.empty}>Nenhuma regra ainda. Clique em &quot;+ Adicionar regra&quot; para começar.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {d.rules.map(rule => {
          const open = openId === rule.id
          return (
            <div key={rule.id} style={accStyle(true)}>
              <div style={s.accHead} onClick={() => setOpenId(open ? null : rule.id)}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                  {rule.label.trim() || 'Nova regra'}
                </span>
                <div style={s.pillRow}>
                  <span style={s.pill}>{rule.index}</span>
                  <span style={s.pill}>{rule.window}</span>
                  <span style={s.pill}>&gt; {rule.threshold}</span>
                </div>
                <span style={chevStyle(open)}>▶</span>
              </div>
              {open && (
                <div style={s.accBody} onClick={e => e.stopPropagation()}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={s.miniLabel} htmlFor={`${rule.id}-label`}>Nome da regra</label>
                    <input id={`${rule.id}-label`} className="focus-ring" style={s.input} value={rule.label} onChange={e => patchRule(rule.id, { label: e.target.value })} placeholder="ex.: Erros 5xx do checkout" />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={s.miniLabel} htmlFor={`${rule.id}-filter`}>Filtro (Log Search Syntax)</label>
                    <input id={`${rule.id}-filter`} className="focus-ring" style={s.input} value={rule.queryFilter} onChange={e => patchRule(rule.id, { queryFilter: e.target.value })} placeholder='ex.: service:checkout status:error' />
                  </div>
                  <div>
                    <label style={s.miniLabel} htmlFor={`${rule.id}-index`}>Índice</label>
                    <input id={`${rule.id}-index`} className="focus-ring" style={s.select} value={rule.index} onChange={e => patchRule(rule.id, { index: e.target.value || DEFAULT_LOG_INDEX })} placeholder={DEFAULT_LOG_INDEX} />
                  </div>
                  <div>
                    <label style={s.miniLabel} htmlFor={`${rule.id}-window`}>Janela</label>
                    <select id={`${rule.id}-window`} className="focus-ring" style={s.select} value={rule.window} onChange={e => patchRule(rule.id, { window: e.target.value })}>
                      {LOG_WINDOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={s.miniLabel} htmlFor={`${rule.id}-threshold`}>Limite (critical)</label>
                    <input id={`${rule.id}-threshold`} className="focus-ring" style={s.select} type="number" min="0" value={rule.threshold} onChange={e => patchRule(rule.id, { threshold: Number(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <label style={s.miniLabel} htmlFor={`${rule.id}-warn`}>Limite de aviso (opcional)</label>
                    <input id={`${rule.id}-warn`} className="focus-ring" style={s.select} type="number" min="0" placeholder="sem aviso" value={rule.warningThreshold ?? ''} onChange={e => patchRule(rule.id, { warningThreshold: e.target.value === '' ? null : Number(e.target.value) })} />
                  </div>
                  <div>
                    <label style={s.miniLabel} htmlFor={`${rule.id}-priority`}>Prioridade</label>
                    <select id={`${rule.id}-priority`} className="focus-ring" style={s.select} value={rule.priority ?? ''} onChange={e => patchRule(rule.id, { priority: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">Sem prioridade</option>
                      <option value="1">P1</option><option value="2">P2</option><option value="3">P3</option><option value="4">P4</option><option value="5">P5</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                      <input type="checkbox" checked={rule.enableLogsSample} onChange={e => patchRule(rule.id, { enableLogsSample: e.target.checked })} />
                      Anexar amostra de logs na notificação
                    </label>
                  </div>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
                    <button style={s.removeBtn} onClick={() => removeRule(rule.id)}>Remover regra</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <button style={s.addBtn} onClick={addRule}>+ Adicionar regra</button>

      {error && <div style={s.err}>{error}</div>}

      <div style={s.actions}>
        <button style={s.btnGhost} onClick={onBack}>← Voltar</button>
        <button style={s.btn} onClick={handleNext}>Continuar →</button>
      </div>
    </div>
  )
}
