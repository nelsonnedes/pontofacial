'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { optimizedFaceRecognition } from '@/lib/face-recognition-optimized';

// Removido estados globais duplicados, usando o serviço singleton diretamente

export function useFaceAPIInit() {
  const [status, setStatus] = useState({ initialized: false, modelsLoaded: false, backend: 'cpu' });
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const syncStatus = useCallback(async () => {
    try {
      const currentStatus = await optimizedFaceRecognition.getStatus();
      // ✅ CORREÇÃO: Mapear status para o formato esperado
      setStatus({
        initialized: currentStatus.initialized || false,
        modelsLoaded: currentStatus.initialized || false, // Assumir que se inicializado, modelos estão carregados
        backend: currentStatus.backend || 'cpu'
      });
      setInitializing(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao sincronizar status');
      setInitializing(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    syncStatus();
    intervalRef.current = setInterval(syncStatus, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [syncStatus]);

  const initializeFaceAPI = useCallback(async (): Promise<boolean> => {
    if (status.initialized) return true;
    setInitializing(true);
    try {
      await optimizedFaceRecognition.initialize();
      await syncStatus();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na inicialização');
      setInitializing(false);
      return false;
    }
  }, [status.initialized, syncStatus]);

  // ✅ CORREÇÃO: Só inicializar TFJS em páginas que precisam - SEM DEPENDÊNCIA CIRCULAR
  useEffect(() => {
    // Verificar se estamos em uma página que precisa de reconhecimento facial
    const needsFaceAPI = typeof window !== 'undefined' && (
      window.location.pathname.includes('/marcar') ||
      window.location.pathname.includes('/cadastro-facial') ||
      window.location.pathname.includes('/verificar-face') ||
      window.location.pathname.includes('/verificacao-facial')
    );
    
    // ✅ CORREÇÃO: Não carregar na página de login
    const isLoginPage = typeof window !== 'undefined' && window.location.pathname === '/login';
    
    if (mounted && !status.initialized && !initializing && needsFaceAPI && !isLoginPage) {
      initializeFaceAPI();
    }
  }, [mounted, status.initialized, initializing]); // ✅ REMOVIDO: initializeFaceAPI das dependências

  const retry = useCallback(() => {
    setError(null);
    return initializeFaceAPI();
  }, [initializeFaceAPI]);

  const isReady = useCallback(() => {
    return mounted && status.initialized && status.modelsLoaded && !initializing && !error;
  }, [mounted, status, initializing, error]);

  return {
    initialized: status.initialized,
    initializing,
    error,
    mounted,
    retry,
    initializeFaceAPI,
    isReady
  };
}

// Funções utilitárias atualizadas
export async function isFaceAPIReady(): Promise<boolean> {
  const status = await optimizedFaceRecognition.getStatus();
  return status.initialized || false;
}

export async function waitForFaceAPI(): Promise<void> {
  while (!(await isFaceAPIReady())) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}