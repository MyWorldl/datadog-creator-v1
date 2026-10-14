// tests/progress-estimate.test.js — runner nativo do Node (node --test), sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimateFraction, nextExpected, clampExpected, MAX_ESTIMATE, MIN_EXPECTED_MS, MAX_EXPECTED_MS } from '../src/lib/progress-estimate.ts'

test('estimateFraction: começa em 0, cresce sempre e nunca passa de 95%', () => {
  assert.equal(estimateFraction(0, 4000), 0)
  let prev = 0
  for (const t of [200, 1000, 2000, 4000, 8000, 20000, 120000, 1e9]) {
    const f = estimateFraction(t, 4000)
    assert.ok(f > prev || f === MAX_ESTIMATE, `t=${t}`)
    assert.ok(f <= MAX_ESTIMATE)
    prev = f
  }
})

test('estimateFraction: na duração esperada já passou de 70% (sem parecer travada nem terminar cedo)', () => {
  const f = estimateFraction(4000, 4000)
  assert.ok(f > 0.7 && f < MAX_ESTIMATE)
})

test('estimateFraction: entradas inválidas viram 0; duração esperada é limitada', () => {
  assert.equal(estimateFraction(-5, 4000), 0)
  assert.equal(estimateFraction(NaN, 4000), 0)
  assert.equal(clampExpected(10), MIN_EXPECTED_MS)
  assert.equal(clampExpected(9e9), MAX_EXPECTED_MS)
})

test('nextExpected: sem histórico usa a última; com histórico faz média móvel', () => {
  assert.equal(nextExpected(null, 4000), 4000)
  assert.equal(nextExpected(undefined, 4000), 4000)
  assert.equal(nextExpected(10000, 4000), 8200)   // 0.7*10000 + 0.3*4000
  assert.equal(nextExpected(NaN, 3000), 3000)
})
