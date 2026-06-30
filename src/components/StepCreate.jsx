// src/components/StepCreate.jsx
//
// Step 5 do Wizard — envia o monitor para o Datadog via /api/create-monitor
// e exibe o resultado (sucesso ou erro detalhado).
//
// Props recebidas do page.jsx:
//   config   → objeto com todas as configurações preenchidas nos steps anteriores
//   onBack   → função chamada ao clicar "Voltar"

'use client'

import { useState } from 'react'
import { useApp } from '@/context/AppContext'
import DiscoveryCreate from '@/components/discovery/DiscoveryCreate'

// ─────────────────────────────────────────────
// Ícones inline (SVG simples, sem dependência)
// ─────────────────────────────────────────────
function IconCheck() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="var(--success)" />
      <path d="M5.5 10.5l3 3 6-6" stroke="white" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconError() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="var(--danger)" />
      <path d="M7 7l6 6M13 7l-6 6" stroke="white" strokeWidth="1.8"
        strokeLinecap="round" />
    </svg>
  )
}

function IconExternal() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V8"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8 1h4m0 0v4m0-4L6 7"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"
        strokeLinejoin="round" />
    </svg>
  )
}

function IconCopy() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1" y="4" width="9" height="9" rx="1.5"
        stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 4V2.5A1.5 1.5 0 015.5 1H11.5A1.5 1.5 0 0113 2.5v6A1.5 1.5 0 0111.5 10H10"
        stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

// ─────────────────────────────────────────────
// Spinner de carregamento
// ─────────────────────────────────────────────
function Spinner() {
  return (
    <span
      role="status"
      aria-label="Carregando"
      style={{
        display: 'inline-block',
        width: 16,
        height: 16,
        border: '2px solid var(--accent)',
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
        flexShrink: 0,
      }}
    />
  )
}

// ─────────────────────────────────────────────
// Linha do resumo de configuração
// ─────────────────────────────────────────────
function SummaryRow({ label, value, mono = false }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 16,
      padding: '7px 0',
      borderBottom: '0.5px solid var(--accent-light)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: 13,
        color: 'var(--text-primary)',
        fontFamily: mono ? 'var(--font-mono, monospace)' : 'inherit',
        textAlign: 'right',
        wordBreak: 'break-all',
      }}>
        {value}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────
// Monta a query no mesmo formato do route.js
// (para exibir no preview antes de criar)
// ─────────────────────────────────────────────
function buildQueryPreview(config) {
  const {
    metric = '', filter = '*', algorithm = 'agile',
    deviations = 2, direction = 'both',
    alertWindow = 'last_15m', queryWindow = 'last_4h',
    seasonality = 'daily',
  } = config

  const seasonalityParam =
    algorithm !== 'basic' ? `, seasonality='${seasonality}'` : ''

  return (
    `avg(${queryWindow}):anomalies(` +
    `avg:${metric}{${filter}}, ` +
    `'${algorithm}', ${deviations}, ` +
    `direction='${direction}', ` +
    `alert_window='${alertWindow}', ` +
    `interval=60, count_default_zero='true'` +
    `${seasonalityParam}) >= 1`
  )
}

// ─────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────
export default function StepCreate({ config, onBack }) {
  const { datadogSite } = useApp()
  // Estados possíveis: 'idle' | 'loading' | 'success' | 'error'
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState(null)   // resposta de sucesso
  const [error, setError] = useState(null)     // mensagem de erro
  const [copied, setCopied] = useState(false)  // feedback do botão copiar

  if (config.mode === 'discovery')
    return <DiscoveryCreate config={config} onBack={onBack} />

  const query = buildQueryPreview(config)

  // ── Copia texto para a área de transferência ──
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback para browsers sem clipboard API
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // ── Chamada principal para /api/create-monitor ──
  async function handleCreate() {
    setStatus('loading')
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/create-monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // As chaves e o site NÃO vão mais aqui — o servidor lê dos cookies
          // httpOnly da sessão (definidos no passo "Conectar").
          config: {
            metric:      config.metric,
            filter:      config.filter,
            algorithm:   config.algorithm,
            deviations:  config.deviations,
            seasonality: config.seasonality,
            direction:   config.direction,
            alertWindow: config.alertWindow,
            queryWindow: config.queryWindow,
            name:        config.name || `Anomaly — ${config.metric}`,
            message:     config.message || `Anomalia detectada em ${config.metric}. @equipe-ops`,
            tags:        config.tags || ['env:prod'],
            priority:    config.priority || 3,
            notifyNoData: config.notifyNoData || false,
          },
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        // Erro retornado pelo route.js ou pelo Datadog
        setError(data.error || `Erro ${response.status} — tente novamente.`)
        setStatus('error')
        return
      }

      setResult(data)
      setStatus('success')

    } catch (networkErr) {
      // Erro de rede (sem conexão, timeout, etc.)
      setError(`Falha de rede: ${networkErr.message}`)
      setStatus('error')
    }
  }

  // ── Reset para tentar novamente ──
  function handleRetry() {
    setStatus('idle')
    setError(null)
    setResult(null)
  }

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <>
      {/* Injeção do keyframe de spin — só uma vez no DOM */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Painel de resumo ── */}
        <div style={{
          border: '0.5px solid var(--border)',
          borderRadius: 12,
          padding: '1rem 1.25rem',
          background: 'var(--bg-surface)',
        }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8 }}>
            Resumo da configuração
          </p>

          <SummaryRow label="Site"       value={datadogSite} />
          <SummaryRow label="Métrica"    value={config.metric} mono />
          <SummaryRow label="Algoritmo"  value={`${config.algorithm} · ${config.seasonality} · ${config.deviations} desvios`} />
          <SummaryRow label="Direção"    value={config.direction} />
          <SummaryRow label="Janelas"    value={`alert: ${config.alertWindow} · query: ${config.queryWindow}`} />
          <SummaryRow label="Nome"       value={config.name || `Anomaly — ${config.metric}`} />
          <SummaryRow
            label="Tags"
            value={(config.tags || ['env:prod']).join(', ') || '—'}
          />
          <SummaryRow label="Prioridade" value={`P${config.priority || 3}`} />
        </div>

        {/* ── Preview da query ── */}
        <div style={{
          border: '0.5px solid var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
          background: 'var(--bg-surface)',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            borderBottom: '0.5px solid var(--bg-surface-2)',
          }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
              Query gerada
            </span>
            <button
              onClick={() => copyToClipboard(query)}
              aria-label="Copiar query"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
                color: copied ? 'var(--success)' : 'var(--text-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: 6,
              }}
            >
              <IconCopy />
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
          <pre style={{
            margin: 0,
            padding: '12px 14px',
            fontSize: 11.5,
            fontFamily: 'var(--font-mono, monospace)',
            color: 'var(--accent)',
            background: 'var(--accent-light)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            lineHeight: 1.6,
          }}>
            {query}
          </pre>
        </div>

        {/* ── Estado: loading ── */}
        {status === 'loading' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '1rem 1.25rem',
            border: '0.5px solid var(--accent)',
            borderRadius: 12,
            background: 'var(--accent-light)',
          }}>
            <Spinner />
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent)', margin: 0 }}>
                Criando monitor no Datadog...
              </p>
              <p style={{ fontSize: 12, color: 'var(--accent-hover)', margin: '2px 0 0' }}>
                Conectando a api.{datadogSite}
              </p>
            </div>
          </div>
        )}

        {/* ── Estado: sucesso ── */}
        {status === 'success' && result && (
          <div style={{
            border: '0.5px solid var(--success)',
            borderRadius: 12,
            overflow: 'hidden',
            background: 'var(--bg-surface)',
          }}>
            {/* Cabeçalho verde */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 16px',
              background: 'var(--success-bg)',
              borderBottom: '0.5px solid var(--success)',
            }}>
              <IconCheck />
              <div>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--success)', margin: 0 }}>
                  Monitor criado com sucesso
                </p>
                <p style={{ fontSize: 12, color: 'var(--success)', margin: '1px 0 0' }}>
                  ID #{result.monitorId} · {result.monitorName}
                </p>
              </div>
            </div>

            {/* Detalhes */}
            <div style={{ padding: '12px 16px' }}>
              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 4px' }}>
                  URL do monitor
                </p>
                <a
                  href={result.monitorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 13,
                    color: 'var(--info)',
                    textDecoration: 'none',
                    fontFamily: 'var(--font-mono, monospace)',
                  }}
                >
                  {result.monitorUrl}
                  <IconExternal />
                </a>
              </div>

              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 4px' }}>
                  Query aplicada
                </p>
                <pre style={{
                  margin: 0,
                  padding: '8px 10px',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--accent)',
                  background: 'var(--accent-light)',
                  borderRadius: 8,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  lineHeight: 1.5,
                }}>
                  {result.query}
                </pre>
              </div>

              {/* Aviso sobre dados históricos */}
              <div style={{
                display: 'flex',
                gap: 8,
                padding: '10px 12px',
                background: 'var(--warning-bg)',
                border: '0.5px solid var(--warning)',
                borderRadius: 8,
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }} aria-hidden="true">⚡</span>
                <p style={{ fontSize: 12, color: 'var(--warning)', margin: 0, lineHeight: 1.5 }}>
                  O monitor pode levar de <strong>3 a 7 dias</strong> para treinar o modelo de
                  anomalia e começar a disparar alertas. Durante esse período ele fica azul
                  no Datadog — isso é normal.
                </p>
              </div>
            </div>

            {/* Ação: criar outro monitor */}
            <div style={{
              padding: '10px 16px',
              borderTop: '0.5px solid var(--success)',
              display: 'flex',
              justifyContent: 'flex-end',
            }}>
              <button
                onClick={handleRetry}
                style={{
                  fontSize: 13,
                  color: 'var(--success)',
                  background: 'none',
                  border: '0.5px solid var(--success)',
                  borderRadius: 8,
                  padding: '7px 14px',
                  cursor: 'pointer',
                }}
              >
                Criar outro monitor
              </button>
            </div>
          </div>
        )}

        {/* ── Estado: erro ── */}
        {status === 'error' && error && (
          <div style={{
            border: '0.5px solid var(--danger)',
            borderRadius: 12,
            overflow: 'hidden',
            background: 'var(--bg-surface)',
          }}>
            {/* Cabeçalho vermelho */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 16px',
              background: 'var(--danger-bg)',
              borderBottom: '0.5px solid var(--danger)',
            }}>
              <IconError />
              <div>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--danger)', margin: 0 }}>
                  Erro ao criar o monitor
                </p>
                <p style={{ fontSize: 12, color: 'var(--danger)', margin: '1px 0 0' }}>
                  Verifique os detalhes abaixo e tente novamente
                </p>
              </div>
            </div>

            {/* Mensagem de erro */}
            <div style={{ padding: '12px 16px' }}>
              <pre style={{
                margin: 0,
                padding: '10px 12px',
                fontSize: 12,
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--danger)',
                background: 'var(--danger-bg)',
                borderRadius: 8,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                lineHeight: 1.5,
              }}>
                {error}
              </pre>

              {/* Dicas de erro comuns */}
              <div style={{ marginTop: 10 }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 6px' }}>
                  Causas mais comuns:
                </p>
                <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                  <li>API Key ou Application Key inválida — volte ao step 1 e verifique</li>
                  <li>Métrica não existe no seu Datadog — confirme o nome exato</li>
                  <li>Permissão insuficiente — a Application Key precisa de acesso a Monitors</li>
                  <li>Site incorreto — certifique que escolheu o site correto da sua org</li>
                </ul>
              </div>
            </div>

            {/* Ações */}
            <div style={{
              padding: '10px 16px',
              borderTop: '0.5px solid var(--danger)',
              display: 'flex',
              gap: 8,
              justifyContent: 'flex-end',
            }}>
              <button
                onClick={onBack}
                style={{
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  background: 'none',
                  border: '0.5px solid var(--border)',
                  borderRadius: 8,
                  padding: '7px 14px',
                  cursor: 'pointer',
                }}
              >
                ← Voltar e corrigir
              </button>
              <button
                onClick={handleRetry}
                style={{
                  fontSize: 13,
                  color: 'var(--danger)',
                  background: 'none',
                  border: '0.5px solid var(--danger)',
                  borderRadius: 8,
                  padding: '7px 14px',
                  cursor: 'pointer',
                }}
              >
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        {/* ── Barra de ações inferior (idle) ── */}
        {status !== 'success' && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 4,
          }}>
            <button
              onClick={onBack}
              disabled={status === 'loading'}
              style={{
                fontSize: 13,
                color: status === 'loading' ? 'var(--border)' : 'var(--text-secondary)',
                background: 'none',
                border: '0.5px solid var(--border)',
                borderRadius: 8,
                padding: '9px 18px',
                cursor: status === 'loading' ? 'not-allowed' : 'pointer',
              }}
            >
              ← Voltar
            </button>

            {status !== 'error' && (
              <button
                onClick={handleCreate}
                disabled={status === 'loading'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#fff',
                  background: status === 'loading' ? 'var(--accent)' : 'var(--accent)',
                  border: 'none',
                  borderRadius: 8,
                  padding: '9px 20px',
                  cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                {status === 'loading' ? (
                  <>
                    <Spinner />
                    Criando...
                  </>
                ) : (
                  'Criar monitor no Datadog'
                )}
              </button>
            )}
          </div>
        )}

      </div>
    </>
  )
}

// ─────────────────────────────────────────────
// Como usar no page.jsx:
//
// import StepCreate from '@/components/StepCreate'
//
// {step === 4 && (
//   <StepCreate
//     config={config}
//     onBack={() => setStep(3)}
//   />
// )}
// ─────────────────────────────────────────────
