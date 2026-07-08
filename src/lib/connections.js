// src/lib/connections.js
//
// CRUD das conexões Datadog (múltiplas orgs por usuário), guardadas no
// Supabase (tabela `datadog_connections` — ver scripts/supabase-schema.sql).
// As chaves (API Key / App Key) ficam cifradas em repouso (lib/crypto-keys).
//
// Modelo: cada usuário (session.user.id, vindo do Auth.js) pode ter N
// conexões. Exatamente UMA fica marcada como `is_active` por vez — é essa
// que as rotas /api/datadog/* usam (via readSessionKeys, em session-keys.js).
//
// Este arquivo é server-only (usa a Service Role Key por baixo). Não
// importar de componentes 'use client'.

import { supabaseAdmin } from './supabase-admin'
import { encryptSecret, decryptSecret } from './crypto-keys'

const TABLE = 'datadog_connections'

function toPublic(row) {
  return {
    id: row.id,
    name: row.name,
    site: row.site,
    isActive: !!row.is_active,
    createdAt: row.created_at,
  }
}

// Lista as conexões do usuário (sem expor as chaves cifradas nem decifradas).
export async function listConnections(userId) {
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from(TABLE)
    .select('id, name, site, is_active, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Falha ao listar conexões: ${error.message}`)
  return (data || []).map(toPublic)
}

// Cria uma nova conexão. Se for a primeira do usuário, já nasce ativa.
export async function createConnection(userId, { name, apiKey, appKey, site }) {
  const sb = supabaseAdmin()

  const { count, error: countErr } = await sb
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (countErr) throw new Error(`Falha ao verificar conexões existentes: ${countErr.message}`)

  const isFirst = !count || count === 0

  const { data, error } = await sb
    .from(TABLE)
    .insert({
      user_id: userId,
      name: String(name || '').trim() || site,
      site,
      api_key_enc: encryptSecret(apiKey),
      app_key_enc: encryptSecret(appKey),
      is_active: isFirst,
    })
    .select('id, name, site, is_active, created_at')
    .single()

  if (error) throw new Error(`Falha ao salvar conexão: ${error.message}`)
  return toPublic(data)
}

// Marca uma conexão como ativa (e desmarca as demais do mesmo usuário).
export async function activateConnection(userId, id) {
  const sb = supabaseAdmin()

  // Confirma que a conexão pertence ao usuário antes de mexer em qualquer coisa.
  const { data: target, error: findErr } = await sb
    .from(TABLE)
    .select('id')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle()
  if (findErr) throw new Error(`Falha ao localizar conexão: ${findErr.message}`)
  if (!target) throw new Error('Conexão não encontrada.')

  const { error: clearErr } = await sb
    .from(TABLE)
    .update({ is_active: false })
    .eq('user_id', userId)
  if (clearErr) throw new Error(`Falha ao atualizar conexões: ${clearErr.message}`)

  const { error: setErr } = await sb
    .from(TABLE)
    .update({ is_active: true })
    .eq('user_id', userId)
    .eq('id', id)
  if (setErr) throw new Error(`Falha ao ativar conexão: ${setErr.message}`)

  return true
}

// Remove uma conexão. Se era a ativa, promove a mais antiga restante (se houver).
export async function deleteConnection(userId, id) {
  const sb = supabaseAdmin()

  const { data: target, error: findErr } = await sb
    .from(TABLE)
    .select('id, is_active')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle()
  if (findErr) throw new Error(`Falha ao localizar conexão: ${findErr.message}`)
  if (!target) return true // já não existe — idempotente

  const { error: delErr } = await sb.from(TABLE).delete().eq('user_id', userId).eq('id', id)
  if (delErr) throw new Error(`Falha ao remover conexão: ${delErr.message}`)

  if (target.is_active) {
    const { data: next } = await sb
      .from(TABLE)
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (next?.id) {
      await sb.from(TABLE).update({ is_active: true }).eq('user_id', userId).eq('id', next.id)
    }
  }

  return true
}

// Busca as credenciais (decifradas) da conexão ATIVA do usuário.
// Retorna null se o usuário não tiver nenhuma conexão configurada.
export async function getActiveConnectionKeys(userId) {
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from(TABLE)
    .select('id, name, site, api_key_enc, app_key_enc')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw new Error(`Falha ao buscar conexão ativa: ${error.message}`)
  if (!data) return null

  return {
    id: data.id,
    name: data.name,
    site: data.site,
    apiKey: decryptSecret(data.api_key_enc),
    appKey: decryptSecret(data.app_key_enc),
  }
}
