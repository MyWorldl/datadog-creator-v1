// tests/apm-services.test.js — runner nativo do Node (node --test), sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseApmServices } from '../src/lib/apm-services.ts'

const resp = (services, metadata) => ({ data: { id: 'x', type: 'services_list', attributes: { services, metadata } } })

test('separa traced de USM-only pelo metadata alinhado com services', () => {
  const p = parseApmServices(resp(['b', 'a', 'c'], [{ isTraced: true, isUsm: true }, { isUsm: true }, { isTraced: true }]))
  assert.deepEqual(p.all, ['a', 'b', 'c'])
  assert.deepEqual(p.traced, ['b', 'c'])
  assert.deepEqual(p.usmOnly, ['a'])
})

test('isTraced:false explícito + isUsm também é USM-only', () => {
  const p = parseApmServices(resp(['a'], [{ isTraced: false, isUsm: true }]))
  assert.deepEqual(p.usmOnly, ['a'])
})

test('flags ausentes ({}) contam como traced — não esconde serviço por engano', () => {
  const p = parseApmServices(resp(['a'], [{}]))
  assert.deepEqual(p.traced, ['a'])
  assert.deepEqual(p.usmOnly, [])
})

test('sem metadata, ou tamanho que não bate: todos traced (comportamento de antes)', () => {
  assert.deepEqual(parseApmServices(resp(['a', 'b'], undefined)).traced, ['a', 'b'])
  const mism = parseApmServices(resp(['a', 'b'], [{ isUsm: true }]))
  assert.deepEqual(mism.traced, ['a', 'b'])
  assert.deepEqual(mism.usmOnly, [])
})

test('nome duplicado: traced vence', () => {
  const p = parseApmServices(resp(['a', 'a'], [{ isUsm: true }, { isTraced: true }]))
  assert.deepEqual(p.traced, ['a'])
  assert.deepEqual(p.usmOnly, [])
})

test('formato antigo (data como array de {attributes.services}/{id}) segue funcionando', () => {
  const p = parseApmServices({ data: [{ attributes: { services: ['x', 'y'] } }, { id: 'z' }] })
  assert.deepEqual(p.traced, ['x', 'y', 'z'])
})

test('resposta vazia/inesperada não lança', () => {
  for (const j of [undefined, null, {}, { data: null }, { data: { attributes: {} } }]) {
    assert.deepEqual(parseApmServices(j), { all: [], traced: [], usmOnly: [] })
  }
})
