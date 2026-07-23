// tests/datadog-server.test.js — node --test, sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSafeDqlToken } from '../src/lib/datadog-server.js'

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
