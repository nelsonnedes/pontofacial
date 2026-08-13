'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';

// ✅ LAZY LOADING PARA EVITAR TDZ - SEGUINDO PADRÃO EXATO
const InitialFaceVerification = dynamic(
  () => import('@/components/face-verification/InitialFaceVerification'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando verificação facial...</p>
        </div>
      </div>
    )
  }
);

// ✅ SEGUINDO PADRÃO EXATO DO MARCAR PONTO
export default function VerificarFacePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    }>
      <InitialFaceVerification />
    </Suspense>
  );
}
