'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import { useSession } from '@/context/SupabaseAuthContext';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { IconEye, IconEyeOff } from '@/components/Icons';

const s: Record<string, CSSProperties> = {
  wrap: { minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
  card: { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '2.5rem 2rem', width: '100%', maxWidth: 400, boxShadow: 'var(--card-shadow)' },
  label: { display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 },
  input: { width: '100%', padding: '0.65rem 0.875rem', background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.9375rem', outline: 'none', boxSizing: 'border-box' },
  err: { background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '0.6rem 0.875rem', color: 'var(--danger)', fontSize: '0.875rem' },
  ok: { background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 8, padding: '0.6rem 0.875rem', color: 'var(--success)', fontSize: '0.875rem' },
  btn: { marginTop: 4, padding: '0.75rem', color: 'white', border: 'none', borderRadius: 8, fontSize: '0.9375rem', fontWeight: 600, transition: 'background 0.15s' },
  link: { background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left' },
  eyeBtn: { position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex', padding: 4 },
};

function Logo() {
  return (
    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
      <div style={{ width: 52, height: 52, background: 'var(--accent)', borderRadius: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M6 22L14 6L22 22H6Z" fill="white" opacity="0.9" />
          <circle cx="14" cy="14" r="4" fill="white" />
        </svg>
      </div>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Datadog Creator</h1>
    </div>
  );
}

// Campo de senha com botão de mostrar/ocultar (👁) embutido — mesmo padrão
// visual do resto do app (Icons.tsx), sem depender de segurar o mouse etc.
// Exportado: reaproveitado por app/redefinir-senha/page.tsx (mesmo padrão de
// campo, mesma UX, evita duplicar o botão de mostrar/ocultar).
export function PasswordField({ label, value, onChange, autoComplete }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label style={s.label}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="••••••••"
          autoComplete={autoComplete}
          style={{ ...s.input, paddingRight: 40 }}
        />
        <button type="button" style={s.eyeBtn} onClick={() => setShow(v => !v)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} title={show ? 'Ocultar senha' : 'Mostrar senha'}>
          {show ? <IconEyeOff size={18} /> : <IconEye size={18} />}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { refresh } = useSession();
  const [mode, setMode] = useState<'login' | 'forgot'>('login');

  // ── Login ──
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
    //
    // Achado da auditoria: o fetch rodava fora de try/catch — uma falha de
    // rede (offline, DNS) rejeitava a promise sem handler, e setLoading(false)
    // nunca rodava (botão travado em "Entrando..." pra sempre, sem nenhuma
    // mensagem). Mesmo padrão de try/catch/finally já usado logo abaixo em
    // handleForgotSubmit.
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        if (data.code === 'rate_limited') {
          setError('Muitas tentativas de login. Aguarde alguns minutos antes de tentar novamente.');
        } else if (data.code === 'email_not_confirmed') {
          setError('Este e-mail ainda não foi confirmado. Confirme pelo link recebido, ou peça pra confirmar manualmente no painel do Supabase (Authentication → Users).');
        } else {
          setError('Credenciais inválidas. Verifique e-mail e senha.');
        }
        return;
      }

      // Sucesso: o cookie de sessão já foi setado pelo servidor. O browser
      // client ainda não sabe disso sozinho (onAuthStateChange não dispara
      // pra login feito fora dele) — refresh() força a reavaliação.
      await refresh();
    } catch (e) {
      setError('Falha de rede: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // ── Esqueci minha senha ──
  // Roda direto no browser (chave anon), diferente do login — não precisa do
  // rate-limit por IP do /api/auth/login, o próprio Supabase Auth já limita
  // esse endpoint. redirectTo aponta pra /redefinir-senha: o e-mail chega com
  // os tokens no formato #access_token=...&refresh_token=...&type=recovery
  // (hash), que o SupabaseAuthContext já sabe consumir sozinho (mesmo
  // mecanismo dos links de convite — ver consumeAuthHashIfPresent).
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  async function handleForgotSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setForgotError('');
    if (!forgotEmail.trim()) { setForgotError('Informe seu e-mail.'); return; }

    setForgotLoading(true);
    try {
      const { error: resetErr } = await supabaseBrowser().auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      // Achado real: resetPasswordForEmail não LANÇA erro pra "e-mail não
      // cadastrado" (de propósito — não revela se um endereço existe, mesmo
      // padrão de qualquer fluxo de recuperação de senha). Mas problemas de
      // configuração de verdade (URL de redirect fora da allowlist do
      // Supabase, limite de envio, SMTP mal configurado) VÊM em `error`, sem
      // lançar exceção — ignorar esse campo (como o código fazia antes)
      // escondia esses erros reais atrás da mesma tela de "sucesso".
      if (resetErr) { setForgotError(resetErr.message); return; }
      setForgotSent(true);
    } catch (e) {
      setForgotError('Falha de rede: ' + (e as Error).message);
    } finally {
      setForgotLoading(false);
    }
  }

  function backToLogin() {
    setMode('login'); setForgotSent(false); setForgotError(''); setForgotEmail('');
  }

  if (mode === 'forgot') {
    return (
      <div style={s.wrap}>
        <div style={s.card}>
          <Logo />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', marginTop: -12, marginBottom: 24 }}>
            Esqueci minha senha
          </p>

          {forgotSent ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={s.ok}>
                Se <strong>{forgotEmail}</strong> estiver cadastrado, enviamos um e-mail com um link pra você definir uma nova senha.
              </div>
              <button type="button" style={s.link} onClick={backToLogin}>← Voltar para o login</button>
            </div>
          ) : (
            <form onSubmit={handleForgotSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={s.label}>E-mail</label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  placeholder="seu.email@empresa.com"
                  autoComplete="email"
                  autoFocus
                  style={s.input}
                />
              </div>

              {forgotError && <div style={s.err}>{forgotError}</div>}

              <button type="submit" disabled={forgotLoading} style={{ ...s.btn, background: forgotLoading ? 'var(--text-muted)' : 'var(--accent)', cursor: forgotLoading ? 'not-allowed' : 'pointer' }}>
                {forgotLoading ? 'Enviando…' : 'Enviar link de recuperação'}
              </button>
              <button type="button" style={s.link} onClick={backToLogin}>← Voltar para o login</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <Logo />
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', marginTop: -12, marginBottom: 24 }}>
          Faça login para continuar
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={s.label}>E-mail</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu.email@empresa.com"
              autoComplete="email"
              style={s.input}
            />
          </div>

          <PasswordField label="Senha" value={password} onChange={setPassword} autoComplete="current-password" />

          <button type="button" style={{ ...s.link, marginTop: -6 }} onClick={() => { setMode('forgot'); setForgotEmail(email); }}>
            Esqueci minha senha
          </button>

          {error && <div style={s.err}>{error}</div>}

          <button type="submit" disabled={loading} style={{ ...s.btn, background: loading ? 'var(--text-muted)' : 'var(--accent)', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
