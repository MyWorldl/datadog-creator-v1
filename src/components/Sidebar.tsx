// src/components/Sidebar.tsx
'use client'
/* eslint-disable react-hooks/set-state-in-effect --
   O efeito abaixo sincroniza a categoria aberta com a navegação (sistema
   externo ao componente), não é loop de render. */

import { useEffect, useRef, useState, type CSSProperties, type ComponentType } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from '@/context/SupabaseAuthContext'
import { useApp } from '@/context/AppContext'
import {
  IconDashboard, IconMonitorsCreator, IconScope, IconAnalytics,
  IconFinops, IconSettings, IconInfo, IconLogout, IconClose, IconArrow, IconRename,
} from '@/components/Icons'

interface NavItem {
  href: string
  label: string
  Icon: ComponentType<{ size?: number }>
}

interface NavCategory {
  key: string
  label: string
  Icon: ComponentType<{ size?: number }>
  items: NavItem[]
}

// Categorias de navegação da sidebar. TODAS funcionam do mesmo jeito, mesmo
// as que têm só 1 recurso (Home, Financeiro): passar o mouse abre um flyout
// AO LADO, na mesma cor/tema da sidebar (não é um card branco flutuando
// por cima da página, é uma extensão dela). Em telas touch (sem hover), o
// clique no cabeçalho abre/fecha do mesmo jeito.
const categories: NavCategory[] = [
  {
    key: 'home',
    label: 'Home',
    Icon: IconDashboard,
    items: [
      { href: '/ferramentas/dashboard', label: 'Dashboard', Icon: IconDashboard },
    ],
  },
  {
    key: 'observabilidade',
    label: 'Observabilidade',
    Icon: IconAnalytics,
    items: [
      { href: '/ferramentas/monitor', label: 'MonitorsCreator', Icon: IconMonitorsCreator },
      { href: '/ferramentas/audit', label: 'AuditMonitors', Icon: IconAnalytics },
      { href: '/ferramentas/analise', label: 'ScopeMaturity', Icon: IconScope },
      { href: '/ferramentas/bulk-rename', label: 'SwitchName', Icon: IconRename },
    ],
  },
  {
    key: 'financeiro',
    label: 'Financeiro',
    Icon: IconFinops,
    items: [
      { href: '/ferramentas/finops', label: 'FinOps Insights', Icon: IconFinops },
    ],
  },
  {
    key: 'sistema',
    label: 'Sistema',
    Icon: IconSettings,
    items: [
      { href: '/configuracoes', label: 'Configurações', Icon: IconSettings },
      { href: '/sistema/sobre', label: 'Sobre', Icon: IconInfo },
    ],
  },
]

function isItemActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/' && pathname.startsWith(href))
}

function rowStyle({ active, hovered }: { active: boolean; hovered: boolean }): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    width: 'calc(100% - 16px)',
    margin: '2px 8px',
    padding: '8px 10px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
    background: active ? 'var(--sidebar-active-bg)' : hovered ? 'rgba(255,255,255,0.08)' : 'transparent',
    textDecoration: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    lineHeight: 'inherit',
    transition: 'background 0.1s',
  }
}

interface CategoryGroupProps {
  category: NavCategory
  pathname: string
  openKey: string | null
  setOpenKey: (updater: string | null | ((curr: string | null) => string | null)) => void
  onNavigate?: () => void
}

function CategoryGroup({ category, pathname, openKey, setOpenKey, onNavigate }: CategoryGroupProps) {
  const { key, label, Icon, items } = category
  const isActive = items.some((it) => isItemActive(pathname, it.href))
  const isOpen = openKey === key
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function openNow() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setOpenKey(key)
  }

  function closeLater() {
    closeTimer.current = setTimeout(() => {
      setOpenKey((curr) => (curr === key ? null : curr))
    }, 180)
  }

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={openNow}
      onMouseLeave={closeLater}
    >
      <button
        type="button"
        onClick={() => setOpenKey(isOpen ? null : key)}
        aria-expanded={isOpen}
        style={rowStyle({ active: isActive, hovered: isOpen })}
      >
        <span style={{ display: 'inline-flex' }}><Icon size={17} /></span>
        <span style={{ flex: 1 }}>{label}</span>
        <span
          style={{
            display: 'inline-flex',
            transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            opacity: 0.7,
          }}
        >
          <IconArrow size={13} />
        </span>
      </button>

      {isOpen && (
        <div
          className="sidebar-flyout"
          onMouseEnter={openNow}
          onMouseLeave={closeLater}
        >
          {items.map((item) => {
            const active = isItemActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  onNavigate?.()
                  setOpenKey(null)
                }}
                className="sidebar-flyout-item"
                data-active={active ? 'true' : 'false'}
              >
                <span style={{ display: 'inline-flex' }}><item.Icon size={15} /></span>
                {item.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface SidebarProps {
  isOpen?: boolean
  onNavigate?: () => void
  onClose?: () => void
}

export default function Sidebar({ isOpen = false, onNavigate, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const { setKeysConfigured } = useApp()
  const [openKey, setOpenKey] = useState<string | null>(null)

  // Ao navegar pra dentro de uma categoria (ex.: link direto, favorito,
  // "voltar" do navegador), abre o flyout correspondente automaticamente,
  // pra sempre indicar onde o usuário está. Some sozinho quando o mouse sai.
  useEffect(() => {
    const active = categories.find((c) => c.items.some((it) => isItemActive(pathname, it.href)))
    if (active) setOpenKey(active.key)
  }, [pathname])

  async function handleLogout() {
    // As orgs salvas ficam no Supabase (não numa sessão) — não há nada pra
    // limpar no servidor aqui. Só reseta o estado local da UI.
    setKeysConfigured()
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
        {categories.map((category) => (
          <CategoryGroup
            key={category.key}
            category={category}
            pathname={pathname}
            openKey={openKey}
            setOpenKey={setOpenKey}
            onNavigate={onNavigate}
          />
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
