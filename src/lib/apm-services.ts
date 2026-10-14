// src/lib/apm-services.ts
//
// Interpreta a resposta de GET /api/v2/apm/services. Além da lista de nomes
// (attributes.services), a resposta traz attributes.metadata (mesma ordem/
// tamanho) com { isTraced?, isUsm? } por serviço. Um serviço pode ser:
//  - traced: tem APM (traces) => existem métricas trace.*.hits/errors/duration;
//  - USM-only: detectado só pelo Universal Service Monitoring (eBPF) => NÃO tem
//    métricas trace.* — monitores de APM (latência/erro/volume) criados nele
//    nascem sem dados. Verificado contra um org real: 6/6 traced tinham
//    operations trace.*.hits, 0/6 USM-only tinham (e ~48% dos serviços do org
//    eram USM-only — o app contava todos como "serviços APM").
//
// Sem metadata utilizável (formato antigo / tamanhos que não batem), todos os
// serviços são tratados como traced — o comportamento de antes.

export interface ApmServicesParsed {
  all: string[]      // todos os serviços (únicos, ordenados)
  traced: string[]   // com APM de verdade (base de cobertura/sugestão de APM)
  usmOnly: string[]  // só USM, sem traces
}

interface ServiceMeta { isTraced?: boolean; isUsm?: boolean }

export function parseApmServices(json: unknown): ApmServicesParsed {
  const data = (json as { data?: unknown } | null | undefined)?.data
  const flagged = new Map<string, boolean>() // nome -> traced?

  const mark = (name: unknown, traced: boolean) => {
    if (typeof name !== 'string' || !name) return
    // traced vence se o mesmo nome aparecer duas vezes
    flagged.set(name, (flagged.get(name) ?? false) || traced)
  }

  if (Array.isArray(data)) {
    // Formato antigo/defensivo: lista de { id, attributes: { services } } — sem metadata.
    for (const d of data as { id?: unknown; attributes?: { services?: unknown } }[]) {
      const svcs = d?.attributes?.services
      if (Array.isArray(svcs)) svcs.forEach(n => mark(n, true))
      else mark(d?.id, true)
    }
  } else {
    const attrs = (data as { attributes?: { services?: unknown; metadata?: unknown } } | undefined)?.attributes
    const services = Array.isArray(attrs?.services) ? (attrs!.services as unknown[]) : []
    const metadata = Array.isArray(attrs?.metadata) ? (attrs!.metadata as ServiceMeta[]) : null
    const aligned = !!metadata && metadata.length === services.length
    services.forEach((name, i) => {
      const m = aligned ? metadata![i] : undefined
      // USM-only = sem isTraced mas com isUsm. Qualquer outro caso (inclusive
      // flags ausentes) conta como traced, pra não esconder serviço por engano.
      const usmOnly = !!m && m.isTraced !== true && m.isUsm === true
      mark(name, !usmOnly)
    })
  }

  const all = [...flagged.keys()].sort()
  return {
    all,
    traced: all.filter(n => flagged.get(n)),
    usmOnly: all.filter(n => !flagged.get(n)),
  }
}
