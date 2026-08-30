'use client'

import dynamic from 'next/dynamic'

// Renderizar RegisterSW apenas no cliente para evitar hydration mismatch
const RegisterSW = dynamic(() => import('../app/register-sw'), {
  ssr: false,
  loading: () => null
})

export default function ClientRegisterSW() {
  return <RegisterSW />
}