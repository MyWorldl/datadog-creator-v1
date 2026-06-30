// src/components/Stepper.jsx
// Barra de progresso visual com os 5 steps do Wizard

'use client'

export default function Stepper({ steps, current }) {
  return (
    <nav
      aria-label="Progresso do wizard"
      style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: 28,
        overflowX: 'auto',
        paddingBottom: 2,
      }}
    >
      {steps.map((label, i) => {
        const isDone   = i < current
        const isActive = i === current

        return (
          <div
            key={i}
            style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 0 }}
          >
            {/* Círculo + label */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div
                aria-current={isActive ? 'step' : undefined}
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
                  transition: 'all 0.2s',
                }}
              >
                {isDone ? '✓' : i + 1}
              </div>
              <span style={{
                fontSize: 11,
                whiteSpace: 'nowrap',
                color: isActive ? 'var(--accent)' : isDone ? 'var(--success)' : 'var(--text-muted)',
                fontWeight: isActive ? 500 : 400,
              }}>
                {label}
              </span>
            </div>

            {/* Linha conectora */}
            {i < steps.length - 1 && (
              <div style={{
                flex: 1,
                height: 1,
                background: i < current ? 'var(--success)' : 'var(--border)',
                marginBottom: 20,
                marginLeft: 4,
                marginRight: 4,
                minWidth: 16,
                transition: 'background 0.2s',
              }} />
            )}
          </div>
        )
      })}
    </nav>
  )
}
