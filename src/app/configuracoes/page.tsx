'use client'

import type { CSSProperties } from 'react';
import { useApp, type Theme } from '@/context/AppContext';
import ConnectKeysCard from '@/components/ConnectKeysCard';
import AccountPasswordCard from '@/components/AccountPasswordCard';

const s: Record<string, CSSProperties> = {
  cardTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' },
};

export default function ConfiguracoesPage() {
  const { theme, setTheme } = useApp();

  return (
    <div>
      <h1 className="page-h1">Configurações</h1>
      <p className="page-sub">Tema e conexões com o Datadog (múltiplas orgs).</p>
      <div className="fill-grid">

      {/* ── TEMA ── */}
      <div className="surface">
        <p style={s.cardTitle}>Tema</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {([
            { value: 'light',  label: 'Light',   icon: '☀️' },
            { value: 'dark',   label: 'Dark',    icon: '🌙' },
            { value: 'system', label: 'Sistema', icon: '💻' },
          ] as { value: Theme; label: string; icon: string }[]).map(opt => (
            <button
              key={opt.value}
              className="choice"
              aria-pressed={theme === opt.value}
              onClick={() => setTheme(opt.value)}
            >
              {opt.icon} {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONEXÃO DA SESSÃO ── */}
      <ConnectKeysCard />

      {/* ── SENHA DA CONTA ── */}
      <AccountPasswordCard />
      </div>
    </div>
  );
}
