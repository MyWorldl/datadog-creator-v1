'use client';

import { useState } from 'react';
import { useSession } from '@/context/SupabaseAuthContext';
import Sidebar from '@/components/Sidebar';
import LoginPage from '@/components/LoginPage';
import { IconMenu } from '@/components/Icons';

export default function AppShell({ children }) {
  // Fonte da verdade do login agora é o Supabase Auth.
  const { status } = useSession(); // 'loading' | 'authenticated' | 'unauthenticated'
  const [mobileOpen, setMobileOpen] = useState(false);

  if (status === 'loading') {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-base)',
      }}>
        <div style={{
          width: 40,
          height: 40,
          border: '3px solid var(--border)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (status !== 'authenticated') {
    return <LoginPage />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        isOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
        onClose={() => setMobileOpen(false)}
      />

      <div
        className={`sidebar-overlay${mobileOpen ? ' is-open' : ''}`}
        onClick={() => setMobileOpen(false)}
      />

      <div className="mobile-topbar">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--sidebar-logo)',
            cursor: 'pointer',
            display: 'inline-flex',
            padding: 6,
          }}
        >
          <IconMenu size={22} />
        </button>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--sidebar-logo)', margin: 0 }}>
          Datadog Creator
        </p>
      </div>

      <main className="app-main">
        {children}
      </main>
    </div>
  );
}
