// src/auth.js
//
// Configuração principal do Auth.js (NextAuth v5) — login por USUÁRIO + senha,
// com verificação por hash bcrypt. Exporta handlers, auth, signIn, signOut.
//
// MODELO DE USUÁRIO (sem banco de dados):
//   AUTH_USERS  -> lista JSON de usuários (múltiplos):
//       [{"username":"gabriel","name":"Gabriel","passwordHash":"$2b$12$..."}]
//   (fallback) usuário único:
//       AUTH_LOGIN_USER, AUTH_LOGIN_NAME, AUTH_LOGIN_PASSWORD_HASH
//
// Para trocar por um banco depois, substitua o bloco ">>> PLUGUE O BANCO AQUI".

import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { authConfig } from './auth.config'

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,

  providers: [
    Credentials({
      // Campos do formulário de login (agora usuário + senha).
      credentials: {
        username: { label: 'Usuário', type: 'text' },
        password: { label: 'Senha', type: 'password' },
      },

      async authorize(credentials) {
        const username = String(credentials?.username || '').trim().toLowerCase()
        const password = String(credentials?.password || '')
        if (!username || !password) return null

        // >>> PLUGUE O BANCO AQUI <<<
        let user = null

        const usersRaw = process.env.AUTH_USERS
        if (usersRaw) {
          let list = []
          try { list = JSON.parse(usersRaw) }
          catch { console.error('[auth] AUTH_USERS não é um JSON válido.') }
          const found = Array.isArray(list)
            ? list.find(u => String(u?.username || '').trim().toLowerCase() === username)
            : null
          if (found?.passwordHash) {
            user = { username, name: found.name || username, hash: found.passwordHash }
          }
        }

        if (!user) {
          // Fallback: usuário único por variáveis separadas.
          const expectedUser = (process.env.AUTH_LOGIN_USER || '').trim().toLowerCase()
          const passwordHash = process.env.AUTH_LOGIN_PASSWORD_HASH || ''
          if (expectedUser && passwordHash && username === expectedUser) {
            user = { username: expectedUser, name: process.env.AUTH_LOGIN_NAME || expectedUser, hash: passwordHash }
          }
        }

        if (!user) {
          if (!usersRaw && !process.env.AUTH_LOGIN_USER) {
            console.error('[auth] Nenhum usuário configurado (AUTH_USERS ou AUTH_LOGIN_USER).')
          }
          return null
        }

        // bcrypt confere a senha contra o hash (o salt está embutido no hash).
        const ok = await bcrypt.compare(password, user.hash)
        if (!ok) return null

        return { id: user.username, name: user.name }
      },
    }),
  ],

  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    async session({ session, token }) {
      if (token?.id && session.user) session.user.id = token.id
      return session
    },
  },
})
