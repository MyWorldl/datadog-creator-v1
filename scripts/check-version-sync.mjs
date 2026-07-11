// scripts/check-version-sync.mjs
//
// Rede de segurança pro CI: falha o build se package.json.version e
// VERSION_HISTORY[0].version (src/lib/app-version.js) estiverem
// dessincronizados — já aconteceu duas vezes antes (v1.7.1 e v1.17.1) por
// edição manual em momentos diferentes. Use scripts/bump-version.mjs pra
// evitar cair nisso de novo.
//
// Uso: node scripts/check-version-sync.mjs

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const { VERSION_HISTORY } = await import(pathToFileURL(path.join(root, 'src', 'lib', 'app-version.js')))

const latest = VERSION_HISTORY[0]?.version

if (pkg.version !== latest) {
  console.error(
    `Versão dessincronizada: package.json="${pkg.version}" vs VERSION_HISTORY[0]="${latest}".\n` +
    'Rode scripts/bump-version.mjs (ou corrija manualmente os dois pra baterem) antes de commitar.'
  )
  process.exit(1)
}

console.log(`OK: package.json e VERSION_HISTORY[0] batem (${pkg.version}).`)
