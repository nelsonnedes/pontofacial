'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { faceRecognition } from '@/lib/face-recognition';

// Removido estados globais duplicados, usando o serviço singleton diretamente

export function useFaceAPIInit() {
  const [status, setStatus] = useState({ initialized: false, modelsLoaded: false, backend: 'cpu' });
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const syncStatus = useCallback(async () => {
    try {
      const currentStatus = await faceRecognition.getStatus();
      setStatus(currentStatus);
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
      await faceRecognition.initialize();
      await syncStatus();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na inicialização');
      setInitializing(false);
      return false;
    }
  }, [status.initialized, syncStatus]);

  useEffect(() => {
    if (mounted && !status.initialized && !initializing) {
      initializeFaceAPI();
    }
  }, [mounted, status.initialized, initializing, initializeFaceAPI]);

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
  const status = await faceRecognition.getStatus();
  return status.initialized && status.modelsLoaded;
}

export async function waitForFaceAPI(): Promise<void> {
  while (!(await isFaceAPIReady())) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}