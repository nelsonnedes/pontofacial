'use client'
import { useEffect, useState } from 'react'
import { auth } from '@/lib/firebase'
import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import Link from 'next/link'

export default function AppHome() {
  const [user, setUser] = useState<any>(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser: any) => {
      if (!currentUser) {
        router.push('/login')
      } else {
        setUser(currentUser)
      }
    })
    return () => unsubscribe()
  }, [router])

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const handleLogout = async () => {
    try {
      await signOut(auth)
      router.push('/login')
    } catch (error) {
      console.error('Erro ao fazer logout:', error)
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    )
  }

  const quickActions = [
    {
      title: 'Marcar Ponto',
      description: 'Registrar entrada, saída e pausas com reconhecimento facial',
      icon: '📍',
      href: '/app/marcar',
      bgColor: 'bg-blue-600',
      hoverColor: 'hover:bg-blue-700',
      iconBg: 'bg-blue-500',
      textColor: 'text-blue-100'
    },
    {
      title: 'Histórico',
      description: 'Visualizar todos os registros de ponto e relatórios',
      icon: '📊',
      href: '/app/historico',
      bgColor: 'bg-green-600',
      hoverColor: 'hover:bg-green-700',
      iconBg: 'bg-green-500',
      textColor: 'text-green-100'
    },
    {
      title: 'Comprovantes',
      description: 'Gerar e baixar documentos oficiais de frequência',
      icon: '📄',
      href: '/app/comprovantes',
      bgColor: 'bg-purple-600',
      hoverColor: 'hover:bg-purple-700',
      iconBg: 'bg-purple-500',
      textColor: 'text-purple-100'
    },
    {
      title: 'Fila de Sync',
      description: 'Visualizar marcações pendentes de sincronização',
      icon: '🔄',
      href: '/app/fila',
      bgColor: 'bg-orange-600',
      hoverColor: 'hover:bg-orange-700',
      iconBg: 'bg-orange-500',
      textColor: 'text-orange-100'
    },
    {
      title: 'Cadastro Facial',
      description: 'Configure seu reconhecimento facial para marcar ponto',
      icon: '🤳',
      href: '/app/cadastro-facial',
      bgColor: 'bg-pink-600',
      hoverColor: 'hover:bg-pink-700',
      iconBg: 'bg-pink-500',
      textColor: 'text-pink-100'
    },
    {
      title: 'Administração',
      description: 'Gerenciar usuários, configurações e relatórios do sistema',
      icon: '⚙️',
      href: '/admin',
      bgColor: 'bg-indigo-600',
      hoverColor: 'hover:bg-indigo-700',
      iconBg: 'bg-indigo-500',
      textColor: 'text-indigo-100'
    }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header com informações do usuário */}
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-8 mb-8 border border-white/50">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
            <div className="flex items-center gap-6">
              <div className="relative">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <span className="text-white text-2xl font-bold">
                    {user.email?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                </div>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-1">
                  Olá, {user.displayName || user.email?.split('@')[0]}!
                </h1>
                <p className="text-gray-600">
                  {formatDate(currentTime)}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-3xl font-mono font-bold text-gray-900">
                  {formatTime(currentTime)}
                </div>
                <div className="text-sm text-gray-500">
                  Horário atual
                </div>
              </div>
              
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-6 py-3 text-sm font-medium text-gray-700 bg-gray-100 rounded-2xl hover:bg-gray-200 transition-all duration-200 shadow-md hover:shadow-lg"
              >
                <span>🚪</span>
                Sair
              </button>
            </div>
          </div>
        </div>

        {/* Ações Rápidas */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Ações Rápidas</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {quickActions.map((action, index) => (
              <Link
                key={index}
                href={action.href}
                className={`${action.bgColor} ${action.hoverColor} text-white p-6 rounded-2xl transition-colors shadow-lg hover:shadow-xl group`}
              >
                <div className="flex items-center space-x-4">
                  <div className={`w-12 h-12 ${action.iconBg} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <span className="text-2xl">{action.icon}</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-1">{action.title}</h3>
                    <p className={`${action.textColor} text-sm`}>{action.description}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Cards de Status */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Status do Sistema</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl p-6 border border-white/50">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                </div>
                <h3 className="font-bold text-gray-900">Conexão</h3>
              </div>
              <p className="text-2xl font-bold text-green-600 mb-1">Online</p>
              <p className="text-sm text-gray-600">Sistema conectado e funcionando</p>
            </div>

            <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl p-6 border border-white/50">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center">
                  <span className="text-blue-600 text-xl">🕐</span>
                </div>
                <h3 className="font-bold text-gray-900">Último Ponto</h3>
              </div>
              <p className="text-2xl font-bold text-gray-900 mb-1">--:--</p>
              <p className="text-sm text-gray-600">Nenhum registro hoje</p>
            </div>

            <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl p-6 border border-white/50">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center">
                  <span className="text-orange-600 text-xl">📋</span>
                </div>
                <h3 className="font-bold text-gray-900">Pendências</h3>
              </div>
              <p className="text-2xl font-bold text-gray-900 mb-1">0</p>
              <p className="text-sm text-gray-600">Marcações na fila</p>
            </div>
          </div>
        </div>

        {/* Alerta de Cadastro Facial */}
        <div className="mb-8 bg-gradient-to-r from-pink-500 to-rose-600 rounded-2xl shadow-xl p-6 text-white">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <span className="text-2xl">🤳</span>
            </div>
            <h3 className="text-xl font-bold">Cadastro Facial Disponível</h3>
          </div>
          <p className="text-pink-100 mb-4">
            Configure seu reconhecimento facial para marcar ponto de forma mais rápida e segura. 
            Procure pelo cartão rosa "🤳 Cadastro Facial" na seção "Ações Rápidas" acima.
          </p>
          <div className="flex gap-3">
            <Link 
              href="/app/cadastro-facial"
              className="bg-white/20 hover:bg-white/30 px-6 py-2 rounded-lg transition-colors font-medium"
            >
              🤳 Fazer Cadastro Agora
            </Link>
            <span className="px-3 py-1 bg-white/10 rounded-full text-sm flex items-center">
              ✨ Recomendado
            </span>
          </div>
        </div>

        {/* Informações Adicionais */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl shadow-xl p-6 text-white">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <span className="text-2xl">💡</span>
            </div>
            <h3 className="text-xl font-bold">Dica do Sistema</h3>
          </div>
          <p className="text-blue-100 mb-4">
            Para marcar ponto, certifique-se de estar em um local bem iluminado e posicione seu rosto corretamente na câmera.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1 bg-white/20 rounded-full text-sm">📱 PWA Instalado</span>
            <span className="px-3 py-1 bg-white/20 rounded-full text-sm">🔒 Seguro</span>
            <span className="px-3 py-1 bg-white/20 rounded-full text-sm">⚡ Rápido</span>
          </div>
        </div>
      </div>
    </div>
  )
}
