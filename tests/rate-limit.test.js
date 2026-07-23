// tests/rate-limit.test.js — node --test, sem deps.
//
// Sem UPSTASH_REDIS_REST_URL/TOKEN no ambiente de teste, kvEnabled() é false
// e checkApiRateLimit cai direto no fallback em memória — é esse caminho que
// os testes abaixo exercitam.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkApiRateLimit } from '../src/lib/rate-limit.js'

test('checkApiRateLimit: permite até o limite e bloqueia a partir da próxima', async () => {
  const id = `test-${Math.random()}`
  for (let i = 0; i < 30; i++) {
    const r = await checkApiRateLimit(id)
    assert.equal(r.allowed, true, `requisição ${i + 1}/30 deveria ser permitida`)
  }
  const blocked = await checkApiRateLimit(id)
  assert.equal(blocked.allowed, false)
  assert.ok(blocked.retryAfterSeconds > 0)
})

test('checkApiRateLimit: identificadores diferentes têm janelas independentes', async () => {
  const a = `test-a-${Math.random()}`
  const b = `test-b-${Math.random()}`
  for (let i = 0; i < 30; i++) await checkApiRateLimit(a)
  const aBlocked = await checkApiRateLimit(a)
  const bAllowed = await checkApiRateLimit(b)
  assert.equal(aBlocked.allowed, false)
  assert.equal(bAllowed.allowed, true)
})
