// src/components/discovery/DiscoveryCreate.tsx
'use client'

import { useRef, useState, type CSSProperties } from 'react'
import { planPreview, type PlanItem, type DiscoveryState } from '@/lib/discovery'
import { planInfraPreview, type InfraPlanItem, type InfraDiscoveryState } from '@/lib/infra'
import { planLogPreview, type LogMonitorPlanItem, type LogMonitorsState } from '@/lib/log-monitors'
import { planSloPreview, type SloPlanItem, type SloMonitorsState } from '@/lib/slo-monitors'
import { downloadResultsExcel as downloadResultsExcelShared, downloadPlanExcel, type ExcelResultEntry } from '@/lib/monitor-excel'
import type { PlanResultItem } from '@/lib/monitor-create-server'
import { planBatches, readJsonSafe } from '@/lib/create-batches'
import { sourcesFor, type DiscoveryStepProps } from './types'

type PlanEntry = PlanItem | InfraPlanItem | LogMonitorPlanItem | SloPlanItem

// Monta e baixa o Excel (só monitores CRIADOS agora — não os que já existiam
// e foram pulados, já que esses não têm id novo). Builder compartilhado com
// AuditMonitors em lib/monitor-excel.ts (mesma lógica, extraída de propósito
// pra não duplicar o boilerplate do ExcelJS — ver comentário sobre a
// vulnerabilidade MODERADA transitiva mantida de propósito lá).
async function downloadResultsExcel(plan: PlanEntry[], resultsList: ExcelResultEntry[]) {
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
  progressWrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  progressTrack: { height: 8, borderRadius: 999, background: 'var(--bg-surface-2)', border: '0.5px solid var(--border)', overflow: 'hidden' },
  progressBar: { height: '100%', background: 'var(--accent)', transition: 'width 0.25s ease' },
  warnBox: { fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' },
  btnExport: { fontSize: 13, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', alignSelf: 'flex-start' },
}

type DiscoveryCreateProps = Omit<DiscoveryStepProps, 'setConfig' | 'onNext'> & {
  // Chamado depois de uma criação bem-sucedida (ex.: pra limpar o rascunho do wizard).
  onCreated?: () => void
}

export default function DiscoveryCreate({ config, onBack, onCreated }: DiscoveryCreateProps) {
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
    if (src.dataKind === 'slo') {
      return { state, plan: planSloPreview(state as SloMonitorsState) as PlanEntry[], endpoint: '/api/datadog/slo-monitors', bodyKey: 'sloMonitors' }
    }
    return { state, plan: planPreview(state as DiscoveryState) as PlanEntry[], endpoint: '/api/datadog/service-monitors', bodyKey: 'discovery' }
  })
  const plan: PlanEntry[] = sources.flatMap(src => src.plan)
  const [phase, setPhase] = useState<'idle' | 'sheet' | 'creating'>('idle')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState('')
  // items[i] <-> plan[i]; undefined = ainda não processado (cancelado/erro no meio).
  const [outcome, setOutcome] = useState<{ items: (PlanResultItem | undefined)[]; aborted: boolean } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [sheetBusy, setSheetBusy] = useState(false)
  const cancelRef = useRef(false)
  const sheetSavedRef = useRef(false) // a planilha do plano baixa uma vez por visita a esta etapa
  const busy = phase !== 'idle'

  const planSheetName = () => `plano-monitores-${new Date().toISOString().slice(0, 10)}.xlsx`

  async function downloadPlanSheet() {
    setSheetBusy(true); setError('')
    try { await downloadPlanExcel(plan, planSheetName()); sheetSavedRef.current = true }
    catch (e) { setError('Não foi possível gerar a planilha do plano: ' + (e as Error).message) }
    finally { setSheetBusy(false) }
  }

  // Ordem: (1) planilha do plano baixa ANTES de qualquer criação; (2) lista os
  // monitores que já existem (1 vez); (3) cria em lotes pequenos — uma única
  // requisição com centenas/milhares de monitores estourava o timeout da função
  // e voltava uma resposta que não era JSON.
  async function create() {
    setError(''); setOutcome(null); cancelRef.current = false
    const items: (PlanResultItem | undefined)[] = new Array(plan.length)
    let aborted = false
    try {
      if (!sheetSavedRef.current) {
        setPhase('sheet')
        try { await downloadPlanExcel(plan, planSheetName()); sheetSavedRef.current = true }
        catch (e) { setError('Não foi possível gerar a planilha do plano, então nada foi criado: ' + (e as Error).message); return }
      }

      setPhase('creating')
      setProgress({ done: 0, total: plan.length })
      const er = await fetch('/api/datadog/existing-monitors')
      const ed = await readJsonSafe(er)
      if (!er.ok) { setError(String(ed.error || 'Falha ao listar os monitores existentes.')); return }
      const existing = new Set<string>(Array.isArray(ed.names) ? (ed.names as string[]) : [])

      const jobs: { src: (typeof sources)[number]; base: number; batch: number[] }[] = []
      let base = 0, done = 0
      for (const src of sources) {
        const { skipped, batches } = planBatches(src.plan.map(p => p.name), existing)
        for (const i of skipped) {
          const p = src.plan[i]
          items[base + i] = { kind: p.kind, service: p.service, operation: p.operation, ok: true, skipped: true, name: p.name }
        }
        done += skipped.length
        for (const batch of batches) jobs.push({ src, base, batch })
        base += src.plan.length
      }
      setProgress({ done, total: plan.length })

      try {
        for (const job of jobs) {
          if (cancelRef.current) { aborted = true; break }
          const r = await fetch(job.src.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [job.src.bodyKey]: job.src.state, batch: { only: job.batch } }),
          })
          const data = await readJsonSafe(r)
          if (!r.ok) { setError(String(data.error || 'Falha ao criar.')); aborted = true; break }
          const rs = (Array.isArray(data.results) ? data.results : []) as PlanResultItem[]
          job.batch.forEach((localIdx, k) => { items[job.base + localIdx] = rs[k] })
          done += job.batch.length
          setProgress({ done, total: plan.length })
        }
      } catch (e) { setError('Falha de rede: ' + (e as Error).message); aborted = true }
      setOutcome({ items, aborted })
      // Só limpa o rascunho do wizard se terminou: parou no meio = dá pra retomar.
      if (!aborted && items.some(x => x?.ok && !x.skipped)) onCreated?.()
    } catch (e) {
      setError('Falha de rede: ' + (e as Error).message)
      if (items.some(Boolean)) setOutcome({ items, aborted: true })
    } finally { setPhase('idle') }
  }

  async function exportExcel() {
    setExporting(true)
    try {
      await downloadResultsExcel(plan, (outcome?.items || []) as ExcelResultEntry[])
    } finally {
      setExporting(false)
    }
  }

  const done = outcome?.items.filter((x): x is PlanResultItem => !!x) || []
  const createdCount = done.filter(r => r.ok && !r.skipped).length
  const skippedCount = done.filter(r => r.skipped).length
  const failedItems = done.filter(r => !r.ok)
  const pendingCount = outcome ? outcome.items.length - done.length : 0
  const allOk = !!outcome && failedItems.length === 0 && pendingCount === 0
  // Com milhares de monitores, listar todos os ✓ trava a tela: mostra só o que falhou.
  const LIST_LIMIT = 200
  const listed = done.length > LIST_LIMIT ? failedItems : done
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div style={s.card}>
      {!outcome && !busy && (
        <>
          <p style={s.summary}>
            Pronto para criar <strong>{plan.length}</strong> monitor(es). Ao clicar em criar, a <strong>planilha do plano</strong> é
            baixada primeiro e, em seguida, os monitores são enviados ao Datadog em lotes.
          </p>
          <button style={s.btnExport} onClick={downloadPlanSheet} disabled={sheetBusy}>
            {sheetBusy ? 'Gerando…' : '📊 Baixar só a planilha do plano'}
          </button>
        </>
      )}

      {busy && (
        <div style={s.progressWrap} role="status" aria-live="polite">
          <p style={s.summary}>
            {phase === 'sheet'
              ? 'Gerando a planilha do plano…'
              : <>Criando… <strong>{progress.done}</strong> de <strong>{progress.total}</strong> ({pct}%)</>}
          </p>
          <div style={s.progressTrack} aria-hidden="true"><div style={{ ...s.progressBar, width: `${phase === 'sheet' ? 0 : pct}%` }} /></div>
          <p style={{ ...s.summary, fontSize: 11.5 }}>Mantenha esta aba aberta. Se precisar parar, os já criados são pulados na próxima vez.</p>
        </div>
      )}

      {error && <div style={s.err}>{error}</div>}

      {outcome && (
        <>
          <div style={allOk ? s.okBox : s.err}>
            {createdCount} de {outcome.items.length} monitor(es) criado(s)
            {skippedCount > 0 ? ` · ${skippedCount} já existia(m) (pulado)` : ''}
            {failedItems.length > 0 ? ` · ${failedItems.length} com erro` : ''}
            {pendingCount > 0 ? ` · ${pendingCount} não processado(s)` : ''}.
          </div>
          {pendingCount > 0 && <div style={s.warnBox}>A criação foi interrompida. Clique em &quot;Continuar&quot; para criar o que faltou — o que já foi criado é pulado.</div>}
          {done.length > LIST_LIMIT && (
            <div style={s.warnBox}>
              Lista longa: mostrando só os {failedItems.length} com erro. Os demais {done.length - failedItems.length} deram certo ou já existiam — a planilha de resultados traz os criados.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
            {listed.map((r, i) => (
              <div key={i} style={{ ...s.resItem, color: r.ok ? (r.skipped ? 'var(--text-muted)' : 'var(--success)') : 'var(--danger)', borderColor: r.ok ? (r.skipped ? 'var(--border)' : 'var(--success)') : 'var(--danger)' }}>
                {r.ok ? (r.skipped ? '↷' : '✓') : '✗'} {String(r.service)} · {String(r.operation)} · {String(r.kind)}
                {r.id ? ` · id ${r.id}` : ''}{r.skipped ? ' · já existia' : ''}{r.error ? ` · ${r.error}` : ''}
              </div>
            ))}
          </div>
          {createdCount > 0 && (
            <button style={s.btnExport} onClick={exportExcel} disabled={exporting}>
              {exporting ? 'Gerando…' : `📊 Baixar Excel dos criados (${createdCount} monitor(es))`}
            </button>
          )}
        </>
      )}

      <div style={s.actions}>
        <button style={s.btnGhost} onClick={onBack} disabled={busy}>← Voltar</button>
        {busy ? (
          <button style={s.btnGhost} onClick={() => { cancelRef.current = true }} disabled={phase === 'sheet'}>Cancelar</button>
        ) : (!outcome || !allOk) && (
          <button style={s.btn} onClick={create}>
            {outcome ? 'Continuar (pula os já criados)' : `Criar ${plan.length} monitor(es)`}
          </button>
        )}
      </div>
    </div>
  )
}
