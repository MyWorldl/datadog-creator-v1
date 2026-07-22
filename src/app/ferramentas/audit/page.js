// src/app/ferramentas/audit/page.js
'use client'

import { useState } from 'react'
import { useApp } from '@/context/AppContext'
import Sparkline from '@/components/Sparkline'
import MonitorPlanList from '@/components/discovery/MonitorPlanList'
import { coveragePercent, percentBand } from '@/lib/audit'

const scoreColor = (v) => v == null ? 'var(--text-muted)' : v >= 80 ? 'var(--success)' : v >= 50 ? 'var(--warning)' : 'var(--danger)'
// Cores por faixa de % de cobertura por entidade (host/serviço) — faixas de
// negócio calculadas em lib/audit.js (percentBand); aqui só o mapeamento
// pra CSS var, igual ao que scoreColor já faz pro score numérico do anel.
const bandColor = (band) => band === 'red' ? 'var(--danger)' : band === 'yellow' ? 'var(--warning)' : band === 'green' ? 'var(--success)' : 'var(--text-muted)'
const bandBg = (band) => band === 'red' ? 'var(--danger-bg)' : band === 'yellow' ? 'var(--warning-bg)' : band === 'green' ? 'var(--success-bg)' : 'var(--bg-surface-2)'

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
  cov: (band) => ({ border: `1px solid ${bandColor(band)}`, background: bandBg(band), borderRadius: 10, padding: '12px 14px' }),
  covName: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  covStatus: (band) => ({ fontSize: 15, fontWeight: 800, color: bandColor(band) }),
  suggestCard: { background: 'var(--bg-base)', marginTop: 16, borderRadius: 12, border: '1px solid var(--border)', padding: '1.25rem' },
  suggestHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  note: { fontSize: 11.5, color: 'var(--text-muted)', background: 'var(--bg-surface-2)', border: '0.5px solid var(--border)', borderRadius: 8, padding: '8px 10px', margin: '10px 0' },
}

// Card de resumo + preview/confirmação pra uma leva de monitores sugeridos
// (Infra ou APM). Mesmo componente serve pros dois grupos — só muda o texto,
// o endpoint de criação e (pra APM) a nota de operation padrão.
function SuggestionCard({ title, sug, entityLabel, endpoint, operationNote, open, onOpen, onClose, onConfirm, confirming }) {
  if (!sug || sug.monitorCount === 0) return null
  return (
    <div style={s.suggestCard}>
      <div style={s.suggestHead}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>
            {sug.monitorCount} monitor(es) em {entityLabel}. Idempotente: pula os que já existirem.
          </div>
        </div>
        {!open && <button style={s.btn} onClick={onOpen}>Ver monitores sugeridos ({sug.monitorCount})</button>}
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          {operationNote && <div style={s.note}>{operationNote}</div>}
          <MonitorPlanList plan={sug.plan} maxHeight={360} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
            <button style={s.btn2} onClick={onClose} disabled={confirming}>Cancelar</button>
            <button style={s.btn} onClick={() => onConfirm(endpoint)} disabled={confirming}>
              {confirming ? 'Criando…' : `Confirmar criação de ${sug.monitorCount} monitor(es)`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CoverageTable({ title, rows, metrics, rowKey, rowLabel, footnote }) {
  const complete = rows.filter(r => r.gapCount === 0).length
  return (
    <details style={{ marginTop: 16 }}>
      <summary style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, cursor: 'pointer' }}>
        {title} ({complete}/{rows.length} completos)
      </summary>
      <div style={{ overflowX: 'auto', marginTop: 10 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11.5, width: '100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-muted)', position: 'sticky', left: 0, background: 'var(--bg-surface)' }}>{rowLabel}</th>
              {metrics.map(m => (
                <th key={m.key} style={{ padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>{m.label}</th>
              ))}
              <th style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>Lacunas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r[rowKey]} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontFamily: 'var(--font-geist-mono), monospace', position: 'sticky', left: 0, background: 'var(--bg-surface)' }}>{r[rowKey]}</td>
                {metrics.map(m => (
                  <td key={m.key} style={{ padding: '6px 8px', textAlign: 'center', color: r.metrics[m.key] ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                    {r.metrics[m.key] ? '✓' : '✗'}
                  </td>
                ))}
                <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: r.gapCount === 0 ? 'var(--success)' : 'var(--danger)' }}>{r.gapCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>{footnote}</p>
      </div>
    </details>
  )
}

export default function AuditMonitorsPage() {
  const { keysConfigured, datadogSite } = useApp()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [previewKind, setPreviewKind] = useState(null) // null | 'infra' | 'apm'
  const [confirming, setConfirming] = useState(false)
  const [createResult, setCreateResult] = useState(null)

  async function run() {
    setError(''); setLoading(true); setData(null); setCreateResult(null); setPreviewKind(null)
    try {
      const r = await fetch('/api/datadog/audit-monitors')
      const json = await r.json()
      if (!r.ok) { setError(json.error || 'Falha ao auditar.'); return }
      setData(json)
    } catch (e) { setError('Falha de rede: ' + e.message) }
    finally { setLoading(false) }
  }

  async function confirmCreate(endpoint) {
    const sug = previewKind === 'infra' ? data?.suggestedInfra : data?.suggestedApm
    if (!sug?.plan?.length) return
    setConfirming(true); setCreateResult(null); setError('')
    try {
      const r = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: sug.plan }),
      })
      const json = await r.json()
      if (!r.ok) { setError(json.error || 'Falha ao criar monitores.'); return }
      setCreateResult(json)
      await run() // recalcula a cobertura após criar
    } catch (e) { setError('Falha de rede: ' + e.message) }
    finally { setConfirming(false) }
  }

  const infra = data?.coverage?.filter(c => c.group === 'Infra') || []
  const apm = data?.coverage?.filter(c => c.group === 'APM') || []

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
              <SuggestionCard
                title="Leva sugerida de monitores de Infra"
                sug={data.suggestedInfra}
                entityLabel={`${data.suggestedInfra.hostCount} host(s) em lacuna`}
                endpoint="/api/datadog/infra-monitors"
                open={previewKind === 'infra'}
                onOpen={() => setPreviewKind('infra')}
                onClose={() => setPreviewKind(null)}
                onConfirm={confirmCreate}
                confirming={confirming}
              />
              <SuggestionCard
                title="Leva sugerida de monitores de APM"
                sug={data.suggestedApm}
                entityLabel={`${data.suggestedApm.serviceCount} serviço(s) em lacuna`}
                endpoint="/api/datadog/apm-monitors"
                operationNote={data.suggestedApm.operationNote}
                open={previewKind === 'apm'}
                onOpen={() => setPreviewKind('apm')}
                onClose={() => setPreviewKind(null)}
                onConfirm={confirmCreate}
                confirming={confirming}
              />

              <p style={s.groupTitle}>Infra ({infra.filter(c => c.covered).length}/{infra.length})</p>
              <div style={s.grid}>
                {infra.map(c => {
                  const pct = coveragePercent(data.hostCoverage, c.key)
                  const band = percentBand(pct.percent)
                  return (
                    <div key={c.key} style={s.cov(band)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={s.covName}>{c.label}</span>
                        <span style={s.covStatus(band)}>{pct.percent == null ? '—' : `${pct.percent}%`}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{pct.coveredCount}/{pct.totalCount} hosts cobertos.</div>
                    </div>
                  )
                })}
              </div>

              {Array.isArray(data.hostCoverage) && data.hostCoverage.length > 0 && (
                <CoverageTable
                  title="Cobertura de Infra por host"
                  rows={data.hostCoverage}
                  metrics={data.infraMetrics}
                  rowKey="host"
                  rowLabel="Host"
                  footnote="Heurística por escopo da query: monitor com {*} cobre todos os hosts; monitor com host:<nome> cobre aquele host. Monitores escopados por outras tags (ex.: env) não são contados aqui."
                />
              )}

              <p style={s.groupTitle}>APM ({apm.filter(c => c.covered).length}/{apm.length})</p>
              <div style={s.grid}>
                {apm.map(c => {
                  const pct = coveragePercent(data.serviceCoverage, c.key)
                  const band = percentBand(pct.percent)
                  return (
                    <div key={c.key} style={s.cov(band)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={s.covName}>{c.label}</span>
                        <span style={s.covStatus(band)}>{pct.percent == null ? '—' : `${pct.percent}%`}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{pct.coveredCount}/{pct.totalCount} serviços cobertos.</div>
                    </div>
                  )
                })}
              </div>

              {Array.isArray(data.serviceCoverage) && data.serviceCoverage.length > 0 && (
                <CoverageTable
                  title="Cobertura de APM por serviço"
                  rows={data.serviceCoverage}
                  metrics={data.apmMetrics}
                  rowKey="service"
                  rowLabel="Serviço"
                  footnote="Heurística por escopo da query: monitor com {*} cobre todos os serviços; monitor com service:<nome> cobre aquele serviço. Monitor de NAMESPACE (kube_namespace:<ns>) não é reconhecido aqui mesmo cobrindo o serviço na prática — limitação conhecida, evita custo de mapear serviço→namespace."
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
