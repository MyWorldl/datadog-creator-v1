// src/components/StepReview.jsx
// Step 4 — Revisar configuração e JSON antes de criar

'use client'

import { useState } from 'react'
import { useApp } from '@/context/AppContext'
import DiscoveryReview from '@/components/discovery/DiscoveryReview'

const s = {
  card: {
    border: '0.5px solid var(--border)',
    borderRadius: 12,
    overflow: 'hidden',
    background: 'var(--bg-surface)',
  },
  section: {
    padding: '1rem 1.25rem',
    borderBottom: '0.5px solid var(--bg-surface-2)',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text-muted)',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    padding: '6px 0',
    borderBottom: '0.5px solid var(--bg-surface-2)',
  },
  rowLabel: { fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 },
  rowValue: {
    fontSize: 13,
    color: 'var(--text-primary)',
    textAlign: 'right',
    wordBreak: 'break-all',
  },
  rowValueMono: {
    fontSize: 12,
    color: 'var(--accent)',
    textAlign: 'right',
    wordBreak: 'break-all',
    fontFamily: 'var(--font-mono, monospace)',
  },
  queryBox: {
    background: 'var(--accent-light)',
    padding: '10px 12px',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 11,
    color: 'var(--accent)',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  jsonBox: {
    background: '#1e1e2e',
    padding: '12px 14px',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 11,
    color: '#cdd6f4',
    lineHeight: 1.6,
    whiteSpace: 'pre',
    overflowX: 'auto',
    maxHeight: 260,
    overflowY: 'auto',
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 1.25rem',
  },
  btnPrimary: {
    fontSize: 13, fontWeight: 500, color: '#fff',
    background: 'var(--accent)', border: 'none',
    borderRadius: 8, padding: '9px 20px', cursor: 'pointer',
  },
  btnGhost: {
    fontSize: 13, color: 'var(--text-secondary)',
    background: 'none', border: '0.5px solid var(--border)',
    borderRadius: 8, padding: '9px 18px', cursor: 'pointer',
  },
  btnCopy: {
    fontSize: 11, color: 'var(--text-muted)',
    background: 'none', border: '0.5px solid var(--border)',
    borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
  },
}

function buildQuery(config) {
  const {
    metric = '', filter = '*', algorithm = 'agile',
    deviations = 2, direction = 'both',
    alertWindow = 'last_15m', queryWindow = 'last_4h',
    seasonality = 'daily',
  } = config
  const sp = algorithm !== 'basic' ? `, seasonality='${seasonality}'` : ''
  return (
    `avg(${queryWindow}):anomalies(avg:${metric}{${filter}}, ` +
    `'${algorithm}', ${deviations}, direction='${direction}', ` +
    `alert_window='${alertWindow}', interval=60, ` +
    `count_default_zero='true'${sp}) >= 1`
  )
}

function buildPayload(config) {
  return {
    type: 'query alert',
    query: buildQuery(config),
    name: config.name || `Anomaly — ${config.metric}`,
    message: config.message || '',
    tags: config.tags || [],
    priority: config.priority || 3,
    options: {
      threshold_windows: {
        alert_window: config.alertWindow,
        recovery_window: 'last_15m',
      },
      thresholds: { critical: 1.0 },
      notify_no_data: config.notifyNoData || false,
      notify_audit: false,
      require_full_window: false,
    },
  }
}

function SummaryRow({ label, value, mono = false }) {
  return (
    <div style={s.row}>
      <span style={s.rowLabel}>{label}</span>
      <span style={mono ? s.rowValueMono : s.rowValue}>{value}</span>
    </div>
  )
}

export default function StepReview({ config, onNext, onBack }) {
  const { datadogSite } = useApp()
  const [copied, setCopied] = useState(false)
  const [showJson, setShowJson] = useState(false)

  if (config.mode === 'discovery')
    return <DiscoveryReview config={config} onNext={onNext} onBack={onBack} />

  const payload = buildPayload(config)
  const json    = JSON.stringify(payload, null, 2)
  const query   = buildQuery(config)

  async function copyJson() {
    try { await navigator.clipboard.writeText(json) }
    catch {
      const el = document.createElement('textarea')
      el.value = json
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <div style={s.card}>

        {/* Conexão */}
        <div style={s.section}>
          <p style={s.sectionTitle}>Conexão</p>
          <SummaryRow label="Site"        value={datadogSite} mono />
          <SummaryRow label="Credenciais" value="definidas na sessão (cookie httpOnly)" />
        </div>

        {/* Anomaly Detection */}
        <div style={s.section}>
          <p style={s.sectionTitle}>Anomaly Detection</p>
          <SummaryRow label="Métrica"     value={`avg:${config.metric}{${config.filter}}`} mono />
          <SummaryRow label="Algoritmo"   value={config.algorithm} />
          <SummaryRow label="Sazonalidade" value={config.algorithm === 'basic' ? 'n/a' : config.seasonality} />
          <SummaryRow label="Desvios"     value={`${config.deviations} desvios padrão`} />
          <SummaryRow label="Direção"     value={config.direction} />
          <SummaryRow label="Alert window" value={config.alertWindow} mono />
          <SummaryRow label="Query window" value={config.queryWindow} mono />
        </div>

        {/* Notificação */}
        <div style={s.section}>
          <p style={s.sectionTitle}>Notificação</p>
          <SummaryRow label="Nome"       value={config.name || `Anomaly — ${config.metric}`} />
          <SummaryRow label="Prioridade" value={`P${config.priority}`} />
          <SummaryRow label="Tags"       value={(config.tags || []).join(', ') || '—'} />
          <SummaryRow label="Sem dados"  value={config.notifyNoData ? 'Notificar' : 'Ignorar'} />
        </div>

        {/* Query */}
        <div style={{ borderBottom: '0.5px solid var(--bg-surface-2)' }}>
          <div style={{ ...s.section, paddingBottom: 8 }}>
            <p style={s.sectionTitle}>Query gerada</p>
          </div>
          <pre style={s.queryBox}>{query}</pre>
        </div>

        {/* JSON completo (expansível) */}
        <div>
          <div style={{
            ...s.section,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            userSelect: 'none',
            borderBottom: showJson ? '0.5px solid var(--bg-surface-2)' : 'none',
          }}
            onClick={() => setShowJson(v => !v)}
          >
            <p style={{ ...s.sectionTitle, margin: 0 }}>Payload JSON completo</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {showJson && (
                <button
                  style={s.btnCopy}
                  onClick={e => { e.stopPropagation(); copyJson() }}
                >
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              )}
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {showJson ? '▲ fechar' : '▼ expandir'}
              </span>
            </div>
          </div>
          {showJson && (
            <pre style={s.jsonBox}>{json}</pre>
          )}
        </div>

        {/* Ações */}
        <div style={s.actions}>
          <button style={s.btnGhost} onClick={onBack}>← Voltar</button>
          <button style={s.btnPrimary} onClick={onNext}>
            Criar monitor no Datadog →
          </button>
        </div>

      </div>
    </div>
  )
}
