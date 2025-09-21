'use client';

import React, { createContext, useContext, useEffect, useCallback, useRef, useState } from 'react';
import { useBackgroundSync } from '../hooks/useBackgroundSync';

interface BackgroundSyncContextType {
  isSupported: boolean;
  isServiceWorkerActive: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  requestSync: () => void;
  getSyncStatus: () => Promise<any>;
}

const BackgroundSyncContext = createContext<BackgroundSyncContextType | null>(null);

export function useBackgroundSyncContext() {
  const context = useContext(BackgroundSyncContext);
  if (!context) {
    throw new Error('useBackgroundSyncContext must be used within BackgroundSyncProvider');
  }
  return context;
}

interface BackgroundSyncProviderProps {
  children: React.ReactNode;
}

export function BackgroundSyncProvider({ children }: BackgroundSyncProviderProps) {
  const [mounted, setMounted] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isServiceWorkerActive, setIsServiceWorkerActive] = useState(false);

  // SEMPRE chamar o hook, independente do estado de montagem
  const backgroundSync = useBackgroundSync({
    autoRegister: false, // Desabilitar registro automático para evitar conflito
    onSyncStart: () => {
      setIsSyncing(true);
      console.log('🔄 Background sync started');
    },
    onSyncComplete: (result) => {
      setIsSyncing(false);
      setLastSyncTime(new Date());
      console.log('✅ Background sync completed:', result);
      
      // Mostrar notificação de sucesso se houver itens processados
      if (result.processed > 0) {
        showSyncNotification(`${result.processed} registros sincronizados com sucesso`);
      }
    },
    onSyncError: (error) => {
      setIsSyncing(false);
      console.error('❌ Background sync error:', error);
      showSyncNotification('Erro na sincronização. Tentando novamente...', 'error');
    }
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Verificar status do service worker periodicamente
  useEffect(() => {
    if (!mounted) return;
    
    let isActive = true;
    
    const checkServiceWorkerStatus = async () => {
      if (!isActive) return; // Evitar execução após cleanup
      
      try {
        const status = await backgroundSync.getSyncStatus();
        if (isActive) { // Verificar novamente antes de atualizar estado
          setIsServiceWorkerActive(status.serviceWorkerActive);
        }
      } catch (error) {
        console.error('Failed to check service worker status:', error);
        if (isActive) {
          setIsServiceWorkerActive(false);
        }
      }
    };

    checkServiceWorkerStatus();
    const interval = setInterval(checkServiceWorkerStatus, 30000); // Verificar a cada 30 segundos

    return () => {
      isActive = false; // Marcar como inativo
      clearInterval(interval);
    };
  }, [mounted]); // Remover backgroundSync da dependência

  // Mostrar notificações de sincronização
  const showSyncNotification = (message: string, type: 'success' | 'error' = 'success') => {
    // Verificar se o navegador suporta notificações
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Ponto Facial', {
        body: message,
        icon: '/icon-192x192.png',
        badge: '/icon-72x72.png',
        tag: 'sync-notification',
        silent: type === 'success' // Silencioso para sucessos, com som para erros
      });
    } else {
      // Fallback para console ou toast notification
      console.log(`📱 ${message}`);
    }
  };

  // Solicitar permissão para notificações na primeira vez
  useEffect(() => {
    if (!mounted) return;
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log('Notification permission:', permission);
      });
    }
  }, [mounted]);

  // Não renderizar contexto até estar montado no cliente, mas retornar valores padrão
  if (!mounted) {
    return (
      <BackgroundSyncContext.Provider value={{
        isSupported: false,
        isServiceWorkerActive: false,
        isSyncing: false,
        lastSyncTime: null,
        requestSync: () => {},
        getSyncStatus: async () => ({ supported: false, serviceWorkerActive: false, pendingItems: 0, processingItems: 0, failedItems: 0 })
      }}>
        {children}
      </BackgroundSyncContext.Provider>
    );
  }

  return (
    <BackgroundSyncContext.Provider value={{
      isSupported: backgroundSync.isSupported,
      isServiceWorkerActive,
      isSyncing,
      lastSyncTime,
      requestSync: backgroundSync.requestBackgroundSync,
      getSyncStatus: backgroundSync.getSyncStatus
    }}>
      {children}
      
      {/* Indicador visual de sincronização */}
      {isSyncing && (
        <div className="fixed top-4 right-4 z-50 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          <span className="text-sm font-medium">Sincronizando...</span>
        </div>
      )}
      
      {/* Indicador de service worker inativo */}
      {backgroundSync.isBackgroundSyncSupported && !isServiceWorkerActive && (
        <div className="fixed bottom-4 right-4 z-50 bg-yellow-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2">
          <span className="text-sm">⚠️</span>
          <span className="text-sm font-medium">Service Worker inativo</span>
          <button 
            onClick={() => window.location.reload()}
            className="ml-2 text-xs underline hover:no-underline"
          >
            Recarregar
          </button>
        </div>
      )}
    </BackgroundSyncContext.Provider>
  );
}

export default BackgroundSyncProvider;