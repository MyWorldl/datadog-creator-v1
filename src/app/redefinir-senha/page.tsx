// src/app/redefinir-senha/page.tsx
//
// Destino do link de "Esqueci minha senha" (ver LoginPage.tsx, que dispara
// resetPasswordForEmail com redirectTo apontando pra cá). O link chega com
// os tokens no hash (#access_token=...&refresh_token=...&type=recovery) —
// o SupabaseAuthContext já consome esse hash sozinho e loga a pessoa (mesmo
// mecanismo dos links de convite, ver consumeAuthHashIfPresent), então
// quando este componente renderiza, a sessão (via AppShell) já existe.
//
// Também serve como "trocar minha senha" pra quem já está logado e navegar
// pra cá diretamente — supabase.auth.updateUser funciona nos dois casos.
'use client'

import { useState, type CSSProperties, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { PasswordField } from '@/components/LoginPage'

const s: Record<string, CSSProperties> = {
  wrap: { minHeight: 'calc(100vh - 4rem)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
  card: { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '2.5rem 2rem', width: '100%', maxWidth: 400, boxShadow: 'var(--card-shadow)' },
  title: { fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px', textAlign: 'center' },
  sub: { color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', margin: '0 0 24px' },
  err: { background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '0.6rem 0.875rem', color: 'var(--danger)', fontSize: '0.875rem' },
  ok: { background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 8, padding: '0.6rem 0.875rem', color: 'var(--success)', fontSize: '0.875rem' },
  btn: { marginTop: 4, padding: '0.75rem', color: 'white', border: 'none', borderRadius: 8, fontSize: '0.9375rem', fontWeight: 600 },
}

const MIN_LENGTH = 6 // mínimo padrão do Supabase Auth pra senha

export default function RedefinirSenhaPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    if (password.length < MIN_LENGTH) { setError(`A senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`); return }
    if (password !== confirm) { setError('As senhas não coincidem.'); return }

    setSaving(true)
    try {
      const { error: updateErr } = await supabaseBrowser().auth.updateUser({ password })
      if (updateErr) { setError(updateErr.message); return }
      setDone(true)
      setTimeout(() => router.push('/'), 1500)
    } catch (e) {
      setError('Falha de rede: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <p style={s.title}>Redefinir senha</p>
        <p style={s.sub}>Escolha uma nova senha pra sua conta.</p>

        {done ? (
          <div style={s.ok}>✓ Senha atualizada. Redirecionando…</div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <PasswordField label="Nova senha" value={password} onChange={setPassword} autoComplete="new-password" />
            <PasswordField label="Confirmar nova senha" value={confirm} onChange={setConfirm} autoComplete="new-password" />

            {error && <div style={s.err}>{error}</div>}

            <button type="submit" disabled={saving} style={{ ...s.btn, background: saving ? 'var(--text-muted)' : 'var(--accent)', cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Salvando…' : 'Salvar nova senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
