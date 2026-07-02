// scripts/generate-credentials.mjs
// Gera AUTH_SECRET e o hash bcrypt, mostrando as DUAS formas do $:
//   • LOCAL (.env.local): $ escapado (\$)   • VERCEL (painel): $ cru
//
// Uso:
//   npm run gen:credentials
//   npm run gen:credentials -- "MinhaSenha" usuario "Nome"

import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'

const [, , password, username, name] = process.argv
const esc = (h) => h.replace(/\$/g, '\\$')

console.log('\n# AUTH_SECRET (igual em local e Vercel)')
console.log('AUTH_SECRET=' + crypto.randomBytes(32).toString('base64'))

if (password) {
  const hash = bcrypt.hashSync(password, 12)
  console.log('\n# Hash bcrypt:')
  console.log('#   LOCAL (.env.local): ' + esc(hash))
  console.log('#   VERCEL (painel):    ' + hash)

  if (username) {
    const entry = { username, name: name || username, passwordHash: hash }
    const json = JSON.stringify([entry])
    console.log('\n# AUTH_USERS')
    console.log('#   LOCAL (.env.local):')
    console.log('AUTH_USERS=' + esc(json))
    console.log('#   VERCEL (painel):')
    console.log('AUTH_USERS=' + json)
    console.log('\n# Vários usuários: junte as entradas dentro de [ ... ] separadas por vírgula.')
  }
  console.log('\n(senha usada: "' + password + '" — o hash não é reversível)')
} else {
  console.log('\nDica: npm run gen:credentials -- "MinhaSenha123" seu.usuario "Seu Nome"')
}
console.log('')
