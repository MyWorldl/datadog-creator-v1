// src/components/Sidebar.jsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useApp } from '@/context/AppContext'

const navItems = [
  {
    section: 'Ferramentas',
    items: [
      { href: '/ferramentas/dashboard', label: 'Dashboard', icon: '▦' },
      { href: '/monitor', label: 'MonitorsCreator', icon: '◈' },
      { href: '/ferramentas/analise', label: 'Análise do Ambiente', icon: '◎' },
    ],
  },
  {
    section: 'Sistema',
    items: [
      { href: '/configuracoes', label: 'Configurações', icon: '⚙' },
      { href: '/sistema/sobre', label: 'Sobre', icon: 'ⓘ' },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const { setKeysConfigured } = useApp()

  async function handleLogout() {
    // Limpa as chaves httpOnly da sessão antes de sair.
    try { await fetch('/api/session/keys', { method: 'DELETE' }) } catch {}
    setKeysConfigured(false)
    signOut({ callbackUrl: '/' })
  }

  const user = session?.user

  return (
    <aside style={{
      width: 220,
      minHeight: '100vh',
      background: 'var(--bg-sidebar)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{
        padding: '1.25rem 1rem',
        borderBottom: '1px solid rgba(255,255,255,0.15)',
      }}>
        <p style={{ fontSize: 22, fontWeight: 600, color: 'var(--sidebar-logo)', margin: '1px 0 0' }}>
          Datadog Creator
        </p>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--sidebar-text)',
          letterSpacing: '0.03em', textTransform: 'uppercase', margin: 0, opacity: 0.85 }}>
          Ryujin Projects
        </p>
      </div>

      {/* Navegação */}
      <nav style={{ padding: '8px 0', flex: 1 }}>
        {navItems.map(({ section, items }) => (
          <div key={section}>
            <p style={{
              fontSize: 10, fontWeight: 600, color: 'var(--sidebar-text)',
              letterSpacing: '0.10em', textTransform: 'uppercase',
              padding: '10px 1rem 4px', margin: 0, opacity: 0.7,
            }}>
              {section}
            </p>
            {items.map(({ href, label, icon }) => {
              const isActive = pathname === href ||
                (href !== '/' && pathname.startsWith(href))
              return (
                <Link
                  key={href}
                  href={href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    margin: '2px 8px',
                    padding: '8px 10px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
                    background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
                    textDecoration: 'none',
                    transition: 'background 0.1s',
                  }}
                >
                  <span style={{ fontSize: 15 }}>{icon}</span>
                  {label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Rodapé: usuário + sair */}
      <div style={{
        padding: '12px',
        borderTop: '1px solid rgba(255,255,255,0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          background: 'var(--sidebar-active-bg)',
          color: 'var(--sidebar-text-active)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, flexShrink: 0,
        }}>
          {(user?.name || user?.email || '?')[0]?.toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 12, color: 'var(--sidebar-text-active)', margin: 0,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {user?.name || 'Usuário'}
          </p>
        </div>
        <button
          onClick={handleLogout}
          title="Sair"
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.25)',
            color: 'var(--sidebar-text)',
            borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11,
          }}
        >
          Sair
        </button>
      </div>
    </aside>
  )
}
