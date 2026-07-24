// src/lib/session-keys.ts
//
// Fonte única das credenciais do Datadog usadas pelas rotas /api/datadog/*.
//
// Desde a v1.17.0, as credenciais NÃO ficam mais em cookie: cada usuário pode
// ter várias conexões (orgs) salvas no Supabase (ver lib/connections.ts),
// cifradas em repouso (lib/crypto-keys.ts). Esta função sempre lê a conexão
// marcada como ATIVA do usuário logado — trocar de org é só marcar outra
// conexão como ativa (POST /api/connections/:id/activate), sem precisar
// digitar as chaves de novo.
//
// Mantido de propósito com a MESMA assinatura de antes ({ apiKey, appKey, site })
// para não exigir mudanças nas ~10 rotas que já consomem isso.

import { getServerUser } from './supabase-server.ts'
import { getActiveConnectionKeys } from './connections'
import { logError } from './logger.ts'
import { VALID_SITES } from './datadog-sites.ts'

// Reexportado pra não quebrar quem já importava VALID_SITES daqui — a
// definição em si vive em datadog-sites.ts (ver comentário lá: precisa
// ficar isolada de next/headers pra ser importável em teste/schemas.ts).
export { VALID_SITES }

export interface SessionKeys {
  apiKey: string
  appKey: string
  site: string
}

export async function readSessionKeys(): Promise<SessionKeys> {
  const user = await getServerUser()
  if (!user?.id) return { apiKey: '', appKey: '', site: '' }

  try {
    const active = await getActiveConnectionKeys(user.id)
    if (!active) return { apiKey: '', appKey: '', site: '' }
    return { apiKey: active.apiKey, appKey: active.appKey, site: active.site }
  } catch (e) {
    // Supabase/criptografia mal configurados, ou erro de rede com o banco:
    // trata como "sem credenciais" em vez de derrubar a rota inteira.
    logError('session-keys', e, { hint: 'falha ao ler conexão ativa' })
    return { apiKey: '', appKey: '', site: '' }
  }
}
