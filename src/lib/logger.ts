// src/lib/logger.ts
//
// Logging estruturado mínimo — sem dependência nova (nada de pino/winston).
// Escreve uma linha JSON por evento em vez de string solta: a maioria das
// plataformas de deploy (Vercel incluso) já faz parsing de JSON em stdout/
// stderr, então isso já rende log pesquisável/filtrável por campo sem
// nenhuma infra extra. Uso: logError('scope', error, { extra: 'contexto' }).
//
// Convenção de scope: mesma tag "[modulo]" que várias partes do código já
// usavam solta em console.error — só formaliza o formato, não muda onde loga.

type LogLevel = 'error' | 'warn'
type LogExtra = Record<string, unknown> | undefined

interface LogEntry {
  level: LogLevel
  scope: string
  at: string
  message: string
  stack?: string
  [key: string]: unknown
}

function serializeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: error.message, stack: error.stack }
  if (typeof error === 'string') return { message: error }
  const maybeMessage = (error as { message?: unknown } | null | undefined)?.message
  return { message: String(maybeMessage ?? error ?? 'erro desconhecido') }
}

function emit(level: LogLevel, scope: string, error: unknown, extra: LogExtra): void {
  const entry: LogEntry = {
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

export function logError(scope: string, error: unknown, extra?: LogExtra): void { emit('error', scope, error, extra) }
export function logWarn(scope: string, error: unknown, extra?: LogExtra): void { emit('warn', scope, error, extra) }
