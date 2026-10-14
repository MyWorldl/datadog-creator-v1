// src/components/discovery/MonitorPlanList.tsx
//
// Lista de itens de um plano de monitores (nome + query + mensagem),
// extraída de DiscoveryReview.tsx pra ser reaproveitada também no preview de
// "criar os que faltam" do AuditMonitors. Cada item só precisa de
// {name, query, kind} + message OU payload.message (planPreview()/
// planInfraPreview() sempre setam os dois; os planos montados diretamente em
// lib/audit.ts — buildSuggestedApm — só setam payload.message).
'use client'

import { useState, type CSSProperties } from 'react'

const s: Record<string, CSSProperties> = {
  name: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' },
  qLabel: { fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px' },
  query: { fontFamily: 'var(--font-geist-mono), monospace', fontSize: 11, color: 'var(--accent)', background: 'var(--accent-light)', border: '0.5px solid var(--accent)', borderRadius: 6, padding: '8px 10px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: '0 0 6px' },
  qHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 },
  copyBtn: { fontSize: 10.5, fontWeight: 600, color: 'var(--accent)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' },
  msg: { fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: 0 },
}

export interface MonitorPlanListItem {
  name: string
  query: string
  message?: string
  payload?: { message?: string }
}

interface MonitorPlanListProps {
  plan: MonitorPlanListItem[]
  maxHeight?: number
}

export default function MonitorPlanList({ plan, maxHeight = 420 }: MonitorPlanListProps) {
  // Índice do item cuja query acabou de ser copiada (feedback "Copiado ✓").
  const [copied, setCopied] = useState<number | null>(null)

  async function copyQuery(i: number, query: string) {
    try {
      await navigator.clipboard.writeText(query)
      setCopied(i)
      setTimeout(() => setCopied(c => (c === i ? null : c)), 1500)
    } catch {
      // Sem permissão de clipboard (http, iframe...): seleciona o texto pra Ctrl+C manual.
      window.prompt('Copie a query:', query)
    }
  }

  return (
    <div className="plan-grid" style={{ maxHeight, overflowY: 'auto' }}>
      {plan.map((m, i) => (
        <div key={i} className="plan-item" style={{ '--i': i } as CSSProperties}>
          <p style={s.name}>{m.name}</p>
          <div style={s.qHead}>
            <p style={{ ...s.qLabel, margin: 0 }}>Query</p>
            <button type="button" className="copy-btn" style={s.copyBtn} onClick={() => copyQuery(i, m.query)} aria-label={`Copiar query de ${m.name}`}>
              {copied === i ? 'Copiado ✓' : 'Copiar'}
            </button>
          </div>
          <pre style={s.query}>{m.query}</pre>
          <p style={s.qLabel}>Mensagem</p>
          <p style={s.msg}>{m.message || m.payload?.message}</p>
        </div>
      ))}
    </div>
  )
}
