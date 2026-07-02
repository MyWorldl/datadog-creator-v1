// src/app/api/datadog/finops/route.js
//
// Volume de consumo por produto (licenciamento), via Usage Metering API:
//   GET /api/v1/usage/summary?start_month=YYYY-MM&end_month=YYYY-MM
// https://docs.datadoghq.com/api/latest/usage-metering/
//
// Requer o escopo usage_read na App key e uma parent-org. Se faltar,
// retorna erro claro em vez de quebrar. O custo é calculado no cliente
// (preços editáveis), pois preço de lista ≠ preço contratado.

import { auth } from '@/auth'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom, ddGet } from '@/lib/datadog-server'
import { PRODUCTS } from '@/lib/finops-pricing'

function monthStr(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function GET(request) {
  const session = await auth()
  if (!session?.user) return Response.json({ error: 'Não autenticado.' }, { status: 401 })

  const { apiKey, appKey, site } = await readSessionKeys()
  if (!apiKey || !appKey || !site) {
    return Response.json({ error: 'Sessão sem credenciais do Datadog. Conecte-se primeiro.' }, { status: 412 })
  }
  const ctx = ctxFrom({ apiKey, appKey, site })

  // Mês corrente por padrão (aceita ?month=YYYY-MM).
  const url = new URL(request.url)
  const month = url.searchParams.get('month') || monthStr(new Date())

  const res = await ddGet(ctx, `/api/v1/usage/summary?start_month=${month}&end_month=${month}`)
  if (!res.ok) {
    const hint = res.status === 403
      ? 'Sem permissão: a App key precisa do escopo usage_read e a org precisa ser a parent-org.'
      : `Falha ao consultar Usage Metering (${res.status || res.error}).`
    return Response.json({ error: hint }, { status: 502 })
  }

  const summary = res.json || {}
  // Campos agregados ficam no topo do objeto (ex.: apm_host_top99p_sum).
  const pick = (fields) => {
    for (const f of fields) {
      const v = summary[f]
      if (typeof v === 'number') return { value: v, field: f }
    }
    return null
  }

  const products = []
  const missing = []
  for (const p of PRODUCTS) {
    const found = pick(p.fields)
    if (found) {
      products.push({
        key: p.key, label: p.label, unit: p.unit, price: p.price, per: p.per, bytes: p.bytes,
        estMetric: p.estMetric, value: found.value, field: found.field,
      })
    } else {
      missing.push(p.key)
    }
  }

  return Response.json({
    site,
    month,
    startDate: summary.start_date || null,
    endDate: summary.end_date || null,
    products,
    missing,
    generatedAt: new Date().toISOString(),
  })
}
