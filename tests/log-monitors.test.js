// tests/log-monitors.test.js — runner nativo do Node (node --test), sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLogCountQuery, buildLogMonitorPayload, planLogPreview, initialLogMonitors, newLogMonitorRule, LOG_WINDOW_OPTIONS, DEFAULT_LOG_INDEX, tagsFromLogFilter, buildLogQuery, sanitizeLogGroupBy, normalizeLogMeasure, defaultLogMessage, validateLogRule, MAX_LOG_GROUPS } from '../src/lib/log-monitors.ts'

test('buildLogCountQuery: monta logs(query).index(idx).rollup("count").last(window) > threshold', () => {
  const q = buildLogCountQuery({ queryFilter: 'service:checkout status:error', index: 'main', window: '15m', threshold: 50 })
  assert.equal(q, 'logs("service:checkout status:error").index("main").rollup("count").last("15m") > 50')
})

test('buildLogCountQuery: index ausente cai pro default "*" (todos os índices)', () => {
  const q = buildLogCountQuery({ queryFilter: 'status:error', window: '5m', threshold: 1 })
  assert.ok(q.includes('.index("*")'))
  assert.equal(DEFAULT_LOG_INDEX, '*')
})

test('buildLogCountQuery: filtro vazio é aceito (conta TODOS os logs do índice)', () => {
  const q = buildLogCountQuery({ queryFilter: '', index: '*', window: '1h', threshold: 1000 })
  assert.equal(q, 'logs("").index("*").rollup("count").last("1h") > 1000')
})

test('buildLogCountQuery: aspas duplas no filtro do usuário são escapadas (não quebram a query)', () => {
  const q = buildLogCountQuery({ queryFilter: 'message:"connection refused"', index: '*', window: '5m', threshold: 1 })
  assert.equal(q, 'logs("message:\\"connection refused\\"").index("*").rollup("count").last("5m") > 1')
})

test('LOG_WINDOW_OPTIONS: nenhuma janela passa do teto documentado de 2 dias', () => {
  for (const w of LOG_WINDOW_OPTIONS) {
    const m = w.value.match(/^(\d+)([mh])$/)
    assert.ok(m, `formato inesperado: ${w.value}`)
    const minutes = m[2] === 'h' ? Number(m[1]) * 60 : Number(m[1])
    assert.ok(minutes <= 2880, `${w.value} excede o teto de 2 dias`)
  }
})

test('buildLogMonitorPayload: type "log alert", nome com prefixo, tags base, enable_logs_sample', () => {
  const payload = buildLogMonitorPayload({ label: 'Erros do checkout', queryFilter: 'service:checkout status:error', index: '*', window: '15m', threshold: 50 })
  assert.equal(payload.type, 'log alert')
  assert.equal(payload.name, '[MonitorsCreator] Erros do checkout')
  assert.ok(payload.tags.includes('created_by:monitorscreator'))
  assert.ok(payload.tags.includes('monitor_kind:log'))
  assert.equal(payload.options.thresholds.critical, 50)
  assert.equal(payload.options.enable_logs_sample, true)
  assert.equal(payload.options.thresholds.warning, undefined)
})

test('buildLogMonitorPayload: warningThreshold definido entra em options.thresholds.warning', () => {
  const payload = buildLogMonitorPayload({ label: 'x', queryFilter: '', index: '*', window: '5m', threshold: 100, warningThreshold: 50 })
  assert.equal(payload.options.thresholds.warning, 50)
})

test('buildLogMonitorPayload: priority null/ausente não entra no payload; definida entra no topo', () => {
  const semPrioridade = buildLogMonitorPayload({ label: 'x', queryFilter: '', window: '5m', threshold: 1 })
  assert.equal('priority' in semPrioridade, false)
  const comPrioridade = buildLogMonitorPayload({ label: 'x', queryFilter: '', window: '5m', threshold: 1, priority: 2 })
  assert.equal(comPrioridade.priority, 2)
})

test('buildLogMonitorPayload: notifyTarget substitui @equipe-ops na mensagem default', () => {
  const payload = buildLogMonitorPayload({ label: 'x', queryFilter: '', window: '5m', threshold: 1, notifyTarget: '@equipe-plataforma' })
  assert.ok(payload.message.includes('@equipe-plataforma'))
  assert.ok(!payload.message.includes('@equipe-ops'))
})

test('planLogPreview: 1 item por regra habilitada (com label); regra sem label é pulada', () => {
  const state = initialLogMonitors()
  state.rules = [
    { ...newLogMonitorRule('r1'), label: 'Erros checkout', queryFilter: 'service:checkout status:error', threshold: 50 },
    { ...newLogMonitorRule('r2'), label: '' }, // sem label — deve ser pulada
  ]
  const plan = planLogPreview(state)
  assert.equal(plan.length, 1)
  assert.equal(plan[0].label, 'Erros checkout')
  assert.equal(plan[0].payload.type, 'log alert')
})

test('planLogPreview: mensagem por regra vem de messages[rule.id] quando presente', () => {
  const state = initialLogMonitors()
  state.rules = [{ ...newLogMonitorRule('r1'), label: 'x' }]
  state.messages = { r1: 'mensagem customizada' }
  const plan = planLogPreview(state)
  assert.equal(plan[0].message, 'mensagem customizada')
})

test('planLogPreview: sem regras (ou objeto vazio) devolve plano vazio, sem lançar', () => {
  assert.deepEqual(planLogPreview({}), [])
  assert.deepEqual(planLogPreview(initialLogMonitors()), [])
})

test('newLogMonitorRule: defaults sensatos (janela 15m, índice "*", amostra de logs ligada)', () => {
  const r = newLogMonitorRule('abc')
  assert.equal(r.id, 'abc')
  assert.equal(r.window, '15m')
  assert.equal(r.index, '*')
  assert.equal(r.enableLogsSample, true)
  assert.equal(r.warningThreshold, null)
})

// ── tagsFromLogFilter (source/status replicados do filtro pra tag do monitor) ──

test('tagsFromLogFilter: source e status simples viram tag', () => {
  assert.deepEqual(tagsFromLogFilter('source:nginx status:error'), ['source:nginx', 'status:error'])
  assert.deepEqual(tagsFromLogFilter('status:error'), ['status:error'])
})

test('tagsFromLogFilter: valor entre aspas (com espaço) vira tag sem as aspas', () => {
  assert.deepEqual(tagsFromLogFilter('source:"meu source"'), ['source:meu source'])
})

test('tagsFromLogFilter: negado (-status:x ou NOT status:x) não vira tag — seria o oposto do que o monitor observa', () => {
  assert.deepEqual(tagsFromLogFilter('-status:info'), [])
  assert.deepEqual(tagsFromLogFilter('NOT status:info'), [])
  assert.deepEqual(tagsFromLogFilter('source:nginx -status:info'), ['source:nginx'])
})

test('tagsFromLogFilter: wildcard não vira tag (valor não é literal)', () => {
  assert.deepEqual(tagsFromLogFilter('source:ng*'), [])
})

test('tagsFromLogFilter: grupo/OR não vira tag (não é 1 valor único)', () => {
  assert.deepEqual(tagsFromLogFilter('source:(nginx OR apache)'), [])
})

test('tagsFromLogFilter: filtro vazio ou sem source/status não gera nada', () => {
  assert.deepEqual(tagsFromLogFilter(''), [])
  assert.deepEqual(tagsFromLogFilter('service:checkout env:prod'), [])
})

test('tagsFromLogFilter: outros facets (além de source/status) são ignorados de propósito', () => {
  assert.deepEqual(tagsFromLogFilter('source:nginx team:payments'), ['source:nginx'])
})

test('buildLogMonitorPayload: filtro com source/status entra nas tags do monitor final', () => {
  const payload = buildLogMonitorPayload({ label: 'Erros nginx', queryFilter: 'source:nginx status:error', window: '15m', threshold: 10 })
  assert.ok(payload.tags.includes('source:nginx'))
  assert.ok(payload.tags.includes('status:error'))
})

test('buildLogMonitorPayload: tag manual repetida do filtro não duplica (dedupe)', () => {
  const payload = buildLogMonitorPayload({ label: 'x', queryFilter: 'source:nginx', window: '15m', threshold: 1, tags: ['source:nginx', 'team:payments'] })
  assert.equal(payload.tags.filter(t => t === 'source:nginx').length, 1)
  assert.ok(payload.tags.includes('team:payments'))
})

// ── v2: agregação, atributo, agrupamento, operador (sintaxe confirmada via /validate) ──

test('buildLogQuery: avg com atributo e operador', () => {
  assert.equal(
    buildLogQuery({ queryFilter: 'service:x', window: '15m', threshold: 100, rollup: 'avg', measure: '@duration', operator: '>=' }),
    'logs("service:x").index("*").rollup("avg", "@duration").last("15m") >= 100',
  )
})

test('buildLogQuery: atributo sem @ ganha o @; espaços/vírgulas/aspas são removidos', () => {
  assert.equal(normalizeLogMeasure('duration'), '@duration')
  assert.equal(normalizeLogMeasure(' @a, b"c '), '@abc')
  assert.equal(normalizeLogMeasure(''), '')
})

test('buildLogQuery: .by() entra DEPOIS do rollup e ANTES do last, com os facets separados por vírgula', () => {
  assert.equal(
    buildLogQuery({ queryFilter: 'status:error', window: '5m', threshold: 10, groupBy: ['service', '@http.status_code'] }),
    'logs("status:error").index("*").rollup("count").by("service,@http.status_code").last("5m") > 10',
  )
})

test('sanitizeLogGroupBy: limpa vazios/duplicados e corta em 4 (limite do Datadog)', () => {
  assert.deepEqual(sanitizeLogGroupBy([' service ', '', 'service', 'host', 'env', '@a', '@b', '@c']), ['service', 'host', 'env', '@a'])
  assert.equal(MAX_LOG_GROUPS, 4)
  assert.deepEqual(sanitizeLogGroupBy(undefined), [])
})

test('buildLogQuery: sem os campos novos continua idêntico ao v1 (compatibilidade)', () => {
  assert.equal(
    buildLogQuery({ queryFilter: 'a', window: '15m', threshold: 1 }),
    buildLogCountQuery({ queryFilter: 'a', window: '15m', threshold: 1 }),
  )
})

test('validateLogRule: agregação != count exige atributo; warning precisa estar do lado certo do operador', () => {
  assert.deepEqual(validateLogRule({ rollup: 'count', threshold: 10, warningThreshold: 5 }), [])
  assert.equal(validateLogRule({ rollup: 'avg', measure: '', threshold: 10, warningThreshold: null }).length, 1)
  assert.deepEqual(validateLogRule({ rollup: 'avg', measure: '@d', threshold: 10, warningThreshold: null }), [])
  assert.equal(validateLogRule({ operator: '>', threshold: 100, warningThreshold: 150 }).length, 1)
  assert.equal(validateLogRule({ operator: '<', threshold: 10, warningThreshold: 5 }).length, 1)
  assert.deepEqual(validateLogRule({ operator: '<', threshold: 10, warningThreshold: 20 }), [])
  assert.equal(validateLogRule({ groupBy: ['a', 'b', 'c', 'd', 'e'], threshold: 1, warningThreshold: null }).length, 1)
})

test('defaultLogMessage: menciona o agrupamento (variável de grupo certa) e a agregação', () => {
  const m = defaultLogMessage({ rollup: 'avg', measure: 'duration', groupBy: ['service', '@http.status_code'], operator: '<' })
  assert.ok(m.includes('{{service.name}}'))
  assert.ok(m.includes('{{[@http.status_code].name}}'))
  assert.ok(m.includes('avg(@duration)'))
  assert.ok(m.includes('mínimo'))
  assert.ok(m.endsWith('@equipe-ops'))
})

test('planLogPreview: regra v2 chega até a query do plano', () => {
  const state = initialLogMonitors()
  state.rules = [{ ...newLogMonitorRule('r1'), label: 'Lento', queryFilter: 'service:api', rollup: 'pc95', measure: '@duration', groupBy: ['service'], operator: '>', threshold: 500 }]
  const plan = planLogPreview(state)
  assert.equal(plan[0].query, 'logs("service:api").index("*").rollup("pc95", "@duration").by("service").last("15m") > 500')
})
