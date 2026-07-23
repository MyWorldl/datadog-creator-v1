// src/lib/rate-limit.js
//
// Dois limitadores independentes, mesmo backend (kv-store/Upstash com
// fallback em memória), semânticas diferentes:
//
//  1. checkLoginRateLimit/recordFailedLogin/resetLoginAttempts — força bruta
//     no Credentials provider. Por IP, conta só TENTATIVAS FALHADAS, bloqueia
//     por um tempo fixo depois de estourar (lockout).
//
//  2. checkApiRateLimit — throttle geral de uso das rotas /api/connections/*
//     e /api/datadog/* (aplicado em proxy.js). Por USUÁRIO autenticado (cai
//     pra IP se anônimo), janela fixa curta, conta TODA requisição (sucesso
//     ou erro) — não é sobre força bruta, é sobre não deixar um script (ou
//     sessão comprometida) martelar a API do Datadog através da nossa app.
//     Limite generoso de propósito: a Home já dispara 2 GETs automáticos
//     (scope-maturity + audit-monitors) a cada navegação, e confirmar criação
//     de um plano de N monitores é SEMPRE 1 requisição (N chamadas ao Datadog
//     acontecem dentro dela, no servidor — ver monitor-create-server.js) — o
//     limite não deveria ser sentido em uso normal, só em abuso.
//
// Backend: se houver Redis externo (kv-store / Upstash) configurado, o estado
// é COMPARTILHADO entre instâncias serverless (proteção real com múltiplas
// instâncias/regigões). Senão, cai para um Map em memória por processo — cobre
// o caso comum (mesma instância, tentativas em sequência). Em erro do Redis,
// faz fallback para memória (fail-open — prioriza disponibilidade).
//
// Interface mantida (agora assíncrona):
//   getClientIp (sync) · checkLoginRateLimit / recordFailedLogin / resetLoginAttempts (async)
//   checkApiRateLimit (async)

import { kvEnabled, kvIncr, kvExpire, kvPttl, kvSetEx, kvDel } from './kv-store.js'

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

// ── Throttle geral de API (/api/connections/*, /api/datadog/*) ──
// Janela fixa (não sliding): simples e suficiente pro limite generoso aqui —
// o pior caso da borda da janela (2x o limite num intervalo curto) ainda é
// bem menor que o que uma sessão comprometida conseguiria martelar sem limite.
const API_WINDOW_S = 60
const API_MAX_REQUESTS = 30
const apiKeyOf = (id) => `ddc:arl:${id}`

// ── fallback em memória (mesmo padrão de `attempts` acima, chave própria) ──
const apiWindows = new Map() // id -> { count, windowStart }
function apiCleanup(now) {
  for (const [key, entry] of apiWindows) {
    if (now - entry.windowStart > API_WINDOW_S * 1000) apiWindows.delete(key)
  }
}

// Pode fazer mais uma requisição agora? -> { allowed, retryAfterSeconds? }
// `id` é o identificador do limitador: "u:<userId>" quando autenticado,
// "ip:<ip>" como fallback pra requisições sem sessão (que as rotas ainda vão
// rejeitar com 401, mas não custa limitar antes de chegar lá).
export async function checkApiRateLimit(id) {
  if (kvEnabled()) {
    try {
      const key = apiKeyOf(id)
      const count = await kvIncr(key)
      if (count === 1) await kvExpire(key, API_WINDOW_S)
      if (count > API_MAX_REQUESTS) {
        const ttlMs = await kvPttl(key)
        return { allowed: false, retryAfterSeconds: typeof ttlMs === 'number' && ttlMs > 0 ? Math.ceil(ttlMs / 1000) : API_WINDOW_S }
      }
      return { allowed: true }
    } catch {
      // cai para memória
    }
  }
  const now = Date.now()
  apiCleanup(now)
  let entry = apiWindows.get(id)
  if (!entry || now - entry.windowStart > API_WINDOW_S * 1000) {
    entry = { count: 0, windowStart: now }
    apiWindows.set(id, entry)
  }
  entry.count += 1
  if (entry.count > API_MAX_REQUESTS) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.windowStart + API_WINDOW_S * 1000 - now) / 1000) }
  }
  return { allowed: true }
}
