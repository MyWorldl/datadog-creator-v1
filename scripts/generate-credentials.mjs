// scripts/generate-credentials.mjs
//
// Gera valores para o .env.local:
//   - AUTH_SECRET (segredo aleatório para assinar a sessão)
//   - hash bcrypt da senha
//   - (se você passar e-mail/nome) uma entrada pronta para AUTH_USERS
//
// Uso:
//   npm run gen:credentials                              -> só AUTH_SECRET
//   npm run gen:credentials -- "minha-senha"             -> AUTH_SECRET + hash
//   npm run gen:credentials -- "minha-senha" a@x.com Ana -> + entrada AUTH_USERS

import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'

const [, , password, email, name] = process.argv

const secret = crypto.randomBytes(32).toString('base64')
console.log('\nAUTH_SECRET=' + secret)

if (password) {
  const hash = bcrypt.hashSync(password, 12)
  console.log('AUTH_LOGIN_PASSWORD_HASH=' + hash)

  if (email) {
    const entry = { email, name: name || email.split('@')[0], passwordHash: hash }
    console.log('\n# Entrada para AUTH_USERS (múltiplos usuários):')
    console.log(JSON.stringify(entry))
    console.log('\n# Exemplo com vários:')
    console.log('AUTH_USERS=' + JSON.stringify([entry]))
  }
  console.log('\n(senha usada: "' + password + '" — o hash não é reversível)')
} else {
  console.log('\nDica: passe uma senha (e opcionalmente e-mail e nome):')
  console.log('  npm run gen:credentials -- "MinhaSenha123" voce@empresa.com "Seu Nome"')
}
console.log('')
