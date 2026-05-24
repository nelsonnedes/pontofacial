'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const ScheduleConfiguration = dynamic(() => import('@/components/admin/ScheduleConfiguration'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Carregando sistema de horários...</p>
      </div>
    </div>
  )
});

export default function AdminHorariosPage() {
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState({
    schedulesCount: 0,
    activeHolidays: 0,
    pendingPoints: 0,
    activeEmployees: 0,
    lastLoadedAt: new Date().toISOString(),
    error: ''
  });

  const loadScheduleStats = useCallback(async () => {
    setStatsLoading(true);

    try {
      const [schedulesResult, employeesResult, analysisResult, holidaysResult] = await Promise.allSettled([
        getDocs(collection(db, 'employee_schedules')),
        getDocs(collection(db, 'employees')),
        getDocs(collection(db, 'point_analysis')),
        getDocs(collection(db, 'holidays'))
      ]);

      let schedulesCount = 0;
      let activeEmployees = 0;
      let pendingPoints = 0;
      let activeHolidays = 0;

      if (schedulesResult.status === 'fulfilled') {
        schedulesCount = schedulesResult.value.size;
      }

      if (employeesResult.status === 'fulfilled') {
        employeesResult.value.forEach((document) => {
          const data = document.data();
          if (data.status !== 'inactive' && data.status !== 'demitido' && data.active !== false) {
            activeEmployees += 1;
          }
        });
      }

      if (analysisResult.status === 'fulfilled') {
        analysisResult.value.forEach((document) => {
          if (document.data().status === 'pending') {
            pendingPoints += 1;
          }
        });
      }

      if (holidaysResult.status === 'fulfilled') {
        holidaysResult.value.forEach((document) => {
          if (document.data().active !== false) {
            activeHolidays += 1;
          }
        });
      }

      const failedSources = [schedulesResult, employeesResult, analysisResult, holidaysResult]
        .filter((result) => result.status === 'rejected').length;

      setStats({
        schedulesCount,
        activeHolidays,
        pendingPoints,
        activeEmployees,
        lastLoadedAt: new Date().toISOString(),
        error: failedSources > 0
          ? `${failedSources} fonte(s) de dados de horários não responderam. Valores exibidos parcialmente.`
          : ''
      });
    } catch (error: any) {
      setStats((previous) => ({
        ...previous,
        error: error?.message || 'Não foi possível carregar os indicadores reais de horários.',
        lastLoadedAt: new Date().toISOString()
      }));
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadScheduleStats();
  }, [loadScheduleStats]);

  return (
    <div className="space-y-8">
      {/* ✅ HEADER DA PÁGINA */}
      <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg p-6 border border-gray-200/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">⏰ Configuração de Horários</h1>
            <p className="text-gray-600">
              Gerencie horários de trabalho, tolerâncias e feriados dos funcionários
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Sistema Atualizado</div>
            <div className="text-sm font-medium text-gray-900">
              {new Date(stats.lastLoadedAt).toLocaleString('pt-BR')}
            </div>
            <button
              type="button"
              onClick={loadScheduleStats}
              disabled={statsLoading}
              className="mt-1 text-xs text-blue-600 hover:text-blue-700 disabled:text-gray-400"
            >
              {statsLoading ? 'Atualizando' : 'Atualizar dados'}
            </button>
          </div>
        </div>
      </div>

      {stats.error && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          {stats.error}
        </div>
      )}

      {/* ✅ ESTATÍSTICAS RÁPIDAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg p-6 border border-blue-200/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Horários Configurados</p>
              <p className="text-2xl font-bold text-blue-600">{statsLoading ? '...' : stats.schedulesCount}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <span className="text-2xl">⏰</span>
            </div>
          </div>
        </div>
        
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg p-6 border border-green-200/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Feriados Ativos</p>
              <p className="text-2xl font-bold text-green-600">{statsLoading ? '...' : stats.activeHolidays}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <span className="text-2xl">✅</span>
            </div>
          </div>
        </div>
        
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg p-6 border border-yellow-200/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Análises Pendentes</p>
              <p className="text-2xl font-bold text-yellow-600">{statsLoading ? '...' : stats.pendingPoints}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
              <span className="text-2xl">⚠️</span>
            </div>
          </div>
        </div>
        
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg p-6 border border-purple-200/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Funcionários Ativos</p>
              <p className="text-2xl font-bold text-purple-600">{statsLoading ? '...' : stats.activeEmployees}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <span className="text-2xl">👥</span>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ COMPONENTE DE CONFIGURAÇÃO */}
      <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg border border-gray-200/50">
        <ScheduleConfiguration />
      </div>
    </div>
  );
}
