'use client';

import { notifyUser } from '@/lib/user-dialogs';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useOfflineTimeRecords } from '@/hooks/useOfflineTimeRecords';
import { useFirebaseTimeRecords } from '@/hooks/useFirebaseTimeRecords';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type FilterPeriod = 'today' | 'week' | 'month' | 'all';
type RecordType = 'entry' | 'exit' | 'break_start' | 'break_end';

interface TimeRecord {
  id: string | number;
  userId: string;
  timestamp: number;
  type: RecordType;
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed' | 'failed_permanent';
  createdAt: number;
}

export default function HistoricoPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { unsyncedRecords, queueStats, getUnsyncedRecords, getQueueStats } = useOfflineTimeRecords();
  const { records: firebaseRecords, isLoading: firebaseLoading } = useFirebaseTimeRecords();

  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('month');
  const [searchTerm, setSearchTerm] = useState('');

  // ✅ FIX: Redirecionar se não autenticado
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // ✅ FIX: Carregar dados offline apenas quando user disponível, sem deps instáveis
  useEffect(() => {
    if (!user) return;
    getUnsyncedRecords();
    getQueueStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]); // usar user.uid como dep estável, não funções

  // ✅ FIX: combinar registros com useMemo em vez de useEffect — sem loop de setState
  const allRecords = useMemo<TimeRecord[]>(() => {
    const combined: TimeRecord[] = [];

    // Adicionar registros offline (não sincronizados)
    if (unsyncedRecords) {
      unsyncedRecords
        .filter(r => r.userId && r.timestamp && r.type && typeof r.timestamp === 'number' && r.timestamp > 0)
        .forEach(r => {
          combined.push({
            id: r.id ?? Date.now(),
            userId: r.userId,
            timestamp: r.timestamp,
            type: r.type,
            location: r.location,
            syncStatus: r.syncStatus,
            createdAt: r.createdAt
          });
        });
    }

    // Adicionar registros do Firebase (sincronizados)
    if (firebaseRecords) {
      firebaseRecords
        .filter(r => r.userId && r.timestamp && r.type && typeof r.timestamp === 'number' && r.timestamp > 0)
        .forEach(r => {
          combined.push({
            id: r.id,
            userId: r.userId,
            timestamp: r.timestamp,
            type: r.type,
            location: r.location,
            syncStatus: 'synced' as const,
            createdAt: r.createdAt
          });
        });
    }

    // Deduplicar por timestamp+type (dentro de 1s) e ordenar
    const seen = new Set<string>();
    return combined
      .filter(r => {
        const key = `${Math.floor(r.timestamp / 1000)}_${r.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [unsyncedRecords, firebaseRecords]);

  // ✅ FIX: filtrar com useMemo — sem loop de setState
  const filteredRecords = useMemo(() => {
    let filtered = [...allRecords];

    // Filtro por período
    if (filterPeriod !== 'all') {
      const now = new Date();
      let startDate: Date;
      let endDate: Date = now;

      switch (filterPeriod) {
        case 'today':
          startDate = startOfDay(now);
          endDate = endOfDay(now);
          break;
        case 'week':
          startDate = startOfWeek(now, { locale: ptBR });
          endDate = endOfWeek(now, { locale: ptBR });
          break;
        case 'month':
        default:
          startDate = startOfMonth(now);
          endDate = endOfMonth(now);
          break;
      }

      filtered = filtered.filter(r => {
        const d = new Date(r.timestamp);
        return d >= startDate && d <= endDate;
      });
    }

    // Filtro por busca
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r =>
        r.type.toLowerCase().includes(term) ||
        format(new Date(r.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR }).includes(term)
      );
    }

    return filtered;
  }, [allRecords, filterPeriod, searchTerm]);

  // ✅ FIX: stats com useMemo — sem loop de setState
  const stats = useMemo(() => {
    if (allRecords.length > 0) {
      return {
        total: allRecords.length,
        synced: allRecords.filter(r => r.syncStatus === 'synced').length,
        pending: allRecords.filter(r => r.syncStatus === 'pending').length,
        failed: allRecords.filter(r => r.syncStatus === 'failed').length
      };
    }
    // Fallback para quando não há registros combinados
    const offlineTotal = queueStats?.totalTimeRecords || 0;
    const firebaseTotal = firebaseRecords?.length || 0;
    return {
      total: Math.max(offlineTotal, firebaseTotal),
      synced: queueStats?.syncedTimeRecords || firebaseTotal,
      pending: queueStats?.pending || 0,
      failed: queueStats?.failed || 0
    };
  }, [allRecords, queueStats, firebaseRecords]);

  const formatDateTime = (timestamp: number) =>
    format(new Date(timestamp), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR });

  const formatLocation = (location?: { latitude: number; longitude: number; accuracy: number }) => {
    if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
      return 'Não disponível';
    }
    const acc = typeof location.accuracy === 'number' ? location.accuracy : 0;
    return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)} (±${Math.round(acc)}m)`;
  };

  const getTypeLabel = (type: RecordType) => ({
    entry: 'Entrada',
    exit: 'Saída',
    break_start: 'Início de Pausa',
    break_end: 'Fim de Pausa'
  }[type] || 'Registro');

  const getTypeIcon = (type: RecordType) => ({
    entry: '🟢',
    exit: '🔴',
    break_start: '⏸️',
    break_end: '▶️'
  }[type] || '📍');

  const getSyncStatusBadge = (status: string) => {
    const badges: Record<string, { color: string; label: string; icon: string }> = {
      synced:  { color: 'bg-green-100 text-green-800',  label: 'Processado', icon: '✅' },
      pending: { color: 'bg-yellow-100 text-yellow-800', label: 'Aguardando', icon: '⏳' },
      syncing: { color: 'bg-blue-100 text-blue-800',   label: 'Processando', icon: '🔄' },
      failed:  { color: 'bg-red-100 text-red-800',     label: 'Erro',        icon: '❌' }
    };
    const badge = badges[status] || { color: 'bg-gray-100 text-gray-800', label: 'Desconhecido', icon: '❓' };
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${badge.color}`}>
        <span>{badge.icon}</span>
        {badge.label}
      </span>
    );
  };

  const exportToCSV = () => {
    if (filteredRecords.length === 0) {
      notifyUser('Nenhum registro disponível para exportação.');
      return;
    }
    const csvContent = [
      ['Data e Hora', 'Tipo de Registro', 'Coordenadas GPS', 'Status'].join(','),
      ...filteredRecords.map(r => [
        `"${formatDateTime(r.timestamp)}"`,
        `"${getTypeLabel(r.type)}"`,
        `"${formatLocation(r.location)}"`,
        `"${r.syncStatus}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const ts = format(new Date(), 'yyyy-MM-dd_HHmm');
    const link = document.createElement('a');
    link.href = url;
    link.download = `historico-ponto-${ts}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    notifyUser(`✅ ${filteredRecords.length} registro(s) exportado(s)`);
  };

  if (authLoading || firebaseLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando histórico...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-lg p-6 sm:p-8 lg:p-10 border border-gray-100 w-full max-w-6xl mx-auto shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      {/* Header */}
      <div className="border-b border-gray-150 pb-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/app')}
              className="flex items-center justify-center w-10 h-10 text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
            >
              <span className="text-lg">←</span>
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">📊 Histórico de Pontos</h1>
              <p className="text-gray-600 text-sm">Visualize e gerencie seus registros de ponto</p>
            </div>
          </div>
          <div className="mt-4 sm:mt-0 flex gap-2">
            <button
              onClick={exportToCSV}
              disabled={filteredRecords.length === 0}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              📥 Exportar CSV
            </button>
            <button
              onClick={() => { getUnsyncedRecords(); getQueueStats(); }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              🔄 Atualizar
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total', value: stats.total, icon: '📊', color: 'text-gray-900' },
          { label: 'Sincronizados', value: stats.synced, icon: '✅', color: 'text-green-600' },
          { label: 'Pendentes', value: stats.pending, icon: '⏳', color: 'text-yellow-600' },
          { label: 'Falharam', value: stats.failed, icon: '❌', color: 'text-red-600' }
        ].map(card => (
          <div key={card.label} className="bg-gray-50/80 rounded-2xl border border-gray-100/80 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{card.label}</p>
                <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
              </div>
              <div className="text-2xl">{card.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-gray-50/50 rounded-2xl border border-gray-100/50 p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Período</label>
            <select
              value={filterPeriod}
              onChange={e => setFilterPeriod(e.target.value as FilterPeriod)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="today">Hoje</option>
              <option value="week">Esta Semana</option>
              <option value="month">Este Mês</option>
              <option value="all">Todos</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Buscar</label>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por tipo ou data..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Lista de Registros */}
      <div className="border border-gray-200/80 rounded-2xl overflow-hidden bg-white">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Registros de Ponto</h2>
          <p className="text-gray-600 text-sm">
            {filteredRecords.length} registro{filteredRecords.length !== 1 ? 's' : ''} encontrado{filteredRecords.length !== 1 ? 's' : ''}
          </p>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-6xl mb-4">📭</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Nenhum registro encontrado</h3>
            <p className="text-gray-600">Tente ajustar os filtros ou marque seu primeiro ponto.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data/Hora</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Localização</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredRecords.map((record, idx) => (
                  <tr key={`${record.id}-${idx}`} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getTypeIcon(record.type)}</span>
                        <span className="text-sm font-medium text-gray-900">{getTypeLabel(record.type)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatDateTime(record.timestamp)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600 max-w-xs truncate" title={formatLocation(record.location)}>
                        {formatLocation(record.location)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getSyncStatusBadge(record.syncStatus)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}