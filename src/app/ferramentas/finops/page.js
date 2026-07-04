// src/app/ferramentas/finops/page.js
'use client'

import { useState } from 'react'
import { useApp } from '@/context/AppContext'
import { EST_METRICS, computeCost, fmtMoney, fmtNum } from '@/lib/finops-pricing'

const s = {
  h1: { fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' },
  sub: { fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1.25rem' },
  card: { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem', boxShadow: 'var(--card-shadow)' },
  tabs: { display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  tab: (on) => ({ fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border)', background: on ? 'var(--accent)' : 'var(--bg-surface)', color: on ? '#fff' : 'var(--text-secondary)' }),
  btn: { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer' },
  btnGhost: { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', cursor: 'pointer' },
  err: { fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 12px', marginTop: 12 },
  note: { fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 },
  warn: { fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', margin: '0 0 14px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', padding: '8px 10px', borderBottom: '1px solid var(--border)' },
  thR: { textAlign: 'right', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', padding: '8px 10px', borderBottom: '1px solid var(--border)' },
  td: { padding: '9px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' },
  tdR: { padding: '9px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  priceInput: { width: 90, textAlign: 'right', fontSize: 13, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-base)', color: 'var(--text-primary)' },
  label: { display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 },
  select: { width: '100%', fontSize: 13, padding: '9px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)' },
  totalRow: { fontWeight: 800, fontSize: 15 },
  okBox: { fontSize: 12.5, color: 'var(--success)', background: '#e6f4ef', border: '1px solid var(--success)', borderRadius: 8, padding: '10px 12px', marginTop: 12, lineHeight: 1.5 },
}

const PRICING_URL = 'https://www.datadoghq.com/pricing/list/'

export default function FinOpsPage() {
  const { keysConfigured, datadogSite } = useApp()
  const [tab, setTab] = useState('consumo')

  // Consumo / Custo compartilham os dados carregados
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [prices, setPrices] = useState({}) // key -> override de preço

  // Alarme
  const [metric, setMetric] = useState(EST_METRICS[0]?.metric || '')
  const [dev, setDev] = useState(3)
  const [win, setWin] = useState('last_4h')
  const [creating, setCreating] = useState(false)
  const [alarmMsg, setAlarmMsg] = useState(null)
  const [alarmErr, setAlarmErr] = useState('')

  async function loadUsage() {
    setError(''); setLoading(true); setData(null)
    try {
      const r = await fetch('/api/datadog/finops')
      const json = await r.json()
      if (!r.ok) { setError(json.error || 'Falha ao carregar consumo.'); return }
      setData(json)
      const seed = {}
      for (const p of json.products) seed[p.key] = p.price
      setPrices(seed)
    } catch (e) { setError('Falha de rede: ' + e.message) }
    finally { setLoading(false) }
  }

  async function createAlarm() {
    setAlarmErr(''); setAlarmMsg(null); setCreating(true)
    try {
      const r = await fetch('/api/datadog/finops/monitor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metric, deviations: dev, alertWindow: win }),
      })
      const json = await r.json()
      if (!r.ok) { setAlarmErr(json.error || 'Falha ao criar o monitor.'); return }
      setAlarmMsg(json)
    } catch (e) { setAlarmErr('Falha de rede: ' + e.message) }
    finally { setCreating(false) }
  }

  if (!keysConfigured) {
    return (
      <div style={{ maxWidth: 900 }}>
        <h1 style={s.h1}>Datadog FinOps Insights</h1>
        <p style={s.sub}>Consumo e custo do ambiente Datadog.</p>
        <div style={s.card}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Conecte a API e a App Key em Configurações para ver o consumo. A leitura de uso exige o escopo <code>usage_read</code>.
          </p>
        </div>
      </div>
    )
  }

  const totalCost = data ? data.products.reduce((acc, p) => {
    const c = computeCost(p.value, prices[p.key] ?? p.price, p.per, p.bytes)
    return acc + (c || 0)
  }, 0) : 0

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={s.h1}>Datadog FinOps Insights</h1>
      <p style={s.sub}>Consumo e custo do ambiente · coleta no servidor via {datadogSite}.</p>

      <div style={s.tabs}>
        <button style={s.tab(tab === 'consumo')} onClick={() => setTab('consumo')}>Consumo</button>
        <button style={s.tab(tab === 'alarme')} onClick={() => setTab('alarme')}>Análise &amp; Alarme</button>
        <button style={s.tab(tab === 'custo')} onClick={() => setTab('custo')}>Custo estimado</button>
      </div>

      {/* ── CONSUMO ── */}
      {tab === 'consumo' && (
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
            <button style={s.btn} onClick={loadUsage} disabled={loading}>
              {loading ? 'Carregando…' : data ? 'Recarregar' : 'Carregar consumo'}
            </button>
            {data && <span style={s.note}>Mês {data.month}{data.startDate ? ` · desde ${data.startDate.slice(0, 10)}` : ''}</span>}
            {data && (
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999,
                border: '1px solid var(--border)',
                color: data.source === 'usage_summary' ? 'var(--success)' : 'var(--warning)',
                background: data.source === 'usage_summary' ? 'var(--success-bg)' : 'var(--warning-bg)',
              }}>
                {data.source === 'usage_summary' ? 'Usage Metering (oficial)' : 'Métricas estimadas (Sub-Org)'}
              </span>
            )}
          </div>
          {error && <div style={s.err}>{error}</div>}
          {data?.warning && <div style={s.warn}>⚠️ {data.warning}</div>}
          {data && (
            <>
              <table style={s.table}>
                <thead>
                  <tr><th style={s.th}>Produto (licenciamento)</th><th style={s.thR}>Consumo</th><th style={s.th}>Unidade</th></tr>
                </thead>
                <tbody>
                  {data.products.map(p => (
                    <tr key={p.key}>
                      <td style={s.td}>{p.label}</td>
                      <td style={s.tdR}>{fmtNum(p.bytes ? p.value / 1e9 : p.value)}</td>
                      <td style={s.td}>{p.bytes ? 'GB' : p.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.products.length === 0 && <p style={{ ...s.note, marginTop: 12 }}>Nenhum campo de consumo reconhecido no retorno (org sem uso ou App key sem escopo).</p>}
              {data.missing.length > 0 && <p style={{ ...s.note, marginTop: 10 }}>Sem dados para: {data.missing.join(', ')} (produto não usado ou campo ausente no seu plano).</p>}
              {Array.isArray(data.diagnostics) && data.diagnostics.length > 0 && (
                <details style={{ marginTop: 16 }}>
                  <summary style={{ fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>Diagnóstico das métricas (query, pontos e valor)</summary>
                  <div style={{ overflowX: 'auto', marginTop: 10 }}>
                    <table style={{ ...s.table, fontSize: 11.5 }}>
                      <thead>
                        <tr>
                          <th style={s.th}>Métrica</th><th style={s.th}>Agg</th>
                          <th style={s.thR}>Pontos</th><th style={s.thR}>Valor</th><th style={s.th}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.diagnostics.map(dg => (
                          <tr key={dg.key} title={dg.query || ''}>
                            <td style={{ ...s.td, fontFamily: 'var(--font-geist-mono), monospace' }}>{dg.metric || '—'}</td>
                            <td style={s.td}>{dg.agg || '—'}</td>
                            <td style={s.tdR}>{dg.points}</td>
                            <td style={s.tdR}>{dg.value == null ? '—' : fmtNum(dg.value)}</td>
                            <td style={{ ...s.td, color: dg.status === 'ok' ? 'var(--success)' : 'var(--text-muted)' }}>{dg.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p style={{ ...s.note, marginTop: 8 }}>Passe o mouse sobre a linha para ver a query completa enviada à Metrics API.</p>
                  </div>
                </details>
              )}
            </>
          )}
        </div>
      )}

      {/* ── ANÁLISE & ALARME ── */}
      {tab === 'alarme' && (
        <div style={s.card}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 14px' }}>
            Cria um monitor de <strong>anomaly detection</strong> sobre a métrica de licenciamento escolhida, com
            direção <strong>ambos</strong> — alarma tanto <strong>aumento</strong> quanto <strong>queda</strong> anormal do consumo.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={s.label}>Métrica de licenciamento (uso estimado)</label>
              <input list="est-metrics" style={s.select} value={metric} onChange={e => setMetric(e.target.value)} placeholder="datadog.estimated_usage.hosts" />
              <datalist id="est-metrics">
                {EST_METRICS.map(m => <option key={m.metric} value={m.metric}>{m.label}</option>)}
              </datalist>
            </div>
            <div>
              <label style={s.label}>Desvios (bounds)</label>
              <input type="number" min="1" max="10" style={s.select} value={dev} onChange={e => setDev(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Alert window</label>
              <select style={s.select} value={win} onChange={e => setWin(e.target.value)}>
                <option value="last_15m">last_15m</option>
                <option value="last_30m">last_30m</option>
                <option value="last_1h">last_1h</option>
                <option value="last_4h">last_4h</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <button style={s.btn} onClick={createAlarm} disabled={creating || !metric}>
              {creating ? 'Criando…' : 'Criar monitor de anomalia (direção: ambos)'}
            </button>
          </div>
          {alarmErr && <div style={s.err}>{alarmErr}</div>}
          {alarmMsg && (
            <div style={s.okBox}>
              Monitor criado: <strong>{alarmMsg.name}</strong> (id {alarmMsg.id}).<br />
              <span style={{ fontFamily: 'var(--font-geist-mono), monospace', fontSize: 11 }}>{alarmMsg.query}</span>
            </div>
          )}
          <p style={{ ...s.note, marginTop: 12 }}>
            Precisa de ~3 semanas de histórico (sazonalidade weekly) para o baseline. O trigger_window casa com a alert window, conforme a doc de anomaly.
          </p>
        </div>
      )}

      {/* ── CUSTO ── */}
      {tab === 'custo' && (
        <div style={s.card}>
          <div style={s.warn}>
            ⚠️ Estimativa por <strong>preço de lista</strong> (anual). O preço real contratado varia com committed use e descontos — por isso os preços são <strong>editáveis</strong>. Ajuste-os aos do seu contrato. Fonte: <a href={PRICING_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>pricing/list</a>.
          </div>
          {!data ? (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px' }}>Carregue o consumo primeiro para calcular o custo.</p>
              <button style={s.btnGhost} onClick={() => setTab('consumo')}>Ir para Consumo</button>
            </div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Produto</th>
                  <th style={s.thR}>Consumo</th>
                  <th style={s.thR}>Preço lista (US$)</th>
                  <th style={s.th}>Base</th>
                  <th style={s.thR}>Custo/mês (est.)</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map(p => {
                  const price = prices[p.key] ?? p.price
                  const cost = computeCost(p.value, price, p.per, p.bytes)
                  const baseLabel = p.bytes ? 'por GB' : p.per === 1 ? `por ${p.unit.replace(/\s*\(p99\)/, '')}` : `por ${fmtNum(p.per)} ${p.unit}`
                  return (
                    <tr key={p.key}>
                      <td style={s.td}>{p.label}</td>
                      <td style={s.tdR}>{fmtNum(p.bytes ? p.value / 1e9 : p.value)} {p.bytes ? 'GB' : ''}</td>
                      <td style={s.tdR}>
                        <input style={s.priceInput} type="number" step="0.01" min="0" value={price}
                          onChange={e => setPrices({ ...prices, [p.key]: Number(e.target.value) })} />
                      </td>
                      <td style={s.td}>{baseLabel}</td>
                      <td style={s.tdR}>{fmtMoney(cost)}</td>
                    </tr>
                  )
                })}
                <tr>
                  <td style={{ ...s.td, ...s.totalRow }} colSpan={4}>Total estimado / mês</td>
                  <td style={{ ...s.tdR, ...s.totalRow }}>{fmtMoney(totalCost)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
