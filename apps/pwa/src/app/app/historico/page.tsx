'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useOfflineTimeRecords } from '@/hooks/useOfflineTimeRecords';
import { useFirebaseTimeRecords } from '@/hooks/useFirebaseTimeRecords';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type FilterPeriod = 'today' | 'week' | 'month' | 'all';
type RecordType = 'entry' | 'exit' | 'break_start' | 'break_end';

interface TimeRecord {
  id: number;
  userId: string;
  timestamp: number;
  type: RecordType;
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed';
  createdAt: number;
}

export default function HistoricoPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { unsyncedRecords, queueStats, getUnsyncedRecords, getQueueStats, isLoading: offlineLoading } = useOfflineTimeRecords();
  const { records: firebaseRecords, isLoading: firebaseLoading, loadRecordsByPeriod, totalCount: firebaseTotalCount } = useFirebaseTimeRecords();
  
  const [allRecords, setAllRecords] = useState<TimeRecord[]>([]);
  const isLoading = offlineLoading || firebaseLoading;
  
  const [filteredRecords, setFilteredRecords] = useState<TimeRecord[]>([]);
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('month');
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({
    total: 0,
    synced: 0,
    pending: 0,
    failed: 0
  });

  // Redirecionar se não autenticado
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Carregar dados iniciais
  useEffect(() => {
    if (user) {
      getUnsyncedRecords();
      getQueueStats();
    }
  }, [user, getUnsyncedRecords, getQueueStats]);

  // Validar e combinar dados offline e Firebase
  useEffect(() => {
    const combined: TimeRecord[] = [];
    
    // Adicionar registros offline (não sincronizados) - apenas válidos
    if (unsyncedRecords) {
      const validOfflineRecords = unsyncedRecords.filter(record => 
        record.userId && 
        record.timestamp && 
        record.type &&
        record.createdAt &&
        typeof record.timestamp === 'number' &&
        record.timestamp > 0
      );
      combined.push(...validOfflineRecords);
    }
    
    // Adicionar registros do Firebase (já sincronizados) - apenas válidos
    if (firebaseRecords) {
      const firebaseAsTimeRecords = firebaseRecords
        .filter(record => 
          record.userId && 
          record.timestamp && 
          record.type &&
          record.createdAt &&
          typeof record.timestamp === 'number' &&
          record.timestamp > 0
        )
        .map(record => ({
          id: parseInt(record.id) || Date.now(),
          userId: record.userId,
          timestamp: record.timestamp,
          type: record.type,
          location: record.location,
          syncStatus: 'synced' as const,
          createdAt: record.createdAt
        }));
      combined.push(...firebaseAsTimeRecords);
    }
    
    // Remover duplicatas e ordenar por timestamp (apenas registros válidos)
    const uniqueRecords = combined
      .filter((record, index, self) => 
        record.timestamp && 
        record.type &&
        index === self.findIndex(r => 
          Math.abs(r.timestamp - record.timestamp) < 1000 && // Menos de 1 segundo de diferença
          r.type === record.type
        )
      )
      .sort((a, b) => b.timestamp - a.timestamp);
    
    setAllRecords(uniqueRecords);
  }, [unsyncedRecords, firebaseRecords]);

  // Filtrar registros quando dados mudarem
  useEffect(() => {
    filterRecords();
    calculateStats();
  }, [allRecords, filterPeriod, searchTerm, queueStats, firebaseTotalCount]);

  const filterRecords = () => {
    if (!allRecords || allRecords.length === 0) {
      setFilteredRecords([]);
      return;
    }

    let filtered = [...allRecords];
    
    // Filtro por período
    const now = new Date();
    let startDate: Date;
    let endDate = now;
    
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
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
        break;
      default:
        startDate = new Date(0); // Início dos tempos
    }
    
    if (filterPeriod !== 'all') {
      filtered = filtered.filter(record => {
        const recordDate = new Date(record.timestamp);
        return recordDate >= startDate && recordDate <= endDate;
      });
    }
    
    // Filtro por busca
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(record => 
        record.type.toLowerCase().includes(term) ||
        format(new Date(record.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR }).includes(term)
      );
    }
    
    // Ordenar por timestamp decrescente
    filtered.sort((a, b) => b.timestamp - a.timestamp);
    
    setFilteredRecords(filtered);
  };

  const calculateStats = () => {
    if (allRecords && allRecords.length > 0) {
      const total = allRecords.length;
      const synced = allRecords.filter(r => r.syncStatus === 'synced').length;
      const pending = allRecords.filter(r => r.syncStatus === 'pending').length;
      const failed = allRecords.filter(r => r.syncStatus === 'failed').length;
      
      setStats({ total, synced, pending, failed });
    } else {
      // Usar dados das estatísticas offline e Firebase quando não há registros combinados
      const offlineTotal = queueStats?.totalTimeRecords || 0;
      const firebaseTotal = firebaseTotalCount || 0;
      const totalCombined = Math.max(offlineTotal, firebaseTotal); // Usar o maior valor disponível
      
      const statsData = {
        total: totalCombined,
        synced: queueStats?.completed || firebaseTotal,
        pending: queueStats?.pending || 0,
        failed: queueStats?.failed || 0
      };
      
      setStats(statsData);
    }
  };

  const formatDateTime = (timestamp: number) => {
    return format(new Date(timestamp), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR });
  };

  const formatLocation = (location?: { latitude: number; longitude: number; accuracy: number }) => {
    if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
      return 'Não disponível';
    }
    const accuracy = typeof location.accuracy === 'number' ? location.accuracy : 0;
    return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)} (±${Math.round(accuracy)}m)`;
  };

  const getTypeLabel = (type: RecordType) => {
    const labels = {
      'entry': 'Entrada',
      'exit': 'Saída', 
      'break_start': 'Início de Pausa',
      'break_end': 'Fim de Pausa'
    };
    return labels[type] || 'Registro Não Identificado';
  };

  const getTypeIcon = (type: RecordType) => {
    const icons = {
      'entry': '🟢',
      'exit': '🔴',
      'break_start': '⏸️',
      'break_end': '▶️'
    };
    return icons[type] || '📍';
  };

  const getSyncStatusBadge = (status: string) => {
    const badges = {
      'synced': { color: 'bg-green-100 text-green-800', label: 'Processado', icon: '✅' },
      'pending': { color: 'bg-yellow-100 text-yellow-800', label: 'Aguardando', icon: '⏳' },
      'syncing': { color: 'bg-blue-100 text-blue-800', label: 'Processando', icon: '🔄' },
      'failed': { color: 'bg-red-100 text-red-800', label: 'Erro', icon: '❌' }
    };
    
    const badge = badges[status as keyof typeof badges] || { color: 'bg-gray-100 text-gray-800', label: 'Desconhecido', icon: '❓' };
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${badge.color}`}>
        <span>{badge.icon}</span>
        {badge.label}
      </span>
    );
  };

  const exportToCSV = () => {
    if (filteredRecords.length === 0) {
      alert('Nenhum registro disponível para exportação.');
      return;
    }
    
    const csvContent = [
      ['Data e Hora', 'Tipo de Registro', 'Coordenadas GPS', 'Status de Processamento', 'ID do Registro'].join(','),
      ...filteredRecords.map(record => [
        `"${formatDateTime(record.timestamp)}"`,
        `"${getTypeLabel(record.type as RecordType)}"`,
        `"${formatLocation(record.location)}"`,
        `"${getSyncStatusBadge(record.syncStatus).props.children[1]}"`,
        record.id
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const timestamp = format(new Date(), 'yyyy-MM-dd_HHmm');
    link.setAttribute('href', url);
    link.setAttribute('download', `historico-ponto-eletronico-${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Feedback para o usuário
    alert(`✅ Arquivo exportado com sucesso!\n\n📊 ${filteredRecords.length} registro(s) exportado(s)\n📁 Nome: historico-ponto-eletronico-${timestamp}.csv`);
  };

  if (authLoading || isLoading) {
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/app')}
                className="flex items-center justify-center w-10 h-10 text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
              >
                <span className="text-lg">←</span>
              </button>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
                  📊 Histórico de Pontos
                </h1>
                <p className="text-gray-600 text-sm">
                  Visualize e gerencie seus registros de ponto
                </p>
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
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                🔄 Atualizar
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              </div>
              <div className="text-2xl">📊</div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Sincronizados</p>
                <p className="text-2xl font-bold text-green-600">{stats.synced}</p>
              </div>
              <div className="text-2xl">✅</div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pendentes</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
              </div>
              <div className="text-2xl">⏳</div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Falharam</p>
                <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
              </div>
              <div className="text-2xl">❌</div>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Filtro por período */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Período
              </label>
              <select
                value={filterPeriod}
                onChange={(e) => setFilterPeriod(e.target.value as FilterPeriod)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="today">Hoje</option>
                <option value="week">Esta Semana</option>
                <option value="month">Este Mês</option>
                <option value="all">Todos</option>
              </select>
            </div>
            
            {/* Busca */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Buscar
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por tipo ou data..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Lista de Registros */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tipo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Data/Hora
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Localização
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{getTypeIcon(record.type as RecordType)}</span>
                          <span className="text-sm font-medium text-gray-900">
                            {getTypeLabel(record.type as RecordType)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatDateTime(record.timestamp)}
                        </div>
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
    </div>
  );
}