'use client'

import { useEffect } from 'react'
import consoleOptimizer from '../lib/console-optimizer'

/**
 * Console Optimizer Client Component
 * Carrega e ativa o console optimizer apenas no cliente
 */
export default function ConsoleOptimizerClient() {
  useEffect(() => {
    consoleOptimizer.initialize()
  }, [])

  // Este componente não renderiza nada
  return null
}
