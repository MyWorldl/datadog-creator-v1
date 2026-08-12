// tests/bulk-rename.test.js — node --test, sem deps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeRenames } from '../src/lib/bulk-rename.ts'

test('computeRenames: só inclui monitores cujo nome contém o texto buscado', () => {
  const monitors = [
    { id: 1, name: '[MonitorsCreator] web · CPU' },
    { id: 2, name: '[FinOps] Consumo anômalo · logs' },
    { id: 3, name: '[MonitorsCreator] db · Memória' },
  ]
  const out = computeRenames(monitors, '[MonitorsCreator]', '[Monitors]')
  assert.equal(out.length, 2)
  assert.deepEqual(out.map(m => m.id), [1, 3])
})

test('computeRenames: aplica substituição literal, não regex (caracteres especiais não são interpretados)', () => {
  const monitors = [{ id: 1, name: 'host.cpu.usage > 90%' }]
  const out = computeRenames(monitors, '.', '_')
  // Se fosse regex, "." casaria QUALQUER caractere — aqui deve trocar só os "." literais.
  assert.equal(out[0].newName, 'host_cpu_usage > 90%')
})

test('computeRenames: replace vazio remove o trecho buscado', () => {
  const monitors = [{ id: 1, name: '[MonitorsCreator] web · CPU' }]
  const out = computeRenames(monitors, '[MonitorsCreator] ', '')
  assert.equal(out[0].newName, 'web · CPU')
})

test('computeRenames: troca TODAS as ocorrências no nome, não só a primeira', () => {
  const monitors = [{ id: 1, name: 'a-b-a-b' }]
  const out = computeRenames(monitors, 'a', 'x')
  assert.equal(out[0].newName, 'x-b-x-b')
})

test('computeRenames: search vazio nunca "casa" tudo (proteção contra renomear a org inteira)', () => {
  const monitors = [{ id: 1, name: 'qualquer coisa' }, { id: 2, name: 'outra coisa' }]
  assert.deepEqual(computeRenames(monitors, '', 'x'), [])
})

test('computeRenames: monitor sem nome (name ausente/não-string) é ignorado sem quebrar', () => {
  const monitors = [{ id: 1 }, { id: 2, name: 'tem [X] no nome' }]
  const out = computeRenames(monitors, '[X]', '[Y]')
  assert.equal(out.length, 1)
  assert.equal(out[0].id, 2)
})

test('computeRenames: quando o nome resultante é IGUAL ao original (replace === search), não entra no resultado', () => {
  const monitors = [{ id: 1, name: 'web · CPU' }]
  const out = computeRenames(monitors, 'CPU', 'CPU')
  assert.deepEqual(out, [])
})

test('computeRenames: mantém oldName original e retorna newName calculado', () => {
  const monitors = [{ id: 'abc', name: '@equipe-antiga alerta' }]
  const out = computeRenames(monitors, '@equipe-antiga', '@equipe-nova')
  assert.deepEqual(out, [{ id: 'abc', oldName: '@equipe-antiga alerta', newName: '@equipe-nova alerta' }])
})
