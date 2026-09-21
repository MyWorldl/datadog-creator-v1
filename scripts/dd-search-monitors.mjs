#!/usr/bin/env node
// scripts/dd-search-monitors.mjs
//
// Consulta direta à API do Datadog (fora do app, uso pontual via terminal) —
// busca monitores por tag usando a mesma sintaxe da tela "Manage Monitors"
// (tag:<valor>) e imprime ID + nome de cada um.
//
// Lê as credenciais de .env.datadog.local (gitignorado, nunca commitado —
// ver padrão .env* em .gitignore). Preencha DD_API_KEY/DD_APP_KEY/DD_SITE
// nesse arquivo antes de rodar.
//
// Uso:
//   node scripts/dd-search-monitors.mjs GUILBERTH
//   node scripts/dd-search-monitors.mjs "tag:GUILBERTH"   (query DQL completa também funciona)

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.datadog.local')

function loadEnvFile(path) {
  if (!existsSync(path)) {
    console.error(`Arquivo não encontrado: ${path}`)
    console.error('Crie-o com DD_API_KEY / DD_APP_KEY / DD_SITE preenchidos antes de rodar este script.')
    process.exit(1)
  }
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return out
}

const env = loadEnvFile(envPath)
const apiKey = env.DD_API_KEY
const appKey = env.DD_APP_KEY
const site = env.DD_SITE || 'datadoghq.com'

if (!apiKey || !appKey) {
  console.error('DD_API_KEY e/ou DD_APP_KEY estão vazios em .env.datadog.local — preencha e rode de novo.')
  process.exit(1)
}

const rawArg = process.argv[2] || 'GUILBERTH'
// Se já vier com "tag:"/outro operador DQL, usa como está; senão assume tag simples.
const query = /[:><]/.test(rawArg) ? rawArg : `tag:${rawArg}`

async function searchMonitors(query) {
  const perPage = 100
  let page = 0
  const all = []
  for (;;) {
    const url = `https://api.${site}/api/v1/monitor/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}`
    const res = await fetch(url, {
      headers: {
        'DD-API-KEY': apiKey,
        'DD-APPLICATION-KEY': appKey,
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Datadog respondeu ${res.status}: ${body.slice(0, 500)}`)
    }
    const json = await res.json()
    const monitors = json.monitors || []
    all.push(...monitors)
    const totalCount = json.metadata?.total_count ?? all.length
    if (all.length >= totalCount || monitors.length === 0) break
    page++
  }
  return all
}

try {
  const monitors = await searchMonitors(query)
  if (monitors.length === 0) {
    console.log(`Nenhum monitor encontrado para "${query}".`)
    process.exit(0)
  }
  console.log(`${monitors.length} monitor(es) para "${query}" (site: ${site}):\n`)
  console.log('ID\tNome')
  for (const m of monitors.sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
    console.log(`${m.id}\t${m.name}`)
  }
} catch (e) {
  console.error('Falha ao consultar o Datadog:', e.message)
  process.exit(1)
}
