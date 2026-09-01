// scripts/migrate-supabase-project.mjs
//
// Migração one-time: troca o projeto Supabase da aplicação por outro,
// preservando usuários (Supabase Auth) e as conexões Datadog já salvas
// (datadog_connections) de cada um.
//
// Mesmo espírito de scripts/migrate-users-to-supabase-auth.mjs (a migração
// anterior, de AUTH_USERS/next-auth pro Supabase Auth) — aqui o "de onde" é
// outro projeto Supabase, não uma env var, mas o problema é idêntico: os
// usuários precisam ser recriados no destino (Admin API não copia senha —
// GoTrue nunca expõe o hash pela API pública) e datadog_connections.user_id
// precisa ser remapeado do UUID antigo pro novo.
//
// O QUE NÃO PRECISA SER DECIFRADO: api_key_enc/app_key_enc são cifrados com
// CONNECTIONS_ENCRYPTION_KEYS (env var da APLICAÇÃO, não do Supabase) — o
// ciphertext é copiado literalmente pro projeto novo, sem passar por
// decryptSecret/encryptSecret em nenhum momento. Só funciona se o projeto
// novo usar a MESMA CONNECTIONS_ENCRYPTION_KEYS/_KEY_VERSION de hoje — não
// rotacione a chave nesta migração (rotação é scripts/reencrypt-connections.mjs,
// um problema separado).
//
// PRÉ-REQUISITO: rode scripts/supabase-schema.sql no projeto NOVO antes
// (Project novo -> SQL Editor) — este script só faz INSERT, não cria tabela.
//
// Idempotente: cada usuário usa inviteUserByEmail (cai pra busca por e-mail
// se já existir, mesmo padrão do script anterior) e cada conexão usa upsert
// por `id` — rodar de novo depois de uma falha parcial não duplica nada.
//
// Uso:
//   node --env-file=.env.local scripts/migrate-supabase-project.mjs [--dry-run]
//
// Precisa no ambiente:
//   OLD_SUPABASE_URL / OLD_SUPABASE_SERVICE_ROLE_KEY   -- projeto de ORIGEM (leitura)
//   NEW_SUPABASE_URL / NEW_SUPABASE_SERVICE_ROLE_KEY   -- projeto de DESTINO (escrita)
//   SITE_URL (opcional)  -- default https://datadog-creator.vercel.app; pra
//                           onde o link de convite de cada usuário redireciona
//                           (.../redefinir-senha) — troque se for migrar pra
//                           um domínio diferente do de produção.

import { createClient } from '@supabase/supabase-js'

const dryRun = process.argv.includes('--dry-run')

const oldUrl = process.env.OLD_SUPABASE_URL || ''
const oldKey = process.env.OLD_SUPABASE_SERVICE_ROLE_KEY || ''
const newUrl = process.env.NEW_SUPABASE_URL || ''
const newKey = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY || ''

if (!oldUrl || !oldKey || !newUrl || !newKey) {
  console.error(
    'Defina no ambiente: OLD_SUPABASE_URL, OLD_SUPABASE_SERVICE_ROLE_KEY, ' +
    'NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_ROLE_KEY (ex: --env-file=.env.local).'
  )
  process.exit(1)
}
if (oldUrl === newUrl) {
  console.error('OLD_SUPABASE_URL e NEW_SUPABASE_URL são iguais — nada a migrar.')
  process.exit(1)
}

// redirectTo aponta pra /redefinir-senha: sem isso, o link do convite loga a
// pessoa mas não pede senha nenhuma — ela ficaria sem conseguir logar de novo
// depois (login normal exige senha, que nunca foi definida).
const siteUrl = (process.env.SITE_URL || 'https://datadog-creator.vercel.app').replace(/\/$/, '')

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const oldSb = createClient(oldUrl, oldKey, opts)
const newSb = createClient(newUrl, newKey, opts)

// ── 1) Lista todos os usuários do projeto ANTIGO (paginado) ──
async function listAllUsers(sb) {
  const users = []
  let page = 1
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`listUsers falhou: ${error.message}`)
    users.push(...data.users)
    if (data.users.length < 200) break
    page += 1
  }
  return users
}

async function findExistingByEmail(sb, email) {
  let page = 1
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`listUsers falhou: ${error.message}`)
    const found = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (found) return found
    if (data.users.length < 200) return null
    page += 1
  }
}

// Convida no projeto novo (recebe e-mail pra DEFINIR a própria senha — a
// senha antiga NUNCA é lida nem transferida, GoTrue não expõe o hash pela
// Admin API). Idempotente: se já existir (rerun), busca o UUID em vez de falhar.
async function ensureUserInNew(oldUser) {
  const email = oldUser.email?.trim().toLowerCase()
  if (!email) return null // usuário sem e-mail (ex.: login só por telefone) — fora de escopo aqui

  if (dryRun) {
    const existing = await findExistingByEmail(newSb, email)
    return { id: existing?.id || '(seria criado)', created: !existing }
  }

  const { data: invited, error: inviteErr } = await newSb.auth.admin.inviteUserByEmail(email, {
    data: oldUser.user_metadata || undefined,
    redirectTo: `${siteUrl}/redefinir-senha`,
  })
  if (!inviteErr) return { id: invited.user.id, created: true }

  const existing = await findExistingByEmail(newSb, email)
  if (existing) return { id: existing.id, created: false }

  throw new Error(`Falha ao convidar ${email} e usuário não encontrado depois: ${inviteErr.message}`)
}

console.log(`Migrando de ${oldUrl} para ${newUrl}${dryRun ? ' — modo --dry-run, nada será escrito' : ''}...\n`)

console.log('── Usuários (Supabase Auth) ──')
const oldUsers = await listAllUsers(oldSb)
console.log(`${oldUsers.length} usuário(s) no projeto antigo.\n`)

const idMap = new Map() // oldId -> newId
let invited = 0
let reused = 0
let userFailed = 0

for (const u of oldUsers) {
  try {
    const result = await ensureUserInNew(u)
    if (!result) { console.log(`${u.email || u.id} — sem e-mail, pulado (fora de escopo deste script)`); continue }
    idMap.set(u.id, result.id)
    if (result.created) invited++; else reused++
    console.log(`${u.email} — ${result.created ? 'convite enviado' : 'já existia'} — UUID ${result.id}`)
  } catch (e) {
    userFailed++
    console.error(`${u.email || u.id} — FALHOU: ${e.message}`)
  }
}

console.log(`\n${invited} convite(s) enviado(s), ${reused} já existiam, ${userFailed} falha(s).\n`)

// ── 2) Copia datadog_connections, remapeando user_id ──
console.log('── Conexões Datadog (datadog_connections) ──')
const { data: oldRows, error: rowsErr } = await oldSb
  .from('datadog_connections')
  .select('id, user_id, name, site, api_key_enc, app_key_enc, key_version, is_active, created_at')

if (rowsErr) {
  console.error(`Falha ao listar conexões do projeto antigo: ${rowsErr.message}`)
  process.exit(1)
}

console.log(`${oldRows.length} conexão(ões) no projeto antigo.\n`)

let connMigrated = 0
let connSkipped = 0
let connFailed = 0

for (const row of oldRows) {
  const newUserId = idMap.get(row.user_id)
  if (!newUserId) {
    connSkipped++
    console.error(`${row.id} (${row.name}) — pulada: usuário ${row.user_id} não foi migrado`)
    continue
  }

  if (dryRun) {
    console.log(`[dry-run] ${row.id} (${row.name}) — user_id ${row.user_id} -> ${newUserId}`)
    connMigrated++
    continue
  }

  // upsert por `id` (mesmo id da linha original) — torna o script seguro de
  // rodar de novo após uma falha parcial, sem duplicar conexão nenhuma.
  // api_key_enc/app_key_enc vão como estão (ciphertext) — ver nota no topo.
  const { error: upsertErr } = await newSb
    .from('datadog_connections')
    .upsert({ ...row, user_id: newUserId }, { onConflict: 'id' })

  if (upsertErr) {
    connFailed++
    console.error(`${row.id} (${row.name}) — FALHOU: ${upsertErr.message}`)
    continue
  }
  connMigrated++
  console.log(`${row.id} (${row.name}) — migrada`)
}

console.log(`\n${connMigrated} conexão(ões) migrada(s), ${connSkipped} pulada(s), ${connFailed} falha(s).`)

if (!dryRun) {
  console.log(
    '\nPróximos passos:\n' +
    '1. Cada usuário convidado recebe um e-mail do Supabase pra definir a senha nova.\n' +
    '2. Configure Authentication -> URL Configuration -> Redirect URLs no projeto NOVO\n' +
    '   (o projeto novo começa sem isso — precisa da URL de produção + /redefinir-senha).\n' +
    '3. Só depois de validar que o projeto novo funciona: troque NEXT_PUBLIC_SUPABASE_URL,\n' +
    '   NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas envs\n' +
    '   (Vercel + .env.local) pro projeto novo e redeploy — CONNECTIONS_ENCRYPTION_KEYS/\n' +
    '   _KEY_VERSION ficam EXATAMENTE iguais (não são do Supabase, e o ciphertext copiado\n' +
    '   só decifra com a mesma chave).\n' +
    '4. Mantenha o projeto antigo vivo até confirmar que tudo funciona no novo.'
  )
}
