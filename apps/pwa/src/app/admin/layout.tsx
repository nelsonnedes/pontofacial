'use client';

import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  // Aguardar carregamento da autenticação
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  // Verificar se usuário está logado
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <div className="bg-white rounded-lg shadow-md p-8">
            <div className="text-red-600 text-5xl mb-4">🚫</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Acesso Negado</h1>
            <p className="text-gray-600 mb-6">Você precisa estar logado para acessar o módulo administrativo.</p>
            <Link 
              href="/login" 
              className="inline-block bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
            >
              Fazer Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Menu de navegação admin
  const adminMenuItems = [
    { href: '/admin', label: '📊 Dashboard', icon: '📊' },
    { href: '/admin/geofences', label: '🎯 Cercas Virtuais', icon: '🎯' },
    { href: '/admin/reports', label: '📄 Relatórios', icon: '📄' },
    { href: '/admin/users', label: '👥 Usuários', icon: '👥' },
    { href: '/admin/settings', label: '⚙️ Configurações', icon: '⚙️' }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                🔧 Administração
              </h1>
              <p className="text-sm text-gray-600">Sistema de Ponto Facial</p>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">
                👋 Olá, <strong>{user.email}</strong>
              </span>
              <Link 
                href="/app" 
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm"
              >
                ← Voltar ao App
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <nav className="w-64 bg-white shadow-sm min-h-screen">
          <div className="p-4">
            <ul className="space-y-2">
              {adminMenuItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`
                        flex items-center space-x-3 px-4 py-2 rounded-md transition-colors
                        ${isActive 
                          ? 'bg-blue-100 text-blue-700 border-l-4 border-blue-700' 
                          : 'text-gray-700 hover:bg-gray-100'
                        }
                      `}
                    >
                      <span>{item.icon}</span>
                      <span>{item.label.replace(/^.+ /, '')}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
