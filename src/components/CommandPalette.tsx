// src/components/CommandPalette.tsx
//
// Paleta de comandos (Ctrl/Cmd+K): busca rápida pra navegar entre as
// ferramentas e executar ações globais (ex.: alternar tema) sem passar pelo
// menu lateral — útil sobretudo no teclado e em telas pequenas, onde a
// sidebar fica escondida. Fonte única de navegação: `categories` da Sidebar.
'use client'

import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/context/AppContext'
import { categories } from '@/components/Sidebar'

interface Command {
  id: string
  label: string
  hint: string          // grupo (ex.: "Observabilidade") ou "Ação"
  keywords: string      // termos extras que também casam na busca
  Icon?: ComponentType<{ size?: number }>
  run: () => void
}

// Normaliza pra busca sem acento/caixa ("configuracoes" acha "Configurações").
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function CommandPalette({ open, onClose }: Props) {
  const router = useRouter()
  const { theme, setTheme } = useApp()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = categories.flatMap(cat => cat.items.map(it => ({
      id: it.href,
      label: it.label,
      hint: cat.label,
      keywords: `${cat.label} ${it.href}`,
      Icon: it.Icon,
      run: () => router.push(it.href),
    })))
    const next = theme === 'dark' ? 'light' : 'dark'
    const actions: Command[] = [
      { id: 'act-theme', label: `Alternar para tema ${next === 'dark' ? 'escuro' : 'claro'}`, hint: 'Ação', keywords: 'tema dark light claro escuro aparencia', run: () => setTheme(next) },
      { id: 'act-system', label: 'Usar tema do sistema', hint: 'Ação', keywords: 'tema automatico sistema', run: () => setTheme('system') },
    ]
    return [...nav, ...actions]
  }, [router, theme, setTheme])

  const results = useMemo(() => {
    const terms = norm(query).split(/\s+/).filter(Boolean)
    if (terms.length === 0) return commands
    return commands.filter(c => {
      const hay = norm(`${c.label} ${c.hint} ${c.keywords}`)
      return terms.every(t => hay.includes(t))
    })
  }, [commands, query])

  // Ao abrir: limpa a busca e foca o campo.
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset ao abrir (sistema externo: atalho de teclado)
    setQuery(''); setActive(0)
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  // Mantém o item ativo visível ao navegar com as setas.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, results])

  if (!open) return null

  function choose(c: Command | undefined) {
    if (!c) return
    onClose()
    c.run()
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, Math.max(results.length - 1, 0))) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]) }
  }

  return (
    <div className="cmdk-backdrop" onMouseDown={onClose}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Paleta de comandos" onMouseDown={e => e.stopPropagation()} onKeyDown={onKeyDown}>
        <input
          ref={inputRef}
          className="cmdk-input"
          value={query}
          onChange={e => { setQuery(e.target.value); setActive(0) }}
          placeholder="Ir para… ou digite uma ação"
          aria-label="Buscar comando"
          role="combobox"
          aria-expanded="true"
          aria-controls="cmdk-list"
          aria-activedescendant={results[active] ? `cmdk-${results[active].id}` : undefined}
        />
        <ul id="cmdk-list" ref={listRef} className="cmdk-list" role="listbox">
          {results.map((c, i) => (
            <li
              key={c.id}
              id={`cmdk-${c.id}`}
              role="option"
              aria-selected={i === active}
              className="cmdk-item"
              onMouseMove={() => setActive(i)}
              onClick={() => choose(c)}
            >
              <span className="cmdk-icon" aria-hidden="true">{c.Icon ? <c.Icon size={16} /> : '⚡'}</span>
              <span className="cmdk-label">{c.label}</span>
              <span className="cmdk-hint">{c.hint}</span>
            </li>
          ))}
          {results.length === 0 && <li className="cmdk-empty">Nada encontrado para &quot;{query}&quot;.</li>}
        </ul>
        <div className="cmdk-foot" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>↵</kbd> abrir</span>
          <span><kbd>esc</kbd> fechar</span>
        </div>
      </div>
    </div>
  )
}
