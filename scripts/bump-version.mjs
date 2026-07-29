// scripts/bump-version.mjs
//
// Atualiza package.json E insere a entrada correspondente no topo de
// VERSION_HISTORY (src/lib/app-version.ts) numa única execução — elimina a
// classe de bug já vista duas vezes no projeto (versões 1.7.1 e 1.17.1)
// onde os dois ficaram dessincronizados por terem sido editados à mão em
// momentos diferentes. O CI (scripts/check-version-sync.mjs) falha o build
// se alguém ainda assim esquecer de rodar isto.
//
// Uso:
//   node scripts/bump-version.mjs <versão> "<título>" "<nota 1>" ["<nota 2>" ...]
//
// Exemplo:
//   node scripts/bump-version.mjs 1.22.0 "FinOps: exportar CSV" \
//     "Botão de exportar consumo do mês em CSV na tela FinOps Insights." \
//     "Inclui as colunas de custo estimado por produto."

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const pkgPath = path.join(root, 'package.json')
const versionFilePath = path.join(root, 'src', 'lib', 'app-version.ts')

const [, , version, title, ...notes] = process.argv

if (!version || !title || notes.length === 0) {
  console.log(`
Uso: node scripts/bump-version.mjs <versão> "<título>" "<nota 1>" ["<nota 2>" ...]

Exemplo:
  node scripts/bump-version.mjs 1.22.0 "FinOps: exportar CSV" "Botão de exportar consumo do mês em CSV."
`)
  process.exit(1)
}

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`"${version}" não parece uma versão válida (esperado formato X.Y.Z).`)
  process.exit(1)
}

// 1) package.json — só troca o campo "version", preservando o resto do arquivo.
const pkgRaw = await readFile(pkgPath, 'utf8')
const pkg = JSON.parse(pkgRaw)

if (pkg.version === version) {
  console.error(`package.json já está em ${version} — nada a fazer (escolha uma versão nova).`)
  process.exit(1)
}

const newPkgRaw = pkgRaw.replace(
  /"version":\s*"[^"]*"/,
  `"version": "${version}"`
)
await writeFile(pkgPath, newPkgRaw)

// 2) src/lib/app-version.ts — insere a entrada nova logo após
//    "export const VERSION_HISTORY: VersionEntry[] = [", na mesma formatação
//    das existentes.
const versionFileRaw = await readFile(versionFilePath, 'utf8')
const marker = 'export const VERSION_HISTORY: VersionEntry[] = [\n'
const markerIndex = versionFileRaw.indexOf(marker)
if (markerIndex === -1) {
  console.error(`Não encontrei "${marker.trim()}" em ${versionFilePath} — verifique se o arquivo mudou de formato.`)
  process.exit(1)
}

const today = new Date().toISOString().slice(0, 10)
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

const entry =
`  {
    version: '${esc(version)}',
    date: '${today}',
    title: '${esc(title)}',
    notes: [
${notes.map(n => `      '${esc(n)}',`).join('\n')}
    ],
  },
`

const insertAt = markerIndex + marker.length
const newVersionFileRaw = versionFileRaw.slice(0, insertAt) + entry + versionFileRaw.slice(insertAt)
await writeFile(versionFilePath, newVersionFileRaw)

console.log(`✓ package.json atualizado para ${version}`)
console.log(`✓ Entrada adicionada no topo de VERSION_HISTORY (${versionFilePath.replace(root, '.')})`)
console.log('\nRevise o diff (git diff) e ajuste o texto das notas se quiser antes de commitar.')
