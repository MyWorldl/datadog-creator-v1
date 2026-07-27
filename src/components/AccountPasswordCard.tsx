// src/components/AccountPasswordCard.tsx
'use client'

// Define/troca a senha da conta. Necessário depois de aceitar um convite
// (link de convite só autentica temporariamente — não define senha nenhuma;
// sem isso, a pessoa nunca consegue logar de novo via e-mail/senha depois
// que a sessão expirar). Também serve pra trocar senha a qualquer momento.

import { useState, type CSSProperties, type FormEvent } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

const s: Record<string, CSSProperties> = {
  card: { background: 'var(--bg-surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', boxShadow: 'var(--card-shadow)', marginTop: 12 },
  title: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' },
  sub: { fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' },
  label: { display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 5, fontWeight: 600 },
  input: { width: '100%', fontSize: 13, padding: '9px 12px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  btn: { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', marginTop: 10 },
  err: { fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px', marginTop: 10 },
  ok: { fontSize: 12, color: 'var(--success)', background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 8, padding: '8px 12px', marginTop: 10 },
}

export default function AccountPasswordCard() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setOk(false)

    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }

    setLoading(true)
    // updateUser roda direto no browser client — a senha nunca passa por
    // nenhuma rota nossa nem fica em log algum, só trafega pro Supabase.
    const { error: updateErr } = await supabaseBrowser().auth.updateUser({ password })
    setLoading(false)

    if (updateErr) {
      setError(updateErr.message || 'Falha ao definir a senha.')
      return
    }
    setOk(true)
    setPassword('')
    setConfirm('')
  }

  return (
    <div style={s.card}>
      <p style={s.title}>Senha da conta</p>
      <p style={s.sub}>
        Defina ou troque a senha usada pra logar por e-mail/senha. Se você entrou aqui por um link de convite, defina uma senha agora — sem isso, não dá pra logar de novo depois que a sessão atual expirar.
      </p>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 10 }}>
          <label style={s.label}>Nova senha</label>
          <input
            style={s.input}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="mínimo 8 caracteres"
            autoComplete="new-password"
          />
        </div>
        <div>
          <label style={s.label}>Confirmar senha</label>
          <input
            style={s.input}
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="repita a senha"
            autoComplete="new-password"
          />
        </div>
        {error && <div style={s.err}>{error}</div>}
        {ok && <div style={s.ok}>Senha definida com sucesso.</div>}
        <button style={s.btn} type="submit" disabled={loading}>
          {loading ? 'Salvando…' : 'Salvar senha'}
        </button>
      </form>
    </div>
  )
}
