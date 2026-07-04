// src/lib/route-cache.js
//
// Cache curto (TTL) para respostas de rotas pesadas que fazem muitas chamadas
// ao Datadog (scope-maturity, finops, monitors-analytics). Evita bater rate
// limit (429) em refresh repetido ou uso simultâneo da mesma conta.
//
// Backend: se houver Redis externo configurado (kv-store / Upstash), usa ele
// — cache COMPARTILHADO entre instâncias serverless. Senão, cai para um Map
// em memória (por processo). Em qualquer erro do Redis, trata como cache miss
// (recalcula), nunca quebra a rota.
//
// Interface mantida (agora assíncrona): cacheKey (sync), cacheGet/cacheSet (async).

import { createHash } from 'node:crypto'
import { kvEnabled, kvGet, kvSetEx } from '@/lib/kv-store'

const PREFIX = 'ddc:cache:'
const store = new Map() // fallback em memória: key -> { value, expiresAt }

// Deriva uma chave sem guardar api/app key em texto puro.
export function cacheKey(parts) {
  const raw = Array.isArray(parts) ? parts.join('|') : String(parts)
  return createHash('sha256').update(raw).digest('hex')
}

export async function cacheGet(key) {
  if (kvEnabled()) {
    try {
      const raw = await kvGet(PREFIX + key)
      return raw ? JSON.parse(raw) : undefined
    } catch {
      // erro no Redis -> trata como miss (segue para memória/recalcular)
    }
  }
  const entry = store.get(key)
  if (!entry) return undefined
  if (entry.expiresAt < Date.now()) { store.delete(key); return undefined }
  return entry.value
}

export async function cacheSet(key, value, ttlMs) {
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
