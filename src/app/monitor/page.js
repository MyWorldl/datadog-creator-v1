// src/app/monitor/page.js
// Página do MonitorsCreator — orquestra os 5 steps do wizard

'use client'

import { useState } from 'react'
import { initialDiscovery } from '@/lib/discovery'
import Stepper from '@/components/Stepper'
import StepConnect from '@/components/StepConnect'
import DiscoveryConfigure from '@/components/discovery/DiscoveryConfigure'
import DiscoveryPersonalize from '@/components/discovery/DiscoveryPersonalize'
import DiscoveryReview from '@/components/discovery/DiscoveryReview'
import DiscoveryCreate from '@/components/discovery/DiscoveryCreate'

// ─────────────────────────────────────────────
// Labels da barra de progresso
// ─────────────────────────────────────────────
const STEPS = ['Conectar', 'Configurar', 'Personalizar', 'Revisar', 'Criar']

// ─────────────────────────────────────────────
// Estado inicial de todas as configurações
// ─────────────────────────────────────────────
const INITIAL_CONFIG = {
  // O wizard opera somente no modo de descoberta de serviços.
  mode: 'discovery',
  discovery: initialDiscovery(),
}

export default function Home() {
  const [step, setStep]     = useState(0)
  const [config, setConfig] = useState(INITIAL_CONFIG)

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
          <StepConnect
            config={config}
            setConfig={setConfig}
            onNext={goNext}
          />
        )}

        {step === 1 && (
          <DiscoveryConfigure
            config={config}
            setConfig={setConfig}
            onNext={goNext}
            onBack={goBack}
          />
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
