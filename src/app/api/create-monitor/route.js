// src/app/api/create-monitor/route.js
//
// Rota de servidor — roda APENAS no servidor (Vercel/Node.js)
// Nunca é exposta ao browser. As chaves do Datadog ficam seguras aqui.
//
// URL: POST /api/create-monitor
// Chamada pelo Wizard em: src/components/StepCreate.jsx
//
// MUDANÇA: as chaves NÃO vêm mais no body. Elas são lidas dos cookies
// httpOnly da sessão (definidos em "Conectar"), de modo que nunca trafegam
// pelo JavaScript do browser. O body agora carrega só o "config" do monitor.

import { auth } from '@/auth'
import { readSessionKeys } from '@/lib/session-keys'

// ─────────────────────────────────────────────
// Sites válidos do Datadog
// ─────────────────────────────────────────────
const VALID_SITES = [
  'datadoghq.com',
  'us3.datadoghq.com',
  'us5.datadoghq.com',
  'datadoghq.eu',
  'ap1.datadoghq.com',
  'ap2.datadoghq.com',
  'ddog-gov.com',
]

// ─────────────────────────────────────────────
// Algoritmos e sazonalidades válidos
// ─────────────────────────────────────────────
const VALID_ALGORITHMS = ['basic', 'agile', 'robust']
const VALID_SEASONALITIES = ['hourly', 'daily', 'weekly']
const VALID_DIRECTIONS = ['above', 'below', 'both']
const VALID_ALERT_WINDOWS = [
  'last_5m', 'last_10m', 'last_15m', 'last_30m',
  'last_1h', 'last_2h', 'last_4h',
]
const VALID_QUERY_WINDOWS = [
  'last_1h', 'last_4h', 'last_1d',
  'last_2d', 'last_7d',
]

// ─────────────────────────────────────────────
// Validação dos campos obrigatórios
// Retorna null se tudo ok, ou string com o erro
// ─────────────────────────────────────────────
function validate(body) {
  const { apiKey, appKey, site, config } = body

  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10)
    return 'apiKey inválida ou ausente.'

  if (!appKey || typeof appKey !== 'string' || appKey.trim().length < 10)
    return 'appKey inválida ou ausente.'

  if (!site || !VALID_SITES.includes(site))
    return `site inválido. Use um dos: ${VALID_SITES.join(', ')}`

  if (!config || typeof config !== 'object')
    return 'config ausente no body.'

  const { metric, filter, algorithm, deviations, seasonality,
          direction, alertWindow, queryWindow, name, message } = config

  if (!metric || typeof metric !== 'string' || metric.trim().length === 0)
    return 'config.metric é obrigatório.'

  if (!filter || typeof filter !== 'string')
    return 'config.filter é obrigatório (use "*" para todos).'

  if (!VALID_ALGORITHMS.includes(algorithm))
    return `config.algorithm inválido. Use: ${VALID_ALGORITHMS.join(', ')}`

  if (!VALID_SEASONALITIES.includes(seasonality))
    return `config.seasonality inválido. Use: ${VALID_SEASONALITIES.join(', ')}`

  if (!VALID_DIRECTIONS.includes(direction))
    return `config.direction inválido. Use: ${VALID_DIRECTIONS.join(', ')}`

  if (!VALID_ALERT_WINDOWS.includes(alertWindow))
    return `config.alertWindow inválido. Use: ${VALID_ALERT_WINDOWS.join(', ')}`

  if (!VALID_QUERY_WINDOWS.includes(queryWindow))
    return `config.queryWindow inválido. Use: ${VALID_QUERY_WINDOWS.join(', ')}`

  const dev = Number(deviations)
  if (isNaN(dev) || dev < 1 || dev > 10)
    return 'config.deviations deve ser um número entre 1 e 10.'

  if (!name || typeof name !== 'string' || name.trim().length === 0)
    return 'config.name é obrigatório.'

  if (!message || typeof message !== 'string' || message.trim().length === 0)
    return 'config.message é obrigatório.'

  return null // ← tudo válido
}

// ─────────────────────────────────────────────
// Monta a query no formato exigido pela API do Datadog
//
// Formato oficial:
// avg(<queryWindow>):anomalies(<metric>{<filter>}, '<algorithm>',
//   <deviations>, direction='<direction>',
//   alert_window='<alertWindow>', interval=60,
//   count_default_zero='true',
//   seasonality='<seasonality>') >= 1
// ─────────────────────────────────────────────
function buildQuery(config) {
  const {
    metric, filter, algorithm, deviations,
    direction, alertWindow, queryWindow, seasonality,
  } = config

  // basic não usa seasonality
  const seasonalityParam =
    algorithm !== 'basic'
      ? `, seasonality='${seasonality}'`
      : ''

  return (
    `avg(${queryWindow}):anomalies(` +
    `avg:${metric}{${filter}}, ` +
    `'${algorithm}', ${deviations}, ` +
    `direction='${direction}', ` +
    `alert_window='${alertWindow}', ` +
    `interval=60, ` +
    `count_default_zero='true'` +
    `${seasonalityParam}` +
    `) >= 1`
  )
}

// ─────────────────────────────────────────────
// Monta o payload completo para POST /api/v1/monitor
// ─────────────────────────────────────────────
function buildPayload(config) {
  const {
    name, message, tags = [], priority = 3,
    alertWindow, notifyNoData = false,
  } = config

  return {
    type: 'query alert', // ← Anomaly Detection usa este tipo
    query: buildQuery(config),
    name: name.trim(),
    message: message.trim(),
    tags: Array.isArray(tags) ? tags : [],
    priority: Number(priority),
    options: {
      // Janelas exclusivas de anomaly detection
      threshold_windows: {
        alert_window: alertWindow,
        recovery_window: 'last_15m',
      },
      thresholds: {
        critical: 1.0, // >= 1 ponto anomalous dispara alerta
      },
      notify_no_data: Boolean(notifyNoData),
      notify_audit: false,
      require_full_window: false, // false = não esperar janela completa
      new_host_delay: 300,        // 5min de delay para hosts novos
      renotify_interval: 0,       // 0 = não renotificar
    },
  }
}

// ─────────────────────────────────────────────
// Handler principal — POST /api/create-monitor
// ─────────────────────────────────────────────
export async function POST(request) {
  // 0. Exige usuário logado (revalida no servidor — não confia só no proxy
  //    por causa da CVE-2025-29927).
  const session = await auth()
  if (!session?.user) {
    return Response.json(
      { success: false, error: 'Não autenticado.' },
      { status: 401 }
    )
  }

  // 1. Lê e valida o JSON do body (agora só o "config" do monitor)
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { success: false, error: 'Body inválido. Envie um JSON válido.' },
      { status: 400 }
    )
  }

  // 2. Pega as chaves dos cookies httpOnly da sessão (definidas em "Conectar")
  const { apiKey, appKey, site } = await readSessionKeys()
  if (!apiKey || !appKey || !site) {
    return Response.json(
      {
        success: false,
        error: 'Sessão sem credenciais do Datadog. Conecte-se primeiro em "Conectar".',
      },
      { status: 412 } // Precondition Failed
    )
  }

  // 3. Valida tudo junto (chaves da sessão + config do body) reutilizando
  //    o mesmo validador.
  const merged = { apiKey, appKey, site, config: body?.config }
  const validationError = validate(merged)
  if (validationError) {
    return Response.json(
      { success: false, error: validationError },
      { status: 400 }
    )
  }

  const { config } = merged

  // 3. Monta o payload do monitor
  const payload = buildPayload(config)

  // 4. Chama a API do Datadog (no servidor — chaves nunca vão ao browser)
  let ddResponse
  try {
    ddResponse = await fetch(`https://api.${site}/api/v1/monitor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': apiKey.trim(),
        'DD-APPLICATION-KEY': appKey.trim(),
      },
      body: JSON.stringify(payload),
    })
  } catch (networkError) {
    return Response.json(
      {
        success: false,
        error: `Erro de rede ao conectar ao Datadog: ${networkError.message}`,
      },
      { status: 502 }
    )
  }

  // 5. Lê a resposta do Datadog
  let ddData
  try {
    ddData = await ddResponse.json()
  } catch {
    return Response.json(
      { success: false, error: 'Resposta inválida do Datadog.' },
      { status: 502 }
    )
  }

  // 6. Trata erros retornados pelo Datadog
  if (!ddResponse.ok) {
    const ddErrors = ddData?.errors?.join(', ') || ddData?.message || 'Erro desconhecido do Datadog.'
    return Response.json(
      { success: false, error: ddErrors, details: ddData },
      { status: ddResponse.status }
    )
  }

  // 7. Sucesso — retorna ID e URL do monitor criado
  return Response.json(
    {
      success: true,
      monitorId: ddData.id,
      monitorName: ddData.name,
      monitorUrl: `https://app.${site}/monitors/${ddData.id}`,
      query: payload.query, // útil para debug
    },
    { status: 201 }
  )
}

// ─────────────────────────────────────────────
// Bloqueia métodos não suportados (GET, DELETE, etc.)
// ─────────────────────────────────────────────
export async function GET() {
  return Response.json(
    { error: 'Método não permitido. Use POST.' },
    { status: 405 }
  )
}