'use client';

import dynamic from 'next/dynamic';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface HrStats {
  pendingPoints: number;
  activeVacations: number;
  activeMedicalLeaves: number;
  todayDelays: number;
  totalAnalysis: number;
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

function isDateInRange(startDate: string, endDate: string, today = new Date()): boolean {
  if (!startDate || !endDate) return false;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59`);

  return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && today >= start && today <= end;
}

const HRManagement = dynamic(() => import('@/components/admin/HRManagement'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Carregando sistema do RH...</p>
      </div>
    </div>
  )
});

export default function AdminRHPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState<HrStats>({
    pendingPoints: 0,
    activeVacations: 0,
    activeMedicalLeaves: 0,
    todayDelays: 0,
    totalAnalysis: 0,
    lastLoadedAt: null,
    error: null
  });

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  const loadHrStats = useCallback(async () => {
    if (!user) {
      setStatsLoading(false);
      return;
    }

    setStatsLoading(true);

    try {
      const [analysisResult, vacationResult, medicalResult] = await Promise.allSettled([
        getDocs(collection(db, 'point_analysis')),
        getDocs(collection(db, 'vacation_requests')),
        getDocs(collection(db, 'medical_leave_requests'))
      ]);

      let pendingPoints = 0;
      let todayDelays = 0;
      let totalAnalysis = 0;
      let activeVacations = 0;
      let activeMedicalLeaves = 0;
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

      if (analysisResult.status === 'fulfilled') {
        totalAnalysis = analysisResult.value.size;
        analysisResult.value.forEach((document) => {
          const data = document.data();
          if (data.status === 'pending') {
            pendingPoints += 1;
          }

          const timestamp = normalizeTimestamp(data.createdAt || data.date);
          if (timestamp >= startOfDay && timestamp < endOfDay && Number(data.delayMinutes || 0) > 0) {
            todayDelays += 1;
          }
        });
      }

      if (vacationResult.status === 'fulfilled') {
        vacationResult.value.forEach((document) => {
          const data = document.data();
          if (data.status !== 'rejected' && isDateInRange(data.startDate, data.endDate, today)) {
            activeVacations += 1;
          }
        });
      }

      if (medicalResult.status === 'fulfilled') {
        medicalResult.value.forEach((document) => {
          const data = document.data();
          if (data.status !== 'rejected' && isDateInRange(data.startDate, data.endDate, today)) {
            activeMedicalLeaves += 1;
          }
        });
      }

      const failedSources = [analysisResult, vacationResult, medicalResult]
        .filter((result) => result.status === 'rejected').length;

      setStats({
        pendingPoints,
        activeVacations,
        activeMedicalLeaves,
        todayDelays,
        totalAnalysis,
        lastLoadedAt: new Date().toISOString(),
        error: failedSources > 0
          ? `${failedSources} fonte(s) de dados do RH não responderam. Valores exibidos parcialmente.`
          : null
      });
    } catch (error: any) {
      setStats((previous) => ({
        ...previous,
        error: error?.message || 'Não foi possível carregar os indicadores reais do RH.',
        lastLoadedAt: new Date().toISOString()
      }));
    } finally {
      setStatsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadHrStats();
  }, [loadHrStats]);

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
                <h1 className="text-xl font-semibold text-gray-900">👔 Gerenciamento RH</h1>
                <p className="text-sm text-gray-500">Análise de pendências, férias e atestados</p>
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
              className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium transition-colors"
            >
              🏢 Empresas
            </Link>
            <Link
              href="/admin/horarios"
              className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium transition-colors"
            >
              ⏰ Horários
            </Link>
            <Link
              href="/admin/rh"
              className="text-blue-600 border-b-2 border-blue-600 px-3 py-2 text-sm font-medium"
            >
              👔 RH
            </Link>
            <Link
              href="/admin/geofences"
              className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium transition-colors"
            >
              🎯 Cercas Virtuais
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
          <div className="mb-8 grid grid-cols-1 md:grid-cols-5 gap-6">
            <div className="bg-gray-50/80 rounded-2xl border border-gray-100/80 p-6">
              <div className="flex items-center">
                <div className="text-2xl text-red-600 mr-4">🔍</div>
                <div>
                  <p className="text-sm text-gray-500">Pontos Pendentes</p>
                  <p className="text-2xl font-bold text-gray-900">{statsLoading ? '...' : stats.pendingPoints}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-50/80 rounded-2xl border border-gray-100/80 p-6">
              <div className="flex items-center">
                <div className="text-2xl text-blue-600 mr-4">🏖️</div>
                <div>
                  <p className="text-sm text-gray-500">Férias atuais</p>
                  <p className="text-2xl font-bold text-gray-900">{statsLoading ? '...' : stats.activeVacations}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-50/80 rounded-2xl border border-gray-100/80 p-6">
              <div className="flex items-center">
                <div className="text-2xl text-green-600 mr-4">🏥</div>
                <div>
                  <p className="text-sm text-gray-500">Atestados atuais</p>
                  <p className="text-2xl font-bold text-gray-900">{statsLoading ? '...' : stats.activeMedicalLeaves}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-50/80 rounded-2xl border border-gray-100/80 p-6">
              <div className="flex items-center">
                <div className="text-2xl text-yellow-600 mr-4">⏰</div>
                <div>
                  <p className="text-sm text-gray-500">Atrasos Hoje</p>
                  <p className="text-2xl font-bold text-gray-900">{statsLoading ? '...' : stats.todayDelays}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-50/80 rounded-2xl border border-gray-100/80 p-6">
              <div className="flex items-center">
                <div className="text-2xl text-purple-600 mr-4">📋</div>
                <div>
                  <p className="text-sm text-gray-500">Total Análises</p>
                  <p className="text-2xl font-bold text-gray-900">{statsLoading ? '...' : stats.totalAnalysis}</p>
                  <button
                    type="button"
                    onClick={loadHrStats}
                    disabled={statsLoading}
                    className="mt-1 text-xs text-blue-600 hover:text-blue-700 disabled:text-gray-400"
                  >
                    {statsLoading ? 'Atualizando' : 'Atualizar dados'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Alertas importantes */}
          <div className="mb-8">
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-blue-700">
                    <strong>Fluxo operacional:</strong> análises, férias e atestados desta tela são lidos das coleções do RH.
                    A aplicação em horários acontece somente quando o funcionário possui escala vinculada.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Componente de Gerenciamento RH */}
          <HRManagement />
        </main>
      </div>

      {/* Links úteis */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 mb-8">
        <div className="flex justify-center space-x-4">
          <Link
            href="/admin/horarios"
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            ⏰ Configurar Horários
          </Link>
          <Link
            href="/admin/reports"
            className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            📊 Ver Relatórios
          </Link>
          <Link
            href="/admin/users"
            className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            👥 Gerenciar Usuários
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t mt-12">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">
              Sistema de Ponto Facial PWA - Recursos Humanos v1.0
            </p>
            <p className="text-sm text-gray-400">
              Gestão de Pendências e Solicitações
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
