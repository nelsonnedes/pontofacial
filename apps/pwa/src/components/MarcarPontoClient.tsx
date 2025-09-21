'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '@/hooks/useAuth';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useFaceEmbeddings } from '@/hooks/useFaceEmbeddings';
import { useOfflineTimeRecords } from '@/hooks/useOfflineTimeRecords';

// Componente de loading reutilizável
const LoadingSpinner = ({ text }: { text: string }) => (
  <div className="text-center py-4">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
    {text && <p className="mt-2 text-sm text-gray-600">{text}</p>}
  </div>
);

// Importações dinâmicas otimizadas
const HybridPointCapture = dynamic(() => import('@/components/HybridPointCapture'), {
  ssr: false,
  loading: () => <LoadingSpinner text="Carregando sistema de captura..." />
});

const FaceRegistration = dynamic(() => import('@/components/FaceRegistration'), {
  ssr: false,
  loading: () => <LoadingSpinner text="Carregando cadastro facial..." />
});

type PontoType = 'entrada' | 'saida' | 'pausa_inicio' | 'pausa_fim';
type AppStep = 'loading' | 'no_face' | 'verification' | 'success' | 'error';

// Tipos e interfaces
interface MarcarPontoState {
  currentStep: AppStep;
  pontoType: PontoType;
  isProcessing: boolean;
  error: string;
  successMessage: string;
  mounted: boolean;
  isClient: boolean;
}

export default function MarcarPontoClient() {
  // Estado consolidado
  const [state, setState] = useState<MarcarPontoState>({
    currentStep: 'loading',
    pontoType: 'entrada',
    isProcessing: false,
    error: '',
    successMessage: '',
    mounted: false,
    isClient: false
  });
  
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { location, error: locationError, isSupported: geoSupported, getCurrentLocation } = useGeolocation();
  const { hasRegisteredFace, isLoading: embeddingLoading, error: embeddingError } = useFaceEmbeddings();
  const { recordTime, isOnline, isLoading: recordLoading, error: recordError } = useOfflineTimeRecords();

  // Função para atualizar estado
  const updateState = useCallback((updates: Partial<MarcarPontoState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // Efeito de inicialização
  useEffect(() => {
    updateState({ mounted: true, isClient: true });
  }, [updateState]);

  // Efeito para determinar o passo atual
  useEffect(() => {
    if (!state.mounted || authLoading || embeddingLoading) {
      updateState({ currentStep: 'loading' });
      return;
    }

    if (!user) {
      router.push('/login');
      return;
    }

    if (embeddingError || !hasRegisteredFace) {
      updateState({ currentStep: 'no_face' });
      return;
    }

    updateState({ currentStep: 'verification' });
  }, [state.mounted, authLoading, embeddingLoading, user, hasRegisteredFace, embeddingError, router, updateState]);

  // Memoizar callbacks para evitar mudanças na ordem dos hooks
  const handleFaceRegistrationComplete = useCallback(() => {
    updateState({ currentStep: 'verification' });
  }, [updateState]);

  // Handler para sucesso do sistema híbrido
  const handleHybridCaptureSuccess = useCallback((data: any) => {
    console.log('✅ Sistema híbrido - ponto registrado com sucesso:', data);
    
    const methodText = data.method === 'facial' ? 'reconhecimento facial' : 'captura de foto';
    const locationText = data.hasLocation ? 'com localização' : 'sem localização';
    const faceText = data.hasFaceEmbedding ? 'com dados biométricos' : 'com foto de validação';
    
    updateState({
      successMessage: `Ponto de ${state.pontoType.replace('_', ' ')} registrado com sucesso via ${methodText} (${locationText}, ${faceText})!`,
      currentStep: 'success'
    });
  }, [state.pontoType, updateState]);

  // Handler para erro do sistema híbrido
  const handleHybridCaptureError = useCallback((error: string) => {
    console.error('❌ Erro no sistema híbrido:', error);
    updateState({ error, currentStep: 'error' });
  }, [updateState]);

  const resetToVerification = useCallback(() => {
    updateState({
      error: '',
      successMessage: '',
      currentStep: 'verification'
    });
  }, [updateState]);

  // Early return após todos os hooks para manter ordem consistente
  if (!state.mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  // Renderização do conteúdo baseado no estado atual
  const renderContent = () => {
    switch (state.currentStep) {
      case 'loading':
        return (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Verificando cadastro facial...</p>
          </div>
        );

      case 'no_face':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                🔐 Cadastro Necessário
              </h2>
              <p className="text-sm sm:text-base text-gray-600 mb-6">
                Para marcar ponto, você precisa cadastrar seu rosto primeiro.
              </p>
            </div>
            
            <FaceRegistration
              onSuccess={handleFaceRegistrationComplete}
              onCancel={() => router.push('/app')}
            />
          </div>
        );

      case 'verification':
        return (
          <div className="space-y-6">
            <div className="text-center">
               <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                 📍 Marcar Ponto
               </h2>
               <p className="text-sm sm:text-base text-gray-600 mb-4">
                 Selecione o tipo de marcação. O sistema tentará reconhecimento facial e utilizará foto como backup.
               </p>
               
               {/* Indicador de geolocalização */}
               <div className="flex items-center justify-center gap-2 text-xs text-gray-500 mb-4">
                 {geoSupported ? (
                   location ? (
                     <>
                       <span className="text-green-600">🌍</span>
                       <span>Localização: {typeof location.accuracy === 'number' ? location.accuracy.toFixed(0) : '0'}m de precisão</span>
                     </>
                   ) : (
                     <>
                       <span className="text-yellow-600">📍</span>
                       <span>Obtendo localização...</span>
                     </>
                   )
                 ) : (
                   <>
                     <span className="text-gray-400">🚫</span>
                     <span>Geolocalização não disponível</span>
                   </>
                 )}
               </div>
            </div>
            
            {/* Seletor de tipo de ponto */}
            <div className="bg-white rounded-lg p-4 shadow-sm border">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Tipo de Marcação
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'entrada', label: '🟢 Entrada', description: 'Iniciar jornada de trabalho', color: 'green' },
                  { value: 'saida', label: '🔴 Saída', description: 'Finalizar jornada de trabalho', color: 'red' },
                  { value: 'pausa_inicio', label: '⏸️ Pausa', description: 'Iniciar intervalo ou almoço', color: 'yellow' },
                  { value: 'pausa_fim', label: '▶️ Volta', description: 'Retornar do intervalo', color: 'blue' }
                ].map((tipo) => (
                  <button
                    key={tipo.value}
                    onClick={() => updateState({ pontoType: tipo.value as PontoType })}
                    className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                      state.pontoType === tipo.value
                        ? `border-${tipo.color}-500 bg-${tipo.color}-50 text-${tipo.color}-700`
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-center">
                      <div className="font-semibold">{tipo.label}</div>
                      <div className="hidden lg:block text-xs mt-1 opacity-75">
                        {tipo.description}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            
            <HybridPointCapture
              pontoType={state.pontoType}
              onSuccess={handleHybridCaptureSuccess}
              onError={handleHybridCaptureError}
            />
          </div>
        );

      case 'success':
        return (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-xl sm:text-2xl font-bold text-green-700 mb-2">
              Sucesso!
            </h2>
            <p className="text-sm sm:text-base text-gray-600 mb-6">
              {state.successMessage}
            </p>
            <div className="space-y-3">
              <button
                onClick={resetToVerification}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Marcar Outro Ponto
              </button>
              <Link
                href="/app"
                className="block w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors text-center"
              >
                Voltar ao Menu
              </Link>
            </div>
          </div>
        );

      case 'error':
        return (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-xl sm:text-2xl font-bold text-red-700 mb-2">
              Erro
            </h2>
            <p className="text-sm sm:text-base text-gray-600 mb-6">
              {state.error}
            </p>
            <div className="space-y-3">
              <button
                onClick={resetToVerification}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Tentar Novamente
              </button>
              <Link
                href="/app"
                className="block w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors text-center"
              >
                Voltar ao Menu
              </Link>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <Link
            href="/app"
            className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-4"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Voltar
          </Link>
        </div>

        {/* Card principal */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}