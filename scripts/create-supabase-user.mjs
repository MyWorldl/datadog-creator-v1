// scripts/create-supabase-user.mjs
//
// Convida (ou reaproveita, se o e-mail já existir) um usuário direto no
// Supabase Auth via Admin API — sem precisar editar env var/redeploy, que
// era como funcionava com o next-auth (scripts/generate-credentials.mjs,
// removido). É o ganho operacional da migração pra Supabase Auth: revogar
// acesso agora é só remover o usuário no Supabase Dashboard.
//
// Usa inviteUserByEmail (não createUser com senha) — o usuário recebe um
// e-mail com link pra DEFINIR a própria senha. Ninguém (nem este script,
// nem quem o executa) fica sabendo/imprimindo uma senha em texto puro.
//
// Uso:
//   node --env-file=.env.local scripts/create-supabase-user.mjs "email@empresa.com" "Nome"
//
// Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente (mesmas
// usadas por src/lib/supabase-admin.js).

import { createClient } from '@supabase/supabase-js'

const [, , email, name] = process.argv

if (!email) {
  console.log('\nUso: node --env-file=.env.local scripts/create-supabase-user.mjs "email@empresa.com" "Nome"\n')
  process.exit(1)
}

const url = process.env.SUPABASE_URL || ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !key) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente (ex: --env-file=.env.local).')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const normalizedEmail = String(email).trim().toLowerCase()

const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(normalizedEmail, {
  data: name ? { name } : undefined,
})

if (!inviteErr) {
  console.log(`\nConvite enviado para: ${normalizedEmail}`)
  console.log(`UUID: ${invited.user.id}`)
  console.log('\nA pessoa recebe um e-mail do Supabase com um link pra definir a própria senha.\n')
  process.exit(0)
}

// E-mail já existe: idempotente — busca o UUID em vez de falhar.
const alreadyExists = /already.*registered|email.*exists/i.test(inviteErr.message || '')
if (!alreadyExists) {
  console.error('Falha ao convidar usuário:', inviteErr.message)
  process.exit(1)
}

console.log(`\nE-mail já cadastrado (${normalizedEmail}) — buscando UUID existente...`)
let page = 1
let found = null
while (!found) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
  if (error) { console.error('Falha ao listar usuários:', error.message); process.exit(1) }
  found = data.users.find(u => u.email?.toLowerCase() === normalizedEmail)
  if (found || data.users.length < 200) break
  page += 1
}

if (!found) {
  console.error('Não encontrei o usuário existente (inesperado).')
  process.exit(1)
}

console.log(`UUID existente: ${found.id}\n`)
