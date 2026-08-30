'use client';

import { useState, useEffect } from 'react';
import { useOfflineTimeRecords, formatTimeRecordType, formatSyncStatus } from '@/hooks/useOfflineTimeRecords';
import { OfflineTimeRecord } from '@/lib/offline-queue';

interface OfflineStatusProps {
  className?: string;
  showDetails?: boolean;
  compact?: boolean;
}

export default function OfflineStatus({ 
  className = '', 
  showDetails = false,
  compact = false 
}: OfflineStatusProps) {
  const {
    isOnline,
    isLoading,
    error,
    queueStats,
    unsyncedRecords,
    getQueueStats,
    getUnsyncedRecords,
    forceSyncAll,
    clearError,
    getAutoSync,
    setAutoSync,
    backgroundSync
  } = useOfflineTimeRecords();

  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [autoSync, setAutoSyncState] = useState(true);
  const [syncStatus, setSyncStatus] = useState<any>(null);

  // Carregar configuração de sincronização automática
  useEffect(() => {
    loadAutoSyncSetting();
    loadSyncStatus();
  }, []);

  const loadSyncStatus = async () => {
    try {
      const status = await backgroundSync.getSyncStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error('Failed to load sync status:', error);
    }
  };

  const loadAutoSyncSetting = async () => {
    try {
      const enabled = await getAutoSync();
      setAutoSyncState(enabled);
    } catch (err) {
      console.error('Erro ao carregar configuração de sincronização automática:', err);
    }
  };

  const handleAutoSyncToggle = async (enabled: boolean) => {
    try {
      await setAutoSync(enabled);
      setAutoSyncState(enabled);
    } catch (err) {
      console.error('Erro ao alterar configuração de sincronização automática:', err);
    }
  };

  const handleForceSyncAll = async () => {
    const result = await forceSyncAll();
    if (result.success) {
      // Atualizar dados após sincronização
      setTimeout(() => {
        getQueueStats();
        getUnsyncedRecords();
      }, 3000);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Renderização compacta
  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {/* Indicador de conexão */}
        <div className={`w-3 h-3 rounded-full ${
          isOnline ? 'bg-green-500' : 'bg-red-500'
        }`} title={isOnline ? 'Online' : 'Offline'} />
        
        {/* Contador de itens não sincronizados */}
        {queueStats && queueStats.unsyncedTimeRecords > 0 && (
          <button
            onClick={() => setShowDetailsModal(true)}
            className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full hover:bg-orange-200 transition-colors"
          >
            {queueStats.unsyncedTimeRecords} pendente{queueStats.unsyncedTimeRecords !== 1 ? 's' : ''}
          </button>
        )}
        
        {/* Modal de detalhes */}
        {showDetailsModal && (
          <OfflineStatusModal
            onClose={() => setShowDetailsModal(false)}
            isOnline={isOnline}
            isLoading={isLoading}
            error={error}
            queueStats={queueStats}
            unsyncedRecords={unsyncedRecords}
            autoSync={autoSync}
            onAutoSyncToggle={handleAutoSyncToggle}
            onForceSyncAll={handleForceSyncAll}
            onClearError={clearError}
          />
        )}
      </div>
    );
  }

  // Renderização completa
  return (
    <div className={`bg-white rounded-lg shadow-md p-4 ${className}`}>
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          📡 Status de Sincronização
        </h3>
        <div className="flex items-center space-x-2">
          {isLoading && (
            <div className="flex items-center space-x-1 text-blue-600">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="text-sm">Sincronizando...</span>
            </div>
          )}
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
            isOnline 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              isOnline ? 'bg-green-500' : 'bg-red-500'
            }`} />
            {isOnline ? 'Online' : 'Offline'}
          </div>
        </div>
      </div>

      {/* Mensagem de erro */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start justify-between">
            <div className="flex items-start">
              <div className="text-red-600 mr-2">⚠️</div>
              <div className="text-sm text-red-700">{error}</div>
            </div>
            <button
              onClick={clearError}
              className="text-red-600 hover:text-red-700 ml-2"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Estatísticas da fila */}
      {queueStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="text-center p-3 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">{queueStats.pending}</div>
            <div className="text-xs text-yellow-700">Pendentes</div>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{queueStats.processing}</div>
            <div className="text-xs text-blue-700">Processando</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{queueStats.completed}</div>
            <div className="text-xs text-green-700">Concluídos</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">{queueStats.failed}</div>
            <div className="text-xs text-red-700">Falharam</div>
          </div>
        </div>
      )}

      {/* Background Sync Status */}
      {syncStatus && (
        <div className="bg-gray-50 p-4 rounded-lg mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Background Sync</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Suportado:</span>
              <span className={`ml-2 font-medium ${
                syncStatus.supported ? 'text-green-600' : 'text-red-600'
              }`}>
                {syncStatus.supported ? 'Sim' : 'Não'}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Service Worker:</span>
              <span className={`ml-2 font-medium ${
                syncStatus.serviceWorkerActive ? 'text-green-600' : 'text-red-600'
              }`}>
                {syncStatus.serviceWorkerActive ? 'Ativo' : 'Inativo'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Sincronização automática */}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoSync}
            onChange={(e) => handleAutoSyncToggle(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-gray-700">Sincronização automática</span>
        </label>

        {/* Botão de sincronização forçada */}
        {isOnline && queueStats && queueStats.unsyncedTimeRecords > 0 && (
          <button
            onClick={handleForceSyncAll}
            disabled={isLoading}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center space-x-1"
          >
            {isLoading && (
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
            )}
            <span>{isLoading ? 'Sincronizando...' : '🔄 Forçar Sincronização'}</span>
          </button>
        )}

        {/* Botão de detalhes */}
        {showDetails && (
          <button
            onClick={() => setShowDetailsModal(true)}
            className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
          >
            📋 Ver Detalhes
          </button>
        )}
      </div>

      {/* Lista de registros não sincronizados (resumida) */}
      {unsyncedRecords.length > 0 && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-900 mb-2">
            Registros Não Sincronizados ({unsyncedRecords.length})
          </h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {unsyncedRecords.slice(0, 5).map((record) => {
              const syncStatus = formatSyncStatus(record.syncStatus);
              return (
                <div key={record.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                  <div className="flex items-center gap-2">
                    <span>{formatTimeRecordType(record.type)}</span>
                    <span className="text-gray-500">
                      {formatTimestamp(record.timestamp)}
                    </span>
                  </div>
                  <span className={syncStatus.color}>{syncStatus.text}</span>
                </div>
              );
            })}
            {unsyncedRecords.length > 5 && (
              <div className="text-center text-sm text-gray-500">
                +{unsyncedRecords.length - 5} mais...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de detalhes */}
      {showDetailsModal && (
        <OfflineStatusModal
          onClose={() => setShowDetailsModal(false)}
          isOnline={isOnline}
          isLoading={isLoading}
          error={error}
          queueStats={queueStats}
          unsyncedRecords={unsyncedRecords}
          autoSync={autoSync}
          onAutoSyncToggle={handleAutoSyncToggle}
          onForceSyncAll={handleForceSyncAll}
          onClearError={clearError}
        />
      )}
    </div>
  );
}

// Componente do modal de detalhes
interface OfflineStatusModalProps {
  onClose: () => void;
  isOnline: boolean;
  isLoading: boolean;
  error: string | null;
  queueStats: any;
  unsyncedRecords: OfflineTimeRecord[];
  autoSync: boolean;
  onAutoSyncToggle: (enabled: boolean) => void;
  onForceSyncAll: () => void;
  onClearError: () => void;
}

function OfflineStatusModal({
  onClose,
  isOnline,
  isLoading,
  error,
  queueStats,
  unsyncedRecords,
  autoSync,
  onAutoSyncToggle,
  onForceSyncAll,
  onClearError
}: OfflineStatusModalProps) {
  const [expandedRecord, setExpandedRecord] = useState<number | null>(null);

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatLocation = (location?: OfflineTimeRecord['location']) => {
    if (!location) return 'Não disponível';
    return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)} (±${location.accuracy}m)`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            📡 Detalhes da Sincronização
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ✕
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Status de conexão */}
          <div className="mb-6">
            <div className={`flex items-center gap-3 p-4 rounded-lg ${
              isOnline 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-red-50 border border-red-200'
            }`}>
              <div className={`w-4 h-4 rounded-full ${
                isOnline ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <div>
                <div className={`font-medium ${
                  isOnline ? 'text-green-800' : 'text-red-800'
                }`}>
                  {isOnline ? '🟢 Conectado' : '🔴 Desconectado'}
                </div>
                <div className={`text-sm ${
                  isOnline ? 'text-green-600' : 'text-red-600'
                }`}>
                  {isOnline 
                    ? 'Sincronização automática ativa'
                    : 'Registros serão sincronizados quando houver conexão'
                  }
                </div>
              </div>
            </div>
          </div>

          {/* Erro */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start justify-between">
                <div className="flex items-start">
                  <div className="text-red-600 mr-2">⚠️</div>
                  <div className="text-sm text-red-700">{error}</div>
                </div>
                <button
                  onClick={onClearError}
                  className="text-red-600 hover:text-red-700 ml-2"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Estatísticas detalhadas */}
          {queueStats && (
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3">Estatísticas da Fila</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="text-3xl font-bold text-yellow-600">{queueStats.pending}</div>
                  <div className="text-sm text-yellow-700">Pendentes</div>
                </div>
                <div className="text-center p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-3xl font-bold text-blue-600">{queueStats.processing}</div>
                  <div className="text-sm text-blue-700">Processando</div>
                </div>
                <div className="text-center p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="text-3xl font-bold text-green-600">{queueStats.completed}</div>
                  <div className="text-sm text-green-700">Concluídos</div>
                </div>
                <div className="text-center p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="text-3xl font-bold text-red-600">{queueStats.failed}</div>
                  <div className="text-sm text-red-700">Falharam</div>
                </div>
              </div>
              <div className="mt-4 text-center text-sm text-gray-600">
                Total de registros: {queueStats.totalTimeRecords} | 
                Não sincronizados: {queueStats.unsyncedTimeRecords}
              </div>
            </div>
          )}

          {/* Controles */}
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => onAutoSyncToggle(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-700">Sincronização automática</span>
            </label>

            {isOnline && queueStats && queueStats.unsyncedTimeRecords > 0 && (
              <button
                onClick={onForceSyncAll}
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isLoading ? '🔄 Sincronizando...' : '🔄 Forçar Sincronização'}
              </button>
            )}
          </div>

          {/* Lista detalhada de registros */}
          {unsyncedRecords.length > 0 && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3">
                Registros Não Sincronizados ({unsyncedRecords.length})
              </h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {unsyncedRecords.map((record) => {
                  const syncStatus = formatSyncStatus(record.syncStatus);
                  const isExpanded = expandedRecord === record.id;
                  
                  return (
                    <div key={record.id} className="border border-gray-200 rounded-lg">
                      <div 
                        className="p-4 cursor-pointer hover:bg-gray-50"
                        onClick={() => setExpandedRecord(isExpanded ? null : record.id!)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-lg">{formatTimeRecordType(record.type)}</span>
                            <div>
                              <div className="font-medium text-gray-900">
                                {formatTimestamp(record.timestamp)}
                              </div>
                              <div className="text-sm text-gray-500">
                                Usuário: {record.userId.substring(0, 8)}...
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm ${syncStatus.color}`}>
                              {syncStatus.text}
                            </span>
                            <span className="text-gray-400">
                              {isExpanded ? '▼' : '▶'}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="px-4 pb-4 border-t bg-gray-50">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 text-sm">
                            <div>
                              <span className="font-medium text-gray-700">Localização:</span>
                              <div className="text-gray-600">{formatLocation(record.location)}</div>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">Tentativas de Sync:</span>
                              <div className="text-gray-600">{record.syncAttempts}</div>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">Dispositivo:</span>
                              <div className="text-gray-600">{record.deviceInfo.platform}</div>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">Offline:</span>
                              <div className="text-gray-600">
                                {record.metadata?.offline ? 'Sim' : 'Não'}
                              </div>
                            </div>
                            {record.syncError && (
                              <div className="md:col-span-2">
                                <span className="font-medium text-red-700">Erro:</span>
                                <div className="text-red-600">{record.syncError}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {unsyncedRecords.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-2">✅</div>
              <div>Todos os registros estão sincronizados!</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export type { OfflineStatusProps };
