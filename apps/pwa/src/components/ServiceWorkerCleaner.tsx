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
            // Substituir addEventListener para ignorar novos listeners
            navigator.serviceWorker.addEventListener = function(type: string, _listener: any, _options?: any) {
              console.log(`🚫 Bloqueando listener SW: ${type}`)
              // Não fazer nada - ignorar completamente
            }
            
            // Substituir postMessage para interceptar
            if (navigator.serviceWorker.controller) {
              navigator.serviceWorker.controller.postMessage = function(message: any, _transfer?: any) {
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
            
            // Permitir registros legítimos do próprio app
            const originalRegister = navigator.serviceWorker.register
            navigator.serviceWorker.register = function(scriptURL: string | URL, options?: RegistrationOptions) {
              // Permitir apenas o SW do nosso app
              const allowedSW = ['/sw.js']
              const url = typeof scriptURL === 'string' ? scriptURL : scriptURL.toString()
              
              if (allowedSW.some(allowed => url.endsWith(allowed))) {
                console.log('✅ Permitindo registro do SW legítimo:', url)
                return originalRegister.call(this, scriptURL, options)
              } else {
                console.log('🚫 Bloqueando registro de SW externo:', url)
                return Promise.reject(new Error('Service Worker externo bloqueado'))
              }
            }
            
          } catch (error) {
            console.warn('⚠️ Erro ao bloquear SW:', error)
          }
        }
        
        // Limpar mensagens de ping/pong problemáticas
        const clearPingMessages = () => {
          // Interceptar window.postMessage que pode estar gerando pings
          const originalPostMessage = window.postMessage.bind(window)
          window.postMessage = function(
            message: any,
            targetOriginOrOptions?: string | WindowPostMessageOptions,
            transfer?: Transferable[]
          ) {
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
            if (typeof targetOriginOrOptions === 'string') {
              return originalPostMessage(message, targetOriginOrOptions, transfer)
            }
            return originalPostMessage(message, targetOriginOrOptions)
          } as typeof window.postMessage
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
