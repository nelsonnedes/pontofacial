'use client';

import dynamic from 'next/dynamic';
import { FaceAPIProvider } from '@/contexts/FaceAPIContext';
import type { ComponentType } from 'react';

/**
 * 🧪 PÁGINA DE TESTE: Diferenciação Facial
 * Acesso: /test-facial-differentiation
 */
const TestFacialDifferentiation: ComponentType | null =
  process.env.NODE_ENV === 'production'
    ? null
    : dynamic(() => import('@/components/test/TestFacialDifferentiation'), { ssr: false });

export default function TestFacialDifferentiationPage() {
  if (process.env.NODE_ENV === 'production') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">Teste indisponível em produção</h1>
          <p className="mt-2 text-sm text-gray-600">
            Esta rota é exclusiva para validação técnica em ambiente de desenvolvimento.
          </p>
        </div>
      </div>
    );
  }

  return (
    <FaceAPIProvider>
      {TestFacialDifferentiation && <TestFacialDifferentiation />}
    </FaceAPIProvider>
  );
}
