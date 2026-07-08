// src/lib/score-history.js
//
// Guarda a série histórica de um score (ScopeMaturity, cobertura do
// AuditMonitors) para desenhar o sparkline e calcular o delta ("▲ N desde a
// última medição").
//
// Backend: Redis externo (Upstash via kv-store) quando configurado —
// compartilhado entre instâncias serverless; senão, memória por processo.
// Em qualquer erro do Redis, cai para memória (nunca quebra a rota).
//
// Modelo: um ponto por DIA (bucket diário). Se já houve medição hoje, o ponto
// do dia é ATUALIZADO em vez de duplicado — assim a série vira uma tendência
// limpa ao longo dos dias/semanas, não um amontoado de reloads.
//
// Nota: a gravação é read-modify-write (lê, anexa, grava). Para um uso interno
// e de baixa frequência (as rotas têm cache), a chance de corrida é desprezível.

import { kvEnabled, kvGet, kvSetEx } from './kv-store.js'

const CAP = 30                     // mantém os últimos 30 pontos (≈ 30 dias)
const TTL_SEC = 120 * 24 * 3600    // expira em 120 dias sem atualização
const mem = new Map()              // fallback em memória: key -> [{t, score}]
const keyOf = (scope, id) => `ddc:hist:${scope}:${id}`

function dayStart(t) { const d = new Date(t); d.setUTCHours(0, 0, 0, 0); return d.getTime() }

async function readRaw(key) {
  if (kvEnabled()) {
    try { const raw = await kvGet(key); return raw ? JSON.parse(raw) : [] } catch { /* cai p/ memória */ }
  }
  return mem.get(key) || []
}
async function writeRaw(key, hist) {
  if (kvEnabled()) {
    try { await kvSetEx(key, JSON.stringify(hist), TTL_SEC); return } catch { /* cai p/ memória */ }
  }
  mem.set(key, hist)
}

// Registra um novo ponto (substitui o do mesmo dia). Retorna a série resultante.
export async function recordScore(scope, id, score) {
  if (typeof score !== 'number' || Number.isNaN(score)) return await readRaw(keyOf(scope, id))
  const key = keyOf(scope, id)
  const now = Date.now()
  let hist = await readRaw(key)
  const last = hist[hist.length - 1]
  if (last && dayStart(last.t) === dayStart(now)) hist[hist.length - 1] = { t: now, score }
  else hist.push({ t: now, score })
  if (hist.length > CAP) hist = hist.slice(-CAP)
  await writeRaw(key, hist)
  return hist
}

export async function getHistory(scope, id) { return readRaw(keyOf(scope, id)) }

// Delta entre os dois últimos pontos (null se não houver base de comparação).
export function computeDelta(hist) {
  if (!Array.isArray(hist) || hist.length < 2) return null
  return hist[hist.length - 1].score - hist[hist.length - 2].score
}
