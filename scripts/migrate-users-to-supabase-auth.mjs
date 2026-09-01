// scripts/migrate-users-to-supabase-auth.mjs
//
// Migração one-time: cria os usuários que hoje só existem em AUTH_USERS
// (env var) diretamente no Supabase Auth, e remapeia as conexões Datadog já
// salvas deles (datadog_connections.user_id) do username antigo (texto
// livre) para o novo UUID do Supabase Auth.
//
// Usa inviteUserByEmail (não createUser com senha) — cada usuário recebe um
// e-mail com link para DEFINIR a própria senha. Ninguém (nem este script,
// nem quem o executa) fica sabendo/imprimindo uma senha em texto puro.
//
// Idempotente: se o usuário já existir no Supabase Auth (por QUALQUER tipo
// de erro do convite — "already registered" ou uma falha de envio de e-mail
// que ainda assim criou o usuário do lado do GoTrue), busca o UUID em vez de
// falhar. Se a conexão já tiver sido remapeada (user_id já é o UUID), o
// UPDATE simplesmente não afeta nenhuma linha (sem erro).
//
// A lista de usuários NÃO fica hardcoded aqui (evita nome/e-mail real de
// gente commitado no repo) — vem de um arquivo JSON local, gitignored:
//   scripts/migrate-users.local.json   (copie de scripts/migrate-users.example.json)
//
// Uso:
//   node --env-file=.env.local scripts/migrate-users-to-supabase-auth.mjs [caminho-do-json]
//
// SITE_URL (opcional) — default https://datadog-creator.vercel.app; pra onde
// o link de convite de cada usuário redireciona (.../redefinir-senha).

import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const jsonPath = process.argv[2] || new URL('./migrate-users.local.json', import.meta.url)

let USERS
try {
  USERS = JSON.parse(await readFile(jsonPath, 'utf8'))
} catch (e) {
  console.error(`Não consegui ler a lista de usuários em "${jsonPath}": ${e.message}`)
  console.error('Copie scripts/migrate-users.example.json para scripts/migrate-users.local.json e preencha com os dados reais.')
  process.exit(1)
}

const url = process.env.SUPABASE_URL || ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !key) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente (ex: --env-file=.env.local).')
  process.exit(1)
}

// redirectTo aponta pra /redefinir-senha: sem isso, o link do convite loga a
// pessoa mas não pede senha nenhuma — ela ficaria sem conseguir logar de novo
// depois (login normal exige senha, que nunca foi definida).
const siteUrl = (process.env.SITE_URL || 'https://datadog-creator.vercel.app').replace(/\/$/, '')

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function findExistingByEmail(email) {
  let page = 1
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`listUsers falhou: ${error.message}`)
    const found = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (found) return found
    if (data.users.length < 200) return null
    page += 1
  }
}

// Tenta convidar; SEJA QUAL FOR o motivo do erro (já registrado, ou uma
// falha de envio de e-mail que mesmo assim criou o usuário do lado do
// GoTrue — já vimos os dois casos na prática), cai pra busca por e-mail
// antes de desistir. Só falha de verdade se nem isso encontrar o usuário.
async function ensureUser({ email, name }) {
  const normalizedEmail = email.trim().toLowerCase()

  const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(normalizedEmail, {
    data: { name },
    redirectTo: `${siteUrl}/redefinir-senha`,
  })
  if (!inviteErr) return { id: invited.user.id, created: true }

  const existing = await findExistingByEmail(normalizedEmail)
  if (existing) return { id: existing.id, created: false }

  throw new Error(`Falha ao convidar ${normalizedEmail} e usuário não encontrado depois: ${inviteErr.message}`)
}

// user_id é `uuid` no schema atual (ver scripts/supabase-schema.sql) — um
// oldUsername em texto livre nunca vai bater com nenhuma linha, mas a
// comparação em si já falha no Postgres (erro de sintaxe de uuid) em vez de
// simplesmente retornar 0 linhas. Detecta isso ANTES de tentar, pra não
// travar a migração de quem não tem nada pra remapear.
async function remapConnections(oldUsername, newUuid) {
  if (!UUID_RE.test(oldUsername)) {
    return 0 // não pode ter sido um user_id válido na coluna uuid atual
  }
  const { data, error } = await supabase
    .from('datadog_connections')
    .update({ user_id: newUuid })
    .eq('user_id', oldUsername)
    .select('id')
  if (error) throw new Error(`Falha ao remapear conexões de ${oldUsername}: ${error.message}`)
  return data?.length || 0
}

console.log(`Migrando ${USERS.length} usuário(s) para o Supabase Auth (lista: ${jsonPath})...\n`)

for (const u of USERS) {
  try {
    const { id, created } = await ensureUser(u)
    const remapped = await remapConnections(u.oldUsername, id)
    console.log(
      `${u.name} <${u.email}> — ${created ? 'convite enviado' : 'já existia'} — UUID ${id} — ` +
      `${remapped} conexão(ões) remapeada(s) de "${u.oldUsername}"`
    )
  } catch (e) {
    console.error(`${u.name} <${u.email}> — FALHOU: ${e.message}`)
  }
}

console.log('\nConcluído. Cada usuário convidado recebe um e-mail do Supabase para definir a senha e logar.')
