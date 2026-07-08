// src/lib/session-keys.js
//
// Fonte única das credenciais do Datadog usadas pelas rotas /api/datadog/*.
//
// Desde a v1.17.0, as credenciais NÃO ficam mais em cookie: cada usuário pode
// ter várias conexões (orgs) salvas no Supabase (ver lib/connections.js),
// cifradas em repouso (lib/crypto-keys.js). Esta função sempre lê a conexão
// marcada como ATIVA do usuário logado — trocar de org é só marcar outra
// conexão como ativa (POST /api/connections/:id/activate), sem precisar
// digitar as chaves de novo.
//
// Mantido de propósito com a MESMA assinatura de antes ({ apiKey, appKey, site })
// para não exigir mudanças nas ~10 rotas que já consomem isso.

import { auth } from '@/auth'
import { getActiveConnectionKeys } from './connections'

export const VALID_SITES = [
  'datadoghq.com', 'us3.datadoghq.com', 'us5.datadoghq.com',
  'datadoghq.eu', 'ap1.datadoghq.com', 'ap2.datadoghq.com', 'ddog-gov.com',
]

export async function readSessionKeys() {
  const session = await auth()
  if (!session?.user?.id) return { apiKey: '', appKey: '', site: '' }

  try {
    const active = await getActiveConnectionKeys(session.user.id)
    if (!active) return { apiKey: '', appKey: '', site: '' }
    return { apiKey: active.apiKey, appKey: active.appKey, site: active.site }
  } catch (e) {
    // Supabase/criptografia mal configurados, ou erro de rede com o banco:
    // trata como "sem credenciais" em vez de derrubar a rota inteira.
    console.error('[session-keys] falha ao ler conexão ativa:', e.message)
    return { apiKey: '', appKey: '', site: '' }
  }
}
