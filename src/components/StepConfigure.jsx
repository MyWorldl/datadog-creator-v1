// src/components/StepConfigure.jsx
// Step 2 — Configurar o Anomaly Detection Monitor

'use client'

import { useState } from 'react'

const s = {
  card: {
    border: '0.5px solid var(--border)',
    borderRadius: 12,
    padding: '1.25rem',
    background: 'var(--bg-surface)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  label: {
    display: 'block',
    fontSize: 13,
    color: 'var(--text-secondary)',
    marginBottom: 6,
    fontWeight: 500,
  },
  hint: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 },
  input: {
    width: '100%',
    fontSize: 13,
    padding: '9px 12px',
    border: '0.5px solid var(--border)',
    borderRadius: 8,
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    outline: 'none',
    fontFamily: 'var(--font-mono, monospace)',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    fontSize: 13,
    padding: '9px 12px',
    border: '0.5px solid var(--border)',
    borderRadius: 8,
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    outline: 'none',
    boxSizing: 'border-box',
  },
  row2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  row3: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 12,
  },
  queryBox: {
    background: 'var(--accent-light)',
    border: '0.5px solid var(--accent)',
    borderRadius: 8,
    padding: '10px 12px',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 11,
    color: 'var(--accent)',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    paddingTop: 4,
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
}

function buildQueryPreview(config) {
  const {
    metric = '', filter = '*', algorithm = 'agile',
    deviations = 2, direction = 'both',
    alertWindow = 'last_15m', queryWindow = 'last_4h',
    seasonality = 'daily',
  } = config
  const sp = algorithm !== 'basic' ? `, seasonality='${seasonality}'` : ''
  return (
    `avg(${queryWindow}):anomalies(\n` +
    `  avg:${metric}{${filter}},\n` +
    `  '${algorithm}', ${deviations},\n` +
    `  direction='${direction}',\n` +
    `  alert_window='${alertWindow}',\n` +
    `  interval=60, count_default_zero='true'` +
    `${sp}\n) >= 1`
  )
}

export default function StepConfigure({ config, setConfig, onNext, onBack }) {
  const [errors, setErrors] = useState({})

  function validate() {
    const e = {}
    if (!config.metric || config.metric.trim().length === 0)
      e.metric = 'Informe o nome da métrica.'
    if (!config.filter || config.filter.trim().length === 0)
      e.filter = 'Informe o filtro (use * para todos).'
    return e
  }

  function handleNext() {
    const e = validate()
    if (Object.keys(e).length > 0) { setErrors(e); return }
    setErrors({})
    onNext()
  }

  function set(key) {
    return e => setConfig(c => ({ ...c, [key]: e.target.value }))
  }

  return (
    <div style={s.card}>

      {/* Métrica + Filtro */}
      <div style={s.row2}>
        <div>
          <label style={s.label}>Métrica</label>
          <input
            style={s.input}
            value={config.metric}
            onChange={set('metric')}
            placeholder="system.cpu.user"
          />
          {errors.metric && (
            <p style={{ ...s.hint, color: 'var(--danger)', marginTop: 6 }}>{errors.metric}</p>
          )}
          <p style={s.hint}>Nome exato da métrica no Datadog.</p>
        </div>
        <div>
          <label style={s.label}>Filtro de escopo</label>
          <input
            style={s.input}
            value={config.filter}
            onChange={set('filter')}
            placeholder="env:prod ou *"
          />
          {errors.filter && (
            <p style={{ ...s.hint, color: 'var(--danger)', marginTop: 6 }}>{errors.filter}</p>
          )}
          <p style={s.hint}>Use * para todos os hosts.</p>
        </div>
      </div>

      {/* Algoritmo + Sazonalidade + Desvios */}
      <div style={s.row3}>
        <div>
          <label style={s.label}>Algoritmo</label>
          <select style={s.select} value={config.algorithm} onChange={set('algorithm')}>
            <option value="basic">basic</option>
            <option value="agile">agile</option>
            <option value="robust">robust</option>
          </select>
          <p style={s.hint}>agile = reage rápido a mudanças.</p>
        </div>
        <div>
          <label style={s.label}>Sazonalidade</label>
          <select
            style={s.select}
            value={config.seasonality}
            onChange={set('seasonality')}
            disabled={config.algorithm === 'basic'}
          >
            <option value="hourly">hourly</option>
            <option value="daily">daily</option>
            <option value="weekly">weekly</option>
          </select>
          <p style={s.hint}>
            {config.algorithm === 'basic'
              ? 'basic não usa sazonalidade.'
              : 'weekly requer 3 sem. de histórico.'}
          </p>
        </div>
        <div>
          <label style={s.label}>anomalies (bounds)</label>
          <select style={s.select} value={config.deviations} onChange={set('deviations')}>
            <option value="1">1 — sensível</option>
            <option value="2">2 — balanceado</option>
            <option value="3">3 — conservador</option>
          </select>
          <p style={s.hint}>2 é o ponto de partida ideal.</p>
        </div>
      </div>

      {/* Direção + Alert window + Query window */}
      <div style={s.row3}>
        <div>
          <label style={s.label}>Direção</label>
          <select style={s.select} value={config.direction} onChange={set('direction')}>
            <option value="both">both — acima e abaixo</option>
            <option value="above">above — só acima</option>
            <option value="below">below — só abaixo</option>
          </select>
        </div>
        <div>
          <label style={s.label}>Alert window</label>
          <select style={s.select} value={config.alertWindow} onChange={set('alertWindow')}>
            <option value="last_5m">last_5m</option>
            <option value="last_10m">last_10m</option>
            <option value="last_15m">last_15m</option>
            <option value="last_30m">last_30m</option>
            <option value="last_1h">last_1h</option>
            <option value="last_2h">last_2h</option>
            <option value="last_4h">last_4h</option>
          </select>
          <p style={s.hint}>Tempo anomalous para disparar.</p>
        </div>
        <div>
          <label style={s.label}>Query window</label>
          <select style={s.select} value={config.queryWindow} onChange={set('queryWindow')}>
            <option value="last_1h">last_1h</option>
            <option value="last_4h">last_4h</option>
            <option value="last_1d">last_1d</option>
            <option value="last_2d">last_2d</option>
            <option value="last_7d">last_7d</option>
          </select>
          <p style={s.hint}>Janela exibida nas notificações.</p>
        </div>
      </div>

      {/* Preview da query */}
      <div>
        <p style={{ ...s.label, marginBottom: 6 }}>Preview da query</p>
        <pre style={s.queryBox}>{buildQueryPreview(config)}</pre>
      </div>

      {/* Ações */}
      <div style={s.actions}>
        <button style={s.btnGhost} onClick={onBack}>← Voltar</button>
        <button style={s.btnPrimary} onClick={handleNext}>Continuar →</button>
      </div>

    </div>
  )
}
