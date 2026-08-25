// tests/schemas.test.js — node --test, sem deps além de zod (já é dependência).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  datadogKeysSchema, createConnectionSchema, firstIssueMessage,
  hostFilterSchema, envQuerySchema, monthQuerySchema, connectionIdSchema,
  renameConnectionSchema, parseDqlTokenList, planSchema, discoveryBodySchema,
  bulkRenameApplySchema,
} from '../src/lib/schemas.ts'

test('datadogKeysSchema: aceita chaves e site válidos', () => {
  const r = datadogKeysSchema.safeParse({ apiKey: '1234567890', appKey: '1234567890', site: 'datadoghq.com' })
  assert.equal(r.success, true)
  assert.equal(r.data.site, 'datadoghq.com')
})

test('datadogKeysSchema: rejeita apiKey/appKey curtos com mensagem específica', () => {
  const r1 = datadogKeysSchema.safeParse({ apiKey: 'abc', appKey: '1234567890', site: 'datadoghq.com' })
  assert.equal(r1.success, false)
  assert.equal(firstIssueMessage(r1.error), 'API Key parece inválida.')

  const r2 = datadogKeysSchema.safeParse({ apiKey: '1234567890', appKey: 'abc', site: 'datadoghq.com' })
  assert.equal(r2.success, false)
  assert.equal(firstIssueMessage(r2.error), 'Application Key parece inválida.')
})

test('datadogKeysSchema: rejeita site fora da allowlist', () => {
  const r = datadogKeysSchema.safeParse({ apiKey: '1234567890', appKey: '1234567890', site: 'evil.example.com' })
  assert.equal(r.success, false)
  assert.equal(firstIssueMessage(r.error), 'Site do Datadog inválido.')
})

test('datadogKeysSchema: espaços nas chaves são cortados (trim), igual à checagem manual antiga', () => {
  const r = datadogKeysSchema.safeParse({ apiKey: '  1234567890  ', appKey: '1234567890', site: 'datadoghq.com' })
  assert.equal(r.success, true)
  assert.equal(r.data.apiKey, '1234567890')
})

test('createConnectionSchema: name é opcional (default "")', () => {
  const r = createConnectionSchema.safeParse({ apiKey: '1234567890', appKey: '1234567890', site: 'datadoghq.com' })
  assert.equal(r.success, true)
  assert.equal(r.data.name, '')
})

test('createConnectionSchema: name informado é preservado (trim)', () => {
  const r = createConnectionSchema.safeParse({ apiKey: '1234567890', appKey: '1234567890', site: 'datadoghq.com', name: '  Prod  ' })
  assert.equal(r.success, true)
  assert.equal(r.data.name, 'Prod')
})

test('hostFilterSchema: vazio/ausente vira "" (todos os hosts); aceita sintaxe de busca (espaço, AND)', () => {
  assert.equal(hostFilterSchema.parse(undefined), '')
  assert.equal(hostFilterSchema.parse(''), '')
  assert.equal(hostFilterSchema.parse('env:prod AND role:web'), 'env:prod AND role:web')
  assert.equal(hostFilterSchema.parse('  env:prod  '), 'env:prod')
})

test('hostFilterSchema: rejeita filtro absurdamente longo (teto de abuso, não de formato)', () => {
  const huge = 'a'.repeat(501)
  assert.equal(hostFilterSchema.safeParse(huge).success, false)
  assert.equal(hostFilterSchema.safeParse('a'.repeat(500)).success, true)
})

test('envQuerySchema: ausente/indefinido usa default "*"; valor informado precisa ser um token seguro', () => {
  assert.equal(envQuerySchema.parse(undefined), '*')
  assert.equal(envQuerySchema.parse('prod'), 'prod')
  assert.equal(envQuerySchema.safeParse('prod;drop').success, false)
})

test('envQuerySchema: "*" literal (enviado explicitamente pelo client quando o campo env está vazio) é aceito — regressão do bug "Valor de env inválido" no caso mais comum (nenhum env digitado)', () => {
  assert.equal(envQuerySchema.parse('*'), '*')
  assert.equal(envQuerySchema.safeParse('**').success, false, 'só o wildcard exato "*" é aceito, não variações')
})

test('monthQuerySchema: aceita AAAA-MM válido, rejeita formato errado, opcional (undefined ok)', () => {
  assert.equal(monthQuerySchema.parse('2026-07'), '2026-07')
  assert.equal(monthQuerySchema.parse(undefined), undefined)
  assert.equal(monthQuerySchema.safeParse('2026-13').success, false, 'mês 13 não existe')
  assert.equal(monthQuerySchema.safeParse('26-07').success, false, 'ano precisa ter 4 dígitos')
  assert.equal(monthQuerySchema.safeParse('julho/2026').success, false)
})

test('connectionIdSchema: aceita uuid válido, rejeita string arbitrária (evita bater no banco à toa)', () => {
  assert.equal(connectionIdSchema.parse('550e8400-e29b-41d4-a716-446655440000'), '550e8400-e29b-41d4-a716-446655440000')
  assert.equal(connectionIdSchema.safeParse('not-a-uuid').success, false)
  assert.equal(connectionIdSchema.safeParse('').success, false)
})

test('renameConnectionSchema: aceita nome válido (trim); rejeita vazio e nome absurdamente longo', () => {
  const r = renameConnectionSchema.safeParse({ name: '  Produção  ' })
  assert.equal(r.success, true)
  assert.equal(r.data.name, 'Produção')

  assert.equal(renameConnectionSchema.safeParse({ name: '' }).success, false)
  assert.equal(renameConnectionSchema.safeParse({ name: '   ' }).success, false, 'só espaços deve ser rejeitado após trim')
  assert.equal(renameConnectionSchema.safeParse({ name: 'x'.repeat(101) }).success, false)
  assert.equal(renameConnectionSchema.safeParse({ name: 'x'.repeat(100) }).success, true)
})

test('parseDqlTokenList: "a,b,c" -> 3 itens válidos, espaço é cortado', () => {
  const r = parseDqlTokenList('web, checkout , payments', 'serviço')
  assert.equal(r.success, true)
  assert.deepEqual(r.data, ['web', 'checkout', 'payments'])
})

test('parseDqlTokenList: vazio/ausente é rejeitado com mensagem clara', () => {
  assert.equal(parseDqlTokenList('', 'serviço').success, false)
  assert.equal(parseDqlTokenList(null, 'serviço').success, false)
  assert.match(parseDqlTokenList(null, 'serviço').error.issues[0].message, /Informe ao menos um serviço/)
})

test('parseDqlTokenList: um item inválido reprova a lista inteira, apontando qual item', () => {
  const r = parseDqlTokenList('web,ok{*},payments', 'serviço')
  assert.equal(r.success, false)
  assert.match(r.error.issues[0].message, /ok\{\*\}/)
})

test('planSchema: aceita array de itens com payload.name/type/query; rejeita vazio', () => {
  const validItem = { kind: 'cpu', payload: { name: 'x', type: 'query alert', query: 'avg:system.cpu.idle{*} > 1' } }
  assert.equal(planSchema.safeParse([validItem]).success, true)
  assert.equal(planSchema.safeParse([]).success, false, 'plano vazio deve ser rejeitado')
})

test('planSchema: rejeita item sem payload.query (contrato mínimo que createPlanIdempotent/ddPost exigem)', () => {
  const bad = { kind: 'cpu', payload: { name: 'x', type: 'query alert' } }
  assert.equal(planSchema.safeParse([bad]).success, false)
})

test('planSchema: campos extras no item e no payload são preservados (passthrough) — plano carrega metadado próprio (kind/service/operation)', () => {
  const item = { kind: 'cpu', service: 'web', operation: 'http.request', payload: { name: 'x', type: 'query alert', query: 'q', tags: ['a'] } }
  const r = planSchema.safeParse([item])
  assert.equal(r.success, true)
  assert.equal(r.data[0].kind, 'cpu')
  assert.deepEqual(r.data[0].payload.tags, ['a'])
})

test('discoveryBodySchema: objeto vazio recebe defaults (selected:{}) — planPreview/planInfraPreview já toleram isso e devolvem plano vazio', () => {
  const r = discoveryBodySchema.safeParse({})
  assert.equal(r.success, true)
  assert.deepEqual(r.data.selected, {})
})

test('discoveryBodySchema: aceita o formato real de initialDiscovery() (selected, alerts, tags, notifyTarget etc. via passthrough)', () => {
  const discovery = {
    selected: { web: { opsCount: 1, operations: ['http.request'], chosen: ['http.request'] } },
    env: 'prod', scopeType: 'service', groupBy: ['service'], tags: ['team:x'],
    notifyTarget: '@slack-x', notifyNoData: true, renotifyInterval: 30,
    alerts: { latency: { enabled: true } },
  }
  const r = discoveryBodySchema.safeParse(discovery)
  assert.equal(r.success, true)
  assert.equal(r.data.selected.web.opsCount, 1)
  assert.equal(r.data.alerts.latency.enabled, true)
})

test('discoveryBodySchema: scopeType fora de service/namespace é rejeitado', () => {
  assert.equal(discoveryBodySchema.safeParse({ scopeType: 'invalido' }).success, false)
})

test('bulkRenameApplySchema: rejeita lista vazia e nome vazio; aceita lista válida', () => {
  assert.equal(bulkRenameApplySchema.safeParse({ renames: [] }).success, false)
  assert.equal(bulkRenameApplySchema.safeParse({ renames: [{ id: 1, name: '' }] }).success, false)
  const r = bulkRenameApplySchema.safeParse({ renames: [{ id: 1, name: 'novo nome' }, { id: 'abc', name: 'outro' }] })
  assert.equal(r.success, true)
  assert.equal(r.data.renames.length, 2)
})

test('bulkRenameApplySchema: rejeita lote acima do limite (500)', () => {
  const renames = Array.from({ length: 501 }, (_, i) => ({ id: i, name: `monitor ${i}` }))
  assert.equal(bulkRenameApplySchema.safeParse({ renames }).success, false)
})
