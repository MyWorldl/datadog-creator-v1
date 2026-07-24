// src/lib/route-cache.ts
//
// Cache curto (TTL) para respostas de rotas pesadas que fazem muitas chamadas
// ao Datadog (scope-maturity, finops, audit-monitors). Evita bater rate
// limit (429) em refresh repetido ou uso simultâneo da mesma conta.
//
// Backend: se houver Redis externo configurado (kv-store / Upstash), usa ele
// — cache COMPARTILHADO entre instâncias serverless. Senão, cai para um Map
// em memória (por processo). Em qualquer erro do Redis, trata como cache miss
// (recalcula), nunca quebra a rota.
//
// Interface mantida (agora assíncrona): cacheKey (sync), cacheGet/cacheSet (async).
//
// ⚠️ ISSO NÃO É RATE-LIMIT: este cache existe pra reduzir chamadas repetidas
// ao Datadog (performance/custo), não pra impedir abuso. As rotas
// /api/datadog/* e /api/connections/* não têm limite de requisições por
// usuário — só o login (src/lib/rate-limit.ts) tem. Decisão consciente por
// ora: um usuário autenticado ainda consegue bater essas rotas sem limite
// real (o cache só reduz o CUSTO de fazer isso, não impede). Se isso virar
// prioridade, reaproveitar o backend de rate-limit.ts (já suporta Redis/
// Upstash) com uma chave por user.id é o caminho natural.

import { createHash } from 'node:crypto'
import { kvEnabled, kvGet, kvSetEx } from '@/lib/kv-store'

const PREFIX = 'ddc:cache:'
const store = new Map<string, { value: unknown; expiresAt: number }>() // fallback em memória

// Deriva uma chave sem guardar api/app key em texto puro.
export function cacheKey(parts: (string | number)[] | string): string {
  const raw = Array.isArray(parts) ? parts.join('|') : String(parts)
  return createHash('sha256').update(raw).digest('hex')
}

export async function cacheGet<T = unknown>(key: string): Promise<T | undefined> {
  if (kvEnabled()) {
    try {
      const raw = await kvGet(PREFIX + key)
      return raw ? JSON.parse(String(raw)) : undefined
    } catch {
      // erro no Redis -> trata como miss (segue para memória/recalcular)
    }
  }
  const entry = store.get(key)
  if (!entry) return undefined
  if (entry.expiresAt < Date.now()) { store.delete(key); return undefined }
  return entry.value as T
}

export async function cacheSet(key: string, value: unknown, ttlMs: number): Promise<void> {
  if (kvEnabled()) {
    try {
      await kvSetEx(PREFIX + key, JSON.stringify(value), Math.ceil(ttlMs / 1000))
      return
    } catch {
      // erro no Redis -> guarda ao menos em memória
    }
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs })
}
