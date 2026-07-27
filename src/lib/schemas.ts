// src/lib/schemas.ts
//
// Schemas de validação de input (zod) pras rotas de API — substituem
// checagem manual (String(x||'').trim(), x.length < 10, etc.) por um
// contrato declarado uma vez só. Começa pelas rotas que recebem credenciais
// Datadog do usuário (validate, connections); as demais rotas continuam com
// checagem manual por ora — migração incremental, não um rewrite de uma vez.

import { z } from 'zod'
import { VALID_SITES } from './datadog-sites.ts'
import { isSafeDqlToken } from './datadog-server.ts'

// Mesmo limiar (10 chars) que a checagem manual já usava — não é validação
// de formato real da chave (a Datadog não documenta um formato público
// estável), só descarta o caso óbvio de campo vazio/incompleto antes de
// gastar uma chamada de rede pra validar de verdade.
export const datadogKeysSchema = z.object({
  apiKey: z.string().trim().min(10, 'API Key parece inválida.'),
  appKey: z.string().trim().min(10, 'Application Key parece inválida.'),
  site: z.enum(VALID_SITES, { message: 'Site do Datadog inválido.' }),
})
export type DatadogKeys = z.infer<typeof datadogKeysSchema>

// connections/route.ts aceita tudo do schema acima + um nome opcional.
export const createConnectionSchema = datadogKeysSchema.extend({
  name: z.string().trim().optional().default(''),
})
export type CreateConnectionInput = z.infer<typeof createConnectionSchema>

// Extrai a primeira mensagem de erro do schema (formato já pensado pra virar
// direto o campo `error` das respostas JSON das rotas).
export function firstIssueMessage(zodError: z.ZodError | { issues?: { message?: string }[] }): string {
  return zodError.issues?.[0]?.message || 'Dados inválidos.'
}

// ── Rotas de descoberta (query params e bodies de criação de monitor) ──
// Mesmo isSafeDqlToken usado nas rotas de namespace (security-hardening) —
// um único lugar validando "isto vira parte de uma query DQL", em vez de
// reimplementar a allowlist em cada schema. Reforço de contrato/robustez
// contra query malformada, não fronteira de segurança entre tenants (ver
// comentário em datadog-server.ts).
const dqlToken = (label: string) => z.string().trim().refine(isSafeDqlToken, {
  message: `${label} inválido (use apenas letras, dígitos, ponto, underscore, hífen ou barra).`,
})

export interface DqlTokenListResult {
  success: boolean
  data?: string[]
  error?: { issues: { message: string }[] }
}

// "a,b,c" -> ['a','b','c'], cada item validado como token DQL seguro.
// Usada por operations (services) — namespace-operations já valida isso
// inline (branch security-hardening), não duplicado aqui.
export function parseDqlTokenList(raw: string | null | undefined, label: string): DqlTokenListResult {
  const items = String(raw || '').split(',').map(s => s.trim()).filter(Boolean)
  if (items.length === 0) return { success: false, error: { issues: [{ message: `Informe ao menos um ${label}.` }] } }
  for (const item of items) {
    if (!isSafeDqlToken(item)) {
      return { success: false, error: { issues: [{ message: `${label} inválido: ${item} (use apenas letras, dígitos, ponto, underscore, hífen ou barra).` }] } }
    }
  }
  return { success: true, data: items }
}

// hosts/route.ts: filter usa a sintaxe de BUSCA de host da Datadog (aceita
// espaço, AND/OR, etc — não é um token único como service/env/namespace),
// então NÃO reaproveita isSafeDqlToken. Vai como query string já serializada
// via URLSearchParams (nunca interpolada direto numa query DQL nossa) — só
// um teto de tamanho contra abuso, sem restringir caracteres.
export const hostFilterSchema = z.string().trim().max(500, 'Filtro muito longo.').optional().default('')

// services/route.ts: env é um valor de tag isolado (não uma busca composta).
// '*' (wildcard "todos os envs") precisa ser aceito EXPLICITAMENTE além do
// .default('*') abaixo: o client sempre manda env=* quando o campo está
// vazio (DiscoveryConfigure.tsx: `env || '*'` na URL) — ou seja, o valor
// literal "*" chega como input DEFINIDO, então o .default() nunca entra em
// ação pra ele (só substitui quando o input é undefined). Sem esse
// z.union, isSafeDqlToken('*') falhava (asterisco fora do charset de
// isSafeDqlToken) e a rota devolvia "Valor de env inválido" bem no caso
// mais comum (nenhum env digitado) — bug real, coberto agora por teste.
export const envQuerySchema = z.union([z.literal('*'), dqlToken('Valor de env')]).optional().default('*')

// finops/route.ts: mês no formato YYYY-MM (usado em monthBoundsMs — um valor
// fora desse formato quebrava o cálculo de forma silenciosa, sem erro claro).
export const monthQuerySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido (use o formato AAAA-MM).').optional()

// connections/[id]/route.ts: id é um uuid gerado pelo Postgres (Supabase) —
// valor fora desse formato nunca bate com nenhuma linha, mas validar antes
// devolve 400 claro em vez de rodar a query à toa.
export const connectionIdSchema = z.uuid('Id de conexão inválido.')

// ── Criação de monitores (infra/apm/service-monitors) ──
// Formato "plan já expandido" (AuditMonitors/service-monitors): cada item
// precisa só do essencial que createPlanIdempotent/ddPost de fato usam —
// não valida cada campo de metadado (kind/service/operation), que variam
// por origem (host vs. serviço) e já são só para exibição/log.
export const planItemSchema = z.object({
  payload: z.object({
    name: z.string().trim().min(1, 'Monitor sem nome no plano.'),
    type: z.string().trim().min(1, 'Monitor sem type no plano.'),
    query: z.string().trim().min(1, 'Monitor sem query no plano.'),
  }).passthrough(),
}).passthrough()

export const planSchema = z.array(planItemSchema).min(1, 'Plano vazio — nada a criar.')
export type Plan = z.infer<typeof planSchema>

// Formato "discovery bruto" (infra-monitors com {infra:...}, service-monitors
// com {discovery:...} ou body direto): validação leve — só garante o formato
// geral (selected é um objeto, os arrays/objetos auxiliares têm o tipo certo)
// — planPreview()/planInfraPreview() já lidam com campos ausentes via default
// (selected:{}, alerts:{}, etc.) e retornam plano vazio nesse caso, tratado
// à parte pela rota ("Nada a criar").
export const discoveryBodySchema = z.object({
  selected: z.record(z.string(), z.unknown()).optional().default({}),
  env: z.string().trim().optional(),
  groupBy: z.array(z.string()).optional(),
  scopeType: z.enum(['service', 'namespace']).optional(),
  tags: z.array(z.string()).optional(),
  namePrefix: z.string().optional(),
  notifyTarget: z.string().optional(),
  notifyNoData: z.boolean().optional(),
  renotifyInterval: z.number().optional(),
}).passthrough()
export type DiscoveryBody = z.infer<typeof discoveryBodySchema>
