// tests/naming-convention.test.js — runner nativo do Node (node --test), sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectNamingConvention, DEFAULT_NAME_PREFIX } from '../src/lib/naming-convention.ts'

const M = (name, tags = []) => ({ name, tags })

test('prefixo mais comum entre monitores RELACIONADOS às entidades (nome no título)', () => {
  const monitors = [
    M('[Kafka] RioSP - DLQ checkout'),
    M('[Kafka] Sorocabana - DLQ checkout'),
    M('[Postgres] RDS | Disponibilidade'),
    M('[Postgres] RDS | Deadlocks'),
    M('[Postgres] RDS | CPU'),
  ]
  const s = detectNamingConvention(monitors, ['checkout'])
  assert.equal(s.prefix, '[Kafka]')
  assert.equal(s.source, 'related')
  assert.equal(s.matched, 2)
  assert.equal(s.total, 2)
})

test('relacionado também por tag service:/host:/kube_namespace:', () => {
  const monitors = [
    M('[Infra] CPU alta', ['host:web-1']),
    M('[Infra] Memória', ['host:web-1']),
    M('[Outro] x', ['host:db-9']),
  ]
  const s = detectNamingConvention(monitors, ['web-1'])
  assert.equal(s.prefix, '[Infra]')
  assert.equal(s.source, 'related')
})

test('sem monitor relacionado: cai pro prefixo mais comum do org (>=3 e >=25%)', () => {
  const monitors = [M('[Postgres] a'), M('[Postgres] b'), M('[Postgres] c'), M('[Kafka] d')]
  const s = detectNamingConvention(monitors, ['inexistente'])
  assert.equal(s.prefix, '[Postgres]')
  assert.equal(s.source, 'org')
  assert.equal(s.matched, 3)
  assert.equal(s.total, 4)
})

test('org-wide: prefixo isolado (<3 monitores) ou diluído (<25%) NÃO vira sugestão', () => {
  assert.equal(detectNamingConvention([M('[A] x'), M('[A] y'), M('sem colchete')], []), null)
  const diluted = [M('[A] 1'), M('[A] 2'), M('[A] 3'), ...Array.from({ length: 20 }, (_, i) => M(`[B${i}] x`))]
  assert.equal(detectNamingConvention(diluted, []), null)
})

test('o próprio [MonitorsCreator] não conta como convenção detectada', () => {
  const monitors = Array.from({ length: 10 }, (_, i) => M(`${DEFAULT_NAME_PREFIX} svc${i} · Latência`))
  assert.equal(detectNamingConvention(monitors, []), null)
})

test('monitores sem colchete / nome inválido são ignorados; lista vazia/undefined não quebra', () => {
  assert.equal(detectNamingConvention([M('Sem prefixo'), { name: 123 }, {}], ['x']), null)
  assert.equal(detectNamingConvention([], []), null)
  assert.equal(detectNamingConvention(undefined, undefined), null)
})

test('empate: desempata em ordem alfabética (resultado determinístico)', () => {
  const monitors = [M('[Zeta] checkout a'), M('[Alfa] checkout b')]
  assert.equal(detectNamingConvention(monitors, ['checkout']).prefix, '[Alfa]')
})

test('dicas muito curtas (<3 chars) são ignoradas — "a" casaria com tudo', () => {
  const monitors = [M('[Kafka] a'), M('[Kafka] b'), M('[Kafka] c')]
  const s = detectNamingConvention(monitors, ['a'])
  assert.equal(s.source, 'org') // não usou "a" como hint relacionado
})

test('case-insensitive nos hints, preserva o prefixo como está escrito no monitor', () => {
  const s = detectNamingConvention([M('[KaFkA] Checkout-API lag')], ['CHECKOUT-api'])
  assert.equal(s.prefix, '[KaFkA]')
})
