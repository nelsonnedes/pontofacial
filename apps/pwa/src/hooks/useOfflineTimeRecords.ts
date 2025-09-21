'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { OfflineTimeRecord, offlineQueueManager as queueManager, OfflineSettings } from '@/lib/offline-queue';
import { useBackgroundSync } from './useBackgroundSync';

interface TimeRecordData {
  userId: string;
  type: 'entry' | 'exit' | 'break_start' | 'break_end';
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    address?: string;
  };
  faceEmbedding?: string;
}

interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  totalTimeRecords: number;
  unsyncedTimeRecords: number;
}

interface UseOfflineTimeRecordsReturn {
  // Estados
  isOnline: boolean;
  isLoading: boolean;
  error: string | null;
  queueStats: QueueStats | null;
  unsyncedRecords: OfflineTimeRecord[];
  isSyncing: boolean;
  
  // Funções
  recordTime: (data: TimeRecordData) => Promise<{ success: boolean; id?: number; message?: string }>;
  getUnsyncedRecords: () => Promise<void>;
  getQueueStats: () => Promise<void>;
  forceSyncAll: () => Promise<{ success: boolean; message?: string }>;
  clearError: () => void;
  
  // Configurações
  getAutoSync: () => Promise<boolean>;
  setAutoSync: (enabled: boolean) => Promise<void>;
  
  // Background Sync
  backgroundSync: any;
}

export function useOfflineTimeRecords(): UseOfflineTimeRecordsReturn {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [unsyncedRecords, setUnsyncedRecords] = useState<OfflineTimeRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const isMountedRef = useRef(true);
  
  // TEMPORÁRIO: Desabilitar background sync para debugging
  const DISABLE_BACKGROUND_SYNC = true;

  // Integração com Background Sync DESABILITADA
  const backgroundSync = useBackgroundSync({
    autoRegister: false, // Desabilitar auto-registro
    onSyncStart: () => {
      if (DISABLE_BACKGROUND_SYNC || !isMountedRef.current) return;
      setIsSyncing(true);
      console.log('Background sync started');
    },
    onSyncComplete: (result) => {
      if (DISABLE_BACKGROUND_SYNC || !isMountedRef.current) return;
      setIsSyncing(false);
      console.log('Background sync completed:', result);
      // Atualizar estatísticas após sincronização
      getQueueStats();
      getUnsyncedRecords();
    },
    onSyncError: (error) => {
      if (DISABLE_BACKGROUND_SYNC || !isMountedRef.current) return;
      setIsSyncing(false);
      console.error('Background sync error:', error);
    }
  });

  // Monitorar status de conexão
  useEffect(() => {
    isMountedRef.current = true;
    
    const handleOnline = () => {
      if (isMountedRef.current) {
        setIsOnline(true);
        setError(null);
      }
    };

    const handleOffline = () => {
      if (isMountedRef.current) {
        setIsOnline(false);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Carregar dados iniciais
  useEffect(() => {
    loadInitialData();
  }, []);

  // Atualizar estatísticas periodicamente
  useEffect(() => {
    const interval = setInterval(() => {
      // Verificar estado atual no momento da execução para evitar dependência circular
      if (!isLoading) {
        getQueueStats();
        getUnsyncedRecords();
      }
    }, 10000); // A cada 10 segundos

    return () => clearInterval(interval);
  }, []); // Remover isLoading da dependência para evitar loop infinito

  // Carregar dados iniciais
  const loadInitialData = async () => {
    try {
      await Promise.all([
        getQueueStats(),
        getUnsyncedRecords()
      ]);
    } catch (err) {
      console.error('Erro ao carregar dados iniciais:', err);
    }
  };

  // Registrar ponto
  const recordTime = useCallback(async (data: TimeRecordData): Promise<{ success: boolean; id?: number; message?: string }> => {
    try {
      setIsLoading(true);
      setError(null);

      // Obter informações do dispositivo
      const deviceInfo = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };

      // Obter informações de rede e bateria
      const metadata: any = {
        offline: !navigator.onLine,
        networkType: (navigator as any).connection?.effectiveType || 'unknown'
      };

      // Tentar obter nível da bateria (se disponível)
      try {
        if ('getBattery' in navigator) {
          const battery = await (navigator as any).getBattery();
          metadata.batteryLevel = Math.round(battery.level * 100);
        }
      } catch (err) {
        // Ignorar erro de bateria
      }

      // Tentar obter offset NTP (simulado)
      try {
        metadata.ntpOffset = await getNTPOffset();
      } catch (err) {
        // Usar offset padrão se falhar
        metadata.ntpOffset = 0;
      }

      // Criar registro
      const record: Omit<OfflineTimeRecord, 'id' | 'createdAt' | 'updatedAt'> = {
        userId: data.userId,
        timestamp: Date.now() + (metadata.ntpOffset || 0),
        type: data.type,
        location: data.location,
        faceEmbedding: data.faceEmbedding,
        deviceInfo,
        metadata,
        syncStatus: 'pending',
        syncAttempts: 0
      };

      // Adicionar à fila offline
      const id = await queueManager.addTimeRecord(record);

      // Atualizar estatísticas
      await getQueueStats();
      await getUnsyncedRecords();
      
      // Notificar service worker sobre novos itens pendentes
      const autoSyncEnabled = await getAutoSync();
      if (autoSyncEnabled && isOnline) {
        backgroundSync.notifyPendingItems();
      }

      return {
        success: true,
        id,
        message: isOnline 
          ? 'Registro salvo e será sincronizado automaticamente'
          : 'Registro salvo offline - será sincronizado quando houver conexão'
      };

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao registrar ponto';
      setError(message);
      return {
        success: false,
        message
      };
    } finally {
      setIsLoading(false);
    }
  }, [isOnline]);

  // Obter registros não sincronizados
  const getUnsyncedRecords = useCallback(async (): Promise<void> => {
    try {
      const records = await queueManager.getUnsyncedRecords();
      setUnsyncedRecords(records);
    } catch (err) {
      console.error('Erro ao obter registros não sincronizados:', err);
    }
  }, []);

  // Obter estatísticas da fila
  const getQueueStats = useCallback(async (): Promise<void> => {
    try {
      const stats = await queueManager.getQueueStats();
      setQueueStats(stats);
    } catch (err) {
      console.error('Erro ao obter estatísticas da fila:', err);
    }
  }, []);

  // Forçar sincronização de todos os itens
  const forceSyncAll = useCallback(async (): Promise<{ success: boolean; message?: string }> => {
    try {
      setIsLoading(true);
      setError(null);

      if (!isOnline) {
        throw new Error('Sem conexão com a internet');
      }

      setIsSyncing(true);
      
      // Tentar usar background sync se disponível
      if (backgroundSync.isBackgroundSyncSupported && isOnline) {
        backgroundSync.requestBackgroundSync();
        // Aguardar um pouco para o background sync processar
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        // Fallback para sincronização direta
        await queueManager.forceSyncAll();
        setIsSyncing(false);
        
        // Aguardar um pouco para a sincronização começar
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Atualizar estatísticas
      await getQueueStats();
      await getUnsyncedRecords();

      return {
        success: true,
        message: 'Sincronização iniciada com sucesso'
      };

    } catch (err) {
      setIsSyncing(false);
      const message = err instanceof Error ? err.message : 'Erro ao forçar sincronização';
      setError(message);
      return {
        success: false,
        message
      };
    } finally {
      setIsLoading(false);
    }
  }, [isOnline, backgroundSync]);

  // Limpar erro
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Obter configuração de sincronização automática
  const getAutoSync = useCallback(async (): Promise<boolean> => {
    try {
      return await OfflineSettings.get('autoSync', true);
    } catch (err) {
      return true; // Padrão habilitado
    }
  }, []);

  // Definir configuração de sincronização automática
  const setAutoSync = useCallback(async (enabled: boolean): Promise<void> => {
    try {
      await OfflineSettings.set('autoSync', enabled);
      
      if (enabled && isOnline) {
        queueManager.startProcessing();
      } else if (!enabled) {
        queueManager.stopProcessing();
      }
    } catch (err) {
      console.error('Erro ao definir configuração de sincronização automática:', err);
    }
  }, [isOnline]);

  return {
    // Estados
    isOnline,
    isLoading,
    error,
    queueStats,
    unsyncedRecords,
    isSyncing,
    
    // Funções
    recordTime,
    getUnsyncedRecords,
    getQueueStats,
    forceSyncAll,
    clearError,
    
    // Configurações
    getAutoSync,
    setAutoSync,
    
    // Background Sync
    backgroundSync
  };
}

// Função auxiliar para obter offset NTP (simulada)
async function getNTPOffset(): Promise<number> {
  try {
    // Implementação simulada - em produção, usar um serviço NTP real
    const start = Date.now();
    const response = await fetch('/api/time/ntp', {
      method: 'GET',
      cache: 'no-cache'
    });
    
    if (response.ok) {
      const data = await response.json();
      const end = Date.now();
      const networkDelay = (end - start) / 2;
      const serverTime = data.timestamp;
      const localTime = start + networkDelay;
      return serverTime - localTime;
    }
    
    return 0;
  } catch (err) {
    // Se falhar, retornar 0 (sem correção)
    return 0;
  }
}

// Função auxiliar para formatar tipo de registro
export function formatTimeRecordType(type: OfflineTimeRecord['type']): string {
  const types = {
    entry: '🟢 Entrada',
    exit: '🔴 Saída',
    break_start: '⏸️ Início do Intervalo',
    break_end: '▶️ Fim do Intervalo'
  };
  
  return types[type] || type;
}

// Função auxiliar para formatar status de sincronização
export function formatSyncStatus(status: OfflineTimeRecord['syncStatus']): { text: string; color: string } {
  const statuses = {
    pending: { text: '⏳ Pendente', color: 'text-yellow-600' },
    syncing: { text: '🔄 Sincronizando', color: 'text-blue-600' },
    synced: { text: '✅ Sincronizado', color: 'text-green-600' },
    failed: { text: '❌ Falhou', color: 'text-red-600' }
  };
  
  return statuses[status] || { text: status, color: 'text-gray-600' };
}

export default useOfflineTimeRecords;