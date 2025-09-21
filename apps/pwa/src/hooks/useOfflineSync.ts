'use client';

import { useState, useEffect, useCallback } from 'react';
import { queueManager, db, OfflineTimeRecord } from '@/lib/offline-db';
import { useSyncStatus } from './useSyncStatus';
import { useAuth } from './useAuth';

interface OfflineSyncState {
  isInitialized: boolean;
  pendingRecords: number;
  syncedRecords: number;
  failedRecords: number;
  lastSyncTime: Date | null;
  isProcessing: boolean;
  error: string | null;
}

export function useOfflineSync() {
  const { user } = useAuth();
  const { isOnline, isSyncing } = useSyncStatus();
  const [state, setState] = useState<OfflineSyncState>({
    isInitialized: false,
    pendingRecords: 0,
    syncedRecords: 0,
    failedRecords: 0,
    lastSyncTime: null,
    isProcessing: false,
    error: null
  });

  // Atualizar estatísticas
  const updateStats = useCallback(async () => {
    try {
      const stats = await queueManager.getQueueStats();
      const unsyncedRecords = await queueManager.getUnsyncedRecords();
      
      setState(prev => ({
        ...prev,
        pendingRecords: stats.pending,
        syncedRecords: stats.completed,
        failedRecords: stats.failed,
        isInitialized: true
      }));
    } catch (error) {
      console.error('Erro ao atualizar estatísticas offline:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        isInitialized: true
      }));
    }
  }, []);

  // Adicionar registro de ponto offline
  const addTimeRecord = useCallback(async (recordData: {
    type: 'entry' | 'exit' | 'break_start' | 'break_end';
    location?: {
      latitude: number;
      longitude: number;
      accuracy: number;
      address?: string;
    };
    faceEmbedding?: string;
  }) => {
    if (!user) {
      throw new Error('Usuário não autenticado');
    }

    try {
      setState(prev => ({ ...prev, isProcessing: true, error: null }));
      
      const record: Omit<OfflineTimeRecord, 'id' | 'createdAt' | 'updatedAt'> = {
        userId: user.uid,
        timestamp: Date.now(),
        type: recordData.type,
        location: recordData.location,
        faceEmbedding: recordData.faceEmbedding,
        deviceInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        metadata: {
          offline: !isOnline,
          batteryLevel: (navigator as any).getBattery ? 
            await (navigator as any).getBattery().then((battery: any) => battery.level) : undefined,
          networkType: (navigator as any).connection?.effectiveType
        },
        syncStatus: isOnline ? 'pending' : 'pending',
        syncAttempts: 0
      };

      const recordId = await queueManager.addTimeRecord(record);
      
      // Se estiver online, tentar sincronizar imediatamente
      if (isOnline) {
        queueManager.startProcessing();
      }
      
      await updateStats();
      
      setState(prev => ({ ...prev, isProcessing: false }));
      
      return recordId;
    } catch (error) {
      console.error('Erro ao adicionar registro offline:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: error instanceof Error ? error.message : 'Erro ao salvar registro'
      }));
      throw error;
    }
  }, [user, isOnline, updateStats]);

  // Forçar sincronização
  const forcSync = useCallback(async () => {
    if (!isOnline) {
      throw new Error('Sem conexão com a internet');
    }

    try {
      setState(prev => ({ ...prev, isProcessing: true, error: null }));
      
      await queueManager.forceSyncAll();
      await updateStats();
      
      setState(prev => ({
        ...prev,
        isProcessing: false,
        lastSyncTime: new Date()
      }));
    } catch (error) {
      console.error('Erro na sincronização forçada:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: error instanceof Error ? error.message : 'Erro na sincronização'
      }));
      throw error;
    }
  }, [isOnline, updateStats]);

  // Limpar dados antigos
  const cleanupOldData = useCallback(async (daysToKeep: number = 30) => {
    try {
      await queueManager.cleanupOldData(daysToKeep);
      await updateStats();
    } catch (error) {
      console.error('Erro ao limpar dados antigos:', error);
    }
  }, [updateStats]);

  // Obter registros não sincronizados
  const getUnsyncedRecords = useCallback(async () => {
    try {
      return await queueManager.getUnsyncedRecords();
    } catch (error) {
      console.error('Erro ao obter registros não sincronizados:', error);
      return [];
    }
  }, []);

  // Inicialização e listeners
  useEffect(() => {
    updateStats();
    
    // Iniciar processamento da fila se estiver online
    if (isOnline && !isSyncing) {
      queueManager.startProcessing();
    }
  }, [isOnline, isSyncing]); // Remover updateStats da dependência
  
  // Atualizar estatísticas periodicamente - separar em useEffect próprio
  useEffect(() => {
    const interval = setInterval(() => {
      updateStats();
    }, 10000); // A cada 10 segundos
    
    return () => {
      clearInterval(interval);
    };
  }, []); // Sem dependências - executar apenas uma vez

  // Listener para mudanças de conectividade
  useEffect(() => {
    const handleOnline = () => {
      queueManager.startProcessing();
      updateStats();
    };

    const handleOffline = () => {
      queueManager.stopProcessing();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [updateStats]);

  return {
    ...state,
    addTimeRecord,
    forcSync,
    cleanupOldData,
    getUnsyncedRecords,
    refresh: updateStats
  };
}

export default useOfflineSync;