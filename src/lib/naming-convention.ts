// src/lib/naming-convention.ts
//
// "Aprender" a convenção de nomenclatura dos monitores JÁ existentes no org
// pra sugerir o prefixo do nome dos novos (Etapa 3 do MonitorsCreator), em vez
// de sempre cair no genérico "[MonitorsCreator]". O que se detecta é o
// prefixo entre colchetes no início do título — "[Kafka] RioSP - ...",
// "[Postgres] RDS | ..." — que é estruturalmente o mesmo conceito do campo
// namePrefix do app. Não tenta extrair partes do meio do título (ex.: o nome
// da concessão): isso é convenção específica de cada cliente.
//
// Função pura (sem rede), testável. A rota /api/datadog/naming-convention só
// busca os monitores e chama isto.

export const DEFAULT_NAME_PREFIX = '[MonitorsCreator]'

export interface MonitorNameLike {
  name?: unknown
  tags?: unknown
}

export interface NamingSuggestion {
  prefix: string            // ex.: "[Kafka]"
  matched: number           // monitores com ESSE prefixo dentro do conjunto analisado
  total: number             // tamanho do conjunto analisado
  source: 'related' | 'org' // 'related' = monitores ligados às entidades escolhidas; 'org' = org inteiro
}

const BRACKET_RE = /^\s*(\[[^\]\n]{1,40}\])/

function bracketPrefix(name: unknown): string | null {
  const m = typeof name === 'string' ? BRACKET_RE.exec(name) : null
  return m ? m[1].trim() : null
}

// Monitor "relacionado" a uma entidade: o nome da entidade aparece no título,
// ou há uma tag service:/host:/kube_namespace: com esse valor.
function isRelated(m: MonitorNameLike, hints: string[]): boolean {
  const name = typeof m.name === 'string' ? m.name.toLowerCase() : ''
  const tags = Array.isArray(m.tags) ? (m.tags as unknown[]).filter((t): t is string => typeof t === 'string').map(t => t.toLowerCase()) : []
  return hints.some(h => {
    if (name.includes(h)) return true
    return tags.some(t => t === `service:${h}` || t === `host:${h}` || t === `kube_namespace:${h}`)
  })
}

function mostCommon(monitors: MonitorNameLike[]): { prefix: string; count: number } | null {
  const tally = new Map<string, number>()
  for (const m of monitors) {
    const p = bracketPrefix(m.name)
    // O próprio padrão do app não conta: se o org foi criado só por ele, não é
    // "convenção detectada", é o default de volta.
    if (!p || p.toLowerCase() === DEFAULT_NAME_PREFIX.toLowerCase()) continue
    tally.set(p, (tally.get(p) || 0) + 1)
  }
  let best: { prefix: string; count: number } | null = null
  for (const [prefix, count] of tally) {
    if (!best || count > best.count || (count === best.count && prefix.localeCompare(best.prefix) < 0)) best = { prefix, count }
  }
  return best
}

export function detectNamingConvention(monitors: MonitorNameLike[], hintsRaw: string[] = []): NamingSuggestion | null {
  const all = Array.isArray(monitors) ? monitors : []
  const hints = [...new Set(hintsRaw.map(h => h.trim().toLowerCase()).filter(h => h.length >= 3))]

  // 1) Monitores ligados às entidades que o usuário está prestes a monitorar.
  if (hints.length > 0) {
    const related = all.filter(m => isRelated(m, hints))
    const best = mostCommon(related)
    if (best) return { prefix: best.prefix, matched: best.count, total: related.length, source: 'related' }
  }

  // 2) Fallback: o prefixo mais comum no org inteiro — só se for realmente
  // uma convenção (pelo menos 3 monitores e ≥25% do total), pra não sugerir
  // ruído de um prefixo isolado.
  const best = mostCommon(all)
  if (best && best.count >= 3 && best.count / all.length >= 0.25) {
    return { prefix: best.prefix, matched: best.count, total: all.length, source: 'org' }
  }
  return null
}
