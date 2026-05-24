'use client';

import dynamic from 'next/dynamic';

// Novo sistema otimizado de marcar ponto
const SelectTypeScreen = dynamic(() => import('@/components/marcar-ponto/SelectTypeScreen'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Carregando...</p>
      </div>
    </div>
  )
});

// O sistema antigo foi permanentemente removido para garantir 100% de segurança e evitar conflitos.

export default function MarcarPonto() {
  return <SelectTypeScreen />;
}