#!/usr/bin/env node
// scripts/validate-monitors.mjs
//
// Valida CONTRA O DATADOG REAL (POST /api/v1/monitor/validate — não cria nada)
// todos os tipos de monitor que o app sabe gerar: APM (anomalia), K8s (Pod
// Restarts/Pending), Infra (threshold/anomaly), DBM (Postgres/MySQL), Log
// Monitor (agregações, agrupamento, operadores). Pega, antes do usuário, o
// tipo de bug que só aparece na criação em lote (ex.: warning == critical,
// query inválida). Rode depois de mexer em discovery.ts / infra.ts /
// log-monitors.ts ou ao atualizar o Datadog.
//
// Credenciais: .env.datadog.local (gitignorado) com DD_API_KEY/DD_APP_KEY/DD_SITE.
//   node scripts/validate-monitors.mjs        (ou: npm run validate:monitors)
// Sai com código 1 se algum payload for recusado.
//
// Fora de propósito: modo "outlier" de tipos flagged (k8sNodeReady) — a UI
// não expõe essa combinação.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ddGet, ddPost } from '../src/lib/datadog-server.ts'
import { initialDiscovery, planPreview } from '../src/lib/discovery.ts'
import { initialInfraDiscovery, planInfraPreview, INFRA_TYPES } from '../src/lib/infra.ts'
import { buildLogMonitorPayload } from '../src/lib/log-monitors.ts'
import { initialSloMonitors, planSloPreview } from '../src/lib/slo-monitors.ts'

const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env.datadog.local')
if (!existsSync(envPath)) { console.error(`Arquivo não encontrado: ${envPath}\nCrie com DD_API_KEY / DD_APP_KEY / DD_SITE.`); process.exit(1) }
const env = {}
for (const l of readFileSync(envPath, 'utf8').split('\n')) { const t = l.trim(); if (!t || t.startsWith('#')) continue; const i = t.indexOf('='); if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim() }
if (!env.DD_API_KEY || !env.DD_APP_KEY) { console.error('DD_API_KEY/DD_APP_KEY vazios em .env.datadog.local'); process.exit(1) }
const ctx = { apiKey: env.DD_API_KEY, appKey: env.DD_APP_KEY, site: env.DD_SITE || 'datadoghq.com' }

const items = [] // [grupo, rótulo, payload]
const add = (group, plan) => plan.forEach(p => items.push([group, p.kind, p.payload]))

// APM + Pod Restarts/Pending
{
  const d = initialDiscovery(); d.env = 'prod'
  d.selected = { checkout: { operations: ['http.request'], chosen: ['http.request'] } }
  for (const k of Object.keys(d.alerts)) d.alerts[k].enabled = true
  d.podPending.enabled = true
  add('APM', planPreview(d))
  const n = initialDiscovery(); n.scopeType = 'namespace'
  n.selected = { payments: { operations: [], chosen: ['http.request'] } }
  for (const k of Object.keys(n.alerts)) n.alerts[k].enabled = false
  n.podRestarts.enabled = true
  add('K8S', planPreview(n))
}
// Infra: threshold e anomaly (todos os tipos); outlier só nos tipos sem flag
for (const mode of ['threshold', 'anomaly', 'outlier']) {
  const d = initialInfraDiscovery()
  d.hosts = [{ name: 'web-1', up: true, tags: [], sources: ['agent'] }, { name: 'web-2', up: true, tags: [], sources: ['agent'] }]
  d.selected = { 'web-1': true, 'web-2': true }
  for (const t of INFRA_TYPES) {
    const c = d.metrics[t.key]
    c.enabled = mode !== 'outlier' || (c.mode !== 'check' && !t.flag)
    if (c.mode !== 'check') { c.mode = mode; if (mode === 'outlier') { c.algorithm = 'DBSCAN'; c.tolerance = 3 } }
  }
  add(`INFRA/${mode}`, planInfraPreview(d))
}
// DBM por engine
for (const engine of ['postgres', 'mysql']) {
  const d = initialInfraDiscovery()
  d.hosts = [{ name: 'db-1.x.rds.amazonaws.com', up: true, tags: ['dbinstanceidentifier:db-1'], sources: ['aws'] }]
  d.selected = { 'db-1.x.rds.amazonaws.com': true }
  for (const t of INFRA_TYPES) { d.metrics[t.key].enabled = !!t.requiresEngine; if (t.requiresEngine) d.metrics[t.key].dbEngine = engine }
  add(`DBM/${engine}`, planInfraPreview(d))
}
// Log Monitor
const logBase = { label: 'Teste', queryFilter: 'service:api status:error', window: '15m', threshold: 100 }
for (const [label, extra] of [
  ['count', {}],
  ['avg >=', { rollup: 'avg', measure: 'duration', operator: '>=', threshold: 250 }],
  ['pc99 + by 2', { rollup: 'pc99', measure: '@duration', groupBy: ['service', '@http.status_code'], threshold: 2000 }],
  ['cardinality + by 4', { rollup: 'cardinality', measure: '@usr.id', groupBy: ['service', 'host', 'env', '@x'], threshold: 50 }],
  ['< com warning', { operator: '<', threshold: 10, warningThreshold: 20 }],
  ['> com warning', { threshold: 100, warningThreshold: 50 }],
]) items.push(['LOG', label, buildLogMonitorPayload({ ...logBase, ...extra })])

// SLO Alert — usa SLOs REAIS do org (o validador recusa slo_id inexistente).
// Sem SLO cadastrado, esse grupo é pulado (e avisado).
{
  const r = await ddGet(ctx, '/api/v1/slo?limit=50')
  const slos = (r.ok && Array.isArray(r.json?.data) ? r.json.data : []).filter(s => s.id && s.name)
    .slice(0, 3).map(s => ({ id: s.id, name: s.name, type: s.type || '', timeframe: s.thresholds?.[0]?.timeframe || '7d', target: s.thresholds?.[0]?.target ?? null }))
  if (slos.length === 0) console.warn('AVISO: nenhum SLO no org — grupo SLO pulado.')
  else {
    const st = initialSloMonitors()
    st.slos = slos
    st.selected = Object.fromEntries(slos.map(s => [s.id, true]))
    for (const k of Object.keys(st.alerts)) st.alerts[k].enabled = true
    st.notifyTarget = '@equipe-teste'
    st.tags = ['team:teste']
    add('SLO', planSloPreview(st))
  }
}

let ok = 0, bad = 0
for (const [group, label, payload] of items) {
  const r = await ddPost(ctx, '/api/v1/monitor/validate', payload)
  if (r.ok) ok++
  else { bad++; console.error(`ERRO ${group}/${label} (${payload.type}): ${JSON.stringify(r.json?.errors || r.detail || r.error).slice(0, 300)}\n   query: ${String(payload.query).slice(0, 220)}`) }
  await new Promise(res => setTimeout(res, 250)) // educado com o rate limit
}
console.log(`\nValidados: ${items.length} | ok: ${ok} | recusados: ${bad}`)
process.exit(bad ? 1 : 0)
