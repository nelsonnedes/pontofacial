'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { syncPending } from '@/lib/sync'
import { OfflineQueueDB } from '@/lib/offline-queue'

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
  const [isClient, setIsClient] = useState(false)
  const isMountedRef = useRef(true)
  const syncInProgressRef = useRef(false)
  
  // Sincronização sempre habilitada (incluindo em desenvolvimento para testes)
  const DISABLE_SYNC = false; // Mudou: agora sempre ativo para funcionar em produção

  const updatePendingCount = async () => {
    try {
      const db = new OfflineQueueDB()
      const count = await db.pendencias.count()
      setStatus(prev => ({ ...prev, pendingCount: count }))
    } catch (error) {
      console.error('Erro ao contar pendências:', error)
    }
  }

  const performSync = useCallback(async () => {
    if (DISABLE_SYNC) {
      console.log('🚫 Sincronização desabilitada em desenvolvimento')
      return
    }
    
    if (!navigator.onLine || syncInProgressRef.current || !isMountedRef.current) return
    
    syncInProgressRef.current = true
    
    if (isMountedRef.current) {
      setStatus(prev => ({ ...prev, isSyncing: true, syncError: null }))
    }
    
    try {
      await syncPending()
      await updatePendingCount()
      
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
  }, [DISABLE_SYNC])

  useEffect(() => {
    isMountedRef.current = true
    
    // Marcar como cliente e definir estado real de conectividade
    setIsClient(true)
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
  }, []) // Dependências vazias para executar apenas uma vez

  // Sincronização periódica (habilitada para produção)
  useEffect(() => {
    if (!status.isOnline || DISABLE_SYNC) {
      if (DISABLE_SYNC) {
        console.log('🚫 Sincronização periódica desabilitada em desenvolvimento')
      }
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
  }, [status.isOnline, DISABLE_SYNC, performSync, updatePendingCount, status.pendingCount])

  return {
    ...status,
    sync: performSync,
    refreshCount: updatePendingCount
  }
}