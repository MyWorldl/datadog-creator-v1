// scripts/reencrypt-connections.mjs
//
// Re-cifra as linhas de datadog_connections que ainda estão numa versão de
// chave antiga (key_version diferente da CURRENT) para a versão atual.
// Rode isto quando quiser RETIRAR de vez uma chave antiga de
// CONNECTIONS_ENCRYPTION_KEYS (ex: suspeita de vazamento, ou só limpeza) —
// enquanto não rodar, os dados antigos continuam legíveis normalmente
// (versionamento de chave existe exatamente pra não forçar isso a acontecer
// numa janela de manutenção).
//
// Nunca loga valor decifrado — só id e números de versão.
//
// Uso:
//   node --env-file=.env.local scripts/reencrypt-connections.mjs [--dry-run]

import { createClient } from '@supabase/supabase-js'
import { encryptSecret, decryptSecret } from '../src/lib/crypto-keys.js'

const dryRun = process.argv.includes('--dry-run')

const url = process.env.SUPABASE_URL || ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !key) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente (ex: --env-file=.env.local).')
  process.exit(1)
}

const currentVersion = Number(process.env.CONNECTIONS_ENCRYPTION_KEY_VERSION || '')
if (!currentVersion) {
  console.error('CONNECTIONS_ENCRYPTION_KEY_VERSION não configurada.')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const { data: rows, error } = await supabase
  .from('datadog_connections')
  .select('id, api_key_enc, app_key_enc, key_version')
  .neq('key_version', currentVersion)

if (error) {
  console.error(`Falha ao listar conexões: ${error.message}`)
  process.exit(1)
}

if (!rows.length) {
  console.log(`Nenhuma linha fora da versão atual (${currentVersion}). Nada a fazer.`)
  process.exit(0)
}

console.log(`${rows.length} linha(s) fora da versão atual (${currentVersion})${dryRun ? ' — modo --dry-run, nada será alterado' : ''}:\n`)

let migrated = 0
let failed = 0

for (const row of rows) {
  try {
    const apiKey = decryptSecret(row.api_key_enc, row.key_version)
    const appKey = decryptSecret(row.app_key_enc, row.key_version)

    const apiEnc = encryptSecret(apiKey)
    const appEnc = encryptSecret(appKey)

    if (dryRun) {
      console.log(`[dry-run] ${row.id}: versão ${row.key_version} -> ${apiEnc.keyVersion}`)
      migrated++
      continue
    }

    const { error: updateErr } = await supabase
      .from('datadog_connections')
      .update({ api_key_enc: apiEnc.value, app_key_enc: appEnc.value, key_version: apiEnc.keyVersion })
      .eq('id', row.id)

    if (updateErr) throw new Error(updateErr.message)

    console.log(`${row.id}: versão ${row.key_version} -> ${apiEnc.keyVersion}`)
    migrated++
  } catch (e) {
    console.error(`${row.id}: FALHOU (versão ${row.key_version}) — ${e.message}`)
    failed++
  }
}

console.log(`\n${migrated} linha(s) ${dryRun ? 'seriam migradas' : 'migradas'}, ${failed} falha(s).`)

if (!dryRun) {
  // head:true não retorna linhas (data fica null) — a contagem vem em
  // `count`, não em `data.length`.
  const { count, error: checkErr } = await supabase
    .from('datadog_connections')
    .select('id', { count: 'exact', head: true })
    .neq('key_version', currentVersion)

  if (!checkErr) {
    const left = count ?? 0
    console.log(
      left === 0
        ? '\nOK: nenhuma linha restante em versão antiga — seguro remover a chave velha de CONNECTIONS_ENCRYPTION_KEYS.'
        : `\n⚠️  Ainda restam ${left} linha(s) em versão antiga — NÃO remova a chave velha de CONNECTIONS_ENCRYPTION_KEYS ainda.`
    )
  }
}
