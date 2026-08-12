// src/lib/bulk-rename.ts
//
// Renomeação em lote de monitores existentes, por busca/substituição no
// NOME (não mexe em query/tags/options) — usado por
// /api/datadog/monitors/bulk-rename (preview via GET, aplica via POST) e
// pela página ferramentas/bulk-rename.
//
// Substituição é LITERAL (substring), não regex — search/replace são texto
// livre (nomes de monitor têm colchetes, emoji, @menções etc.), então tratar
// como regex exigiria escapar caracteres especiais sem necessidade real:
// o caso de uso é "trocar um prefixo/trecho fixo em vários monitores de
// uma vez", não busca por padrão.

export interface MonitorRef {
  id: string | number
  name?: string
}

export interface RenameCandidate {
  id: string | number
  oldName: string
  newName: string
}

// Só entram no resultado monitores cujo nome CONTÉM `search` — e cujo nome
// resultante seria de fato diferente (proteção redundante contra
// search==='' deslizar por algum caminho e "casar" tudo; o chamador já deve
// barrar search vazio antes de chegar aqui).
export function computeRenames(monitors: MonitorRef[], search: string, replace: string): RenameCandidate[] {
  if (!search) return []
  const out: RenameCandidate[] = []
  for (const m of monitors) {
    if (typeof m.name !== 'string' || !m.name.includes(search)) continue
    const newName = m.name.replaceAll(search, replace)
    if (newName === m.name) continue
    out.push({ id: m.id, oldName: m.name, newName })
  }
  return out
}
