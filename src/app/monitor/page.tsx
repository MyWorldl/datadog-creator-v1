// src/app/monitor/page.tsx
// Página do MonitorsCreator — orquestra os 5 steps do wizard

'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { initialDiscovery } from '@/lib/discovery'
import { initialInfraDiscovery } from '@/lib/infra'
import { useApp } from '@/context/AppContext'
import Stepper from '@/components/Stepper'
import StepConnect from '@/components/StepConnect'
import type { ResourceType, WizardConfig } from '@/components/discovery/types'

// Carregados sob demanda: o wizard mostra 1 step por vez (StepConnect é o
// primeiro, por isso fica com import estático — os demais só entram no bundle
// quando o usuário avança até ali).
const DiscoveryConfigure = dynamic(() => import('@/components/discovery/DiscoveryConfigure'))
const DiscoveryConfigureInfra = dynamic(() => import('@/components/discovery/DiscoveryConfigureInfra'))
const DiscoveryConfigureK8sDbm = dynamic(() => import('@/components/discovery/DiscoveryConfigureK8sDbm'))
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
  // Disco) ou 'k8sDbm' (Kubernetes/DBM, atrás da flag k8sDbmCoverage).
  resourceType: 'services',
  discovery: initialDiscovery(),
  infra: initialInfraDiscovery(),
  k8sInfra: initialInfraDiscovery(),
  k8sDiscovery: initialK8sDiscovery(),
}

export default function Home() {
  const { features } = useApp()
  const [step, setStep]     = useState(0)
  const [config, setConfig] = useState<WizardConfig>(INITIAL_CONFIG)

  function goNext() { setStep(s => Math.min(s + 1, STEPS.length - 1)) }
  function goBack() { setStep(s => Math.max(s - 1, 0)) }

  return (
    <div style={{
      minHeight: '100%',
      background: 'var(--bg-base)',
      padding: '2rem',
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

        {/* Stepper */}
        <Stepper steps={STEPS} current={step} />

        {/* Step ativo */}
        {step === 0 && (
          <StepConnect onNext={goNext} />
        )}

        {step === 1 && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {([
                { key: 'services', label: 'APM' },
                { key: 'infra', label: 'Infraestrutura (Hosts)' },
                // Aba dedicada a Kubernetes/DBM — só aparece com a flag ligada
                // (mesmo padrão de "esconder por completo quando off" da
                // seção K8s/DBM em ferramentas/audit/page.tsx).
                ...(features.k8sDbmCoverage ? [{ key: 'k8sDbm', label: 'APM e Infraestrutura (K8s/DBM)' }] : []),
              ] as { key: ResourceType; label: string }[]).map(opt => {
                const on = config.resourceType === opt.key
                return (
                  <button
                    key={opt.key}
                    onClick={() => setConfig(c => ({ ...c, resourceType: opt.key }))}
                    style={{
                      flex: 1, fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
                      border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                      background: on ? 'var(--accent-light)' : 'var(--bg-surface)',
                      color: on ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
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
