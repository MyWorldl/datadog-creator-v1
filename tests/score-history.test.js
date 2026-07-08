// tests/score-history.test.js — node --test, sem deps (usa o fallback em memória).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recordScore, getHistory, computeDelta } from '../src/lib/score-history.js'

test('computeDelta = diferença dos dois últimos pontos', () => {
  assert.equal(computeDelta([{ t: 1, score: 40 }, { t: 2, score: 46 }]), 6)
  assert.equal(computeDelta([{ t: 1, score: 50 }]), null)
  assert.equal(computeDelta([]), null)
  assert.equal(computeDelta(null), null)
})

test('record/get em memória: 2 medições no mesmo dia = 1 ponto (substitui)', async () => {
  const id = 'unit-' + Math.random().toString(36).slice(2)
  await recordScore('test', id, 40)
  await recordScore('test', id, 55)
  const h = await getHistory('test', id)
  assert.equal(h.length, 1)
  assert.equal(h[0].score, 55)
})

test('recordScore ignora valor não numérico', async () => {
  const id = 'unit-' + Math.random().toString(36).slice(2)
  await recordScore('test', id, NaN)
  const h = await getHistory('test', id)
  assert.equal(h.length, 0)
})
