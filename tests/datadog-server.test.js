// tests/datadog-server.test.js — node --test, sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSafeDqlToken, ddGetRetry429, mapPaced } from '../src/lib/datadog-server.ts'

test('isSafeDqlToken: aceita nomes de métrica e valores de tag comuns', () => {
  assert.equal(isSafeDqlToken('datadog.estimated_usage.hosts'), true)
  assert.equal(isSafeDqlToken('trace.http.request.hits'), true)
  assert.equal(isSafeDqlToken('prod-env_1'), true)
  assert.equal(isSafeDqlToken('team/checkout'), true)
})

test('isSafeDqlToken: rejeita caracteres de sintaxe DQL, vazio e tipos errados', () => {
  assert.equal(isSafeDqlToken(''), false)
  assert.equal(isSafeDqlToken('foo{*}'), false)
  assert.equal(isSafeDqlToken('foo,bar'), false)
  assert.equal(isSafeDqlToken('foo"bar'), false)
  assert.equal(isSafeDqlToken("foo'); DROP"), false)
  assert.equal(isSafeDqlToken('foo\nbar'), false)
  assert.equal(isSafeDqlToken(null), false)
  assert.equal(isSafeDqlToken(undefined), false)
  assert.equal(isSafeDqlToken('a'.repeat(201)), false)
})

// ── rate limit: retry em 429 + espaçamento (Metrics List v2 = 50 req/10s) ──

const ctx = { apiKey: 'k', appKey: 'a', site: 'datadoghq.com' }

// Troca o fetch global por uma fila de respostas pré-definidas.
function mockFetch(responses) {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    const r = responses.shift()
    return new Response(r.body ?? '{}', { status: r.status, headers: r.headers || {} })
  }
  return { calls, restore: () => { globalThis.fetch = original } }
}

test('ddGetRetry429: 429 com x-ratelimit-reset espera esse tempo (+folga) e tenta de novo até dar certo', async () => {
  const m = mockFetch([
    { status: 429, headers: { 'x-ratelimit-reset': '8' } },
    { status: 200, body: '{"data":[]}' },
  ])
  const sleeps = []
  try {
    const r = await ddGetRetry429(ctx, '/api/v2/metrics', { sleep: async ms => { sleeps.push(ms) } })
    assert.equal(r.ok, true)
    assert.equal(m.calls.length, 2)
    assert.deepEqual(sleeps, [8250])
  } finally { m.restore() }
})

test('ddGetRetry429: sem header usa 1s de base; para depois de maxRetries e devolve o 429', async () => {
  const m = mockFetch([{ status: 429 }, { status: 429 }, { status: 429 }])
  const sleeps = []
  try {
    const r = await ddGetRetry429(ctx, '/x', { maxRetries: 2, sleep: async ms => { sleeps.push(ms) } })
    assert.equal(r.ok, false)
    assert.equal(r.status, 429)
    assert.equal(m.calls.length, 3) // 1 + 2 retries
    assert.deepEqual(sleeps, [1250, 1250])
  } finally { m.restore() }
})

test('ddGetRetry429: espera é limitada por maxWaitMs; erro que não é 429 não é retentado', async () => {
  const m1 = mockFetch([{ status: 429, headers: { 'x-ratelimit-reset': '600' } }, { status: 200 }])
  const sleeps = []
  try {
    await ddGetRetry429(ctx, '/x', { maxWaitMs: 5000, sleep: async ms => { sleeps.push(ms) } })
    assert.deepEqual(sleeps, [5000])
  } finally { m1.restore() }

  const m2 = mockFetch([{ status: 403 }])
  try {
    const r = await ddGetRetry429(ctx, '/x', { sleep: async () => { throw new Error('não deveria dormir') } })
    assert.equal(r.status, 403)
    assert.equal(m2.calls.length, 1)
  } finally { m2.restore() }
})

test('mapPaced: preserva a ordem e espaça o INÍCIO das chamadas em pelo menos gapMs', async () => {
  const starts = []
  const slept = []
  const out = await mapPaced(['a', 'b', 'c'], async x => { starts.push(Date.now()); return x.toUpperCase() }, 250, async ms => { slept.push(ms) })
  assert.deepEqual(out, ['A', 'B', 'C'])
  // 1ª chamada sem espera; as 2 seguintes dormem (fn é instantânea, então ~gap cheio)
  assert.equal(slept.length, 2)
  for (const ms of slept) assert.ok(ms > 200 && ms <= 250, `espera inesperada: ${ms}`)
})

test('mapPaced: lista vazia devolve vazio sem dormir', async () => {
  assert.deepEqual(await mapPaced([], async x => x, 250, async () => { throw new Error('não deveria dormir') }), [])
})
