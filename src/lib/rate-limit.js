// src/lib/rate-limit.js
//
// Rate limiting de login por IP (dificulta força bruta no Credentials provider).
//
// Backend: se houver Redis externo (kv-store / Upstash) configurado, o estado
// é COMPARTILHADO entre instâncias serverless (proteção real com múltiplas
// instâncias/regigões). Senão, cai para um Map em memória por processo — cobre
// o caso comum (mesma instância, tentativas em sequência). Em erro do Redis,
// faz fallback para memória (fail-open no login — prioriza disponibilidade).
//
// Interface mantida (agora assíncrona):
//   getClientIp (sync) · checkLoginRateLimit / recordFailedLogin / resetLoginAttempts (async)

import { kvEnabled, kvIncr, kvExpire, kvPttl, kvSetEx, kvDel } from '@/lib/kv-store'

const WINDOW_MS = 15 * 60 * 1000    // janela de contagem de falhas
const MAX_ATTEMPTS = 5              // falhas permitidas na janela
const LOCKOUT_MS = 15 * 60 * 1000   // bloqueio após estourar o limite

const WINDOW_S = Math.floor(WINDOW_MS / 1000)
const LOCKOUT_S = Math.floor(LOCKOUT_MS / 1000)
const countKey = (ip) => `ddc:rl:count:${ip}`
const lockKey = (ip) => `ddc:rl:lock:${ip}`

// ── fallback em memória ──
const attempts = new Map() // ip -> { count, firstAttemptAt, lockedUntil }
function cleanup(now) {
  for (const [key, entry] of attempts) {
    const lockExpired = !entry.lockedUntil || entry.lockedUntil < now
    const windowExpired = now - entry.firstAttemptAt > WINDOW_MS
    if (lockExpired && windowExpired) attempts.delete(key)
  }
}

// x-forwarded-for pode vir "ip-cliente, proxy1, proxy2" — o 1º é o cliente.
export function getClientIp(request) {
  const headers = request?.headers
  if (!headers?.get) return 'unknown'
  const fwd = headers.get('x-forwarded-for') || ''
  if (fwd) return fwd.split(',')[0].trim()
  const real = headers.get('x-real-ip') || ''
  if (real) return real.trim()
  return 'unknown'
}

// Pode tentar logar agora? -> { allowed, retryAfterSeconds? }
export async function checkLoginRateLimit(key) {
  if (kvEnabled()) {
    try {
      const ttlMs = await kvPttl(lockKey(key)) // -2 sem chave, -1 sem expiração, >0 ms restantes
      if (typeof ttlMs === 'number' && ttlMs > 0) {
        return { allowed: false, retryAfterSeconds: Math.ceil(ttlMs / 1000) }
      }
      return { allowed: true }
    } catch {
      // cai para memória
    }
  }
  const now = Date.now()
  cleanup(now)
  const entry = attempts.get(key)
  if (!entry?.lockedUntil) return { allowed: true }
  if (entry.lockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000) }
  }
  attempts.delete(key)
  return { allowed: true }
}

// Registra uma falha; ao estourar MAX_ATTEMPTS na janela, aplica o lockout.
export async function recordFailedLogin(key) {
  if (kvEnabled()) {
    try {
      const count = await kvIncr(countKey(key))
      if (count === 1) await kvExpire(countKey(key), WINDOW_S)
      if (count >= MAX_ATTEMPTS) await kvSetEx(lockKey(key), '1', LOCKOUT_S)
      return
    } catch {
      // cai para memória
    }
  }
  const now = Date.now()
  const entry = attempts.get(key)
  if (!entry || now - entry.firstAttemptAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttemptAt: now, lockedUntil: null })
    return
  }
  entry.count += 1
  if (entry.count >= MAX_ATTEMPTS) entry.lockedUntil = now + LOCKOUT_MS
}

// Limpa o histórico ao logar com sucesso.
export async function resetLoginAttempts(key) {
  if (kvEnabled()) {
    try { await kvDel(countKey(key)); await kvDel(lockKey(key)); return }
    catch { /* cai para memória */ }
  }
  attempts.delete(key)
}
