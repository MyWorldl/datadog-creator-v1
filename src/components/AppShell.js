'use client';

import { useSession } from 'next-auth/react';
import Sidebar from '@/components/Sidebar';
import LoginPage from '@/components/LoginPage';

export default function AppShell({ children }) {
  // Fonte da verdade do login agora é o Auth.js.
  const { status } = useSession(); // 'loading' | 'authenticated' | 'unauthenticated'

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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{
        flex: 1,
        overflowY: 'auto',
        background: 'var(--bg-base)',
        padding: '2rem',
      }}>
        {children}
      </main>
    </div>
  );
}
