'use client';

import GeofenceManager from '@/components/GeofenceManager';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface GeofencePageStats {
  activeFences: number;
  validationsToday: number;
  successRate: number | null;
  averageAccuracy: number | null;
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

function readAccuracy(value: any): number | null {
  const accuracy = Number(
    value?.geofence?.accuracy ??
    value?.location?.accuracy ??
    value?.localizacao?.precisao ??
    value?.gps?.accuracy
  );

  return Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null;
}

function hasGeofenceEvidence(value: any): boolean {
  return Boolean(value?.geofence || value?.geofenceValidation || value?.location || value?.localizacao || value?.gps);
}

function isGeofenceSuccess(value: any): boolean {
  if (value?.geofenceValidation) {
    return value.geofenceValidation.isValid === true;
  }

  return Boolean(value?.geofence || value?.location || value?.localizacao || value?.gps);
}

export default function AdminGeofencesPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState<GeofencePageStats>({
    activeFences: 0,
    validationsToday: 0,
    successRate: null,
    averageAccuracy: null,
    lastLoadedAt: null,
    error: null
  });

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  const loadGeofenceStats = useCallback(async () => {
    if (!user) {
      setStatsLoading(false);
      return;
    }

    setStatsLoading(true);

    try {
      const [geofencesResult, marcacoesResult, timeRecordsResult] = await Promise.allSettled([
        getDocs(collection(db, 'geofences')),
        getDocs(collection(db, 'marcacoes')),
        getDocs(collection(db, 'timeRecords'))
      ]);

      let activeFences = 0;
      let validationsToday = 0;
      let successfulValidations = 0;
      const accuracies: number[] = [];
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

      if (geofencesResult.status === 'fulfilled') {
        geofencesResult.value.forEach((document) => {
          if (document.data().active !== false) {
            activeFences += 1;
          }
        });
      }

      const countRecord = (data: any) => {
        const timestamp = normalizeTimestamp(data.timestamp || data.dataHoraTZ || data.createdAt || data.dataHora);
        if (timestamp < startOfDay || timestamp >= endOfDay || !hasGeofenceEvidence(data)) {
          return;
        }

        validationsToday += 1;

        if (isGeofenceSuccess(data)) {
          successfulValidations += 1;
        }

        const accuracy = readAccuracy(data);
        if (accuracy !== null) {
          accuracies.push(accuracy);
        }
      };

      if (marcacoesResult.status === 'fulfilled') {
        marcacoesResult.value.forEach((document) => countRecord(document.data()));
      }

      if (timeRecordsResult.status === 'fulfilled') {
        timeRecordsResult.value.forEach((document) => countRecord(document.data()));
      }

      const failedSources = [geofencesResult, marcacoesResult, timeRecordsResult]
        .filter((result) => result.status === 'rejected').length;

      setStats({
        activeFences,
        validationsToday,
        successRate: validationsToday > 0 ? Math.round((successfulValidations / validationsToday) * 100) : null,
        averageAccuracy: accuracies.length > 0
          ? Math.round(accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length)
          : null,
        lastLoadedAt: new Date().toISOString(),
        error: failedSources > 0
          ? `${failedSources} fonte(s) de dados de geofencing não responderam. Valores exibidos parcialmente.`
          : null
      });
    } catch (error: any) {
      setStats((previous) => ({
        ...previous,
        error: error?.message || 'Não foi possível carregar os indicadores reais de cercas virtuais.',
        lastLoadedAt: new Date().toISOString()
      }));
    } finally {
      setStatsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadGeofenceStats();
  }, [loadGeofenceStats]);

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
              href="/admin/empresas"
              className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium transition-colors"
            >
              🏢 Empresas
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
        {stats.error && (
          <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            {stats.error}
          </div>
        )}

        {/* Estatísticas rápidas */}
        <div className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="text-2xl text-blue-600 mr-4">🎯</div>
              <div>
                <p className="text-sm text-gray-500">Cercas Ativas</p>
                <p className="text-2xl font-bold text-gray-900">
                  {statsLoading ? '...' : stats.activeFences}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="text-2xl text-green-600 mr-4">✅</div>
              <div>
                <p className="text-sm text-gray-500">Validações Hoje</p>
                <p className="text-2xl font-bold text-gray-900">
                  {statsLoading ? '...' : stats.validationsToday}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="text-2xl text-yellow-600 mr-4">📊</div>
              <div>
                <p className="text-sm text-gray-500">Taxa de Sucesso</p>
                <p className="text-2xl font-bold text-gray-900">
                  {statsLoading ? '...' : stats.successRate === null ? 'Sem dados' : `${stats.successRate}%`}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="text-2xl text-purple-600 mr-4">📍</div>
              <div>
                <p className="text-sm text-gray-500">Precisão Média</p>
                <p className="text-2xl font-bold text-gray-900">
                  {statsLoading ? '...' : stats.averageAccuracy === null ? 'Sem dados' : `${stats.averageAccuracy}m`}
                </p>
                <button
                  type="button"
                  onClick={loadGeofenceStats}
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
