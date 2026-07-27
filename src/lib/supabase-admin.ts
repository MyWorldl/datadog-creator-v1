// src/lib/supabase-admin.ts
//
// Cliente Supabase (server-only) usado para persistir as conexões Datadog
// (múltiplas orgs) por usuário. Usa a Service Role Key — por isso NUNCA pode
// ser importado em código de cliente ('use client'); só em rotas/lib de servidor.
//
// Ativação: defina no .env
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Sem essas variáveis, qualquer chamada lança um erro claro (em vez de falhar
// silenciosamente) — as rotas que usam isso devem tratar o erro e responder
// 500 com uma mensagem acionável.

import { createClient } from '@supabase/supabase-js'

// Sem um tipo `Database` gerado (ver scripts/supabase-schema.sql — não há
// geração automática de tipos configurada), o generic explícito <any> evita
// que TS resolva o schema das tabelas como `never` (ReturnType<typeof
// createClient> sem argumento explícito não aplica o default `Database = any`
// do generic — só uma instanciação explícita faz isso).
type SupabaseAdminClient = ReturnType<typeof createClient<any>>

let cached: SupabaseAdminClient | null = null

export function supabaseAdmin(): SupabaseAdminClient {
  if (cached) return cached

  const url = process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!url || !key) {
    throw new Error(
      'Supabase não configurado: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.'
    )
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
