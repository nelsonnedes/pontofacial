'use client';

import { useState, useEffect } from 'react';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { db as offlineDb } from '@/lib/offline-queue';

interface QueueStatusProps {
  className?: string;
  showDetails?: boolean;
  onSync?: () => void;
}

export default function QueueStatus({ 
  className = '', 
  showDetails = false, 
  onSync 
}: QueueStatusProps) {
  const { 
    isOnline, 
    isSyncing, 
    pendingCount, 
    lastSyncTime, 
    syncError, 
    sync 
  } = useSyncStatus();
  
  const { 
    isInitialized, 
    pendingRecords, 
    syncedRecords, 
    failedRecords, 
    isProcessing, 
    error: offlineError,
    forcSync,
    refresh: refreshOffline
  } = useOfflineSync();
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [queueDetails, setQueueDetails] = useState<any[]>([]);

  // Combinar erros de ambos os sistemas
  const combinedError = syncError || offlineError;
  const totalPending = pendingCount + pendingRecords;
  const isAnySyncing = isSyncing || isProcessing;

  const loadQueueDetails = async () => {
    if (showDetails || isExpanded) {
      try {
        const items = await offlineDb.pendencias.orderBy('createdAt').reverse().limit(10).toArray();
        setQueueDetails(items);
      } catch (error) {
        console.error('Erro ao carregar detalhes da fila:', error);
      }
    }
  };

  useEffect(() => {
    loadQueueDetails();
  }, [pendingCount, isExpanded, showDetails]);

  const handleSync = async () => {
    if (onSync) {
      onSync();
    } else {
      await sync();
      await forcSync();
    }
    await loadQueueDetails();
    await refreshOffline();
  };

  const getStatusColor = () => {
    if (combinedError) return 'bg-red-500';
    if (!isOnline) return 'bg-orange-500';
    if (isAnySyncing) return 'bg-yellow-500';
    if (totalPending > 0) return 'bg-orange-500';
    return 'bg-green-500';
  };

  const getStatusText = () => {
    if (combinedError) return 'Erro na sincronização';
    if (!isOnline) return 'Offline';
    if (isAnySyncing) return 'Sincronizando...';
    if (totalPending > 0) return `${totalPending} pendente${totalPending > 1 ? 's' : ''}`;
    return 'Sincronizado';
  };

  const formatDate = (timestamp: number | Date) => {
    return new Date(timestamp).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={`bg-white rounded-lg shadow-md border ${className}`}>
      {/* Status Principal */}
      <div 
        className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${getStatusColor()}`}></div>
            <div>
              <h3 className="font-semibold text-gray-900">Fila de Sincronização</h3>
              <p className="text-sm text-gray-600">{getStatusText()}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {pendingCount > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSync();
                }}
                disabled={isSyncing || !isOnline}
                className="px-3 py-1 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
              </button>
            )}
            
            <svg 
              className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Detalhes Expandidos */}
      {(isExpanded || showDetails) && (
        <div className="border-t border-gray-200">
          {/* Informações de Status */}
          <div className="p-4 bg-gray-50">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Status da Conexão:</span>
                <span className={`ml-2 font-semibold ${
                  isOnline ? 'text-green-600' : 'text-red-600'
                }`}>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              
              <div>
                <span className="text-gray-600">Última Sincronização:</span>
                <span className="ml-2 text-gray-900">
                  {lastSyncTime ? formatDate(lastSyncTime) : 'Nunca'}
                </span>
              </div>
              
              <div>
                <span className="text-gray-600">Pendentes:</span>
                <span className="ml-2 font-semibold text-orange-600">{totalPending}</span>
              </div>
              
              <div>
                <span className="text-gray-600">Sincronizados:</span>
                <span className="ml-2 font-semibold text-green-600">{syncedRecords}</span>
              </div>
              
              <div>
                <span className="text-gray-600">Falharam:</span>
                <span className="ml-2 font-semibold text-red-600">{failedRecords}</span>
              </div>
              
              <div>
                <span className="text-gray-600">Sistema Offline:</span>
                <span className={`ml-2 font-semibold ${
                  isInitialized ? 'text-green-600' : 'text-blue-600'
                }`}>
                  {isInitialized ? 'Inicializado' : 'Inicializando...'}
                </span>
              </div>
            </div>
            
            {combinedError && (
              <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                <strong>Erro:</strong> {combinedError}
              </div>
            )}
            
            {!isInitialized && (
              <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
                🔄 Inicializando sistema offline...
              </div>
            )}
          </div>

          {/* Lista de Itens Pendentes */}
          {queueDetails.length > 0 && (
            <div className="p-4">
              <h4 className="font-semibold text-gray-900 mb-3">Itens Pendentes</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {queueDetails.map((item, index) => (
                  <div key={item.id || index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {item.type === 'marcacao' ? 'Marcação de Ponto' : item.type}
                      </div>
                      <div className="text-xs text-gray-600">
                        {formatDate(item.createdAt)}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {item.retryCount > 0 && (
                        <span className="text-xs text-orange-600">
                          {item.retryCount} tentativa{item.retryCount > 1 ? 's' : ''}
                        </span>
                      )}
                      
                      <div className={`w-2 h-2 rounded-full ${
                        item.synced ? 'bg-green-500' : 
                        item.error ? 'bg-red-500' : 'bg-yellow-500'
                      }`}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {queueDetails.length === 0 && pendingCount === 0 && (
            <div className="p-4 text-center text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>Nenhum item pendente</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type { QueueStatusProps };
