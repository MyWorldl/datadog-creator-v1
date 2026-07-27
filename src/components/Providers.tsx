// src/components/Providers.tsx
'use client'

// Junta os contexts que precisam rodar no client:
//  - SupabaseAuthProvider: dá acesso ao useSession() (estado de login do Supabase Auth)
//  - AppProvider: tema, site e flags da nossa app
//
// O layout (server component) não pode usar esses providers direto, então
// concentramos tudo aqui.

import type { ReactNode } from 'react'
import { SupabaseAuthProvider } from '@/context/SupabaseAuthContext'
import { AppProvider } from '@/context/AppContext'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SupabaseAuthProvider>
      <AppProvider>{children}</AppProvider>
    </SupabaseAuthProvider>
  )
}
