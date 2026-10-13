// src/components/discovery/useNamingSuggestion.ts
//
// Etapa 3 (Personalizar): ao abrir, se o campo de prefixo ainda está no
// padrão "[MonitorsCreator]", busca a convenção de nomes já usada no org e
// PRÉ-PREENCHE a sugestão (o usuário continua podendo editar/apagar). Nunca
// sobrescreve algo que a pessoa já digitou — por isso `apply` recebe o
// prefixo ATUAL e só aplica se continuar no default quando a resposta chega.
'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_NAME_PREFIX, type NamingSuggestion } from '@/lib/naming-convention'

interface Args {
  prefix: string                         // valor atual do campo
  hints: string[]                        // entidades escolhidas (podem ser [])
  apply: (suggested: string) => void     // grava o prefixo sugerido (checa o default internamente)
}

export function useNamingSuggestion({ prefix, hints, apply }: Args): NamingSuggestion | null {
  const [suggestion, setSuggestion] = useState<NamingSuggestion | null>(null)
  const hintsKey = hints.join(',')

  useEffect(() => {
    if (prefix !== DEFAULT_NAME_PREFIX) return // já personalizado: não incomoda
    let cancelled = false
    fetch(`/api/datadog/naming-convention?hints=${encodeURIComponent(hintsKey)}`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { suggestion?: NamingSuggestion | null } | null) => {
        if (cancelled || !d?.suggestion) return
        setSuggestion(d.suggestion)
        apply(d.suggestion.prefix)
      })
      .catch(() => { /* sugestão é um extra: falha silenciosa */ })
    return () => { cancelled = true }
    // Roda UMA vez por montagem da seção: reexecutar a cada digitação seria
    // refazer a busca à toa (prefix/apply mudam o tempo todo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return suggestion
}

// Texto da notinha exibida sob o campo.
export function suggestionNote(s: NamingSuggestion): string {
  return s.source === 'related'
    ? `Sugestão detectada: ${s.matched} de ${s.total} monitor(es) já existentes ligados a estas entidades usam ${s.prefix}.`
    : `Sugestão detectada: ${s.matched} de ${s.total} monitores deste ambiente usam ${s.prefix}.`
}
