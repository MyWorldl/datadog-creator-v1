// src/lib/job-client.ts
//
// Lado cliente do streaming de job-stream.ts. fetchJob() devolve sempre
// { ok, status, data } — independente da rota responder em NDJSON (com
// progresso) ou em JSON puro (cache hit, erro de auth, rota sem streaming) —
// e nunca lança por resposta que não é JSON (mensagem clara no lugar).

import { readJsonSafe } from './create-batches.ts'

export interface JobProgressInfo {
  done: number
  total: number
  label: string
  /** 0..1, ou null quando não dá pra medir (barra indeterminada). */
  fraction: number | null
}

export interface JobResult<T> {
  ok: boolean
  status: number
  data: T & { error?: string; hint?: string }
}

type Line =
  | { type: 'progress'; done: number; total: number; label: string }
  | { type: 'result'; data: unknown }
  | { type: 'error'; status: number; body: unknown }

export function toProgressInfo(done: number, total: number, label: string): JobProgressInfo {
  return { done, total, label, fraction: total > 0 ? Math.max(0, Math.min(1, done / total)) : null }
}

export async function fetchJob<T = Record<string, unknown>>(
  url: string,
  opts: { init?: RequestInit; onProgress?: (p: JobProgressInfo) => void } = {},
): Promise<JobResult<T>> {
  const r = await fetch(url, opts.init)
  const type = r.headers?.get?.('content-type') || ''

  // JSON puro (cache, auth, validação, rota sem streaming).
  if (!type.includes('ndjson') || !r.body) {
    const data = await readJsonSafe(r)
    return { ok: r.ok, status: r.status, data: data as JobResult<T>['data'] }
  }

  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let final: JobResult<T> | null = null

  const handle = (raw: string) => {
    if (!raw.trim()) return
    let line: Line
    try { line = JSON.parse(raw) as Line } catch { return }
    if (line.type === 'progress') opts.onProgress?.(toProgressInfo(line.done, line.total, line.label))
    else if (line.type === 'result') final = { ok: true, status: 200, data: (line.data ?? {}) as JobResult<T>['data'] }
    else if (line.type === 'error') final = { ok: false, status: line.status || 500, data: ((line.body as object) ?? { error: 'Falha.' }) as JobResult<T>['data'] }
  }

  for (;;) {
    const { value, done } = await reader.read()
    if (value) buf += dec.decode(value, { stream: !done })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, nl)); buf = buf.slice(nl + 1) }
    if (done) break
  }
  handle(buf)

  return final ?? { ok: false, status: 502, data: { error: 'A resposta terminou antes do resultado (conexão interrompida). Tente de novo.' } as JobResult<T>['data'] }
}
