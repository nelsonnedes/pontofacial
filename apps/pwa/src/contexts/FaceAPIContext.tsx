'use client';

import { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { optimizedFaceRecognition } from '@/lib/face-recognition-optimized';

interface FaceAPIContextType {
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  faceAPI: typeof optimizedFaceRecognition;
}

const FaceAPIContext = createContext<FaceAPIContextType | null>(null);

export function useFaceAPI() {
  const context = useContext(FaceAPIContext);
  if (!context) {
    throw new Error('useFaceAPI deve ser usado dentro de um FaceAPIProvider');
  }
  return context;
}

interface FaceAPIProviderProps {
  children: ReactNode;
}

// Exportação nomeada e padrão para uso flexível
export function FaceAPIProvider({ children }: FaceAPIProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function initializeFaceAPI() {
      try {
        setIsLoading(true);
        setError(null);
        
        await optimizedFaceRecognition.initialize();
        
        if (isMounted) {
          setIsReady(true);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Erro ao inicializar Face API:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Erro desconhecido ao inicializar Face API');
          setIsLoading(false);
        }
      }
    }

    initializeFaceAPI();

    return () => {
      isMounted = false;
    };
  }, []);

  const value = {
    isReady,
    isLoading,
    error,
    faceAPI: optimizedFaceRecognition
  };

  return (
    <FaceAPIContext.Provider value={value}>
      {children}
    </FaceAPIContext.Provider>
  );
}

export default FaceAPIProvider;