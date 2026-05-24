'use client';

import { Suspense } from 'react';
import TestFacialDifferentiation from '@/components/test/TestFacialDifferentiation';

export default function TestFacialDifferentiationPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto py-8">
        {/* HEADER DA PÁGINA */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            🧪 Teste de Diferenciação Facial
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Verificação específica: Novo algoritmo consegue diferenciar <strong>Nelson (homem)</strong> de <strong>Selma (mulher)</strong>?
          </p>
          
          <div className="mt-6 flex justify-center gap-4">
            <div className="px-4 py-2 bg-red-100 border border-red-300 rounded-lg">
              <span className="text-red-800 font-semibold">Problema Anterior:</span>
              <span className="text-red-700 ml-2">1% diferença (impossível!)</span>
            </div>
            <div className="px-4 py-2 bg-green-100 border border-green-300 rounded-lg">
              <span className="text-green-800 font-semibold">Meta:</span>
              <span className="text-green-700 ml-2">30%+ diferença</span>
            </div>
          </div>
        </div>

        {/* COMPONENTE DE TESTE */}
        <Suspense fallback={
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Carregando teste...</span>
          </div>
        }>
          <TestFacialDifferentiation />
        </Suspense>
        
        {/* FOOTER COM INSTRUÇÕES */}
        <div className="mt-8 text-center">
          <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="font-semibold text-gray-900 mb-3">📋 Instruções do Teste</h3>
            <ul className="text-left max-w-2xl mx-auto space-y-2 text-gray-700">
              <li>1. Aguarde o carregamento completo do modelo facial</li>
              <li>2. Observe a diferenciação entre Nelson e Selma</li>
              <li>3. Verifique se a diferença é maior que 30%</li>
              <li>4. Teste com diferentes condições de iluminação</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}