// src/lib/connections.ts
//
// CRUD das conexões Datadog (múltiplas orgs por usuário), guardadas no
// Supabase (tabela `datadog_connections` — ver scripts/supabase-schema.sql).
// As chaves (API Key / App Key) ficam cifradas em repouso (lib/crypto-keys).
//
// Modelo: cada usuário (user.id, UUID do Supabase Auth — ver
// lib/supabase-server.ts) pode ter N conexões. Exatamente UMA fica marcada
// como `is_active` por vez — é essa que as rotas /api/datadog/* usam (via
// readSessionKeys, em session-keys.ts).
//
// user_id é uuid com FK pra auth.users(id) ON DELETE CASCADE (ver
// scripts/supabase-schema.sql) — remover o usuário no Supabase Auth já
// remove as conexões dele automaticamente.
//
// Este arquivo é server-only (usa a Service Role Key por baixo). Não
// importar de componentes 'use client'.

import { supabaseAdmin } from './supabase-admin'
import { encryptSecret, decryptSecret } from './crypto-keys'
import type { DatadogSite } from './datadog-sites.ts'

const TABLE = 'datadog_connections'

export interface PublicConnection {
  id: string
  name: string
  site: string
  isActive: boolean
  createdAt: string
}

interface ConnectionRow {
  id: string
  name: string
  site: string
  is_active: boolean
  created_at: string
}

function toPublic(row: ConnectionRow): PublicConnection {
  return {
    id: row.id,
    name: row.name,
    site: row.site,
    isActive: !!row.is_active,
    createdAt: row.created_at,
  }
}

// Lista as conexões do usuário (sem expor as chaves cifradas nem decifradas).
export async function listConnections(userId: string): Promise<PublicConnection[]> {
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from(TABLE)
    .select('id, name, site, is_active, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Falha ao listar conexões: ${error.message}`)
  return (data || []).map(toPublic)
}

export interface CreateConnectionInput {
  name?: string
  apiKey: string
  appKey: string
  site: DatadogSite | string
}

// Cria uma nova conexão. Se for a primeira do usuário, já nasce ativa.
export async function createConnection(userId: string, { name, apiKey, appKey, site }: CreateConnectionInput): Promise<PublicConnection> {
  const sb = supabaseAdmin()

  const { count, error: countErr } = await sb
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (countErr) throw new Error(`Falha ao verificar conexões existentes: ${countErr.message}`)

  const isFirst = !count || count === 0

  // encryptSecret sempre usa a versão CURRENT — as duas chamadas abaixo
  // ficam na mesma versão, então dá pra gravar key_version uma única vez
  // pra linha inteira (API Key e App Key nunca ficam em versões diferentes).
  const apiEnc = encryptSecret(apiKey)
  const appEnc = encryptSecret(appKey)

  const { data, error } = await sb
    .from(TABLE)
    .insert({
      user_id: userId,
      name: String(name || '').trim() || site,
      site,
      api_key_enc: apiEnc.value,
      app_key_enc: appEnc.value,
      key_version: apiEnc.keyVersion,
      is_active: isFirst,
    })
    .select('id, name, site, is_active, created_at')
    .single()

  if (error) throw new Error(`Falha ao salvar conexão: ${error.message}`)
  return toPublic(data)
}

// Marca uma conexão como ativa (e desmarca as demais do mesmo usuário).
export async function activateConnection(userId: string, id: string): Promise<true> {
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
export async function deleteConnection(userId: string, id: string): Promise<true> {
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

export interface ActiveConnectionKeys {
  id: string
  name: string
  site: string
  apiKey: string
  appKey: string
}

// Busca as credenciais (decifradas) da conexão ATIVA do usuário.
// Retorna null se o usuário não tiver nenhuma conexão configurada.
export async function getActiveConnectionKeys(userId: string): Promise<ActiveConnectionKeys | null> {
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from(TABLE)
    .select('id, name, site, api_key_enc, app_key_enc, key_version')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw new Error(`Falha ao buscar conexão ativa: ${error.message}`)
  if (!data) return null

  return {
    id: data.id,
    name: data.name,
    site: data.site,
    apiKey: decryptSecret(data.api_key_enc, data.key_version),
    appKey: decryptSecret(data.app_key_enc, data.key_version),
  }
}
