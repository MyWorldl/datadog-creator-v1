// src/components/discovery/MonitorPlanList.jsx
//
// Lista de itens de um plano de monitores (nome + query + mensagem),
// extraída de DiscoveryReview.jsx pra ser reaproveitada também no preview de
// "criar os que faltam" do AuditMonitors. Cada item só precisa de
// {name, query, kind} + message OU payload.message (planPreview()/
// planInfraPreview() sempre setam os dois; os planos montados diretamente em
// lib/audit.ts — buildSuggestedApm — só setam payload.message).
'use client'

const s = {
  item: { border: '0.5px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: 'var(--bg-surface-2)' },
  name: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' },
  qLabel: { fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px' },
  query: { fontFamily: 'var(--font-geist-mono), monospace', fontSize: 11, color: 'var(--accent)', background: 'var(--accent-light)', border: '0.5px solid var(--accent)', borderRadius: 6, padding: '8px 10px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: '0 0 6px' },
  msg: { fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: 0 },
}

export default function MonitorPlanList({ plan, maxHeight = 420 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight, overflowY: 'auto' }}>
      {plan.map((m, i) => (
        <div key={i} style={s.item}>
          <p style={s.name}>{m.name}</p>
          <p style={s.qLabel}>Query</p>
          <pre style={s.query}>{m.query}</pre>
          <p style={s.qLabel}>Mensagem</p>
          <p style={s.msg}>{m.message || m.payload?.message}</p>
        </div>
      ))}
    </div>
  )
}
