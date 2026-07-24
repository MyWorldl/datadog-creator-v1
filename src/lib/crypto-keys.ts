// src/lib/crypto-keys.ts
//
// Criptografia (AES-256-GCM) das credenciais do Datadog ANTES de gravar no
// Supabase. O banco guarda só o texto cifrado — quem tiver acesso de leitura
// à tabela não vê a API Key/App Key em claro, só quem tiver também as
// chaves de CONNECTIONS_ENCRYPTION_KEYS (que ficam só no servidor, nunca no
// banco).
//
// VERSIONAMENTO DE CHAVE: existe mais de uma chave "ativa" ao mesmo tempo —
// uma versão CURRENT (usada pra cifrar dados novos) e, opcionalmente,
// versões antigas (mantidas só pra decifrar dados que ainda não foram
// re-cifrados). Isso permite rotacionar a chave sem invalidar de uma vez só
// tudo que já foi salvo — cada linha de `datadog_connections` grava em qual
// versão foi cifrada (coluna `key_version`), e a leitura busca a chave certa
// pela versão, não tenta adivinhar.
//
// Ativação: defina no .env
//   CONNECTIONS_ENCRYPTION_KEYS         — JSON {"1": "<32 bytes, hex ou base64>", "2": "..."}
//   CONNECTIONS_ENCRYPTION_KEY_VERSION  — qual versão do mapa acima é a CURRENT (cifra dados novos)
//   Gere uma chave nova com:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//
// Como rotacionar (sem downtime):
//   1. Adicione a nova versão em CONNECTIONS_ENCRYPTION_KEYS SEM remover a antiga.
//   2. Troque CONNECTIONS_ENCRYPTION_KEY_VERSION pra a nova versão (dados novos já usam ela).
//   3. Quando quiser, rode scripts/reencrypt-connections.mjs pra migrar as linhas
//      antigas pra versão atual — só depois disso é seguro remover a chave velha
//      de CONNECTIONS_ENCRYPTION_KEYS (removê-la antes torna aquelas linhas
//      específicas ilegíveis, não a aplicação inteira — ver keyForVersion abaixo).
//
// Formato do valor cifrado (tudo em 1 string base64): iv(12) + tag(16) + ciphertext.
// A versão da chave NÃO fica dentro desse payload — fica em `key_version`,
// coluna separada (ver src/lib/connections.js).
//
// Primeiro arquivo migrado pra TypeScript (achado da auditoria: código de
// criptografia/dinheiro é onde um erro de contrato entre tipos dói mais).

import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

export interface EncryptResult {
  value: string
  keyVersion: number
}

// Parsing sempre sob demanda (nunca no import do módulo) e sem cache — o
// custo de reparsear um JSON pequeno por chamada é desprezível, e cachear
// complicaria testes que mutam process.env em runtime.
function loadKeys(): Map<number, Buffer> {
  const raw = process.env.CONNECTIONS_ENCRYPTION_KEYS || ''
  if (!raw) {
    throw new Error('CONNECTIONS_ENCRYPTION_KEYS não configurada no ambiente.')
  }
  let map: Record<string, string>
  try {
    map = JSON.parse(raw)
  } catch {
    throw new Error('CONNECTIONS_ENCRYPTION_KEYS não é um JSON válido.')
  }
  const keys = new Map<number, Buffer>()
  for (const [version, rawKey] of Object.entries(map)) {
    let key: Buffer
    if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
      key = Buffer.from(rawKey, 'hex')
    } else {
      key = Buffer.from(rawKey, 'base64')
    }
    if (key.length !== 32) {
      throw new Error(`CONNECTIONS_ENCRYPTION_KEYS: a chave da versão ${version} precisa ter 32 bytes (64 chars hex ou base64 equivalente).`)
    }
    keys.set(Number(version), key)
  }
  return keys
}

function loadCurrentVersion(): number {
  const raw = process.env.CONNECTIONS_ENCRYPTION_KEY_VERSION || ''
  if (!raw) {
    throw new Error('CONNECTIONS_ENCRYPTION_KEY_VERSION não configurada no ambiente.')
  }
  return Number(raw)
}

// Busca a chave de uma versão específica. Erro nunca vaza a chave em si, só
// números de versão — propaga até src/lib/session-keys.js, que já isola
// isso por usuário (não derruba a aplicação inteira).
function keyForVersion(keys: Map<number, Buffer>, version: number): Buffer {
  const key = keys.get(version)
  if (!key) {
    const available = [...keys.keys()].sort((a, b) => a - b).join(', ')
    throw new Error(
      `Não há chave para key_version=${version} em CONNECTIONS_ENCRYPTION_KEYS ` +
      `(versões disponíveis: ${available || 'nenhuma'}). Essa versão foi removida do ` +
      `ambiente antes dos dados que ainda a usam serem re-cifrados — rode ` +
      `scripts/reencrypt-connections.mjs antes de remover uma versão.`
    )
  }
  return key
}

// Cifra sempre com a chave CURRENT. Retorna a versão usada junto, pra quem
// chamar gravar na coluna `key_version` da linha.
export function encryptSecret(plainText: string): EncryptResult {
  const keys = loadKeys()
  const version = loadCurrentVersion()
  const key = keyForVersion(keys, version)

  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const enc = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const value = Buffer.concat([iv, tag, enc]).toString('base64')

  return { value, keyVersion: version }
}

// Decifra com a chave da versão indicada (não necessariamente a CURRENT —
// dados antigos continuam legíveis enquanto a chave da versão deles existir
// em CONNECTIONS_ENCRYPTION_KEYS).
export function decryptSecret(payload: string, keyVersion: number | string): string {
  const keys = loadKeys()
  const key = keyForVersion(keys, Number(keyVersion))

  const buf = Buffer.from(String(payload), 'base64')
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const enc = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}
