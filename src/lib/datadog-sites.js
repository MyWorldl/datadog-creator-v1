// src/lib/datadog-sites.js
//
// Allowlist de sites Datadog válidos. Extraído de session-keys.js pra ficar
// num módulo SEM import de nada Next.js-runtime-only (next/headers, via
// supabase-server.js) — session-keys.js importa isso e mais getServerUser(),
// o que tornava impossível importar só a allowlist (ex.: de schemas.js) sem
// arrastar next/headers pra dentro do `node --test` (ele não resolve fora
// do runtime do Next, quebrando qualquer teste que importasse o módulo).

export const VALID_SITES = [
  'datadoghq.com', 'us3.datadoghq.com', 'us5.datadoghq.com',
  'datadoghq.eu', 'ap1.datadoghq.com', 'ap2.datadoghq.com', 'ddog-gov.com',
]
