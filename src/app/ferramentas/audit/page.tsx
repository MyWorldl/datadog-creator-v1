// src/app/ferramentas/audit/page.tsx
'use client'

import { useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useApp } from '@/context/AppContext'
import Sparkline from '@/components/Sparkline'
import MonitorPlanList from '@/components/discovery/MonitorPlanList'
import ScoreRing from '@/components/ScoreRing'
import { IconCluster } from '@/components/Icons'
import {
  coveragePercent, percentBand, type PercentBand, type CoverageItem,
  type HostCoverageRow, type ServiceCoverageRow, type SuggestedInfraResult, type SuggestedApmResult,
} from '@/lib/audit'
import type { CreatePlanResult } from '@/lib/monitor-create-server'

interface MetricRef {
  key: string
  label: string
}

interface AuditData {
  score: number
  gapCount: number
  environment: { hostCount: number; serviceCount: number; monitorCount: number }
  coverage: CoverageItem[]
  hostCoverage: HostCoverageRow[]
  serviceCoverage: ServiceCoverageRow[]
  infraMetrics: MetricRef[]
  apmMetrics: MetricRef[]
  suggestedInfra: SuggestedInfraResult
  suggestedApm: SuggestedApmResult
  history: number[]
  delta: number | null
}

// Cores por faixa de % de cobertura por entidade (host/serviço) — faixas de
// negócio calculadas em lib/audit.ts (percentBand); aqui só o mapeamento
// pra CSS var. O anel (scoreColor) usa a MESMA escala dos cards.
const bandColor = (band: PercentBand): string => band === 'red' ? 'var(--danger)' : band === 'yellow' ? 'var(--warning)' : band === 'green' ? 'var(--success)' : 'var(--text-muted)'
const scoreColor = (v: number | null | undefined): string => bandColor(percentBand(v ?? null))
const bandBg = (band: PercentBand): string => band === 'red' ? 'var(--danger-bg)' : band === 'yellow' ? 'var(--warning-bg)' : band === 'green' ? 'var(--success-bg)' : 'var(--bg-surface-2)'

const s: Record<string, CSSProperties> = {
  h1: { fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' },
  sub: { fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1.5rem' },
  // 0.5px (não 1px) — achado da auditoria: era o único de 3 arquivos com
  // borda de card diferente do resto do app (13 arquivos usam 0.5px).
  card: { background: 'var(--bg-surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', boxShadow: 'var(--card-shadow)' },
  btn: { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer' },
  btn2: { fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 16px', cursor: 'pointer' },
  err: { fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 12px', marginTop: 12 },
  ok: { fontSize: 12, color: 'var(--success)', background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 8, padding: '10px 12px', marginTop: 12 },
  statLbl: { fontSize: 11, color: 'var(--text-muted)' },
  groupTitle: { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '18px 0 8px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: 10 },
  covName: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  suggestCard: { background: 'var(--bg-base)', marginTop: 16, borderRadius: 12, border: '1px solid var(--border)', padding: '1.25rem' },
  suggestHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  note: { fontSize: 11.5, color: 'var(--text-muted)', background: 'var(--bg-surface-2)', border: '0.5px solid var(--border)', borderRadius: 8, padding: '8px 10px', margin: '10px 0' },
}

const statStyle = (c?: string): CSSProperties => ({ fontSize: 20, fontWeight: 800, color: c || 'var(--text-primary)' })
const covStyle = (band: PercentBand): CSSProperties => ({ border: `1px solid ${bandColor(band)}`, background: bandBg(band), borderRadius: 10, padding: '12px 14px' })
const covStatusStyle = (band: PercentBand): CSSProperties => ({ fontSize: 15, fontWeight: 800, color: bandColor(band) })
// Selo de "recurso em desenvolvimento" — mesmo padrão visual usado no modo
// outlier do MonitorsCreator (DiscoveryConfigureInfra.tsx).
const previewBadgeStyle: CSSProperties = { fontSize: 9.5, fontWeight: 800, color: 'var(--accent)', background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: 999, padding: '1px 7px', textTransform: 'uppercase', letterSpacing: '0.04em', marginLeft: 8 }

interface SuggestionCardProps {
  title: string
  sug: SuggestedInfraResult | SuggestedApmResult | undefined
  entityLabel: string
  endpoint: string
  operationNote?: string
  open: boolean
  onOpen: () => void
  onClose: () => void
  onConfirm: (endpoint: string) => void
  confirming: boolean
}

// Card de resumo + preview/confirmação pra uma leva de monitores sugeridos
// (Infra ou APM). Mesmo componente serve pros dois grupos — só muda o texto,
// o endpoint de criação e (pra APM) a nota de operation padrão.
function SuggestionCard({ title, sug, entityLabel, endpoint, operationNote, open, onOpen, onClose, onConfirm, confirming }: SuggestionCardProps) {
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

interface CoverageTableProps<T extends { gapCount: number; metrics: Record<string, boolean> }> {
  title: string
  rows: T[]
  metrics: MetricRef[]
  rowKey: keyof T & string
  rowLabel: string
  footnote: string
}

function CoverageTable<T extends { gapCount: number; metrics: Record<string, boolean> }>({ title, rows, metrics, rowKey, rowLabel, footnote }: CoverageTableProps<T>) {
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
              <tr key={String(r[rowKey])} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontFamily: 'var(--font-geist-mono), monospace', position: 'sticky', left: 0, background: 'var(--bg-surface)' }}>{String(r[rowKey])}</td>
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
  const { keysConfigured, datadogSite, features } = useApp()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<AuditData | null>(null)
  const [previewKind, setPreviewKind] = useState<'infra' | 'apm' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [createResult, setCreateResult] = useState<CreatePlanResult | null>(null)

  async function run() {
    // setData(null) removido de propósito (achado da auditoria): apagava o
    // painel inteiro (anel, tabelas, cards) mesmo com dado válido já na tela,
    // até a resposta nova chegar. Mantém o dado anterior visível durante o
    // reload — o botão "Reauditar" já indica loading via texto, mesmo padrão
    // que ferramentas/bulk-rename/page.tsx (loadMonitors) já usava.
    setError(''); setLoading(true); setCreateResult(null); setPreviewKind(null)
    try {
      const r = await fetch('/api/datadog/audit-monitors')
      const json = await r.json()
      if (!r.ok) { setError(json.error || 'Falha ao auditar.'); return }
      setData(json)
    } catch (e) { setError('Falha de rede: ' + (e as Error).message) }
    finally { setLoading(false) }
  }

  async function confirmCreate(endpoint: string) {
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
    } catch (e) { setError('Falha de rede: ' + (e as Error).message) }
    finally { setConfirming(false) }
  }

  const infra = data?.coverage?.filter(c => c.group === 'Infra') || []
  const apm = data?.coverage?.filter(c => c.group === 'APM') || []
  // K8s/DBM: cobertura binária de ambiente (sem lista de nós/bancos
  // descoberta pelo app) — o servidor só manda esses itens quando a flag
  // k8sDbmCoverage está ligada; sem ela, envItems vem vazio naturalmente.
  const envItems = data?.coverage?.filter(c => c.group === 'K8s' || c.group === 'DBM') || []

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
                <ScoreRing value={data.score} color={scoreColor(data.score)} />
                <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: scoreColor(data.score) }}>
                  <span style={{ fontSize: 28, fontWeight: 800 }}>{data.score}%</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>cobertura</span>
                </span>
              </div>
            ) : null}
            <div style={{ flex: 1, minWidth: 220 }}>
              {data && (
                <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: 10 }}>
                  <div><div style={statStyle()}>{data.environment.hostCount}</div><div style={s.statLbl}>hosts</div></div>
                  <div><div style={statStyle()}>{data.environment.serviceCount}</div><div style={s.statLbl}>serviços APM</div></div>
                  <div><div style={statStyle()}>{data.environment.monitorCount}</div><div style={s.statLbl}>monitores</div></div>
                  <div><div style={statStyle(scoreColor(100 - (data.gapCount / (data.coverage.length || 1)) * 100))}>{data.gapCount}</div><div style={s.statLbl}>lacunas</div></div>
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
                    <div key={c.key} style={covStyle(band)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={s.covName}>{c.label}</span>
                        <span style={covStatusStyle(band)}>{pct.percent == null ? '—' : `${pct.percent}%`}</span>
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
                    <div key={c.key} style={covStyle(band)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={s.covName}>{c.label}</span>
                        <span style={covStatusStyle(band)}>{pct.percent == null ? '—' : `${pct.percent}%`}</span>
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

              {envItems.length > 0 && (
                <>
                  <p style={{ ...s.groupTitle, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <IconCluster size={14} />
                    Kubernetes &amp; Database Monitoring ({envItems.filter(c => c.covered).length}/{envItems.length})
                    {features.k8sDbmCoverage && <span style={previewBadgeStyle}>Preview</span>}
                  </p>
                  <div style={s.grid}>
                    {envItems.map(c => {
                      const band: PercentBand = c.covered ? 'green' : 'red'
                      return (
                        <div key={c.key} style={covStyle(band)}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span style={s.covName}>{c.label}</span>
                            <span style={covStatusStyle(band)}>{c.covered ? '✓' : '✗'}</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{c.monitorCount} monitor(es) detectado(s) no ambiente.</div>
                        </div>
                      )
                    })}
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                    Cobertura no nível do ambiente (não por nó/banco — o app não descobre uma lista de nós ou
                    instâncias de banco como faz com hosts/serviços): considera coberto se existir pelo menos 1
                    monitor com a métrica-chave, em qualquer escopo.
                  </p>
                  {features.k8sDbmCoverage && envItems.some(c => !c.covered) && (
                    <Link href="/monitor?tab=k8sDbm" style={{ ...s.btn2, display: 'inline-block', textDecoration: 'none', marginTop: 4 }}>
                      Criar monitores de K8s/DBM no MonitorsCreator →
                    </Link>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
