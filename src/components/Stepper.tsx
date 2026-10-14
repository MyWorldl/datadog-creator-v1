// src/components/Stepper.tsx
// Barra de progresso visual com os 5 steps do Wizard

'use client'

interface StepperProps {
  steps: string[]
  current: number
}

export default function Stepper({ steps, current }: StepperProps) {
  return (
    <nav
      aria-label={`Progresso do wizard — etapa ${current + 1} de ${steps.length}`}
      className="stepper"
      style={{
        display: 'flex',
        alignItems: 'flex-start', // círculos alinhados pelo TOPO (a etapa ativa tem rótulo embaixo, as outras podem não ter)
        marginBottom: 28,
        paddingBottom: 2,
      }}
    >
      {steps.map((label, i) => {
        const isDone   = i < current
        const isActive = i === current

        return (
          <div
            key={i}
            style={{ display: 'flex', alignItems: 'flex-start', flex: i < steps.length - 1 ? 1 : 0 }}
          >
            {/* Círculo + label */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div
                aria-current={isActive ? 'step' : undefined}
                className={`stepper-dot${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}`}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 500,
                  flexShrink: 0,
                  border: isDone
                    ? '1.5px solid var(--success)'
                    : isActive
                    ? '2px solid var(--accent)'
                    : '1.5px solid var(--border)',
                  background: isDone
                    ? 'var(--success-bg)'
                    : isActive
                    ? 'var(--accent)'
                    : 'var(--bg-surface)',
                  color: isDone
                    ? 'var(--success)'
                    : isActive
                    ? '#ffffff'
                    : 'var(--text-muted)',
                  transition: 'all 0.3s ease',
                }}
              >
                <span>{isDone ? '✓' : i + 1}</span>
              </div>
              <span className={`stepper-label${isActive ? ' is-active' : ''}`} style={{
                fontSize: 11,
                whiteSpace: 'nowrap',
                color: isActive ? 'var(--accent)' : isDone ? 'var(--success)' : 'var(--text-muted)',
                fontWeight: isActive ? 600 : 400,
                transition: 'color 0.3s ease',
              }}>
                {label}
              </span>
            </div>

            {/* Linha conectora */}
            {i < steps.length - 1 && (
              <div className={`stepper-line${i < current ? ' is-done' : ''}`} style={{
                flex: 1,
                height: 2,
                borderRadius: 2,
                marginTop: 13, // centro do círculo (28px)
                marginLeft: 4,
                marginRight: 4,
                minWidth: 16,
              }} />
            )}
          </div>
        )
      })}
    </nav>
  )
}
