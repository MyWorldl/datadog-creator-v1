// scripts/generate-credentials.mjs
//
// Gera os valores para o .env.local:
//   - AUTH_SECRET (segredo aleatório para assinar a sessão)
//   - AUTH_LOGIN_PASSWORD_HASH (hash bcrypt da senha escolhida)
//
// Uso:
//   npm run gen:credentials -- "minha-senha-forte"
//   npm run gen:credentials            (gera só o AUTH_SECRET)

import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'

const password = process.argv[2]

const secret = crypto.randomBytes(32).toString('base64')
console.log('\nAUTH_SECRET=' + secret)

if (password) {
  const hash = bcrypt.hashSync(password, 12)
  console.log('AUTH_LOGIN_PASSWORD_HASH=' + hash)
  console.log('\n(senha usada: "' + password + '" — guarde-a; o hash não é reversível)')
} else {
  console.log('\nDica: passe uma senha para gerar o hash, ex.:')
  console.log('  npm run gen:credentials -- "MinhaSenhaForte123"')
}
console.log('')
