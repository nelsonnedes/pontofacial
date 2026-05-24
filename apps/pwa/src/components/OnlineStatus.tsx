'use client'
import { useState, useEffect } from 'react'
import { useSyncStatus } from '@/hooks/useSyncStatus'

export default function OnlineStatus() {
  const { isOnline, isSyncing, pendingCount, lastSyncTime, syncError } = useSyncStatus()
  const [showStatus, setShowStatus] = useState(false)
  const [wasOffline, setWasOffline] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Evitar hydration mismatch - só renderizar no cliente
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isOnline) {
      setShowStatus(true)
      setWasOffline(true)
    } else if (wasOffline) {
      // Mostrar brevemente quando voltar online
      setShowStatus(true)
      setTimeout(() => setShowStatus(false), 3000)
      setWasOffline(false)
    } else if (pendingCount > 0) {
      // Mostrar se há pendências
      setShowStatus(true)
    } else {
      setShowStatus(false)
    }
  }, [isOnline, pendingCount, wasOffline])

  // Não renderizar no servidor para evitar hydration mismatch
  if (!mounted) {
    return null
  }

  // Mostrar sempre se offline, com pendências, sincronizando ou com erro
  const shouldShow = !isOnline || pendingCount > 0 || isSyncing || syncError || showStatus

  if (!shouldShow) {
    return null
  }

  const getStatusColor = () => {
    if (!isOnline) return 'bg-orange-500'
    if (syncError) return 'bg-red-500'
    if (isSyncing) return 'bg-blue-500'
    if (pendingCount > 0) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const getStatusIcon = () => {
    if (!isOnline) return '📶'
    if (syncError) return '❌'
    if (isSyncing) return '🔄'
    if (pendingCount > 0) return '📤'
    return '✅'
  }

  const getStatusText = () => {
    if (!isOnline) return 'Modo Offline'
    if (syncError) return 'Erro na Sincronização'
    if (isSyncing) return 'Sincronizando...'
    if (pendingCount > 0) return `${pendingCount} pendente${pendingCount > 1 ? 's' : ''}`
    return 'Rede ativa'
  }

  return (
    <div 
      className={`fixed top-4 right-4 z-50 px-3 py-2 rounded-lg shadow-lg transition-all duration-300 text-white ${
        getStatusColor()
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <div className={`w-2 h-2 rounded-full ${
          isSyncing ? 'animate-pulse bg-white' : 'bg-white bg-opacity-70'
        }`} />
        <span className={isSyncing ? 'animate-pulse' : ''}>
          {getStatusIcon()} {getStatusText()}
        </span>
      </div>
      
      {syncError && (
        <div className="text-xs mt-1 opacity-90">
          {syncError}
        </div>
      )}
      
      {lastSyncTime && pendingCount === 0 && isOnline && (
        <div className="text-xs mt-1 opacity-70">
          Última sync: {lastSyncTime.toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}
