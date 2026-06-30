// src/app/api/session/keys/route.js
//
// Guarda as credenciais do Datadog (API Key + App Key + Site) da SESSÃO atual
// em cookies httpOnly. "httpOnly" = o JavaScript do browser NÃO consegue ler;
// só o servidor lê. Isso protege contra um XSS roubar as chaves.
//
// Analogia: a chave fica num cofre nos fundos da loja (servidor). O cliente
// (browser) só recebe uma plaquinha "conectado ✓" — nunca a chave em si.
//
//   POST   -> valida e grava as chaves nos cookies httpOnly da sessão
//   GET    -> diz apenas SE está configurado e qual o site (sem expor a chave)
//   DELETE -> limpa as chaves (usar também no logout)

import { cookies } from 'next/headers'
import { auth } from '@/auth'
import { COOKIE, cookieOpts, VALID_SITES } from '@/lib/session-keys'

// POST — configurar as chaves
export async function POST(request) {
  // Só usuário logado pode configurar chaves (revalida no servidor — não
  // confiamos apenas no proxy por causa da CVE-2025-29927).
  const session = await auth()
  if (!session?.user) {
    return Response.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const apiKey = String(body?.apiKey || '').trim()
  const appKey = String(body?.appKey || '').trim()
  const site = String(body?.site || '').trim()

  if (apiKey.length < 10)
    return Response.json({ error: 'API Key parece inválida.' }, { status: 400 })
  if (appKey.length < 10)
    return Response.json({ error: 'Application Key parece inválida.' }, { status: 400 })
  if (!VALID_SITES.includes(site))
    return Response.json({ error: 'Site do Datadog inválido.' }, { status: 400 })

  const jar = await cookies()
  jar.set(COOKIE.api, apiKey, cookieOpts)
  jar.set(COOKIE.app, appKey, cookieOpts)
  jar.set(COOKIE.site, site, cookieOpts)

  return Response.json({ configured: true, site })
}

// GET — status (sem expor as chaves)
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const jar = await cookies()
  const hasApi = !!jar.get(COOKIE.api)?.value
  const hasApp = !!jar.get(COOKIE.app)?.value
  const site = jar.get(COOKIE.site)?.value || null

  return Response.json({ configured: hasApi && hasApp, site })
}

// DELETE — limpar
export async function DELETE() {
  const jar = await cookies()
  jar.delete(COOKIE.api)
  jar.delete(COOKIE.app)
  jar.delete(COOKIE.site)
  return Response.json({ configured: false })
}
