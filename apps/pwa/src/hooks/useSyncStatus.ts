'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { queueManager } from '@/lib/offline-queue'

interface SyncStatus {
  isOnline: boolean
  isSyncing: boolean
  pendingCount: number
  lastSyncTime: Date | null
  syncError: string | null
}

export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>({
    isOnline: true, // Inicializar sempre como true para evitar hydration mismatch
    isSyncing: false,
    pendingCount: 0,
    lastSyncTime: null,
    syncError: null
  })
  const isMountedRef = useRef(true)
  const syncInProgressRef = useRef(false)
  const pauseSyncRef = useRef(false) // NOVO: Pausar sincronização temporariamente

  const updatePendingCount = useCallback(async () => {
    try {
      const stats = await queueManager.getQueueStats()
      const count =
        stats.pending +
        stats.syncing +
        stats.failed +
        stats.unsyncedTimeRecords
      setStatus(prev => ({ ...prev, pendingCount: count }))
    } catch (error) {
      console.error('Erro ao contar pendências:', error)
    }
  }, [])

  const performSync = useCallback(async () => {
    if (pauseSyncRef.current) {
      console.log('⏸️ Sincronização pausada temporariamente')
      return
    }
    
    if (!navigator.onLine || syncInProgressRef.current || !isMountedRef.current) return
    
    syncInProgressRef.current = true
    
    if (isMountedRef.current) {
      setStatus(prev => ({ ...prev, isSyncing: true, syncError: null }))
    }
    
    try {
      const result = await queueManager.forceSyncAll()
      await updatePendingCount()

      if (!result.success) {
        throw new Error('Ainda há pendências que não puderam ser sincronizadas')
      }
      
      if (isMountedRef.current) {
        setStatus(prev => ({ 
          ...prev, 
          isSyncing: false, 
          lastSyncTime: new Date(),
          syncError: null 
        }))
      }
    } catch (error) {
      console.error('Erro na sincronização:', error)
      
      if (isMountedRef.current) {
        setStatus(prev => ({ 
          ...prev, 
          isSyncing: false, 
          syncError: error instanceof Error ? error.message : 'Erro desconhecido'
        }))
      }
    } finally {
      syncInProgressRef.current = false
    }
  }, [updatePendingCount])

  useEffect(() => {
    isMountedRef.current = true
    
    // Definir estado real de conectividade no cliente
    if (typeof navigator !== 'undefined') {
      setStatus(prev => ({ ...prev, isOnline: navigator.onLine }))
    }
    
    // Atualizar contagem inicial apenas uma vez
    updatePendingCount()

    console.log('🟡 useSyncStatus inicializado')
    
    return () => {
      isMountedRef.current = false
      syncInProgressRef.current = false
      console.log('🟡 useSyncStatus cleanup')
    }
  }, [updatePendingCount])

  useEffect(() => {
    const handleOnline = () => {
      if (!isMountedRef.current) return
      setStatus(prev => ({ ...prev, isOnline: true }))
      updatePendingCount()
    }

    const handleOffline = () => {
      if (!isMountedRef.current) return
      setStatus(prev => ({ ...prev, isOnline: false, isSyncing: false }))
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [updatePendingCount])

  // Sincronização periódica (habilitada para produção)
  useEffect(() => {
    if (!status.isOnline) {
      return
    }

    console.log('🔄 Sincronização periódica habilitada para produção')
    const interval = setInterval(() => {
      if (navigator.onLine && !syncInProgressRef.current) {
        if (status.pendingCount > 0) {
          performSync()
        } else {
          updatePendingCount()
        }
      }
    }, 30000) // Sincronizar a cada 30 segundos

    return () => clearInterval(interval)
  }, [status.isOnline, performSync, updatePendingCount, status.pendingCount])

  // NOVO: Função para pausar/despausar sincronização
  const pauseSync = useCallback((duration = 60000) => {
    pauseSyncRef.current = true
    console.log(`⏸️ Sincronização pausada por ${duration}ms`)
    setTimeout(() => {
      pauseSyncRef.current = false
      console.log('▶️ Sincronização reativada')
    }, duration)
  }, [])

  return {
    ...status,
    sync: performSync,
    refreshCount: updatePendingCount,
    pauseSync // NOVO: Exportar função de pausa
  }
}
