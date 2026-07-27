// src/app/page.tsx
// A raiz agora leva ao Dashboard (porta de entrada da aplicação).
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/ferramentas/dashboard')
}
