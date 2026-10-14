// src/lib/create-batches.ts
//
// Lógica pura da criação em LOTES do wizard (DiscoveryCreate): separa o que já
// existe no Datadog do que falta criar e fatia o que falta em lotes pequenos.
// Enviar tudo numa requisição só estourava o timeout da função (centenas/
// milhares de monitores em sequência) e voltava HTML/texto no lugar de JSON.

export const BATCH_SIZE = 25

export interface BatchPlan {
  skipped: number[]    // índices do plano cujo nome já existe (não precisam de requisição)
  batches: number[][]  // índices a criar, em lotes de até `size`, na ordem do plano
}

// `names[i]` = nome do monitor da posição i do plano (de UMA fonte do wizard).
export function planBatches(names: string[], existing: ReadonlySet<string>, size: number = BATCH_SIZE): BatchPlan {
  const skipped: number[] = []
  const todo: number[] = []
  names.forEach((n, i) => (existing.has(n) ? skipped : todo).push(i))
  const batches: number[][] = []
  for (let i = 0; i < todo.length; i += size) batches.push(todo.slice(i, i + size))
  return { skipped, batches }
}

// Lê a resposta SEM lançar: se o servidor devolveu algo que não é JSON (timeout
// da Vercel, página de erro, 413...), vira uma mensagem clara em vez do
// "The string did not match the expected pattern" do Safari.
export async function readJsonSafe(r: Pick<Response, 'ok' | 'status' | 'text'>): Promise<Record<string, unknown>> {
  const text = await r.text()
  try {
    const j = JSON.parse(text)
    if (j && typeof j === 'object') return j as Record<string, unknown>
  } catch { /* cai na mensagem abaixo */ }
  if (r.status === 504 || r.status === 408) return { error: 'O servidor demorou demais para responder (timeout). Tente de novo — os monitores já criados são pulados.' }
  if (r.status === 413) return { error: 'O envio ficou grande demais para o servidor.' }
  return { error: r.ok ? 'Resposta inesperada do servidor.' : `O servidor respondeu ${r.status} sem detalhes.` }
}
