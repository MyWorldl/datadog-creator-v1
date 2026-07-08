// src/components/Sidebar.jsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useApp } from '@/context/AppContext'
import { IconDashboard, IconMonitorsCreator, IconScope, IconAnalytics, IconFinops, IconSettings, IconInfo, IconLogout, IconClose } from '@/components/Icons'

const navItems = [
  {
    section: 'Ferramentas',
    items: [
      { href: '/ferramentas/dashboard', label: 'Dashboard', Icon: IconDashboard },
      { href: '/monitor', label: 'MonitorsCreator', Icon: IconMonitorsCreator },
      { href: '/ferramentas/audit', label: 'AuditMonitors', Icon: IconAnalytics },
      { href: '/ferramentas/analise', label: 'ScopeMaturity', Icon: IconScope },
      { href: '/ferramentas/finops', label: 'FinOps Insights', Icon: IconFinops },
    ],
  },
  {
    section: 'Sistema',
    items: [
      { href: '/configuracoes', label: 'Configurações', Icon: IconSettings },
      { href: '/sistema/sobre', label: 'Sobre', Icon: IconInfo },
    ],
  },
]

export default function Sidebar({ isOpen = false, onNavigate, onClose }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const { setKeysConfigured } = useApp()

  async function handleLogout() {
    // As orgs salvas ficam no Supabase (não numa sessão) — não há nada pra
    // limpar no servidor aqui. Só reseta o estado local da UI.
    setKeysConfigured(false)
    signOut({ callbackUrl: '/' })
  }

  const user = session?.user

  return (
    <aside className={`app-sidebar${isOpen ? ' is-open' : ''}`}>
      {/* Logo */}
      <div style={{
        padding: '1.25rem 1rem',
        borderBottom: '1px solid rgba(255,255,255,0.15)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
      }}>
        <div>
          <p style={{ fontSize: 22, fontWeight: 600, color: 'var(--sidebar-logo)', margin: '1px 0 0' }}>
            Datadog Creator
          </p>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--sidebar-text)',
            letterSpacing: '0.03em', textTransform: 'uppercase', margin: 0, opacity: 0.85 }}>
            Ryujin Projects
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Fechar menu"
          className="sidebar-close-btn"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--sidebar-logo)',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <IconClose size={20} />
        </button>
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
            {items.map(({ href, label, Icon }) => {
              const isActive = pathname === href ||
                (href !== '/' && pathname.startsWith(href))
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
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
                  <span style={{ display: 'inline-flex' }}><Icon size={17} /></span>
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
            fontSize: 12, fontWeight: 600, color: 'var(--sidebar-logo)', margin: 0,
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
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}
        >
          <IconLogout size={13} /> Sair
        </button>
      </div>
    </aside>
  )
}
