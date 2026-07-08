// src/lib/crypto-keys.js
//
// Criptografia (AES-256-GCM) das credenciais do Datadog ANTES de gravar no
// Supabase. O banco guarda só o texto cifrado — quem tiver acesso de leitura
// à tabela não vê a API Key/App Key em claro, só quem tiver também a
// CONNECTIONS_ENCRYPTION_KEY (que fica só no servidor, nunca no banco).
//
// Ativação: defina no .env
//   CONNECTIONS_ENCRYPTION_KEY  — 32 bytes, em hex (64 caracteres) ou base64.
//   Gere uma com:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//
// Formato do valor cifrado (tudo em 1 string base64): iv(12) + tag(16) + ciphertext.
// Trocar essa chave invalida tudo que já foi cifrado — trate como um segredo
// de produção (não versionar, não trocar sem migrar os dados existentes).

import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

function loadKey() {
  const raw = process.env.CONNECTIONS_ENCRYPTION_KEY || ''
  if (!raw) {
    throw new Error('CONNECTIONS_ENCRYPTION_KEY não configurada no ambiente.')
  }
  let key
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex')
  } else {
    key = Buffer.from(raw, 'base64')
  }
  if (key.length !== 32) {
    throw new Error('CONNECTIONS_ENCRYPTION_KEY precisa ter 32 bytes (64 chars hex ou base64 equivalente).')
  }
  return key
}

export function encryptSecret(plainText) {
  const key = loadKey()
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const enc = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptSecret(payload) {
  const key = loadKey()
  const buf = Buffer.from(String(payload), 'base64')
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const enc = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}
