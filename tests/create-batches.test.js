// tests/create-batches.test.js — runner nativo do Node (node --test), sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planBatches, readJsonSafe, BATCH_SIZE } from '../src/lib/create-batches.ts'
import { selectBatch, MAX_BATCH } from '../src/lib/monitor-create-server.ts'

test('planBatches: separa os já existentes e fatia o resto em lotes na ordem do plano', () => {
  const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
  const r = planBatches(names, new Set(['b', 'e']), 2)
  assert.deepEqual(r.skipped, [1, 4])
  assert.deepEqual(r.batches, [[0, 2], [3, 5], [6]])
})

test('planBatches: tudo existente = nenhum lote; plano vazio = nada', () => {
  assert.deepEqual(planBatches(['a', 'b'], new Set(['a', 'b'])), { skipped: [0, 1], batches: [] })
  assert.deepEqual(planBatches([], new Set()), { skipped: [], batches: [] })
})

test('planBatches: 3432 itens viram lotes de no máximo BATCH_SIZE (e BATCH_SIZE cabe no limite do servidor)', () => {
  const names = Array.from({ length: 3432 }, (_, i) => `m${i}`)
  const { batches } = planBatches(names, new Set())
  assert.equal(batches.length, Math.ceil(3432 / BATCH_SIZE))
  assert.ok(batches.every(b => b.length <= BATCH_SIZE))
  assert.equal(batches.flat().length, 3432)
  assert.ok(BATCH_SIZE <= MAX_BATCH)
})

const resp = (status, body) => ({ ok: status < 400, status, text: async () => body })

test('readJsonSafe: JSON válido passa; HTML/texto vira mensagem clara (não lança)', async () => {
  assert.deepEqual(await readJsonSafe(resp(200, '{"created":3}')), { created: 3 })
  const timeout = await readJsonSafe(resp(504, '<html>Gateway Timeout</html>'))
  assert.match(String(timeout.error), /timeout/i)
  assert.match(String((await readJsonSafe(resp(500, 'boom'))).error), /500/)
  assert.match(String((await readJsonSafe(resp(200, ''))).error), /inesperada/i)
  assert.match(String((await readJsonSafe(resp(413, 'x'))).error), /grande/i)
})

test('selectBatch: sem batch = plano inteiro com checagem normal; com batch = só os índices, sem relistar', () => {
  const plan = ['p0', 'p1', 'p2', 'p3']
  const all = selectBatch(undefined, plan)
  assert.ok(all.ok); assert.deepEqual(all.plan, plan); assert.equal(all.options.existingNames, undefined)
  const some = selectBatch({ only: [3, 1] }, plan)
  assert.ok(some.ok); assert.deepEqual(some.plan, ['p3', 'p1'])
  assert.ok(some.options.existingNames instanceof Set && some.options.existingNames.size === 0)
})

test('selectBatch: lote inválido (vazio, fora do plano, não inteiro, grande demais) é recusado', () => {
  const plan = ['a', 'b']
  for (const bad of [{ only: [] }, { only: [2] }, { only: [-1] }, { only: [0.5] }, { only: 'x' }, {}, { only: Array.from({ length: MAX_BATCH + 1 }, () => 0) }]) {
    assert.equal(selectBatch(bad, plan).ok, false, JSON.stringify(bad).slice(0, 40))
  }
})

// ── createPlanIdempotent com Datadog simulado (fetch global trocado) ──
import { createPlanIdempotent } from '../src/lib/monitor-create-server.ts'

function fakeDatadog({ existing = [], rate429 = new Set() } = {}) {
  const calls = { list: 0, create: [], inflight: 0, maxInflight: 0, attempts: {} }
  const orig = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const u = String(url)
    const json = (status, body) => ({ ok: status < 400, status, headers: new Headers(), json: async () => body, text: async () => JSON.stringify(body) })
    if (init?.method === 'POST') {
      const body = JSON.parse(init.body)
      calls.attempts[body.name] = (calls.attempts[body.name] || 0) + 1
      calls.inflight++; calls.maxInflight = Math.max(calls.maxInflight, calls.inflight)
      await new Promise(r => setTimeout(r, 5))
      calls.inflight--
      if (rate429.has(body.name) && calls.attempts[body.name] === 1) return json(429, { errors: ['rate'] })
      if (body.name.startsWith('ruim')) return json(400, { errors: ['query inválida'] })
      calls.create.push(body.name)
      return json(200, { id: 1000 + calls.create.length })
    }
    if (u.includes('/api/v1/monitor?')) { calls.list++; return json(200, existing.map(name => ({ name, tags: ['created_by:monitorscreator'] }))) }
    return json(404, {})
  }
  return { calls, restore: () => { globalThis.fetch = orig } }
}
const ctx = { apiKey: 'k', appKey: 'a', site: 'datadoghq.com' }
const entry = name => ({ kind: 'k', service: 's', operation: 'o', query: 'q', payload: { name, type: 'query alert', query: 'q' } })

test('createPlanIdempotent: resultados na ordem do plano mesmo em paralelo, duplicado pulado, erro isolado, 429 retentado', async () => {
  const fd = fakeDatadog({ existing: ['m3'], rate429: new Set(['m5']) })
  try {
    const plan = ['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'ruim6', 'm7'].map(entry)
    const r = await createPlanIdempotent(ctx, plan)
    assert.deepEqual(r.results.map(x => x.name ?? null), ['m0', 'm1', 'm2', 'm3', 'm4', 'm5', null, 'm7'])
    assert.equal(r.results[3].skipped, true)
    assert.equal(r.results[6].ok, false)
    assert.match(String(r.results[6].error), /query inválida/)
    assert.equal(r.results[5].ok, true) // 429 na 1ª tentativa, ok na 2ª
    assert.equal(fd.calls.attempts.m5, 2)
    assert.equal(r.created, 6); assert.equal(r.skipped, 1); assert.equal(r.total, 8)
    assert.ok(fd.calls.maxInflight > 1 && fd.calls.maxInflight <= 4, `concorrência ${fd.calls.maxInflight}`)
    assert.equal(fd.calls.list, 1)
  } finally { fd.restore() }
})

test('createPlanIdempotent: com existingNames informado NÃO lista os monitores (lote do wizard)', async () => {
  const fd = fakeDatadog({ existing: ['m0'] })
  try {
    const r = await createPlanIdempotent(ctx, [entry('m0'), entry('m1')], { existingNames: new Set() })
    assert.equal(fd.calls.list, 0)
    assert.equal(r.created, 2) // m0 existe no Datadog, mas o cliente já filtrou: o lote confia nele
  } finally { fd.restore() }
})
