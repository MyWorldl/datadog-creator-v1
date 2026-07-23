// src/lib/schemas.js
//
// Schemas de validação de input (zod) pras rotas de API — substituem
// checagem manual (String(x||'').trim(), x.length < 10, etc.) por um
// contrato declarado uma vez só. Começa pelas rotas que recebem credenciais
// Datadog do usuário (validate, connections); as demais rotas continuam com
// checagem manual por ora — migração incremental, não um rewrite de uma vez.

import { z } from 'zod'
import { VALID_SITES } from './datadog-sites.js'

// Mesmo limiar (10 chars) que a checagem manual já usava — não é validação
// de formato real da chave (a Datadog não documenta um formato público
// estável), só descarta o caso óbvio de campo vazio/incompleto antes de
// gastar uma chamada de rede pra validar de verdade.
export const datadogKeysSchema = z.object({
  apiKey: z.string().trim().min(10, 'API Key parece inválida.'),
  appKey: z.string().trim().min(10, 'Application Key parece inválida.'),
  site: z.enum(VALID_SITES, { message: 'Site do Datadog inválido.' }),
})

// connections/route.js aceita tudo do schema acima + um nome opcional.
export const createConnectionSchema = datadogKeysSchema.extend({
  name: z.string().trim().optional().default(''),
})

// Extrai a primeira mensagem de erro do schema (formato já pensado pra virar
// direto o campo `error` das respostas JSON das rotas).
export function firstIssueMessage(zodError) {
  return zodError.issues?.[0]?.message || 'Dados inválidos.'
}
