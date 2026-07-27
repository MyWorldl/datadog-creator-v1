// src/app/api/feature-flags/route.ts
//
// Devolve o estado de todas as feature flags conhecidas (ver lib/feature-flags.ts)
// pro client decidir o que mostrar. Autenticado como as demais rotas — não
// há motivo pra expor isso a quem não está logado, e mantém o padrão do
// resto da app (ex.: /api/connections).

import { getServerUser } from '@/lib/supabase-server'
import { getEnabledFeatures } from '@/lib/feature-flags'

export async function GET(): Promise<Response> {
  const user = await getServerUser()
  if (!user) {
    return Response.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  return Response.json({ flags: getEnabledFeatures() })
}
