// tests/crypto-keys-versioning.test.js — node --test, sem deps.
//
// Casos de erro do versionamento de chave, isolados num arquivo próprio
// (node --test roda cada arquivo em processo separado, então mutar
// process.env aqui não interfere em tests/crypto-keys.test.js).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

process.env.CONNECTIONS_ENCRYPTION_KEYS = JSON.stringify({ 1: crypto.randomBytes(32).toString('hex') })
process.env.CONNECTIONS_ENCRYPTION_KEY_VERSION = '1'

const { encryptSecret, decryptSecret } = await import('../src/lib/crypto-keys.js')

test('decryptSecret: versão de chave inexistente lança erro claro', () => {
  const enc = encryptSecret('segredo-qualquer')
  assert.throws(
    () => decryptSecret(enc.value, 999),
    /versões disponíveis/
  )
})

test('encryptSecret: CONNECTIONS_ENCRYPTION_KEY_VERSION apontando pra versão fora do mapa lança erro', () => {
  const before = process.env.CONNECTIONS_ENCRYPTION_KEY_VERSION
  process.env.CONNECTIONS_ENCRYPTION_KEY_VERSION = '999'
  try {
    assert.throws(() => encryptSecret('outro-segredo'), /versões disponíveis/)
  } finally {
    process.env.CONNECTIONS_ENCRYPTION_KEY_VERSION = before
  }
})
