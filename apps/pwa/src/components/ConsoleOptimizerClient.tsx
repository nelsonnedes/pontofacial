'use client'

import { useEffect } from 'react'

/**
 * Console Optimizer Client Component
 * Carrega e ativa o console optimizer apenas no cliente
 */
export default function ConsoleOptimizerClient() {
  useEffect(() => {
    // Só ativar em desenvolvimento
    if (process.env.NODE_ENV !== 'development') {
      return
    }

    // Importar e ativar o console optimizer dinamicamente
    import('../lib/console-optimizer').then((module) => {
      // O optimizer é inicializado automaticamente na importação
      console.log('🎛️ Console Optimizer Client ativado via componente')
    }).catch((error) => {
      console.warn('⚠️ Erro ao carregar Console Optimizer:', error)
    })
  }, [])

  // Este componente não renderiza nada
  return null
}
