'use client';

import { createContext, useContext, ReactNode, useState, useEffect, useMemo } from 'react';
// import { useFaceAPIInit } from '@/hooks/useFaceAPIInit'; // Desabilitado - usando versão otimizada
import { FaceAPIErrorBoundary } from './ErrorBoundary';

interface FaceAPIContextType {
  initialized: boolean;
  initializing: boolean;
  error: string | null;
  mounted: boolean;
  retry: () => Promise<boolean>;
  initializeFaceAPI: () => Promise<boolean>;
  isReady: () => boolean;
}

// Valores padrão seguros para o contexto
const defaultContextValue: FaceAPIContextType = {
  initialized: false,
  initializing: false,
  error: null,
  mounted: false,
  retry: async () => false,
  initializeFaceAPI: async () => false,
  isReady: () => false
};

const FaceAPIContext = createContext<FaceAPIContextType>(defaultContextValue);

interface FaceAPIProviderProps {
  children: ReactNode;
}

export function FaceAPIProvider({ children }: FaceAPIProviderProps) {
  // Hook sempre chamado (nunca condicional)
  // const faceAPIState = useFaceAPIInit(); // Desabilitado - usando versão otimizada
  const [faceAPIState, setFaceAPIState] = useState(defaultContextValue);
  const [mounted, setMounted] = useState(false);

  // Efeito para controlar montagem e inicialização otimizada
  useEffect(() => {
    setMounted(true);
    
    // Inicializar versão otimizada
    const initOptimized = async () => {
      try {
        setFaceAPIState(prev => ({
          ...prev,
          initializing: true,
          error: null
        }));

        const module = await import('@/lib/face-recognition-optimized');
        const optimizedFaceRecognition = module.optimizedFaceRecognition;
        
        await optimizedFaceRecognition.initialize();
        
        setFaceAPIState({
          initialized: optimizedFaceRecognition.isReady(),
          initializing: false,
          error: null,
          mounted: true,
          retry: async () => {
            await initOptimized();
            return optimizedFaceRecognition.isReady();
          },
          initializeFaceAPI: async () => {
            await optimizedFaceRecognition.initialize();
            return optimizedFaceRecognition.isReady();
          },
          isReady: () => optimizedFaceRecognition.isReady()
        });

        console.log('✅ Face API Provider usando versão otimizada');
      } catch (error) {
        console.warn('⚠️ Face API otimizada não disponível:', error);
        setFaceAPIState(prev => ({
          ...prev,
          initialized: false,
          initializing: false,
          error: 'Face API otimizada não disponível - sistema funcionará com backup de foto'
        }));
      }
    };

    initOptimized();
  }, []);

  // Memoizar o valor do contexto para evitar re-renders desnecessários
  const contextValue = useMemo(() => {
    // Se não montado, retornar valores padrão
    if (!mounted) {
      return defaultContextValue;
    }
    
    // Retornar estado atual do hook
    return faceAPIState;
  }, [mounted, faceAPIState]);

  return (
    <FaceAPIErrorBoundary>
      <FaceAPIContext.Provider value={contextValue}>
        {children}
      </FaceAPIContext.Provider>
    </FaceAPIErrorBoundary>
  );
}

export function useFaceAPIContext() {
  const context = useContext(FaceAPIContext);
  
  // Verificação de contexto sempre executada
  if (!context) {
    throw new Error('useFaceAPIContext deve ser usado dentro de FaceAPIProvider');
  }
  
  return context;
}

// Hook seguro que não lança erro se usado fora do provider
export function useFaceAPIContextSafe() {
  const context = useContext(FaceAPIContext);
  return context || defaultContextValue;
}

// Componente para debug do status da Face API
export function FaceAPIStatus() {
  const { initialized, initializing, error, mounted, isReady, retry } = useFaceAPIContextSafe();
  
  // Só mostrar em desenvolvimento
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }
  
  return (
    <div className="fixed bottom-4 right-4 bg-black bg-opacity-75 text-white p-2 rounded text-xs z-50 max-w-xs">
      <div className="font-bold mb-1">Face API Status</div>
      <div className="space-y-1">
        <div>Mounted: {mounted ? '✅' : '❌'}</div>
        <div>Initialized: {initialized ? '✅' : '❌'}</div>
        <div>Initializing: {initializing ? '🔄' : '⏸️'}</div>
        <div>Ready: {isReady() ? '✅' : '❌'}</div>
        {error && (
          <div className="text-red-300 break-words">
            Error: {error.length > 50 ? `${error.substring(0, 50)}...` : error}
          </div>
        )}
        {error && (
          <button
            onClick={() => retry()}
            className="mt-1 text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

// Hook para verificar se Face API está pronta para uso
export function useFaceAPIReady() {
  const { isReady } = useFaceAPIContextSafe();
  return isReady();
}

// Hook para obter apenas o status de inicialização
export function useFaceAPIStatus() {
  const { initialized, initializing, error } = useFaceAPIContextSafe();
  return { initialized, initializing, error };
}

// Exportação padrão
export default FaceAPIProvider;