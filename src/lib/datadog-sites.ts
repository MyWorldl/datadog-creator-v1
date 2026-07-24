// src/lib/datadog-sites.ts
//
// Allowlist de sites Datadog válidos. Extraído de session-keys.ts pra ficar
// num módulo SEM import de nada Next.js-runtime-only (next/headers, via
// supabase-server.js) — session-keys.ts importa isso e mais getServerUser(),
// o que tornava impossível importar só a allowlist (ex.: de schemas.ts) sem
// arrastar next/headers pra dentro do `node --test` (ele não resolve fora
// do runtime do Next, quebrando qualquer teste que importasse o módulo).

export const VALID_SITES = [
  'datadoghq.com', 'us3.datadoghq.com', 'us5.datadoghq.com',
  'datadoghq.eu', 'ap1.datadoghq.com', 'ap2.datadoghq.com', 'ddog-gov.com',
] as const

export type DatadogSite = typeof VALID_SITES[number]
