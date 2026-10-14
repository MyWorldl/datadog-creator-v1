// src/lib/progress-estimate.ts
//
// Porcentagem ESTIMADA para operações de uma chamada só (o Datadog não informa
// o andamento): compara o tempo decorrido com a duração típica das últimas
// execuções (média móvel guardada no navegador). A estimativa desacelera perto
// do fim e nunca passa de 95% — só o fim real da operação "completa" a barra.

export const MAX_ESTIMATE = 0.95
export const MIN_EXPECTED_MS = 1500
export const MAX_EXPECTED_MS = 120_000

export function clampExpected(ms: number): number {
  return Math.min(MAX_EXPECTED_MS, Math.max(MIN_EXPECTED_MS, ms))
}

// 0..MAX_ESTIMATE. Em elapsed == expected já passou de ~75%; depois disso
// continua subindo devagar (nunca trava nem volta).
export function estimateFraction(elapsedMs: number, expectedMs: number): number {
  if (!(elapsedMs > 0)) return 0
  const e = clampExpected(expectedMs)
  return MAX_ESTIMATE * (1 - Math.exp((-1.6 * elapsedMs) / e))
}

// Média móvel (70% histórico + 30% última), com limites sãos.
export function nextExpected(previousMs: number | null | undefined, lastMs: number): number {
  const last = clampExpected(lastMs)
  if (!previousMs || !Number.isFinite(previousMs)) return last
  return clampExpected(previousMs * 0.7 + last * 0.3)
}
