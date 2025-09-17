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
  
  // Referência para controlar tentativas de inicialização
  const initAttemptsRef = useRef(0);
  const lastInitTimeRef = useRef(0);
  const MAX_INIT_ATTEMPTS = 3;
  const INIT_COOLDOWN_MS = 10000; // 10 segundos entre tentativas após falhas

  // Sincronizar status de forma mais eficiente
  const syncStatus = useCallback(async () => {
    try {
      // Evitar sincronização se já estiver inicializando
      if (initializing) return;
      
      const currentStatus = await faceRecognition.getStatus();
      
      // Atualizar status apenas se houver mudança
      setStatus(prevStatus => {
        if (prevStatus.initialized !== currentStatus.initialized || 
            prevStatus.modelsLoaded !== currentStatus.modelsLoaded || 
            prevStatus.backend !== currentStatus.backend) {
          return currentStatus;
        }
        return prevStatus;
      });
      
      // Limpar erro se estiver inicializado com sucesso
      if (currentStatus.initialized && currentStatus.modelsLoaded && error) {
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao sincronizar status');
      setInitializing(false);
    }
  }, [initializing, error]);

  // Efeito de montagem com intervalo de sincronização mais longo
  useEffect(() => {
    setMounted(true);
    syncStatus();
    
    // Usar intervalo mais longo (3s) para reduzir sobrecarga
    intervalRef.current = setInterval(syncStatus, 3000);
    
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [syncStatus]);

  // Função de inicialização com controle de tentativas
  const initializeFaceAPI = useCallback(async (): Promise<boolean> => {
    // Verificar se já está inicializado
    if (status.initialized && status.modelsLoaded) return true;
    
    // Evitar múltiplas tentativas simultâneas
    if (initializing) return false;
    
    // Controle de tentativas para evitar loops
    const now = Date.now();
    if (initAttemptsRef.current >= MAX_INIT_ATTEMPTS) {
      const timeSinceLastAttempt = now - lastInitTimeRef.current;
      if (timeSinceLastAttempt < INIT_COOLDOWN_MS) {
        setError(`Muitas tentativas de inicialização. Aguarde ${Math.ceil(INIT_COOLDOWN_MS/1000)}s antes de tentar novamente.`);
        return false;
      }
      // Resetar contador após cooldown
      initAttemptsRef.current = 0;
    }
    
    setInitializing(true);
    lastInitTimeRef.current = now;
    initAttemptsRef.current++;
    
    try {
      await faceRecognition.initialize();
      await syncStatus();
      // Resetar contador após sucesso
      initAttemptsRef.current = 0;
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na inicialização');
      setInitializing(false);
      return false;
    }
  }, [status.initialized, status.modelsLoaded, initializing, syncStatus]);

  // Efeito para inicialização automática (com controle para evitar loops)
  useEffect(() => {
    if (mounted && !status.initialized && !initializing && initAttemptsRef.current < MAX_INIT_ATTEMPTS) {
      const now = Date.now();
      const timeSinceLastAttempt = now - lastInitTimeRef.current;
      
      // Adicionar delay entre tentativas automáticas
      if (timeSinceLastAttempt > INIT_COOLDOWN_MS || initAttemptsRef.current === 0) {
        initializeFaceAPI();
      }
    }
  }, [mounted, status.initialized, initializing, initializeFaceAPI]);

  // Função de retry com reset de erro
  const retry = useCallback(() => {
    setError(null);
    // Resetar contador de tentativas ao fazer retry manual
    initAttemptsRef.current = 0;
    return initializeFaceAPI();
  }, [initializeFaceAPI]);

  // Verificar se está pronto para uso
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