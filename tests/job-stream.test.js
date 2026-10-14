// tests/job-stream.test.js — runner nativo do Node (node --test), sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { streamJob } from '../src/lib/job-stream.ts'
import { fetchJob, toProgressInfo } from '../src/lib/job-client.ts'

// fetch simulado que devolve a Response de um handler de rota
const asFetch = res => async () => res

test('streamJob emite progresso real e termina com o resultado', async () => {
  const res = streamJob(async p => {
    p.setTotal(3)
    await p.tick(Promise.resolve(1), 'A')
    p.step('B')
    await p.tick(new Promise(r => setTimeout(r, 5)), 'C')
    return Response.json({ ok: 1 })
  })
  const seen = []
  globalThis.fetch = asFetch(res)
  const r = await fetchJob('/x', { onProgress: p => seen.push([p.done, p.total, p.label]) })
  assert.equal(r.ok, true); assert.deepEqual(r.data, { ok: 1 })
  const dones = seen.map(s => s[0])
  assert.deepEqual(dones, [...dones].sort((a, b) => a - b))   // nunca volta
  assert.equal(seen.at(-1)[0], 3); assert.equal(seen.at(-1)[2], 'C')
  assert.ok(seen.some(s => s[2] === 'A') && seen.some(s => s[2] === 'B'))
})

test('streamJob: Response de erro vira erro com status e corpo da rota', async () => {
  const res = streamJob(async () => Response.json({ error: 'sem permissão' }, { status: 403 }))
  globalThis.fetch = asFetch(res)
  const r = await fetchJob('/x')
  assert.equal(r.ok, false); assert.equal(r.status, 403); assert.equal(r.data.error, 'sem permissão')
})

test('streamJob: exceção no handler vira erro 500 (não quebra o stream)', async () => {
  globalThis.fetch = asFetch(streamJob(async () => { throw new Error('boom') }))
  const r = await fetchJob('/x')
  assert.equal(r.ok, false); assert.equal(r.status, 500); assert.match(r.data.error, /boom/)
})

test('fetchJob: JSON puro (cache/auth) continua funcionando; HTML vira mensagem clara', async () => {
  globalThis.fetch = asFetch(Response.json({ score: 80 }))
  assert.deepEqual((await fetchJob('/x')).data, { score: 80 })
  globalThis.fetch = asFetch(new Response('<html>Bad Gateway</html>', { status: 502 }))
  const bad = await fetchJob('/x')
  assert.equal(bad.ok, false); assert.match(bad.data.error, /502/)
})

test('fetchJob: stream cortado antes do resultado vira erro claro', async () => {
  const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"type":"progress","done":1,"total":4,"label":"x"}\n')); c.close() } })
  globalThis.fetch = asFetch(new Response(body, { headers: { 'content-type': 'application/x-ndjson' } }))
  const r = await fetchJob('/x')
  assert.equal(r.ok, false); assert.match(r.data.error, /interrompida/)
})

test('toProgressInfo: fração limitada a 0..1', () => {
  assert.equal(toProgressInfo(1, 4, 'x').fraction, 0.25)
  assert.equal(toProgressInfo(9, 4, 'x').fraction, 1)
  assert.equal(toProgressInfo(0, 0, 'x').fraction, null)
})
