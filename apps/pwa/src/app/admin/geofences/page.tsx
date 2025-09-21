'use client';

import GeofenceManager from '@/components/GeofenceManager';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';

export default function AdminGeofencesPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verificando autenticação...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <Link
                href="/admin"
                className="text-gray-600 hover:text-gray-800"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">🎯 Cercas Virtuais</h1>
                <p className="text-sm text-gray-500">Gerenciamento de Geofencing</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Admin:</span>
              <span className="text-sm font-medium text-gray-900">{user.email}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navegação Admin */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8 py-3">
            <Link
              href="/admin"
              className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium transition-colors"
            >
              📊 Dashboard
            </Link>
            <Link
              href="/admin/geofences"
              className="text-blue-600 border-b-2 border-blue-600 px-3 py-2 text-sm font-medium"
            >
              🎯 Cercas Virtuais
            </Link>
            <Link
              href="/admin/users"
              className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium transition-colors"
            >
              👥 Usuários
            </Link>
            <Link
              href="/admin/reports"
              className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium transition-colors"
            >
              📋 Relatórios
            </Link>
          </nav>
        </div>
      </div>

      {/* Conteúdo Principal */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Estatísticas rápidas */}
        <div className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="text-2xl text-blue-600 mr-4">🎯</div>
              <div>
                <p className="text-sm text-gray-500">Cercas Ativas</p>
                <p className="text-2xl font-bold text-gray-900">-</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="text-2xl text-green-600 mr-4">✅</div>
              <div>
                <p className="text-sm text-gray-500">Validações Hoje</p>
                <p className="text-2xl font-bold text-gray-900">-</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="text-2xl text-yellow-600 mr-4">📊</div>
              <div>
                <p className="text-sm text-gray-500">Taxa de Sucesso</p>
                <p className="text-2xl font-bold text-gray-900">-%</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="text-2xl text-purple-600 mr-4">📍</div>
              <div>
                <p className="text-sm text-gray-500">Precisão Média</p>
                <p className="text-2xl font-bold text-gray-900">-m</p>
              </div>
            </div>
          </div>
        </div>

        {/* Componente de Gerenciamento */}
        <GeofenceManager />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-12">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">
              Sistema de Ponto Facial PWA - Geofencing v1.0
            </p>
            <p className="text-sm text-gray-400">
              Administração de Cercas Virtuais
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
