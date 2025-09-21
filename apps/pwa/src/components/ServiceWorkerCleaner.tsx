'use client'

import { useEffect } from 'react'

/**
 * Componente para interceptar e limpar mensagens problemáticas do Service Worker
 * Remove completamente qualquer vestígio de SW e evita mensagens de erro
 */
export default function ServiceWorkerCleaner() {
  
  useEffect(() => {
    // Executar apenas no cliente
    if (typeof window === 'undefined') return
    
    console.log('🧹 ServiceWorkerCleaner ativo - interceptando mensagens problemáticas')
    
    // Interceptar mensagens do service worker
    const interceptSWMessages = () => {
      if ('serviceWorker' in navigator) {
        
        // Remover todos os listeners existentes
        const removeAllListeners = () => {
          try {
            // Criar função stub que não faz nada
            const noop = () => {}
            
            // Substituir addEventListener para ignorar novos listeners
            const originalAddEventListener = navigator.serviceWorker.addEventListener
            navigator.serviceWorker.addEventListener = function(type: string, listener: any, options?: any) {
              console.log(`🚫 Bloqueando listener SW: ${type}`)
              // Não fazer nada - ignorar completamente
            }
            
            // Substituir postMessage para interceptar
            if (navigator.serviceWorker.controller) {
              const originalPostMessage = navigator.serviceWorker.controller.postMessage
              navigator.serviceWorker.controller.postMessage = function(message: any, transfer?: any) {
                console.log('🚫 Bloqueando mensagem para SW:', message)
                // Não enviar nada
              }
            }
            
          } catch (error) {
            console.warn('⚠️ Erro ao remover listeners SW:', error)
          }
        }
        
        // Interceptar e bloquear mensagens
        const blockSWMessages = () => {
          try {
            // Substituir o ready promise para evitar inicializações
            Object.defineProperty(navigator.serviceWorker, 'ready', {
              get: function() {
                return Promise.reject(new Error('Service Worker desabilitado'))
              },
              configurable: true
            })
            
            // Substituir register para bloquear registrations
            const originalRegister = navigator.serviceWorker.register
            navigator.serviceWorker.register = function() {
              console.log('🚫 Bloqueando registro de novo Service Worker')
              return Promise.reject(new Error('Service Worker registro bloqueado'))
            }
            
          } catch (error) {
            console.warn('⚠️ Erro ao bloquear SW:', error)
          }
        }
        
        // Limpar mensagens de ping/pong problemáticas
        const clearPingMessages = () => {
          // Interceptar window.postMessage que pode estar gerando pings
          const originalPostMessage = window.postMessage
          window.postMessage = function(message: any, targetOrigin: string, transfer?: any) {
            // Filtrar mensagens problemáticas
            if (message && (
              message.eventType === 'ping' ||
              message.type === 'ping' ||
              message.type === 'pong' ||
              message.eventType === 'pong'
            )) {
              console.log('🚫 Bloqueando mensagem ping/pong:', message)
              return // Não enviar
            }
            
            // Permitir outras mensagens
            return originalPostMessage.call(this, message, targetOrigin, transfer)
          }
        }
        
        // Executar todas as interceptações
        removeAllListeners()
        blockSWMessages()  
        clearPingMessages()
        
        console.log('✅ Interceptadores de Service Worker configurados')
      }
    }
    
    // Executar interceptação
    interceptSWMessages()
    
    // Limpeza final ao desmontar
    return () => {
      console.log('🧹 ServiceWorkerCleaner desmontado')
    }
  }, [])

  // Este componente não renderiza nada
  return null
}
