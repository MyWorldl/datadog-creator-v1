// src/app/ferramentas/monitor/page.tsx
// Página do MonitorsCreator — orquestra os 5 steps do wizard

'use client'
/* eslint-disable react-hooks/set-state-in-effect --
   O efeito abaixo sincroniza o resourceType inicial com a query string
   (?tab=k8sDbm, usado pelo link do AuditMonitors), um sistema externo ao
   componente — mesmo padrão de Sidebar.tsx/AppContext.tsx, não é loop de render. */

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { initialDiscovery } from '@/lib/discovery'
import { initialInfraDiscovery } from '@/lib/infra'
import { initialLogMonitors } from '@/lib/log-monitors'
import { initialSloMonitors } from '@/lib/slo-monitors'
import { useApp } from '@/context/AppContext'
import Stepper from '@/components/Stepper'
import StepConnect from '@/components/StepConnect'
import type { ResourceType, WizardConfig } from '@/components/discovery/types'
import { DRAFT_KEY, isDraftMeaningful, parseDraft, serializeDraft, type WizardDraft } from '@/lib/wizard-draft'
import { IconAnalytics, IconServer, IconCluster, IconLogs, IconTarget } from '@/components/Icons'

// Carregados sob demanda: o wizard mostra 1 step por vez (StepConnect é o
// primeiro, por isso fica com import estático — os demais só entram no bundle
// quando o usuário avança até ali).
const DiscoveryConfigure = dynamic(() => import('@/components/discovery/DiscoveryConfigure'))
const DiscoveryConfigureInfra = dynamic(() => import('@/components/discovery/DiscoveryConfigureInfra'))
const DiscoveryConfigureK8sDbm = dynamic(() => import('@/components/discovery/DiscoveryConfigureK8sDbm'))
const DiscoveryConfigureLogs = dynamic(() => import('@/components/discovery/DiscoveryConfigureLogs'))
const DiscoveryConfigureSlo = dynamic(() => import('@/components/discovery/DiscoveryConfigureSlo'))
const DiscoveryPersonalize = dynamic(() => import('@/components/discovery/DiscoveryPersonalize'))
const DiscoveryReview = dynamic(() => import('@/components/discovery/DiscoveryReview'))
const DiscoveryCreate = dynamic(() => import('@/components/discovery/DiscoveryCreate'))

// ─────────────────────────────────────────────
// Labels da barra de progresso
// ─────────────────────────────────────────────
const STEPS = ['Conectar', 'Configurar', 'Personalizar', 'Revisar', 'Criar']

// Estado inicial da aba "APM e Infraestrutura" (K8s/DBM) — reaproveita
// DiscoveryState, mas fixo em scopeType:'namespace' (Pod Restarts exige isso;
// Pod Pending ignora) e com os 4 tipos de ALERT_TYPES desligados (essa aba
// não expõe UI pra latência/erro/volume — só Pod Restarts/Pod Pending).
function initialK8sDiscovery() {
  const d = initialDiscovery()
  d.scopeType = 'namespace'
  for (const k of Object.keys(d.alerts)) d.alerts[k].enabled = false
  return d
}

// ─────────────────────────────────────────────
// Estado inicial de todas as configurações
// ─────────────────────────────────────────────
const INITIAL_CONFIG: WizardConfig = {
  // O wizard opera somente no modo de descoberta.
  mode: 'discovery',
  // 'services' (APM, por serviço/operação), 'infra' (por host: CPU/Memória/
  // Disco), 'k8sDbm' (Kubernetes/DBM, atrás de k8sDbmCoverage) ou 'logs'
  // (Log Monitor, atrás de logMonitors) ou 'slo' (SLO Alert, atrás de sloAlerts).
  resourceType: 'services',
  discovery: initialDiscovery(),
  infra: initialInfraDiscovery(),
  k8sInfra: initialInfraDiscovery(),
  k8sDiscovery: initialK8sDiscovery(),
  logMonitors: initialLogMonitors(),
  sloMonitors: initialSloMonitors(),
}

export default function Home() {
  const { features } = useApp()
  const [step, setStep]     = useState(0)
  const [config, setConfig] = useState<WizardConfig>(INITIAL_CONFIG)

  // Deep-link ?tab=k8sDbm (usado pelo botão "Criar no MonitorsCreator" da
  // seção K8s/DBM do AuditMonitors) — lido via window.location em vez de
  // useSearchParams() pra não precisar de <Suspense> (a página é estática).
  // Só troca se a flag estiver ligada (senão a aba nem existe pra selecionar).
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (tab === 'k8sDbm' && features.k8sDbmCoverage) {
      setConfig(c => ({ ...c, resourceType: 'k8sDbm' }))
    }
  }, [features.k8sDbmCoverage])

  // ── Rascunho (localStorage) ──
  // Lido DEPOIS da montagem (nunca no render inicial: SSR/hidratação precisam
  // do mesmo estado) e só oferecido como banner — não restaura sozinho.
  const [draft, setDraft] = useState<WizardDraft<WizardConfig> | null>(null)
  // Config (por identidade) que acabou de ser CRIADA: não vira rascunho de novo
  // só porque o usuário navegou entre etapas depois — só se ele mexer nela.
  const createdConfigRef = useRef<WizardConfig | null>(null)
  const [draftReady, setDraftReady] = useState(false) // só salva depois de decidir o que fazer com o rascunho antigo
  useEffect(() => {
    try {
      setDraft(parseDraft(localStorage.getItem(DRAFT_KEY), INITIAL_CONFIG as unknown as Record<string, unknown>) as WizardDraft<WizardConfig> | null)
    } catch { /* storage bloqueado (modo privado etc.): segue sem rascunho */ }
    setDraftReady(true)
  }, [])

  // Salva (debounce) a cada mudança — só quando há algo pra retomar, e nunca
  // enquanto o banner do rascunho antigo ainda está na tela (senão o estado
  // inicial vazio sobrescreveria o rascunho que o usuário ainda não escolheu).
  useEffect(() => {
    if (!draftReady || draft || createdConfigRef.current === config) return
    const t = setTimeout(() => {
      try {
        if (!isDraftMeaningful(config as unknown as Record<string, unknown>)) { localStorage.removeItem(DRAFT_KEY); return }
        const json = serializeDraft(step, config)
        if (json) localStorage.setItem(DRAFT_KEY, json)
      } catch { /* cota cheia / bloqueado: ignora */ }
    }, 600)
    return () => clearTimeout(t)
  }, [config, step, draft, draftReady])

  function resumeDraft() {
    if (!draft) return
    const c = draft.config
    // resourceType de uma aba cuja flag foi desligada volta pro padrão.
    const blocked = (c.resourceType === 'k8sDbm' && !features.k8sDbmCoverage) || (c.resourceType === 'logs' && !features.logMonitors) || (c.resourceType === 'slo' && !features.sloAlerts)
    setConfig(blocked ? { ...c, resourceType: 'services' } : c)
    setStep(Math.max(1, draft.step)) // conexão já existe se há rascunho; nunca volta pra "Conectar"
    setDraft(null)
  }
  function discardDraft() {
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignora */ }
    setDraft(null)
  }

  function goNext() { setStep(s => Math.min(s + 1, STEPS.length - 1)) }
  function goBack() { setStep(s => Math.max(s - 1, 0)) }

  return (
    <div style={{
      minHeight: '100%',
      background: 'var(--bg-base)',
      // sem padding próprio: o .app-main já dá o respiro (antes era 2rem
      // DOBRADO, deixando o wizard espremido no celular).
      padding: 0,
    }}>
      <main style={{
        maxWidth: 640,
        margin: '0 auto',
      }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom: 28 }}>
          <p style={{
            fontSize: 24,
            fontWeight: 600,
            color: 'var(--accent)',
            marginBottom: 4,
          }}>
            MonitorsCreator
          </p>
          <h1 style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            margin: 0,
          }}>
            Datadog · Criação de Monitores
          </h1>
        </div>

        {draft && (
          <div role="status" className="wz-banner" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, boxShadow: 'var(--card-shadow)' }}>
            <span style={{ flex: 1, minWidth: 200, fontSize: 13, color: 'var(--text-primary)' }}>
              Você tem um rascunho salvo em <strong>{new Date(draft.savedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</strong> (etapa {Math.max(1, draft.step) + 1} de {STEPS.length}).
            </span>
            <button onClick={resumeDraft} className="btn btn-primary btn-sm">Retomar</button>
            <button onClick={discardDraft} className="btn btn-ghost btn-sm">Descartar</button>
          </div>
        )}

        {/* Stepper */}
        <Stepper steps={STEPS} current={step} />

        {/* Step ativo */}
        {step === 0 && (
          <StepConnect onNext={goNext} />
        )}

        {step === 1 && (
          <>
            <div className="wz-tabs" role="tablist" aria-label="Tipo de monitor">
              {([
                { key: 'services', label: 'APM', Icon: IconAnalytics },
                { key: 'infra', label: 'Infraestrutura (Hosts)', Icon: IconServer },
                // Aba dedicada a Kubernetes/DBM — só aparece com a flag ligada
                // (mesmo padrão de "esconder por completo quando off" da
                // seção K8s/DBM em ferramentas/audit/page.tsx).
                ...(features.k8sDbmCoverage ? [{ key: 'k8sDbm', label: 'APM e Infraestrutura (K8s/DBM)', Icon: IconCluster }] : []),
                // Aba Logs — mesmo padrão, atrás de logMonitors.
                ...(features.logMonitors ? [{ key: 'logs', label: 'Logs', Icon: IconLogs }] : []),
                // Aba SLO — alertas de burn rate / error budget, atrás de sloAlerts.
                ...(features.sloAlerts ? [{ key: 'slo', label: 'SLO', Icon: IconTarget }] : []),
              ] as { key: ResourceType; label: string; Icon: typeof IconServer }[]).map(opt => {
                const on = config.resourceType === opt.key
                return (
                  <button
                    key={opt.key}
                    role="tab"
                    aria-selected={on}
                    className="wz-tab"
                    onClick={() => setConfig(c => ({ ...c, resourceType: opt.key }))}
                  >
                    <opt.Icon size={15} />
                    {opt.label}
                  </button>
                )
              })}
            </div>

            {config.resourceType === 'infra' ? (
              <DiscoveryConfigureInfra
                config={config}
                setConfig={setConfig}
                onNext={goNext}
                onBack={goBack}
              />
            ) : config.resourceType === 'k8sDbm' ? (
              <DiscoveryConfigureK8sDbm
                config={config}
                setConfig={setConfig}
                onNext={goNext}
                onBack={goBack}
              />
            ) : config.resourceType === 'logs' ? (
              <DiscoveryConfigureLogs
                config={config}
                setConfig={setConfig}
                onNext={goNext}
                onBack={goBack}
              />
            ) : config.resourceType === 'slo' ? (
              <DiscoveryConfigureSlo
                config={config}
                setConfig={setConfig}
                onNext={goNext}
                onBack={goBack}
              />
            ) : (
              <DiscoveryConfigure
                config={config}
                setConfig={setConfig}
                onNext={goNext}
                onBack={goBack}
              />
            )}
          </>
        )}

        {step === 2 && (
          <DiscoveryPersonalize
            config={config}
            setConfig={setConfig}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {step === 3 && (
          <DiscoveryReview
            config={config}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {step === 4 && (
          <DiscoveryCreate
            config={config}
            onBack={goBack}
            onCreated={() => { createdConfigRef.current = config; try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignora */ } }}
          />
        )}

        {/* Rodapé */}
        <p style={{
          textAlign: 'center',
          fontSize: 11,
          color: 'var(--text-muted)',
          marginTop: 32,
        }}>
          As credenciais do Datadog são da sessão e ficam em cookie httpOnly no servidor.
        </p>

      </main>
    </div>
  )
}
