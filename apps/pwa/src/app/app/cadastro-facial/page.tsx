'use client';

import React, { useState, useEffect } from 'react';

// ✅ SOLUÇÃO RADICAL: Lazy loading TOTAL para quebrar dependência circular definitivamente
function LoadingFacialRegistration() {
    return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Carregando sistema de cadastro facial...</p>
        </div>
      </div>
    );
  }

export default function CadastroFacial() {
  const [Component, setComponent] = useState<React.ComponentType<any> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // ✅ SOLUÇÃO RADICAL: Carregar componente via useEffect para quebrar TDZ
    const loadComponent = async () => {
      try {
        console.log('🔄 Carregando componente de cadastro facial...');
        
        // Aguardar 100ms para garantir que todos os singletons estejam prontos
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const facialRegistrationModule = await import('@/components/facial-registration/FacialRegistrationRefactored');
        console.log('✅ Componente de cadastro facial carregado com sucesso');
        
        setComponent(() => facialRegistrationModule.default);
        setIsLoading(false);
      } catch (err) {
        console.error('❌ Erro ao carregar componente de cadastro facial:', err);
        setError('Erro ao carregar sistema de cadastro facial');
        setIsLoading(false);
      }
    };

    loadComponent();
  }, []);

  if (isLoading) {
    return <LoadingFacialRegistration />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center p-4">
        <div className="text-center py-12">
          <div className="text-red-600 text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-red-800 mb-2">Erro no Sistema</h2>
          <p className="text-red-600 mb-4">{error}</p>
                <button
            onClick={() => window.location.reload()} 
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
                >
            Tentar Novamente
                </button>
      </div>
    </div>
  );
}

  if (!Component) {
    return <LoadingFacialRegistration />;
  }

  return <Component />;
}
