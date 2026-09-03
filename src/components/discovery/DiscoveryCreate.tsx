// src/components/discovery/DiscoveryCreate.tsx
'use client'

import { useState, type CSSProperties } from 'react'
import { planPreview, type PlanItem, type DiscoveryState } from '@/lib/discovery'
import { planInfraPreview, type InfraPlanItem, type InfraDiscoveryState } from '@/lib/infra'
import { planLogPreview, type LogMonitorPlanItem, type LogMonitorsState } from '@/lib/log-monitors'
import { downloadResultsExcel as downloadResultsExcelShared } from '@/lib/monitor-excel'
import type { CreatePlanResult, PlanResultItem } from '@/lib/monitor-create-server'
import { sourcesFor, type DiscoveryStepProps } from './types'

type PlanEntry = PlanItem | InfraPlanItem | LogMonitorPlanItem

// Monta e baixa o Excel (só monitores CRIADOS agora — não os que já existiam
// e foram pulados, já que esses não têm id novo). Builder compartilhado com
// AuditMonitors em lib/monitor-excel.ts (mesma lógica, extraída de propósito
// pra não duplicar o boilerplate do ExcelJS — ver comentário sobre a
// vulnerabilidade MODERADA transitiva mantida de propósito lá).
async function downloadResultsExcel(plan: PlanEntry[], resultsList: PlanResultItem[]) {
  await downloadResultsExcelShared(plan, resultsList, `monitores-datadog-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

const s: Record<string, CSSProperties> = {
  card: { border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 14 },
  summary: { fontSize: 13, color: 'var(--text-secondary)' },
  err: { fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px' },
  okBox: { fontSize: 13, color: 'var(--success)', background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 8, padding: '10px 12px' },
  resItem: { fontSize: 12, padding: '8px 10px', borderRadius: 6, border: '0.5px solid var(--border)', fontFamily: 'var(--font-geist-mono), monospace', wordBreak: 'break-all' },
  actions: { display: 'flex', justifyContent: 'space-between', paddingTop: 4 },
  btn: { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px 20px', cursor: 'pointer' },
  btnGhost: { fontSize: 13, color: 'var(--text-secondary)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  btnExport: { fontSize: 13, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', alignSelf: 'flex-start' },
}

type DiscoveryCreateProps = Omit<DiscoveryStepProps, 'setConfig' | 'onNext'>

export default function DiscoveryCreate({ config, onBack }: DiscoveryCreateProps) {
  // resourceType 'k8sDbm' tem 2 fontes (k8sInfra + k8sDiscovery) que precisam
  // de 2 requisições (endpoints diferentes) — 'services'/'infra' seguem com
  // 1 fonte só, comportamento idêntico a antes.
  const sources = sourcesFor(config.resourceType).map(src => {
    const state = config[src.stateKey]
    if (src.dataKind === 'infra') {
      return { state, plan: planInfraPreview(state as InfraDiscoveryState) as PlanEntry[], endpoint: '/api/datadog/infra-monitors', bodyKey: 'infra' }
    }
    if (src.dataKind === 'log') {
      return { state, plan: planLogPreview(state as LogMonitorsState) as PlanEntry[], endpoint: '/api/datadog/log-monitors', bodyKey: 'logMonitors' }
    }
    return { state, plan: planPreview(state as DiscoveryState) as PlanEntry[], endpoint: '/api/datadog/service-monitors', bodyKey: 'discovery' }
  })
  const plan: PlanEntry[] = sources.flatMap(src => src.plan)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<CreatePlanResult | null>(null)
  const [exporting, setExporting] = useState(false)

  async function create() {
    setError(''); setResults(null); setCreating(true)
    try {
      const merged: PlanResultItem[] = []
      let created = 0, skipped = 0, total = 0
      for (const src of sources) {
        if (src.plan.length === 0) continue
        const r = await fetch(src.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [src.bodyKey]: src.state }),
        })
        const data = await r.json()
        if (!r.ok) { setError(data.error || 'Falha ao criar.'); return }
        merged.push(...(data.results || []))
        created += data.created || 0
        skipped += data.skipped || 0
        total += data.total || 0
      }
      setResults({ created, skipped, total, results: merged })
    } catch (e) { setError('Falha de rede: ' + (e as Error).message) }
    finally { setCreating(false) }
  }

  async function exportExcel() {
    setExporting(true)
    try {
      await downloadResultsExcel(plan, results!.results)
    } finally {
      setExporting(false)
    }
  }

  const createdCount = results?.results?.filter(r => r.ok && !r.skipped).length || 0

  return (
    <div style={s.card}>
      {!results && (
        <p style={s.summary}>
          Pronto para criar <strong>{plan.length}</strong> monitor(es). Clique abaixo para enviar ao Datadog.
        </p>
      )}

      {error && <div style={s.err}>{error}</div>}

      {results && (
        <>
          <div style={results.results.every(r => r.ok) ? s.okBox : s.err}>
            {results.created} de {results.total} monitor(es) criado(s)
            {typeof results.skipped === 'number' && results.skipped > 0 ? ` · ${results.skipped} já existia(m) (pulado)` : ''}.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
            {results.results.map((r, i) => (
              <div key={i} style={{ ...s.resItem, color: r.ok ? (r.skipped ? 'var(--text-muted)' : 'var(--success)') : 'var(--danger)', borderColor: r.ok ? (r.skipped ? 'var(--border)' : 'var(--success)') : 'var(--danger)' }}>
                {r.ok ? (r.skipped ? '↷' : '✓') : '✗'} {String(r.service)} · {String(r.operation)} · {String(r.kind)}
                {r.id ? ` · id ${r.id}` : ''}{r.skipped ? ' · já existia' : ''}{r.error ? ` · ${r.error}` : ''}
              </div>
            ))}
          </div>
          {createdCount > 0 && (
            <button style={s.btnExport} onClick={exportExcel} disabled={exporting}>
              {exporting ? 'Gerando…' : `📊 Baixar Excel (${createdCount} monitor(es))`}
            </button>
          )}
        </>
      )}

      <div style={s.actions}>
        <button style={s.btnGhost} onClick={onBack} disabled={creating}>← Voltar</button>
        {!results && (
          <button style={s.btn} onClick={create} disabled={creating}>
            {creating ? 'Criando…' : `Criar ${plan.length} monitor(es)`}
          </button>
        )}
      </div>
    </div>
  )
}
