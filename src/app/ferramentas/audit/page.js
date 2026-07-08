// src/app/ferramentas/audit/page.js
'use client'

import { useState } from 'react'
import { useApp } from '@/context/AppContext'
import Sparkline from '@/components/Sparkline'

const scoreColor = (v) => v == null ? 'var(--text-muted)' : v >= 80 ? 'var(--success)' : v >= 50 ? 'var(--warning)' : 'var(--danger)'

function Ring({ value, size = 120, stroke = 10 }) {
  const r = (size / 2) - stroke, circ = 2 * Math.PI * r, dash = ((value ?? 0) / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={scoreColor(value)} strokeWidth={stroke} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
    </svg>
  )
}

const s = {
  h1: { fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' },
  sub: { fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1.5rem' },
  card: { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem', boxShadow: 'var(--card-shadow)' },
  btn: { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer' },
  btn2: { fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 16px', cursor: 'pointer' },
  err: { fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 12px', marginTop: 12 },
  ok: { fontSize: 12, color: 'var(--success)', background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 8, padding: '10px 12px', marginTop: 12 },
  stat: (c) => ({ fontSize: 20, fontWeight: 800, color: c || 'var(--text-primary)' }),
  statLbl: { fontSize: 11, color: 'var(--text-muted)' },
  groupTitle: { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '18px 0 8px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: 10 },
  cov: (covered) => ({ border: `1px solid ${covered ? 'var(--success)' : 'var(--danger)'}`, background: covered ? 'var(--success-bg)' : 'var(--danger-bg)', borderRadius: 10, padding: '12px 14px' }),
  covName: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  covStatus: (covered) => ({ fontSize: 11.5, fontWeight: 700, color: covered ? 'var(--success)' : 'var(--danger)' }),
}

export default function AuditMonitorsPage() {
  const { keysConfigured, datadogSite } = useApp()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [creating, setCreating] = useState(false)
  const [createResult, setCreateResult] = useState(null)

  async function run() {
    setError(''); setLoading(true); setData(null); setCreateResult(null)
    try {
      const r = await fetch('/api/datadog/audit-monitors')
      const json = await r.json()
      if (!r.ok) { setError(json.error || 'Falha ao auditar.'); return }
      setData(json)
    } catch (e) { setError('Falha de rede: ' + e.message) }
    finally { setLoading(false) }
  }

  async function createMissing() {
    if (!data?.suggestedInfra?.infra) return
    setCreating(true); setCreateResult(null); setError('')
    try {
      const r = await fetch('/api/datadog/infra-monitors', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ infra: data.suggestedInfra.infra }),
      })
      const json = await r.json()
      if (!r.ok) { setError(json.error || 'Falha ao criar monitores.'); return }
      setCreateResult(json)
      await run() // recalcula a cobertura após criar
    } catch (e) { setError('Falha de rede: ' + e.message) }
    finally { setCreating(false) }
  }

  const infra = data?.coverage?.filter(c => c.group === 'Infra') || []
  const apm = data?.coverage?.filter(c => c.group === 'APM') || []
  const sug = data?.suggestedInfra

  return (
    <div>
      <h1 style={s.h1}>AuditMonitors</h1>
      <p style={s.sub}>Analisa o ambiente e mostra quais métricas têm monitor e quais estão sem cobertura · coleta no servidor via {datadogSite}.</p>

      {!keysConfigured ? (
        <div style={s.card}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Conecte-se ao Datadog em Configurações para auditar.</p>
        </div>
      ) : (
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            {data ? (
              <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
                <Ring value={data.score} />
                <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: scoreColor(data.score) }}>
                  <span style={{ fontSize: 28, fontWeight: 800 }}>{data.score}%</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>cobertura</span>
                </span>
              </div>
            ) : null}
            <div style={{ flex: 1, minWidth: 220 }}>
              {data && (
                <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: 10 }}>
                  <div><div style={s.stat()}>{data.environment.hostCount}</div><div style={s.statLbl}>hosts</div></div>
                  <div><div style={s.stat()}>{data.environment.serviceCount}</div><div style={s.statLbl}>serviços APM</div></div>
                  <div><div style={s.stat()}>{data.environment.monitorCount}</div><div style={s.statLbl}>monitores</div></div>
                  <div><div style={s.stat(scoreColor(100 - (data.gapCount / (data.coverage.length || 1)) * 100))}>{data.gapCount}</div><div style={s.statLbl}>lacunas</div></div>
                </div>
              )}
              {data && data.history && (
                <div style={{ marginBottom: 10 }}>
                  <Sparkline values={data.history} delta={data.delta} color={scoreColor(data.score)} />
                </div>
              )}
              <button style={s.btn} onClick={run} disabled={loading}>
                {loading ? 'Auditando…' : data ? 'Reauditar' : 'Auditar ambiente'}
              </button>
            </div>
          </div>

          {error && <div style={s.err}>{error}</div>}
          {createResult && <div style={s.ok}>Criados {createResult.created} · pulados {createResult.skipped} (já existiam) · total {createResult.total}.</div>}

          {data && (
            <>
              {sug && sug.monitorCount > 0 && (
                <div style={{ ...s.card, background: 'var(--bg-base)', marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Leva sugerida de monitores de Infra</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>
                      {sug.monitorCount} monitor(es) — {sug.gapKinds.length} métrica(s) em lacuna × {sug.hostCount} host(s). Idempotente: pula os que já existirem.
                    </div>
                  </div>
                  <button style={s.btn} onClick={createMissing} disabled={creating}>
                    {creating ? 'Criando…' : 'Criar os que faltam'}
                  </button>
                </div>
              )}

              <p style={s.groupTitle}>Infra ({infra.filter(c => c.covered).length}/{infra.length})</p>
              <div style={s.grid}>
                {infra.map(c => (
                  <div key={c.key} style={s.cov(c.covered)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={s.covName}>{c.label}</span>
                      <span style={s.covStatus(c.covered)}>{c.covered ? '✓ monitorado' : '✗ lacuna'}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{c.monitorCount} monitor(es) referenciam esta métrica.</div>
                  </div>
                ))}
              </div>

              {Array.isArray(data.hostCoverage) && data.hostCoverage.length > 0 && (
                <details style={{ marginTop: 16 }}>
                  <summary style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, cursor: 'pointer' }}>
                    Cobertura de Infra por host ({data.hostCoverage.filter(h => h.gapCount === 0).length}/{data.hostCoverage.length} hosts completos)
                  </summary>
                  <div style={{ overflowX: 'auto', marginTop: 10 }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 11.5, width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-muted)', position: 'sticky', left: 0, background: 'var(--bg-surface)' }}>Host</th>
                          {data.infraMetrics.map(m => (
                            <th key={m.key} style={{ padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>{m.label}</th>
                          ))}
                          <th style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>Lacunas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.hostCoverage.map(h => (
                          <tr key={h.host} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontFamily: 'var(--font-geist-mono), monospace', position: 'sticky', left: 0, background: 'var(--bg-surface)' }}>{h.host}</td>
                            {data.infraMetrics.map(m => (
                              <td key={m.key} style={{ padding: '6px 8px', textAlign: 'center', color: h.metrics[m.key] ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                                {h.metrics[m.key] ? '✓' : '✗'}
                              </td>
                            ))}
                            <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: h.gapCount === 0 ? 'var(--success)' : 'var(--danger)' }}>{h.gapCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                      Heurística por escopo da query: monitor com {'{*}'} cobre todos os hosts; monitor com host:&lt;nome&gt; cobre aquele host. Monitores escopados por outras tags (ex.: env) não são contados aqui.
                    </p>
                  </div>
                </details>
              )}

              <p style={s.groupTitle}>APM ({apm.filter(c => c.covered).length}/{apm.length})</p>
              <div style={s.grid}>
                {apm.map(c => (
                  <div key={c.key} style={s.cov(c.covered)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={s.covName}>{c.label}</span>
                      <span style={s.covStatus(c.covered)}>{c.covered ? '✓ monitorado' : '✗ lacuna'}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{c.monitorCount} monitor(es) referenciam esta métrica.</div>
                  </div>
                ))}
              </div>
              {data.apmGaps.length > 0 && (
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10 }}>
                  Lacunas de APM ({data.apmGaps.join(', ')}) dependem de operação/serviço — crie-as pelo MonitorsCreator, que descobre as operações.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
