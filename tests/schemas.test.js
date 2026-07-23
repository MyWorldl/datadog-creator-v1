// tests/schemas.test.js — node --test, sem deps além de zod (já é dependência).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { datadogKeysSchema, createConnectionSchema, firstIssueMessage } from '../src/lib/schemas.js'

test('datadogKeysSchema: aceita chaves e site válidos', () => {
  const r = datadogKeysSchema.safeParse({ apiKey: '1234567890', appKey: '1234567890', site: 'datadoghq.com' })
  assert.equal(r.success, true)
  assert.equal(r.data.site, 'datadoghq.com')
})

test('datadogKeysSchema: rejeita apiKey/appKey curtos com mensagem específica', () => {
  const r1 = datadogKeysSchema.safeParse({ apiKey: 'abc', appKey: '1234567890', site: 'datadoghq.com' })
  assert.equal(r1.success, false)
  assert.equal(firstIssueMessage(r1.error), 'API Key parece inválida.')

  const r2 = datadogKeysSchema.safeParse({ apiKey: '1234567890', appKey: 'abc', site: 'datadoghq.com' })
  assert.equal(r2.success, false)
  assert.equal(firstIssueMessage(r2.error), 'Application Key parece inválida.')
})

test('datadogKeysSchema: rejeita site fora da allowlist', () => {
  const r = datadogKeysSchema.safeParse({ apiKey: '1234567890', appKey: '1234567890', site: 'evil.example.com' })
  assert.equal(r.success, false)
  assert.equal(firstIssueMessage(r.error), 'Site do Datadog inválido.')
})

test('datadogKeysSchema: espaços nas chaves são cortados (trim), igual à checagem manual antiga', () => {
  const r = datadogKeysSchema.safeParse({ apiKey: '  1234567890  ', appKey: '1234567890', site: 'datadoghq.com' })
  assert.equal(r.success, true)
  assert.equal(r.data.apiKey, '1234567890')
})

test('createConnectionSchema: name é opcional (default "")', () => {
  const r = createConnectionSchema.safeParse({ apiKey: '1234567890', appKey: '1234567890', site: 'datadoghq.com' })
  assert.equal(r.success, true)
  assert.equal(r.data.name, '')
})

test('createConnectionSchema: name informado é preservado (trim)', () => {
  const r = createConnectionSchema.safeParse({ apiKey: '1234567890', appKey: '1234567890', site: 'datadoghq.com', name: '  Prod  ' })
  assert.equal(r.success, true)
  assert.equal(r.data.name, 'Prod')
})
