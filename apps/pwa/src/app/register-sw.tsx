'use client'
import { useEffect, useState } from 'react'

export default function RegisterSW() {
  const [mounted, setMounted] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)
  
  // Service Worker habilitado apenas em produção
  const isProduction = process.env.NODE_ENV === 'production';

  useEffect(() => {
    setMounted(true)
    if (!isProduction) {
      console.log('🚫 RegisterSW: Service Worker desabilitado em desenvolvimento')
    } else {
      console.log('🔄 RegisterSW: Service Worker habilitado para produção')
    }
  }, [isProduction])

  useEffect(() => {
    if (!mounted || typeof window === 'undefined') {
      return
    }

    if (!isProduction) {
      console.log('🚫 Service Worker desabilitado em desenvolvimento - realizando limpeza...')
      
      // Limpeza simplificada para desenvolvimento
      const cleanupDevelopment = async () => {
        try {
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations()
            for (const registration of registrations) {
              await registration.unregister()
              console.log('🧹 SW desregistrado:', registration.scope)
            }
          }
        } catch (error) {
          console.warn('⚠️ Erro na limpeza de SW em desenvolvimento:', error)
        }
      }
      
      const cleanupKey = 'sw-dev-cleanup'
      if (!sessionStorage.getItem(cleanupKey)) {
        sessionStorage.setItem(cleanupKey, 'true')
        cleanupDevelopment()
      }
      
      return
    }

    // 🚀 REGISTRAR SERVICE WORKER EM PRODUÇÃO
    console.log('🚀 Iniciando registro de Service Worker para produção...')
    let refreshing = false

    if (!('serviceWorker' in navigator)) {
      console.warn('⚠️ Service Worker não suportado neste navegador')
      return
    }

    const handleControllerChange = () => {
      if (refreshing) return
      refreshing = true
      console.log('🔄 Novo Service Worker assumiu controle')
    }

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_UPDATED') {
        console.log('🔄 Service Worker atualizado:', event.data.cacheName)
      }
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage)
    
    const registerServiceWorker = async () => {
      try {
        console.log('🔄 Registrando Service Worker...')
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none' // Sempre buscar atualizações
        })

        if (!registration) {
          console.warn('⚠️ Registro do Service Worker não retornou uma inscrição ativa')
          return null
        }

        console.log('✅ Service Worker registrado com sucesso:', registration.scope)

        // Verificar atualizações
        registration.addEventListener('updatefound', () => {
          console.log('🔄 Atualização do Service Worker encontrada')
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  console.log('🔄 Nova versão do Service Worker instalada')
                  setWaitingWorker(newWorker)
                  setUpdateAvailable(true)
                } else {
                  console.log('✅ Service Worker instalado pela primeira vez')
                }
              }
            })
          }
        })

        // Verificar por atualizações periodicamente (apenas em produção)
        setInterval(() => {
          registration.update().catch(err => {
            console.warn('⚠️ Erro ao verificar atualizações do SW:', err)
          })
        }, 60000) // Verificar a cada 1 minuto

        return registration

      } catch (error) {
        console.warn('⚠️ Service Worker indisponível ou bloqueado pelo navegador:', error)
        return null
      }
    }

    // Registrar com delay para não interferir na inicialização
    setTimeout(() => {
      registerServiceWorker().catch(error => {
        console.warn('⚠️ Falha controlada no registro do Service Worker:', error)
      })
    }, 2000)

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
      navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage)
    }

  }, [mounted, isProduction])

  const reloadApp = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' })
    }
    setUpdateAvailable(false)
    setTimeout(() => {
      window.location.reload()
    }, 500)
  }

  // Renderiza o prompt flutuante de atualização
  if (updateAvailable) {
    return (
      <div className="fixed bottom-4 right-4 bg-gray-900 border border-gray-800 text-white p-4 rounded-2xl shadow-2xl z-[9999] flex flex-col gap-3 max-w-sm animate-fade-in-up">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 rounded-full">
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </div>
          <p className="font-semibold text-sm">Nova atualização disponível!</p>
        </div>
        <div className="flex gap-2 w-full mt-1">
          <button onClick={reloadApp} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-xl text-xs font-bold transition-colors">
            Atualizar Agora
          </button>
          <button onClick={() => setUpdateAvailable(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-xl text-xs font-semibold transition-colors">
            Depois
          </button>
        </div>
      </div>
    )
  }

  return null
}
