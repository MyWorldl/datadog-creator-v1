// src/lib/session-keys.js
//
// Lógica compartilhada para as credenciais do Datadog guardadas em cookies
// httpOnly da sessão. Fica fora do route.js de propósito: arquivos de rota
// só podem exportar os métodos HTTP (GET, POST...), então qualquer helper
// extra vive aqui.

import { cookies } from 'next/headers'

export const VALID_SITES = [
  'datadoghq.com', 'us3.datadoghq.com', 'us5.datadoghq.com',
  'datadoghq.eu', 'ap1.datadoghq.com', 'ap2.datadoghq.com', 'ddog-gov.com',
]

export const COOKIE = {
  api: 'dd_api_key',
  app: 'dd_app_key',
  site: 'dd_site',
}

// Cookie de sessão httpOnly. Sem maxAge/expires => sobrevive ao refresh,
// some ao fechar o browser. Exatamente "durante a sessão".
export const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
}

// Lê as chaves no servidor (usada pelas rotas /api/datadog/* e /api/session/keys).
export async function readSessionKeys() {
  const jar = await cookies()
  return {
    apiKey: jar.get(COOKIE.api)?.value || '',
    appKey: jar.get(COOKIE.app)?.value || '',
    site: jar.get(COOKIE.site)?.value || '',
  }
}
