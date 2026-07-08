// tests/crypto-keys.test.js — node --test, sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

// Chave de teste fixa (32 bytes) — não é a de produção.
process.env.CONNECTIONS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex')

const { encryptSecret, decryptSecret } = await import('../src/lib/crypto-keys.js')

test('encryptSecret/decryptSecret: round-trip preserva o texto original', () => {
  const original = 'dd_api_key_1234567890abcdef'
  const enc = encryptSecret(original)
  assert.notEqual(enc, original)
  assert.equal(decryptSecret(enc), original)
})

test('encryptSecret: duas chamadas para o mesmo texto geram ciphertexts diferentes (IV aleatório)', () => {
  const a = encryptSecret('mesma-chave-secreta')
  const b = encryptSecret('mesma-chave-secreta')
  assert.notEqual(a, b)
})

test('decryptSecret: payload adulterado falha (autenticação AEAD)', () => {
  const enc = encryptSecret('outro-segredo')
  const tampered = Buffer.from(enc, 'base64')
  tampered[tampered.length - 1] ^= 0xff // corrompe o último byte do ciphertext
  assert.throws(() => decryptSecret(tampered.toString('base64')))
})
