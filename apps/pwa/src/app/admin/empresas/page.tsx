'use client';

import dynamic from 'next/dynamic';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface CompanyPageStats {
  totalCompanies: number;
  activeCompanies: number;
  companiesWithGps: number;
  totalEmployees: number;
  todayRecords: number;
  lastLoadedAt: string | null;
  error: string | null;
}

function normalizeTimestamp(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function hasValidGps(value: any): boolean {
  const coordinates = value?.coordenadas || value?.coordinates || value?.location || {};
  const latitude = Number(coordinates.latitude ?? value?.latitude);
  const longitude = Number(coordinates.longitude ?? value?.longitude);

  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

const CompanyRegistrationForm = dynamic(() => import('@/components/admin/CompanyRegistrationForm'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Carregando sistema de empresas...</p>
      </div>
    </div>
  )
});

export default function AdminEmpresasPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState<CompanyPageStats>({
    totalCompanies: 0,
    activeCompanies: 0,
    companiesWithGps: 0,
    totalEmployees: 0,
    todayRecords: 0,
    lastLoadedAt: null,
    error: null
  });

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  const loadCompanyStats = useCallback(async () => {
    if (!user) {
      setStatsLoading(false);
      return;
    }

    setStatsLoading(true);

    try {
      const [companiesResult, employeesResult, marcacoesResult, timeRecordsResult] = await Promise.allSettled([
        getDocs(collection(db, 'empresas')),
        getDocs(collection(db, 'employees')),
        getDocs(collection(db, 'marcacoes')),
        getDocs(collection(db, 'timeRecords'))
      ]);

      let totalCompanies = 0;
      let activeCompanies = 0;
      let companiesWithGps = 0;
      let totalEmployees = 0;
      const todayRecordKeys = new Set<string>();
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

      if (companiesResult.status === 'fulfilled') {
        companiesResult.value.forEach((document) => {
          const data = document.data();
          totalCompanies += 1;

          if (data.ativo !== false && data.active !== false) {
            activeCompanies += 1;
          }

          if (hasValidGps(data)) {
            companiesWithGps += 1;
          }
        });
      }

      if (employeesResult.status === 'fulfilled') {
        employeesResult.value.forEach((document) => {
          const data = document.data();
          if (data.status !== 'inactive' && data.status !== 'demitido' && data.active !== false) {
            totalEmployees += 1;
          }
        });
      }

      if (marcacoesResult.status === 'fulfilled') {
        marcacoesResult.value.forEach((document) => {
          const data = document.data();
          const timestamp = normalizeTimestamp(data.timestamp || data.dataHoraTZ || data.createdAt || data.dataHora);

          if (timestamp >= startOfDay && timestamp < endOfDay) {
            todayRecordKeys.add(data.timeRecordId || `marcacao:${document.id}`);
          }
        });
      }

      if (timeRecordsResult.status === 'fulfilled') {
        timeRecordsResult.value.forEach((document) => {
          const data = document.data();
          const timestamp = normalizeTimestamp(data.timestamp || data.dataHoraTZ || data.createdAt || data.dataHora);

          if (timestamp >= startOfDay && timestamp < endOfDay) {
            todayRecordKeys.add(`timeRecord:${document.id}`);
          }
        });
      }

      const failedCollections = [
        companiesResult,
        employeesResult,
        marcacoesResult,
        timeRecordsResult
      ].filter((result) => result.status === 'rejected').length;

      setStats({
        totalCompanies,
        activeCompanies,
        companiesWithGps,
        totalEmployees,
        todayRecords: todayRecordKeys.size,
        lastLoadedAt: new Date().toISOString(),
        error: failedCollections > 0
          ? `${failedCollections} fonte(s) de dados não responderam. Valores exibidos parcialmente.`
          : null
      });
    } catch (error: any) {
      setStats((previous) => ({
        ...previous,
        error: error?.message || 'Não foi possível carregar os dados reais da página.',
        lastLoadedAt: new Date().toISOString()
      }));
    } finally {
      setStatsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadCompanyStats();
  }, [loadCompanyStats]);

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
                <h1 className="text-xl font-semibold text-gray-900">🏢 Gerenciamento de Empresas</h1>
                <p className="text-sm text-gray-500">Cadastro e configuração de empresas</p>
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
              href="/admin/empresas"
              className="text-blue-600 border-b-2 border-blue-600 px-3 py-2 text-sm font-medium"
            >
              🏢 Empresas
            </Link>
            <Link
              href="/admin/geofences"
              className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium transition-colors"
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
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <main className="bg-white rounded-3xl shadow-lg border border-gray-100 p-6 sm:p-8 lg:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] mt-6">
          {stats.error && (
            <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
              {stats.error}
            </div>
          )}

          {/* Estatísticas rápidas */}
          <div className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-gray-50/80 rounded-2xl border border-gray-100/80 p-6">
              <div className="flex items-center">
                <div className="text-2xl text-blue-600 mr-4">🏢</div>
                <div>
                  <p className="text-sm text-gray-500">Empresas cadastradas</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {statsLoading ? '...' : stats.totalCompanies}
                  </p>
                  <p className="text-xs text-gray-400">
                    {statsLoading ? 'Carregando' : `${stats.activeCompanies} ativa(s)`}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-50/80 rounded-2xl border border-gray-100/80 p-6">
              <div className="flex items-center">
                <div className="text-2xl text-green-600 mr-4">📍</div>
                <div>
                  <p className="text-sm text-gray-500">Com GPS válido</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {statsLoading ? '...' : stats.companiesWithGps}
                  </p>
                  <p className="text-xs text-gray-400">Coordenadas reais</p>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-50/80 rounded-2xl border border-gray-100/80 p-6">
              <div className="flex items-center">
                <div className="text-2xl text-yellow-600 mr-4">👥</div>
                <div>
                  <p className="text-sm text-gray-500">Funcionários ativos</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {statsLoading ? '...' : stats.totalEmployees}
                  </p>
                  <p className="text-xs text-gray-400">Cadastros ativos</p>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-50/80 rounded-2xl border border-gray-100/80 p-6">
              <div className="flex items-center">
                <div className="text-2xl text-purple-600 mr-4">⏰</div>
                <div>
                  <p className="text-sm text-gray-500">Registros hoje</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {statsLoading ? '...' : stats.todayRecords}
                  </p>
                  <button
                    type="button"
                    onClick={loadCompanyStats}
                    disabled={statsLoading}
                    className="mt-1 text-xs text-blue-600 hover:text-blue-700 disabled:text-gray-400"
                  >
                    {statsLoading ? 'Atualizando' : 'Atualizar dados'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Componente de Gerenciamento */}
          <CompanyRegistrationForm />
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t mt-12">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">
              Sistema de Ponto Facial PWA - Empresas v1.0
            </p>
            <p className="text-sm text-gray-400">
              Administração de Empresas
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
