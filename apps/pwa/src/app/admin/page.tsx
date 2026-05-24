'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useAccessProfile } from '@/hooks/useAccessProfile';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface SystemStats {
  totalUsers: number;
  todayRegistrations: number;
  activeGeofences: number;
  systemStatus: 'online' | 'maintenance' | 'error';
  lastSync: string;
}

function normalizeTimestamp(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const access = useAccessProfile();
  const [stats, setStats] = useState<SystemStats>({
    totalUsers: 0,
    todayRegistrations: 0,
    activeGeofences: 0,
    systemStatus: 'online',
    lastSync: new Date().toISOString()
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRealStats = async (isRefresh = false) => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        console.log('📊 Carregando estatísticas reais do sistema...');
        
        // Buscar dados reais do Firebase
        const [usuariosData, usersData, employeesData, marcacoesData, timeRecordsData, geofencesData] = await Promise.allSettled([
          getDocs(collection(db, 'usuarios')),
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'employees')),

          // Contar registros de marcações de hoje
          getDocs(collection(db, 'marcacoes')),
          
          // Contar registros de timeRecords de hoje
          getDocs(collection(db, 'timeRecords')),
          
          // Contar geofences ativas
          getDocs(query(collection(db, 'geofences'), where('active', '==', true)))
        ]);

        // Processar resultados
        let totalUsers = 0;
        let todayRegistrations = 0;
        let activeGeofences = 0;

        // Usuários/funcionários reais, deduplicados por id
        const knownPeople = new Set<string>();
        if (usersData.status === 'fulfilled') {
          usersData.value.forEach((doc) => knownPeople.add(doc.id));
        }
        if (usuariosData.status === 'fulfilled') {
          usuariosData.value.forEach((doc) => knownPeople.add(doc.id));
        }
        if (employeesData.status === 'fulfilled') {
          employeesData.value.forEach((doc) => knownPeople.add(doc.id));
        }
        totalUsers = knownPeople.size;

        // Marcações de hoje
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

        const seenToday = new Set<string>();
        if (marcacoesData.status === 'fulfilled') {
          marcacoesData.value.forEach((doc) => {
            const data = doc.data();
            const timestamp = normalizeTimestamp(data.timestamp || data.dataHoraTZ || data.createdAt);
            if (timestamp >= startOfDay && timestamp < endOfDay) {
              seenToday.add(data.timeRecordId || doc.id);
            }
          });
        }

        if (timeRecordsData.status === 'fulfilled') {
          timeRecordsData.value.forEach((doc) => {
            const data = doc.data();
            const timestamp = normalizeTimestamp(data.timestamp || data.dataHoraTZ || data.createdAt);
            if (timestamp >= startOfDay && timestamp < endOfDay) {
              seenToday.add(doc.id);
            }
          });
        }
        todayRegistrations = seenToday.size;

        // Geofences ativas
        if (geofencesData.status === 'fulfilled') {
          activeGeofences = geofencesData.value.size;
        }

        const newStats = {
          totalUsers,
          todayRegistrations,
          activeGeofences,
          systemStatus: 'online' as const,
          lastSync: new Date().toISOString()
        };

        console.log('📊 Estatísticas carregadas:', newStats);
        setStats(newStats);

      } catch (error) {
        console.error('❌ Erro ao carregar estatísticas:', error);
        setStats(prev => ({ 
          ...prev, 
          systemStatus: 'error',
          lastSync: new Date().toISOString()
        }));
      } finally {
        if (isRefresh) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    };

  const handleRefreshStats = async () => {
    setRefreshing(true);
    await loadRealStats(true);
  };

  useEffect(() => {
    loadRealStats();
  }, [user]);

  const statCards = [
    {
      title: 'Usuários Totais',
      value: stats.totalUsers,
      icon: '👥',
      color: 'blue',
      description: 'Usuários e funcionários cadastrados'
    },
    {
      title: 'Registros Hoje',
      value: stats.todayRegistrations,
      icon: '📊',
      color: 'green',
      description: 'Pontos marcados hoje'
    },
    {
      title: 'Cercas Virtuais',
      value: stats.activeGeofences,
      icon: '🎯',
      color: 'purple',
      description: 'Geofences ativas'
    },
    {
      title: 'Leitura Firestore',
      value: stats.systemStatus === 'online' ? 'Acessível' : 'Erro',
      icon: stats.systemStatus === 'online' ? '✅' : '❌',
      color: stats.systemStatus === 'online' ? 'green' : 'red',
      description: 'Resultado das leituras do dashboard'
    }
  ];

  const quickActions = [
    {
      title: 'Gerenciar Cercas Virtuais',
      description: 'Criar e editar geofences',
      href: '/admin/geofences',
      icon: '🎯',
      color: 'blue',
      visible: access.isAdmin || access.hasPermission('admin:geofences')
    },
    {
      title: 'Prévias de Relatórios',
      description: 'AFD, AEJ e espelho operacional',
      href: '/admin/reports',
      icon: '📄',
      color: 'green',
      visible: access.isAdmin || access.hasPermission('admin:reports')
    },
    {
      title: 'Configurações',
      description: 'Ajustes do sistema',
      href: '/admin/settings',
      icon: '⚙️',
      color: 'gray',
      visible: access.isAdmin || access.hasPermission('admin:settings')
    },
    {
      title: 'Gerenciar Usuários',
      description: 'Usuários e permissões',
      href: '/admin/users',
      icon: '👥',
      color: 'purple',
      visible: access.isAdmin || access.hasPermission('admin:users')
    },
    {
      title: 'Manual do Sistema',
      description: 'Instruções conforme suas permissões',
      href: '/admin/manual',
      icon: '📘',
      color: 'blue',
      visible: true
    }
  ].filter(action => action.visible);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-64 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white p-6 rounded-lg shadow-sm">
                <div className="h-16 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Título */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">📊 Dashboard</h2>
        <p className="text-gray-600 mt-1">
          Visão geral do sistema de ponto facial
        </p>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, index) => (
          <div key={index} className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  {card.title}
                </p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {card.description}
                </p>
              </div>
              <div className="text-4xl">
                {card.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Ações Rápidas */}
      <div>
        <h3 className="text-xl font-semibold text-gray-900 mb-4">
          🚀 Ações Rápidas
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action, index) => (
            <Link
              key={index}
              href={action.href}
              className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow"
            >
              <div className="text-center">
                <div className="text-4xl mb-3">{action.icon}</div>
                <h4 className="font-semibold text-gray-900 mb-2">
                  {action.title}
                </h4>
                <p className="text-sm text-gray-600">
                  {action.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Informações do Sistema */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            ℹ️ Informações do Sistema
          </h3>
          <button
            onClick={handleRefreshStats}
            disabled={refreshing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm"
          >
            {refreshing ? '🔄 Atualizando...' : '🔄 Atualizar Dados'}
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4">
          <div>
            <span className="font-medium text-gray-600">Versão:</span>
            <span className="ml-2 text-gray-900">PWA v1.0.0</span>
          </div>
          <div>
            <span className="font-medium text-gray-600">Última Sincronização:</span>
            <span className="ml-2 text-gray-900">
              {new Date(stats.lastSync).toLocaleString('pt-BR')}
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-600">Ambiente:</span>
            <span className="ml-2 text-gray-900">
              {process.env.NODE_ENV === 'development' ? '🔧 Desenvolvimento' : '🚀 Produção'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-600">Leitura do Firestore:</span>
            <span className={`ml-2 ${stats.systemStatus === 'online' ? 'text-green-600' : 'text-red-600'}`}>
              {stats.systemStatus === 'online' ? '✅ Acessível' : '❌ Erro'}
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-600">Última Atualização:</span>
            <span className="ml-2 text-gray-900">
              {new Date().toLocaleString('pt-BR')}
            </span>
          </div>
        </div>

        {stats.systemStatus === 'error' && (
          <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded-lg">
            <p className="text-sm text-red-800">
              ⚠️ Alguns dados podem estar desatualizados devido a problemas de conexão.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
