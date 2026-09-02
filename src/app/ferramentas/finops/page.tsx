// src/app/ferramentas/finops/page.tsx
'use client'

import { useState, type CSSProperties } from 'react'
import { useApp } from '@/context/AppContext'
import { EST_METRICS, computeCost, fmtMoney, fmtNum } from '@/lib/finops-pricing'
import { IconWarning } from '@/components/Icons'

// Achado da auditoria: emoji ⚠️ misturado com SVG/unicode em outros lugares
// pra transmitir o mesmo "aviso" — trocado por IconWarning (Icons.tsx) nos
// avisos abaixo. Emoji decorativo (📊 no botão de exportar, se houver) não
// entra nessa troca, só o que carrega semântica de status/aviso.
const Warn = () => <span aria-hidden="true" style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 5 }}><IconWarning size={13} /></span>

const s: Record<string, CSSProperties> = {
  h1: { fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' },
  sub: { fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1.25rem' },
  card: { background: 'var(--bg-surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', boxShadow: 'var(--card-shadow)' },
  tabs: { display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  btn: { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer' },
  btnGhost: { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-surface)', border: '0.5px solid var(--border)', borderRadius: 8, padding: '10px 16px', cursor: 'pointer' },
  err: { fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 12px', marginTop: 12 },
  note: { fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 },
  warn: { fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-surface-2)', border: '0.5px solid var(--border)', borderRadius: 8, padding: '10px 12px', margin: '0 0 14px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', padding: '8px 10px', borderBottom: '1px solid var(--border)' },
  thR: { textAlign: 'right', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', padding: '8px 10px', borderBottom: '1px solid var(--border)' },
  td: { padding: '9px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' },
  tdR: { padding: '9px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  priceInput: { width: 90, textAlign: 'right', fontSize: 13, padding: '5px 8px', border: '0.5px solid var(--border)', borderRadius: 6, background: 'var(--bg-base)', color: 'var(--text-primary)' },
  label: { display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 },
  select: { width: '100%', fontSize: 13, padding: '9px 10px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)' },
  totalRow: { fontWeight: 800, fontSize: 15 },
  okBox: { fontSize: 12.5, color: 'var(--success)', background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 8, padding: '10px 12px', marginTop: 12, lineHeight: 1.5 },
}

const tabStyle = (on: boolean): CSSProperties => ({ fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', border: '0.5px solid var(--border)', background: on ? 'var(--accent)' : 'var(--bg-surface)', color: on ? '#fff' : 'var(--text-secondary)' })

const PRICING_URL = 'https://www.datadoghq.com/pricing/list/'

type Tab = 'consumo' | 'alarme' | 'custo'

interface UsageProduct {
  key: string
  label: string
  unit: string
  price: number
  per: number
  bytes: boolean
  value: number
}

interface UsageDiagnostic {
  key: string
  metric: string | null
  agg: string | null
  query: string | null
  points: number
  value: number | null
  status: string
}

interface UsageData {
  month: string
  startDate: string | null
  source: string
  warning: string | null
  products: UsageProduct[]
  missing: string[]
  diagnostics: UsageDiagnostic[] | null
}

interface AlarmResult {
  ok: boolean
  id: unknown
  name: string
  query: string
  url: string
}

export default function FinOpsPage() {
  const { keysConfigured, datadogSite } = useApp()
  const [tab, setTab] = useState<Tab>('consumo')

  // Consumo / Custo compartilham os dados carregados
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<UsageData | null>(null)
  const [prices, setPrices] = useState<Record<string, number>>({}) // key -> override de preço

  // Alarme
  const [metric, setMetric] = useState(EST_METRICS[0]?.metric || '')
  const [dev, setDev] = useState(3)
  const [win, setWin] = useState('last_4h')
  const [creating, setCreating] = useState(false)
  const [alarmMsg, setAlarmMsg] = useState<AlarmResult | null>(null)
  const [alarmErr, setAlarmErr] = useState('')

  async function loadUsage() {
    // setData(null) removido de propósito (achado da auditoria): apagava o
    // painel inteiro mesmo com dado válido já na tela, até a resposta nova
    // chegar. Mantém o dado anterior visível durante o reload — o botão já
    // indica loading via texto, mesmo padrão de ferramentas/audit/page.tsx.
    setError(''); setLoading(true)
    try {
      const r = await fetch('/api/datadog/finops')
      const json = await r.json()
      if (!r.ok) { setError(json.error || 'Falha ao carregar consumo.'); return }
      setData(json)
      const seed: Record<string, number> = {}
      for (const p of json.products) seed[p.key] = p.price
      setPrices(seed)
    } catch (e) { setError('Falha de rede: ' + (e as Error).message) }
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
    } catch (e) { setAlarmErr('Falha de rede: ' + (e as Error).message) }
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

  // Caso especial: "logsIndexed" não tem métrica estimada de fallback (não
  // existe datadog.estimated_usage.* que distinga tiers de retenção) — em
  // Sub-Org, onde usage/summary vem incompleto, essa linha simplesmente some
  // do total. Diferente de "produto não usado" (ex.: DBM sem banco no
  // ambiente): aqui HÁ ingestão de log real, então quase certamente há custo
  // de indexação/retenção também — normalmente a MAIOR linha do gasto com
  // logs — só que não sabemos quanto. Vale um aviso destacado, não um item a
  // mais na lista muda de "sem dados para: X, Y, Z".
  const logsIngestValue = data?.products.find(p => p.key === 'logsIngest')?.value ?? 0
  const logsIndexedGap = !!data && data.missing.includes('logsIndexed') && logsIngestValue > 0
  const missingExceptLogsIndexed = data ? data.missing.filter(k => k !== 'logsIndexed') : []

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={s.h1}>Datadog FinOps Insights</h1>
      <p style={s.sub}>Consumo e custo do ambiente · coleta no servidor via {datadogSite}.</p>

      <div style={s.tabs}>
        <button style={tabStyle(tab === 'consumo')} onClick={() => setTab('consumo')}>Consumo</button>
        <button style={tabStyle(tab === 'alarme')} onClick={() => setTab('alarme')}>Alerta de consumo</button>
        <button style={tabStyle(tab === 'custo')} onClick={() => setTab('custo')}>Custo estimado</button>
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
                border: '0.5px solid var(--border)',
                color: data.source === 'usage_summary' ? 'var(--success)' : 'var(--warning)',
                background: data.source === 'usage_summary' ? 'var(--success-bg)' : 'var(--warning-bg)',
              }}>
                {data.source === 'usage_summary' ? 'Usage Metering (oficial)' : 'Métricas estimadas (Sub-Org)'}
              </span>
            )}
          </div>
          {error && <div style={s.err}>{error}</div>}
          {data?.warning && <div style={s.warn}><Warn />{data.warning}</div>}
          {data && (
            <>
              <div style={{ overflowX: 'auto' }}>
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
              </div>
              {data.products.length === 0 && <p style={{ ...s.note, marginTop: 12 }}>Nenhum campo de consumo reconhecido no retorno (org sem uso ou App key sem escopo).</p>}
              {logsIndexedGap && (
                <div style={{ ...s.warn, borderColor: 'var(--danger)', color: 'var(--danger)', marginTop: 12 }}>
                  <Warn /><strong>Logs — Indexados (15d) não entra no total</strong>: seu ambiente ingere logs ({fmtNum(logsIngestValue / 1e9)} GB no período), então quase certamente há custo de indexação/retenção também — normalmente a maior parcela do gasto com logs. Não existe métrica de uso estimado que a Datadog exponha para esse produto em Sub-Org, então ele fica de fora do consumo e do custo estimado abaixo até você conferir o valor real no Datadog (Plan &amp; Usage → Logs).
                </div>
              )}
              {missingExceptLogsIndexed.length > 0 && <p style={{ ...s.note, marginTop: 10 }}>Sem dados para: {missingExceptLogsIndexed.join(', ')} (produto não usado ou campo ausente no seu plano).</p>}
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
          <div style={{ ...s.warn, marginBottom: 14 }}>
            <Warn /><strong>Isto não é um alarme de gasto em dólares</strong> — não usa os preços da aba Custo nem tem
            threshold em US$. Cria um monitor de <strong>anomaly detection</strong> sobre o <strong>volume bruto</strong> de
            uso (hosts, GB, eventos…) da métrica de licenciamento escolhida, com direção <strong>ambos</strong> —
            alarma quando esse volume sai do padrão histórico, seja aumento ou queda. Útil para pegar um pico de
            consumo antes de virar surpresa na fatura, mas não converte isso em R$/US$.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={s.label} htmlFor="finops-metric">Métrica de licenciamento (uso estimado)</label>
              <input id="finops-metric" list="est-metrics" style={s.select} value={metric} onChange={e => setMetric(e.target.value)} placeholder="datadog.estimated_usage.hosts" />
              <datalist id="est-metrics">
                {EST_METRICS.map(m => <option key={m.metric} value={m.metric}>{m.label}</option>)}
              </datalist>
            </div>
            <div>
              <label style={s.label} htmlFor="finops-dev">Desvios (bounds)</label>
              <input id="finops-dev" type="number" min="1" max="10" style={s.select} value={dev} onChange={e => setDev(Number(e.target.value))} />
            </div>
            <div>
              <label style={s.label} htmlFor="finops-window">Alert window</label>
              <select id="finops-window" style={s.select} value={win} onChange={e => setWin(e.target.value)}>
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
              Monitor criado: <strong>{alarmMsg.name}</strong> (id {String(alarmMsg.id)}).<br />
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
            <Warn />Estimativa por <strong>preço de lista</strong> (anual), <strong>linear</strong> (mesmo $/unidade em qualquer volume). O preço real contratado varia com committed use, descontos e blocos degressivos por volume (mais visível em Custom Metrics) — por isso os preços são <strong>editáveis</strong>. Ajuste-os aos do seu contrato. Fonte: <a href={PRICING_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>pricing/list</a>.
          </div>
          {logsIndexedGap && (
            <div style={{ ...s.warn, borderColor: 'var(--danger)', color: 'var(--danger)' }}>
              <Warn /><strong>Total incompleto</strong>: não inclui Logs — Indexados (15d) — sem dado disponível nesta org, mas há ingestão de log real ({fmtNum(logsIngestValue / 1e9)} GB), então o custo real de logs é maior que o mostrado abaixo.
            </div>
          )}
          {!data ? (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px' }}>Carregue o consumo primeiro para calcular o custo.</p>
              <button style={s.btnGhost} onClick={() => setTab('consumo')}>Ir para Consumo</button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
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
                  <td style={{ ...s.td, ...s.totalRow, ...(logsIndexedGap ? { color: 'var(--danger)' } : {}) }} colSpan={4}>
                    Total estimado / mês{logsIndexedGap ? ' (incompleto — falta Logs indexados)' : ''}
                  </td>
                  <td style={{ ...s.tdR, ...s.totalRow, ...(logsIndexedGap ? { color: 'var(--danger)' } : {}) }}>{fmtMoney(totalCost)}</td>
                </tr>
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
