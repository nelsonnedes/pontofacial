'use client'
import { useEffect, useState } from 'react'

export default function RegisterSW() {
  const [mounted, setMounted] = useState(false)
  
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
    
    const registerServiceWorker = async () => {
      try {
        if (!('serviceWorker' in navigator)) {
          console.log('❌ Service Worker não suportado neste navegador')
          return
        }

        console.log('🔄 Registrando Service Worker...')
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none' // Sempre buscar atualizações
        })

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
        console.error('❌ Erro ao registrar Service Worker:', error)
        throw error
      }
    }

    // Registrar com delay para não interferir na inicialização
    setTimeout(() => {
      registerServiceWorker().catch(error => {
        console.error('❌ Falha no registro do Service Worker:', error)
      })
    }, 2000)
    
  }, [mounted, isProduction])

  // Não renderizar nada
  return null
}