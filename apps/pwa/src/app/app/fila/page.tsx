'use client'
import { notifyUser, confirmUser } from '@/lib/user-dialogs';
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { OfflineQueueDB, Pendencia, OfflineTimeRecord, queueManager } from '@/lib/offline-queue'
import { useSyncStatus } from '@/hooks/useSyncStatus'

export default function FilaPage() {
  const router = useRouter()
  const [pendencias, setPendencias] = useState<Pendencia[]>([])
  const [timeRecords, setTimeRecords] = useState<OfflineTimeRecord[]>([])
  const [isDebugMode, setIsDebugMode] = useState(false)
  const [isForcingSyncAll, setIsForcingSyncAll] = useState(false)
  const { isOnline, isSyncing, lastSyncTime, syncError, sync, refreshCount } = useSyncStatus()
  const isProduction = process.env.NODE_ENV === 'production'

  const loadPendencias = async () => {
    try {
      const db = new OfflineQueueDB()
      
      // Carregar pendências gerais
      const items = await db.pendencias.orderBy('createdAt').toArray()
      setPendencias(items)
      
      // Carregar registros de tempo não sincronizados
      const unsyncedRecords = await queueManager.getUnsyncedRecords()
      setTimeRecords(unsyncedRecords)
      
      refreshCount() // Atualizar contagem no hook
      
      console.log(`📊 Carregados: ${items.length} pendências gerais, ${unsyncedRecords.length} registros de tempo pendentes`)
    } catch (error) {
      console.error('Erro ao carregar pendências:', error)
    }
  }

  const handleSync = async () => {
    await sync()
    await loadPendencias()
  }

  const handleForceSyncAll = async () => {
    if (!isOnline) {
      notifyUser('Sem conexão com a internet!')
      return
    }
    
    setIsForcingSyncAll(true)
    try {
      console.log('🔄 FORÇANDO sincronização de todos os itens...')
      
      // Forçar sincronização através do queueManager
      const result = await queueManager.forceSyncAll()
      
      if (result.success) {
        notifyUser(`✅ Sincronização forçada concluída!\n${result.processed} itens processados.`)
      } else {
        throw new Error('Falha na sincronização forçada')
      }
      
      await loadPendencias()
    } catch (error) {
      console.error('Erro na sincronização forçada:', error)
      notifyUser(`❌ Erro na sincronização forçada:\n${error instanceof Error ? error.message : 'Erro desconhecido'}`)
    } finally {
      setIsForcingSyncAll(false)
    }
  }

  const handleClearAll = async () => {
    const totalItems = pendencias.length + timeRecords.length
    if (!confirmUser(`Tem certeza que deseja limpar todas as ${totalItems} pendência(s)?\n\n⚠️ Esta ação não pode ser desfeita!\n\nItens a serem removidos:\n• ${pendencias.length} pendências gerais\n• ${timeRecords.length} registros de tempo`)) {
      return
    }
    
    try {
      const db = new OfflineQueueDB()
      
      // Limpar pendências gerais
      await db.pendencias.clear()
      console.log('✅ Pendências gerais limpas')
      
      // Limpar registros de tempo
      await db.timeRecords.clear()
      console.log('✅ Registros de tempo limpos')
      
      await loadPendencias()
      notifyUser('✅ Todas as pendências foram removidas!')
    } catch (error) {
      console.error('Erro ao limpar pendências:', error)
      notifyUser(`❌ Erro ao limpar pendências:\n${error instanceof Error ? error.message : 'Erro desconhecido'}`)
    }
  }

  useEffect(() => {
    loadPendencias()
  }, [])
  // ✅ FIX: removido o useEffect que comparava pendingCount com pendencias.length
  // pois causava loop: pendingCount → loadPendencias → setPendencias → renderiza → compara → loop

  function formatDate(timestamp: number) {
    return new Date(timestamp).toLocaleString('pt-BR')
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/app')}
                className="flex items-center justify-center w-10 h-10 text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
              >
                <span className="text-lg">←</span>
              </button>
              <h1 className="text-2xl font-bold text-gray-900">Fila de Sincronização</h1>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={loadPendencias}
                className="px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                🔄 Atualizar
              </button>
            </div>
          </div>
          
          <p className="text-gray-600 text-sm">
            Marcações pendentes de sincronização com o servidor
          </p>
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-gray-600">
            <p className="font-semibold">
              📊 Total: {pendencias.length + timeRecords.length} item(ns) pendente(s)
            </p>
            <p className="text-xs mt-1">
              • {pendencias.length} pendência(s) geral(is) • {timeRecords.length} registro(s) de tempo
            </p>
            {lastSyncTime && (
              <p className="text-xs text-gray-500 mt-1">
                Última sincronização: {lastSyncTime.toLocaleString('pt-BR')}
              </p>
            )}
            {syncError && (
              <p className="text-xs text-red-500 mt-1">❌ {syncError}</p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleSync}
              disabled={isSyncing || !isOnline || (pendencias.length === 0 && timeRecords.length === 0)}
              className="px-3 py-2 text-sm bg-blue-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600"
            >
              {isSyncing ? '🔄 Sincronizando...' : '📤 Sincronizar'}
            </button>
            {!isProduction && (
              <>
                <button
                  onClick={handleForceSyncAll}
                  disabled={isForcingSyncAll || !isOnline || (pendencias.length === 0 && timeRecords.length === 0)}
                  className="px-3 py-2 text-sm bg-purple-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-600"
                >
                  {isForcingSyncAll ? '🔄 Forçando...' : '⚡ Força Total'}
                </button>
                <button
                  onClick={() => setIsDebugMode(!isDebugMode)}
                  className="px-3 py-2 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                >
                  {isDebugMode ? '🔍 Menos Info' : '🔍 Debug'}
                </button>
                <button
                  onClick={handleClearAll}
                  disabled={pendencias.length === 0 && timeRecords.length === 0}
                  className="px-3 py-2 text-sm bg-red-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-600"
                >
                  🗑️ Limpar Tudo
                </button>
              </>
            )}
          </div>
        </div>

        {!isOnline && (
          <div className="mb-4 p-3 bg-yellow-100 border border-yellow-300 rounded-lg">
            <p className="text-sm text-yellow-800">📶 Modo offline - As marcações serão sincronizadas quando a conexão for restabelecida</p>
          </div>
        )}

        {(pendencias.length === 0 && timeRecords.length === 0) ? (
          <div className="text-center py-8 text-gray-500">
            <p>✅ Nenhuma pendência local</p>
            <p className="text-sm mt-2">Confira o histórico para ver os registros confirmados pelo servidor</p>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* Registros de Tempo Pendentes */}
            {timeRecords.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                  🕒 Registros de Tempo ({timeRecords.length})
                  <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">NOVO SISTEMA</span>
                </h3>
                <div className="space-y-3">
                  {timeRecords.map((record) => {
                    const statusColor = {
                      'pending': 'bg-yellow-100 text-yellow-800',
                      'syncing': 'bg-blue-100 text-blue-800',
                      'failed': 'bg-red-100 text-red-800',
                      'synced': 'bg-green-100 text-green-800'
                    }[record.syncStatus] || 'bg-gray-100 text-gray-800'
                    
                    const statusIcon = {
                      'pending': '⏳',
                      'syncing': '🔄',
                      'failed': '❌',
                      'synced': '✅'
                    }[record.syncStatus] || '❓'

                    return (
                      <div key={record.id} className="border rounded-lg p-3 bg-white">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-sm">Registro de Ponto - {record.type}</p>
                            <p className="text-xs text-gray-600 mt-1">
                              📅 {formatDate(record.timestamp)}
                            </p>
                            <div className="mt-2 text-xs text-gray-500 space-y-1">
                              <p>👤 Usuário: {record.userId}</p>
                              <p>📱 Dispositivo: {record.deviceInfo.platform}</p>
                              {record.location && (
                                <p>📍 GPS: {record.location.latitude.toFixed(6)}, {record.location.longitude.toFixed(6)} (±{record.location.accuracy}m)</p>
                              )}
                              <p>🤳 Face ID: {record.faceEmbedding ? 'Sim' : 'Não'}</p>
                              <p>🔄 Tentativas: {record.syncAttempts}</p>
                              {record.syncError && (
                                <p className="text-red-600">⚠️ Erro: {record.syncError}</p>
                              )}
                              {isDebugMode && (
                                <div className="mt-2 p-2 bg-gray-100 rounded text-xs">
                                  <p><strong>Debug Info:</strong></p>
                                  <p>ID: {record.id}</p>
                                  <p>Criado: {formatDate(record.createdAt)}</p>
                                  <p>Atualizado: {formatDate(record.updatedAt)}</p>
                                  <p>UserAgent: {record.deviceInfo.userAgent.substring(0, 50)}...</p>
                                  {record.metadata && (
                                    <p>Metadata: {JSON.stringify(record.metadata)}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="ml-4">
                            <span className={`inline-block px-2 py-1 text-xs rounded ${statusColor}`}>
                              {statusIcon} {record.syncStatus}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Pendências Gerais (Sistema Antigo) */}
            {pendencias.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                  📋 Pendências Gerais ({pendencias.length})
                  <span className="ml-2 px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded">SISTEMA ANTIGO</span>
                </h3>
                <div className="space-y-3">
                  {pendencias.map((pendencia) => {
                    const payload = pendencia.payload
                    return (
                      <div key={pendencia.id} className="border rounded-lg p-3 bg-gray-50">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-sm">Marcação de Ponto</p>
                            <p className="text-xs text-gray-600 mt-1">
                              📅 {formatDate(pendencia.createdAt)}
                            </p>
                            <div className="mt-2 text-xs text-gray-500 space-y-1">
                              <p>👤 Usuário: {payload.userId}</p>
                              <p>🏢 Estabelecimento: {payload.estabId}</p>
                              {payload.lat && payload.lng && typeof payload.lat === 'number' && typeof payload.lng === 'number' && (
                                <p>📍 GPS: {payload.lat.toFixed(6)}, {payload.lng.toFixed(6)} (±{payload.acc || 0}m)</p>
                              )}
                              <p>📸 Foto capturada: {payload.dataUrl ? 'Sim' : 'Não'}</p>
                              {isDebugMode && (
                                <div className="mt-2 p-2 bg-gray-100 rounded text-xs">
                                  <p><strong>Debug Info:</strong></p>
                                  <p>ID: {pendencia.id}</p>
                                  <p>Status: {pendencia.status || 'pending'}</p>
                                  <p>Retry Count: {pendencia.retryCount || 0}</p>
                                  <p>Timestamp: {pendencia.timestamp}</p>
                                  <p>Payload: {JSON.stringify(payload, null, 2).substring(0, 200)}...</p>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="ml-4">
                            <span className="inline-block px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded">
                              ⏳ {pendencia.status || 'Pendente'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        </div>

        <div className="bg-blue-50 rounded-2xl p-6 border border-blue-200 mt-6">
          <h2 className="font-medium text-blue-900 mb-2">ℹ️ Como funciona</h2>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Quando offline, as marcações são salvas localmente</li>
            <li>• A sincronização acontece automaticamente quando a conexão volta</li>
            <li>• Você pode forçar a sincronização clicando no botão "Sincronizar"</li>
            <li>• As marcações são processadas na ordem que foram criadas</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
