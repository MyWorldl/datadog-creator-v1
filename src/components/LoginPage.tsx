'use client';

import { useState, type FormEvent } from 'react';
import { useSession } from '@/context/SupabaseAuthContext';

export default function LoginPage() {
  const { refresh } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Preencha e-mail e senha.');
      return;
    }

    setLoading(true);
    // Login roda no servidor (/api/auth/login) pra passar pelo rate-limit por
    // IP antes de chamar o Supabase Auth. redirect:false-equivalente => o
    // erro é tratado aqui, sem navegação.
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok || !data.ok) {
      if (data.code === 'rate_limited') {
        setError('Muitas tentativas de login. Aguarde alguns minutos antes de tentar novamente.');
      } else {
        setError('Credenciais inválidas. Verifique e-mail e senha.');
      }
      return;
    }

    // Sucesso: o cookie de sessão já foi setado pelo servidor. O browser
    // client ainda não sabe disso sozinho (onAuthStateChange não dispara
    // pra login feito fora dele) — refresh() força a reavaliação.
    await refresh();
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '2.5rem 2rem',
        width: '100%',
        maxWidth: 400,
        boxShadow: 'var(--card-shadow)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: 52,
            height: 52,
            background: 'var(--accent)',
            borderRadius: 14,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1rem',
          }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M6 22L14 6L22 22H6Z" fill="white" opacity="0.9"/>
              <circle cx="14" cy="14" r="4" fill="white"/>
            </svg>
          </div>
          <h1 style={{
            fontSize: '1.4rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
            marginBottom: 4,
          }}>Datadog Creator</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Faça login para continuar
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{
              display: 'block',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              marginBottom: 6,
            }}>E-mail</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu.email@empresa.com"
              autoComplete="email"
              style={{
                width: '100%',
                padding: '0.65rem 0.875rem',
                background: 'var(--bg-surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-primary)',
                fontSize: '0.9375rem',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              marginBottom: 6,
            }}>Senha</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              style={{
                width: '100%',
                padding: '0.65rem 0.875rem',
                background: 'var(--bg-surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-primary)',
                fontSize: '0.9375rem',
                outline: 'none',
              }}
            />
          </div>

          {error && (
            <div style={{
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger)',
              borderRadius: 8,
              padding: '0.6rem 0.875rem',
              color: 'var(--danger)',
              fontSize: '0.875rem',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              padding: '0.75rem',
              background: loading ? 'var(--text-muted)' : 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: '0.9375rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
