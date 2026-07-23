// src/lib/logger.js
//
// Logging estruturado mínimo — sem dependência nova (nada de pino/winston).
// Escreve uma linha JSON por evento em vez de string solta: a maioria das
// plataformas de deploy (Vercel incluso) já faz parsing de JSON em stdout/
// stderr, então isso já rende log pesquisável/filtrável por campo sem
// nenhuma infra extra. Uso: logError('scope', error, { extra: 'contexto' }).
//
// Convenção de scope: mesma tag "[modulo]" que várias partes do código já
// usavam solta em console.error — só formaliza o formato, não muda onde loga.

function serializeError(error) {
  if (error instanceof Error) return { message: error.message, stack: error.stack }
  if (typeof error === 'string') return { message: error }
  return { message: String(error?.message ?? error ?? 'erro desconhecido') }
}

function emit(level, scope, error, extra) {
  const entry = {
    level,
    scope,
    at: new Date().toISOString(),
    ...serializeError(error),
    ...(extra && typeof extra === 'object' ? extra : {}),
  }
  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else console.warn(line)
}

export function logError(scope, error, extra) { emit('error', scope, error, extra) }
export function logWarn(scope, error, extra) { emit('warn', scope, error, extra) }
