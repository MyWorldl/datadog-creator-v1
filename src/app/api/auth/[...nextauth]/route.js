// src/app/api/auth/[...nextauth]/route.js
//
// Expõe os endpoints internos do Auth.js (login, logout, callbacks, CSRF...).
// Tudo que o NextAuth precisa no servidor passa por aqui.

import { handlers } from '@/auth'

export const { GET, POST } = handlers
