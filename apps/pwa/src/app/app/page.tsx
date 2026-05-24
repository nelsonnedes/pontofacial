'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useFirebaseTimeRecords } from '@/hooks/useFirebaseTimeRecords'
import { useOfflineTimeRecords } from '@/hooks/useOfflineTimeRecords'
import { useAccessProfile } from '@/hooks/useAccessProfile'

export default function AppHome() {
  const [currentTime, setCurrentTime] = useState(new Date())
  const access = useAccessProfile()
  const { records, isLoading: recordsLoading } = useFirebaseTimeRecords()
  const { queueStats, isOnline } = useOfflineTimeRecords()

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const latestRecord = records[0]
  const pendingQueueCount = queueStats
    ? queueStats.pending + queueStats.syncing + queueStats.failed + queueStats.unsyncedTimeRecords
    : 0
  const latestRecordText = latestRecord
    ? formatTime(new Date(latestRecord.timestamp))
    : recordsLoading
      ? 'Carregando'
      : '--:--'
  const latestRecordDescription = latestRecord
    ? new Date(latestRecord.timestamp).toLocaleDateString('pt-BR')
    : recordsLoading
      ? 'Buscando último registro'
      : 'Nenhum registro encontrado'

  const quickActions = [
    {
      title: 'Marcar Ponto',
      description: 'Registrar entrada, saída e pausas com reconhecimento facial',
      icon: '📍',
      href: '/app/marcar',
      bgColor: 'bg-blue-600',
      hoverColor: 'hover:bg-blue-700',
      iconBg: 'bg-blue-500',
      textColor: 'text-blue-100',
      visible: access.isAdmin || access.hasPermission('app:mark-point')
    },
    {
      title: 'Histórico',
      description: 'Visualizar todos os registros de ponto e relatórios',
      icon: '📊',
      href: '/app/historico',
      bgColor: 'bg-green-600',
      hoverColor: 'hover:bg-green-700',
      iconBg: 'bg-green-500',
      textColor: 'text-green-100',
      visible: access.isAdmin || access.hasPermission('app:history')
    },
    {
      title: 'Comprovantes',
      description: 'Gerar prévias operacionais dos registros de frequência',
      icon: '📄',
      href: '/app/comprovantes',
      bgColor: 'bg-purple-600',
      hoverColor: 'hover:bg-purple-700',
      iconBg: 'bg-purple-500',
      textColor: 'text-purple-100',
      visible: access.isAdmin || access.hasPermission('app:receipts')
    },
    {
      title: 'Fila de Sync',
      description: 'Visualizar marcações pendentes de sincronização',
      icon: '🔄',
      href: '/app/fila',
      bgColor: 'bg-orange-600',
      hoverColor: 'hover:bg-orange-700',
      iconBg: 'bg-orange-500',
      textColor: 'text-orange-100',
      visible: access.isAdmin || access.hasPermission('app:sync-queue')
    },
    {
      title: 'Cadastro Facial',
      description: 'Configure seu reconhecimento facial para marcar ponto',
      icon: '🤳',
      href: '/app/verificar-face',
      bgColor: 'bg-pink-600',
      hoverColor: 'hover:bg-pink-700',
      iconBg: 'bg-pink-500',
      textColor: 'text-pink-100',
      visible: access.isAdmin || access.hasPermission('app:face-verification') || access.hasPermission('app:face-registration')
    },
    {
      title: 'Manual',
      description: 'Instruções de uso filtradas pelo seu perfil',
      icon: '📘',
      href: '/app/manual',
      bgColor: 'bg-slate-700',
      hoverColor: 'hover:bg-slate-800',
      iconBg: 'bg-slate-600',
      textColor: 'text-slate-100',
      visible: true
    },
    {
      title: 'Administração',
      description: 'Gerenciar usuários, configurações e relatórios do sistema',
      icon: '⚙️',
      href: '/admin',
      bgColor: 'bg-indigo-600',
      hoverColor: 'hover:bg-indigo-700',
      iconBg: 'bg-indigo-500',
      textColor: 'text-indigo-100',
      visible: access.isAdmin
    }
  ].filter(action => action.visible)

  return (
    <div className="space-y-8">
      {/* ✅ BOAS-VINDAS SIMPLIFICADO */}
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl shadow-xl p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">
              🎯 Sistema de Ponto Facial
            </h1>
            <p className="text-blue-100">
              Registre seu ponto de forma rápida e segura com reconhecimento facial
            </p>
          </div>
          
          <div className="text-right">
            <div className="text-3xl font-mono font-bold">
              {formatTime(currentTime)}
            </div>
            <div className="text-sm text-blue-100">
              Horário atual
            </div>
          </div>
        </div>
      </div>

      {/* ✅ AÇÕES RÁPIDAS GRID */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">⚡ Ações Rápidas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {quickActions.map((action, index) => (
            <Link
              key={index}
              href={action.href}
              className={`${action.bgColor} ${action.hoverColor} text-white p-6 rounded-2xl transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 group`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 ${action.iconBg} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <span className="text-2xl">{action.icon}</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-1">{action.title}</h3>
                  <p className={`${action.textColor} text-sm leading-relaxed`}>{action.description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ✅ STATUS DO SISTEMA */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">📊 Status do Sistema</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg p-6 border border-gray-200/50">
            <div className="flex items-center gap-4 mb-3">
              <div className={`${isOnline ? 'bg-green-100' : 'bg-red-100'} w-10 h-10 rounded-xl flex items-center justify-center`}>
                <div className={`${isOnline ? 'bg-green-500' : 'bg-red-500'} w-3 h-3 rounded-full animate-pulse`}></div>
              </div>
              <h3 className="font-semibold text-gray-900">Conexão do Dispositivo</h3>
            </div>
            <p className={`${isOnline ? 'text-green-600' : 'text-red-600'} text-xl font-bold mb-1`}>
              {isOnline ? 'Com internet' : 'Offline'}
            </p>
            <p className="text-sm text-gray-600">
              {isOnline ? 'Navegador com rede ativa' : 'Aguardando conexão'}
            </p>
          </div>

          <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg p-6 border border-gray-200/50">
            <div className="flex items-center gap-4 mb-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <span className="text-blue-600 text-lg">🕐</span>
              </div>
              <h3 className="font-semibold text-gray-900">Último Ponto</h3>
            </div>
            <p className="text-xl font-bold text-gray-900 mb-1">{latestRecordText}</p>
            <p className="text-sm text-gray-600">{latestRecordDescription}</p>
          </div>

          <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg p-6 border border-gray-200/50">
            <div className="flex items-center gap-4 mb-3">
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                <span className="text-orange-600 text-lg">📋</span>
              </div>
              <h3 className="font-semibold text-gray-900">Fila Sync</h3>
            </div>
            <p className="text-xl font-bold text-gray-900 mb-1">{pendingQueueCount}</p>
            <p className="text-sm text-gray-600">
              {queueStats ? 'Registros pendentes' : 'Verificando fila'}
            </p>
          </div>
        </div>
      </div>

      {/* ✅ DICA RÁPIDA */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl shadow-xl p-6 text-white">
        <div className="flex items-center gap-4 mb-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <span className="text-lg">💡</span>
          </div>
          <h3 className="text-lg font-bold">Dica para Marcar Ponto</h3>
        </div>
        <p className="text-emerald-100 mb-4 leading-relaxed">
          Para um reconhecimento facial eficiente: use boa iluminação, posicione o rosto no centro do círculo oval e mantenha a câmera na altura dos olhos.
        </p>
        <div className="flex flex-wrap gap-2">
          <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium">📱 PWA</span>
          <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium">🧾 Auditável</span>
          <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium">⚡ Rápido</span>
        </div>
      </div>
    </div>
  )
}
