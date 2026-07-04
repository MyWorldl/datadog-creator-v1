// src/lib/kv-store.js
//
// Cliente mínimo para um Redis externo (Upstash) via REST API — usando só
// fetch, sem adicionar dependência. Serve de backend COMPARTILHADO para o
// rate-limit de login e o cache de rotas, resolvendo a limitação de "memória
// por instância" em serverless (Vercel).
//
// Ativação: basta definir as variáveis de ambiente
//   UPSTASH_REDIS_REST_URL   e   UPSTASH_REDIS_REST_TOKEN
// (a integração Upstash da Vercel injeta ambas). Sem elas, kvEnabled() é
// false e os módulos que usam este cliente caem no modo em memória.
//
// Formato REST (body-style): POST na URL base com Authorization: Bearer,
// corpo = array do comando, ex.: ["SET","k","v","EX","300"] -> {"result":"OK"}.
// Doc oficial: https://upstash.com/docs/redis/features/restapi

const URL = process.env.UPSTASH_REDIS_REST_URL || ''
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || ''

export function kvEnabled() {
  return Boolean(URL && TOKEN)
}

// Executa um comando Redis. Lança em erro de rede/HTTP/Redis — quem chama
// decide o fallback (normalmente: cair para memória / tratar como cache miss).
async function cmd(args) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    cache: 'no-store',
  })
  if (!r.ok) throw new Error(`upstash HTTP ${r.status}`)
  const j = await r.json()
  if (j && j.error) throw new Error(j.error)
  return j ? j.result : null
}

export const kvGet = (key) => cmd(['GET', key])
export const kvSetEx = (key, val, ttlSec) => cmd(['SET', key, val, 'EX', String(ttlSec)])
export const kvIncr = (key) => cmd(['INCR', key])
export const kvExpire = (key, ttlSec) => cmd(['EXPIRE', key, String(ttlSec)])
export const kvPttl = (key) => cmd(['PTTL', key])
export const kvDel = (key) => cmd(['DEL', key])
