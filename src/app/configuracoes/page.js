'use client'

import { useApp } from '@/context/AppContext';
import ConnectKeysCard from '@/components/ConnectKeysCard';

const s = {
  title:     { fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' },
  sub:       { fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1.5rem' },
  card:      { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem', marginBottom: 12, boxShadow: 'var(--card-shadow)' },
  cardTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' },
};

export default function ConfiguracoesPage() {
  const { theme, setTheme } = useApp();

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={s.title}>Configurações</h1>
      <p style={s.sub}>Tema e conexões com o Datadog (múltiplas orgs).</p>

      {/* ── TEMA ── */}
      <div style={s.card}>
        <p style={s.cardTitle}>Tema</p>
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { value: 'light',  label: 'Light',   icon: '☀️' },
            { value: 'dark',   label: 'Dark',    icon: '🌙' },
            { value: 'system', label: 'Sistema', icon: '💻' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              style={{
                flex: 1, padding: '10px 14px', cursor: 'pointer',
                borderRadius: 8, textAlign: 'left', fontSize: 13,
                background: theme === opt.value ? 'var(--accent-light)' : 'var(--bg-surface-2)',
                border: `1.5px solid ${theme === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                color: theme === opt.value ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: theme === opt.value ? 600 : 400,
              }}
            >
              {opt.icon} {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONEXÃO DA SESSÃO ── */}
      <ConnectKeysCard />
    </div>
  );
}
