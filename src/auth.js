// src/auth.js
//
// Configuração principal do Auth.js (NextAuth v5).
// Aqui mora o provider Credentials (usuário + senha) com verificação por
// hash bcrypt. Exporta as funções que o app inteiro usa:
//   - handlers : rotas GET/POST de /api/auth/[...nextauth]
//   - auth     : lê a sessão no servidor (rotas, server components)
//   - signIn   : login programático
//   - signOut  : logout
//
// MODELO DE USUÁRIO (sem banco de dados):
// Para uma ferramenta de SE não vale a pena subir um Postgres só pro login,
// então usamos UM usuário definido por variáveis de ambiente:
//   AUTH_LOGIN_EMAIL          -> e-mail/usuário de login
//   AUTH_LOGIN_PASSWORD_HASH  -> hash bcrypt da senha (NUNCA a senha pura)
//   AUTH_LOGIN_NAME           -> (opcional) nome exibido
//
// Quando precisar de múltiplos usuários, troque o bloco "authorize" por uma
// consulta a um banco (Prisma, Drizzle, etc.) — o resto continua igual.
// Veja o ponto marcado com ">>> PLUGUE O BANCO AQUI".

import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { authConfig } from './auth.config'

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,

  providers: [
    Credentials({
      // Campos do formulário (usados pela tela de login)
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },

      // Coração da autenticação: recebe o que o usuário digitou e decide
      // se é válido. Retornar um objeto = autenticado; retornar null = recusado.
      async authorize(credentials) {
        const email = String(credentials?.email || '').trim().toLowerCase()
        const password = String(credentials?.password || '')

        if (!email || !password) return null

        // >>> PLUGUE O BANCO AQUI <<<
        // Hoje: comparamos com o único usuário vindo do ambiente.
        const expectedEmail = (process.env.AUTH_LOGIN_EMAIL || '').trim().toLowerCase()
        const passwordHash = process.env.AUTH_LOGIN_PASSWORD_HASH || ''

        if (!expectedEmail || !passwordHash) {
          // Sem variáveis configuradas: falha "fechada" (nega o acesso).
          console.error(
            '[auth] AUTH_LOGIN_EMAIL ou AUTH_LOGIN_PASSWORD_HASH não definidos no .env.local'
          )
          return null
        }

        if (email !== expectedEmail) return null

        // Compara a senha digitada com o hash. bcrypt já lida com o "salt"
        // embutido no hash — pensa nele como um cofre que confere a digital
        // sem nunca guardar a digital original.
        const ok = await bcrypt.compare(password, passwordHash)
        if (!ok) return null

        // Objeto do usuário que vira a sessão.
        return {
          id: '1',
          email: expectedEmail,
          name: process.env.AUTH_LOGIN_NAME || expectedEmail.split('@')[0],
        }
      },
    }),
  ],

  callbacks: {
    ...authConfig.callbacks,

    // Coloca o id do usuário no token JWT...
    async jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    // ...e expõe na sessão lida pelo client (useSession).
    async session({ session, token }) {
      if (token?.id && session.user) session.user.id = token.id
      return session
    },
  },
})
