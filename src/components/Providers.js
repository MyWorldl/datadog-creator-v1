// src/components/Providers.js
'use client'

// Junta os contexts que precisam rodar no client:
//  - SessionProvider: dá acesso ao useSession() (estado de login do Auth.js)
//  - AppProvider: tema, site e flags da nossa app
//
// O layout (server component) não pode usar esses providers direto, então
// concentramos tudo aqui.

import { SessionProvider } from 'next-auth/react'
import { AppProvider } from '@/context/AppContext'

export default function Providers({ children }) {
  return (
    <SessionProvider>
      <AppProvider>{children}</AppProvider>
    </SessionProvider>
  )
}
