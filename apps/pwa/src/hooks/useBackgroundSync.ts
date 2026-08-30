import { useEffect, useCallback, useRef, useState } from 'react';
import { offlineQueueManager } from '../lib/offline-queue';

interface BackgroundSyncOptions {
  onSyncStart?: () => void;
  onSyncComplete?: (result: { success: boolean; processed: number; failed: number }) => void;
  onSyncError?: (error: Error) => void;
  autoRegister?: boolean;
}

export function useBackgroundSync(options: BackgroundSyncOptions = {}) {
  const {
    onSyncStart,
    onSyncComplete,
    onSyncError,
    autoRegister = true
  } = options;

  // Service Worker habilitado em produção ou se explicitamente ativado em desenvolvimento
  const isProduction = 
    process.env.NODE_ENV === 'production' || 
    process.env.NEXT_PUBLIC_ENABLE_SW_DEV === 'true';

  const serviceWorkerRef = useRef<ServiceWorker | null>(null);
  const [mounted, setMounted] = useState(false);

  const getActiveServiceWorker = useCallback(async (): Promise<ServiceWorker | null> => {
    if (!mounted || typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !isProduction) {
      return null;
    }

    if (serviceWorkerRef.current) {
      return serviceWorkerRef.current;
    }

    const controller = navigator.serviceWorker.controller;
    if (controller) {
      serviceWorkerRef.current = controller;
      return controller;
    }

    const registration = await navigator.serviceWorker.getRegistration('/').catch(() => null);
    const activeWorker = registration?.active || null;

    if (activeWorker) {
      serviceWorkerRef.current = activeWorker;
    }

    return activeWorker;
  }, [mounted, isProduction]);

  useEffect(() => {
    setMounted(true);
    console.log('🟡 useBackgroundSync montado');
    return () => {
      setMounted(false);
      console.log('🟡 useBackgroundSync desmontado');
    };
  }, []);

  // Registrar service worker (apenas em produção)
  const registerServiceWorker = useCallback(async () => {
    if ('serviceWorker' in navigator && isProduction) {
      try {
        // Aguardar o documento estar completamente carregado
        if (document.readyState !== 'complete') {
          await new Promise(resolve => {
            if (document.readyState === 'complete') {
              resolve(undefined);
            } else {
              window.addEventListener('load', () => resolve(undefined), { once: true });
            }
          });
        }
        
        // Aguardar um pouco adicional para garantir estabilidade
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/'
        });
        console.log('Service Worker registered:', registration);
        
        // Aguardar o service worker estar ativo
        if (registration.active) {
          serviceWorkerRef.current = registration.active;
        } else if (registration.installing) {
          registration.installing.addEventListener('statechange', (event) => {
            const sw = event.target as ServiceWorker;
            if (sw.state === 'activated') {
              serviceWorkerRef.current = sw;
            }
          });
        }
        
        return registration;
      } catch (error) {
        console.error('Service Worker registration failed:', error);
        throw error;
      }
    } else {
      throw new Error('Service Worker not supported');
    }
  }, []);

  // Solicitar background sync com timeout
  const requestBackgroundSync = useCallback(() => {
    getActiveServiceWorker().then((serviceWorker) => {
      if (!serviceWorker) {
        console.warn('Service Worker not available for background sync');
        return;
      }

      const messageId = `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      try {
        serviceWorker.postMessage({
          type: 'SYNC_REQUEST',
          id: messageId,
          timestamp: Date.now()
        });
        console.log('Background sync requested:', messageId);
      } catch (error) {
        console.error('Falha ao solicitar background sync:', error);
      }
    });
  }, [getActiveServiceWorker]);

  // Testar conectividade com Service Worker
  const pingServiceWorker = useCallback(() => {
    return new Promise((resolve, reject) => {
      const activeWorker = serviceWorkerRef.current || navigator.serviceWorker?.controller || null;

      if (!activeWorker) {
        reject(new Error('Service Worker not available'));
        return;
      }

      const channel = new MessageChannel();
      const timeout = setTimeout(() => {
        reject(new Error('Ping timeout'));
      }, 5000);

      channel.port1.onmessage = (event) => {
        clearTimeout(timeout);
        if (event.data.type === 'PONG') {
          resolve(event.data.timestamp);
        } else {
          reject(new Error('Invalid response'));
        }
      };

      try {
        activeWorker.postMessage(
          { type: 'PING', timestamp: Date.now() },
          [channel.port2]
        );
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }, []);

  // Notificar sobre itens pendentes
  const notifyPendingItems = useCallback(() => {
    const activeWorker = serviceWorkerRef.current || navigator.serviceWorker?.controller || null;

    if (activeWorker) {
      const messageId = `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      activeWorker.postMessage({
        type: 'SYNC_REQUEST', // Usar tipo que o SW reconhece
        id: messageId,
        timestamp: Date.now()
      });
      console.log('Notified service worker about pending items:', messageId);
    }
  }, []);

  // Processar fila de sincronização com timeout aprimorado
  const processQueue = useCallback(async (port?: MessagePort) => {
    const startTime = Date.now();
    
    try {
      onSyncStart?.();
      console.log('Starting queue processing...');
      
      // Processar com timeout de 30 segundos
      await Promise.race([
        offlineQueueManager.forceSyncAll(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Queue processing timeout')), 30000)
        )
      ]);
      
      const stats = await offlineQueueManager.getQueueStats();
      const syncResult = {
        success: stats.failed === 0,
        processed: stats.completed,
        failed: stats.failed,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
      
      console.log('Queue processing completed:', syncResult);
      onSyncComplete?.(syncResult);
      
      // Responder ao service worker se um port foi fornecido
      if (port) {
        try {
          port.postMessage({
            type: 'SYNC_COMPLETE',
            ...syncResult
          });
        } catch (portError) {
          console.warn('⚠️ Falha ao responder via port (sucesso):', portError);
        }
      }
      
      return syncResult;
    } catch (error) {
      console.error('Queue processing failed:', error);
      onSyncError?.(error as Error);
      
      const errorResult = {
        type: 'SYNC_COMPLETE',
        success: false,
        processed: 0,
        failed: 0,
        error: (error as Error).message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
      
      // Responder ao service worker mesmo em caso de erro
      if (port) {
        try {
          port.postMessage(errorResult);
        } catch (portError) {
          console.warn('⚠️ Falha ao responder via port (erro):', portError);
        }
      }
      
      throw error;
    }
  }, [onSyncStart, onSyncComplete, onSyncError]);

  // Lidar com mensagens do service worker com timeout
  const handleServiceWorkerMessage = useCallback((event: MessageEvent) => {
    const { type, action, timestamp } = event.data;
    
    console.log('Received message from service worker:', { type, action, timestamp });
    
    // Verificar se a mensagem não é muito antiga (evitar processamento de mensagens órfãs)
    if (timestamp && Date.now() - timestamp > 10000) {
      console.warn('⚠️ Mensagem muito antiga ignorada:', { type, age: Date.now() - timestamp });
      return;
    }
    
    switch (type) {
      case 'TRIGGER_SYNC':
        // Sincronização imediata (fallback) com timeout
        Promise.race([
          processQueue(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Sync timeout')), 15000)
          )
        ]).catch((error) => {
          console.error('Sync timeout ou erro:', error);
        });
        break;
        
      case 'BACKGROUND_SYNC':
        if (action === 'PROCESS_QUEUE') {
          // Background sync com canal de comunicação e timeout
          const port = event.ports?.[0];
          Promise.race([
            processQueue(port),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Background sync timeout')), 20000)
            )
          ]).catch((error) => {
            console.error('Background sync timeout ou erro:', error);
            // Notificar erro via port se disponível
            if (port) {
              try {
                port.postMessage({
                  type: 'SYNC_COMPLETE',
                  success: false,
                  error: error.message,
                  timestamp: Date.now()
                });
              } catch (portError) {
                console.warn('⚠️ Falha ao responder erro via port:', portError);
              }
            }
          });
        }
        break;
        
      case 'CONNECTION_RESTORED':
        console.log('Connection restored, requesting background sync');
        // Aguardar um pouco antes de solicitar sync para evitar sobrecarga
        setTimeout(() => {
          requestBackgroundSync();
        }, 1000);
        break;
        
      case 'PONG':
        console.log('Service Worker respondeu ao ping:', timestamp);
        break;

      case 'SW_UPDATED':
        console.log('Service Worker atualizado:', timestamp);
        break;
        
      default:
        console.log('Unknown message type from service worker:', type);
    }
  }, [processQueue, requestBackgroundSync]);

  // Verificar se há suporte para Background Sync
  const isBackgroundSyncSupported = useCallback(() => {
    if (!mounted || typeof window === 'undefined') return false;
    return 'serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype;
  }, [mounted]);

  // Obter status da sincronização
  const getSyncStatus = useCallback(async () => {
    const stats = await offlineQueueManager.getQueueStats();
    const activeWorker = await getActiveServiceWorker();

    return {
      supported: isBackgroundSyncSupported(),
      serviceWorkerActive: !!activeWorker,
      pendingItems: stats.pending,
      processingItems: stats.processing,
      failedItems: stats.failed
    };
  }, [getActiveServiceWorker, isBackgroundSyncSupported]);

  useEffect(() => {
    if (!mounted) return;
    
    if (!isProduction) {
      console.log('🚫 useBackgroundSync desabilitado em desenvolvimento - Service Worker não registrado');
      return;
    }
    
    // Inicializar Service Worker em produção
    let timeoutId: NodeJS.Timeout | null = null;
    
    if (autoRegister) {
      timeoutId = setTimeout(() => {
        registerServiceWorker();
      }, 1200);
    }

    const handleControllerChange = () => {
      serviceWorkerRef.current = navigator.serviceWorker?.controller || null;
    };

    getActiveServiceWorker();
    navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage);
    navigator.serviceWorker?.addEventListener('controllerchange', handleControllerChange);

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage);
      navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange);
    };
  }, [mounted, autoRegister, registerServiceWorker, handleServiceWorkerMessage]);

  // Monitorar mudanças na conectividade
  useEffect(() => {
    if (!mounted || !isProduction) {
      if (!isProduction) {
        console.log('🚫 Monitoramento de conectividade desabilitado em desenvolvimento');
      }
      return;
    }
    
    const handleOnline = () => {
      console.log('📶 Conexão restaurada, solicitando sincronização');
      requestBackgroundSync();
    };

    const handleOffline = () => {
      console.log('📵 Conexão perdida');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [mounted, requestBackgroundSync]);

  return {
    registerServiceWorker,
    requestBackgroundSync,
    notifyPendingItems,
    processQueue,
    pingServiceWorker,
    getSyncStatus,
    isSupported: isBackgroundSyncSupported(),
    isBackgroundSyncSupported: isBackgroundSyncSupported()
  };
}

export default useBackgroundSync;
