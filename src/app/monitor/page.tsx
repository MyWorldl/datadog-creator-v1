// src/app/monitor/page.tsx
// MonitorsCreator mudou de rota pra /ferramentas/monitor (achado da
// auditoria: era a única ferramenta fora de /ferramentas/*). Redirect mantém
// links/favoritos antigos funcionando — mesmo padrão de src/app/page.tsx.
// Preserva a query string (?tab=k8sDbm, deep-link do AuditMonitors).
import { redirect } from 'next/navigation'

export default async function MonitorRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue
    for (const v of Array.isArray(value) ? value : [value]) qs.append(key, v)
  }
  const suffix = qs.toString()
  redirect(`/ferramentas/monitor${suffix ? `?${suffix}` : ''}`)
}
