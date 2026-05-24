'use client';

import { notifyUser } from '@/lib/user-dialogs';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { collection, getDocs, query, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface RegistroPendente {
  id: string;
  usuarioId: string;
  usuarioNome?: string;
  usuarioEmail?: string;
  timestamp: number;
  dataHoraTZ: string;
  tipo: string;
  origem: string;
  fotoPath?: string;
  photoHash?: string;
  faceEmbedding?: any;
  hasFacialValidation: boolean;
  facialSimilarity?: number | null;
  facialConfidence?: number | null;
  gps?: {
    lat: number;
    lng: number;
    accuracy: number;
  };
  status: 'pendente' | 'aprovado' | 'rejeitado';
  motivoCaptura: string;
  aprovadoPor?: string;
  aprovadoEm?: number;
  observacoes?: string;
  nsr?: number;
}

type StatusFilter = 'todos' | 'pendente' | 'aprovado' | 'rejeitado';

const UNKNOWN_USER = 'Usuário não identificado';

function normalizeTimestamp(value: any): number {
  if (!value) return Date.now();
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Date.now();
  }
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return Date.now();
}

function normalizeStatus(data: any): RegistroPendente['status'] {
  const rawStatus = String(data.status || data.reviewStatus || '').toLowerCase();
  const statusMap: Record<string, RegistroPendente['status']> = {
    pendente: 'pendente',
    pending: 'pendente',
    aprovado: 'aprovado',
    approved: 'aprovado',
    processed: 'aprovado',
    synced: 'aprovado',
    rejeitado: 'rejeitado',
    rejected: 'rejeitado',
    failed: 'rejeitado'
  };

  if (rawStatus && statusMap[rawStatus]) {
    return statusMap[rawStatus];
  }

  if (data.processed === true || data.immutable === true || data.origem === 'server-mark-point') {
    return 'aprovado';
  }

  const hasEvidence = Boolean(
    data.faceEmbedding ||
    data.photoHash ||
    data.fotoPath ||
    data.photoPath ||
    data.metadata?.facialRecognition
  );

  return hasEvidence ? 'aprovado' : 'pendente';
}

function normalizePointType(type: string): string {
  const labels: Record<string, string> = {
    entry: 'Entrada',
    entrada: 'Entrada',
    exit: 'Saída',
    saida: 'Saída',
    break_start: 'Início da Pausa',
    intervalo_inicio: 'Início da Pausa',
    pausa_inicio: 'Início da Pausa',
    break_end: 'Fim da Pausa',
    intervalo_fim: 'Fim da Pausa',
    pausa_fim: 'Fim da Pausa'
  };

  return labels[type] || type.charAt(0).toUpperCase() + type.slice(1);
}

function pickUserName(data: any, fallbackName?: string): string {
  return (
    data.usuarioNome ||
    data.userName ||
    data.employeeName ||
    data.nomeCompleto ||
    data.name ||
    data.metadata?.facialRecognition?.userName ||
    fallbackName ||
    UNKNOWN_USER
  );
}

async function resolveUserDirectory(userIds: string[]): Promise<Map<string, { name?: string; email?: string }>> {
  const directory = new Map<string, { name?: string; email?: string }>();
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));

  await Promise.all(uniqueIds.map(async (userId) => {
    for (const collectionName of ['employees', 'usuarios', 'users']) {
      const snapshot = await getDoc(doc(db, collectionName, userId));
      if (snapshot.exists()) {
        const data = snapshot.data();
        directory.set(userId, {
          name: data.nomeCompleto || data.name || data.displayName || data.employeeName,
          email: data.email || data.emailCorporativo
        });
        return;
      }
    }
  }));

  return directory;
}

export default function AdminRegistrosPage() {
  const { user } = useAuth();
  const [registros, setRegistros] = useState<RegistroPendente[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [selectedRegistro, setSelectedRegistro] = useState<RegistroPendente | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [observacoes, setObservacoes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const loadRegistros = async () => {
    if (!user) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('📋 Carregando registros para revisão...');
      
      // Buscar registros recentes de marcações. O filtro fica no cliente para
      // que registros server-side sem campo status não desapareçam da revisão.
      const marcacoesRef = collection(db, 'marcacoes');
      const q = query(marcacoesRef);
      const querySnapshot = await getDocs(q);
      const rawRecords = querySnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        data: docSnap.data()
      }));
      const directory = await resolveUserDirectory(
        rawRecords.map(({ data }) => data.usuarioId || data.userId || data.authUid || '')
      );
      const registrosData: RegistroPendente[] = [];
      
      rawRecords.forEach(({ id, data }) => {
        const usuarioId = data.usuarioId || data.userId || '';
        const userDirectoryEntry = directory.get(usuarioId) || directory.get(data.authUid || '');
        const facialRecognition = data.metadata?.facialRecognition;
        const hasFacialValidation = Boolean(
          data.faceEmbedding ||
          facialRecognition ||
          data.photoHash ||
          data.fotoPath ||
          data.photoPath
        );
        
        // Determinar motivo da captura
        let motivoCaptura = 'Registro validado pelo servidor';
        if (facialRecognition?.userName) {
          motivoCaptura = 'Reconhecimento facial validado';
        } else if (data.photoHash || data.fotoPath || data.photoPath) {
          motivoCaptura = 'Evidência fotográfica registrada';
        } else if (data.origem === 'offline-sync') {
          motivoCaptura = 'Registro legado sincronizado sem evidência facial';
        } else if (data.captureMethod === 'photo') {
          motivoCaptura = 'Captura por foto para revisão';
        } else if (!hasFacialValidation) {
          motivoCaptura = 'Sem evidência facial vinculada';
        }
        
        registrosData.push({
          id,
          usuarioId,
          usuarioNome: pickUserName(data, userDirectoryEntry?.name),
          usuarioEmail: data.usuarioEmail || data.userEmail || userDirectoryEntry?.email || '',
          timestamp: normalizeTimestamp(data.timestamp || data.dataHoraTZ || data.createdAt),
          dataHoraTZ: data.dataHoraTZ || new Date(data.timestamp || Date.now()).toISOString(),
          tipo: data.tipo || data.type || 'entrada',
          origem: data.origem || 'sistema-digital',
          fotoPath: data.fotoPath || data.photoPath || '',
          photoHash: data.photoHash || '',
          faceEmbedding: data.faceEmbedding,
          hasFacialValidation,
          facialSimilarity: facialRecognition?.similarity ?? null,
          facialConfidence: facialRecognition?.confidence ?? null,
          gps: data.gps || (data.location ? {
            lat: data.location.latitude,
            lng: data.location.longitude,
            accuracy: data.location.accuracy
          } : undefined),
          status: normalizeStatus(data),
          motivoCaptura,
          aprovadoPor: data.aprovadoPor,
          aprovadoEm: data.aprovadoEm,
          observacoes: data.observacoes || '',
          nsr: data.nsr
        });
      });
      
      // Ordenar por data mais recente
      registrosData.sort((a, b) => b.timestamp - a.timestamp);
      
      setRegistros(registrosData);
      console.log(`✅ Carregados ${registrosData.length} registros para revisão`);
      
    } catch (error) {
      console.error('❌ Erro ao carregar registros:', error);
      setError('Erro ao carregar registros. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveReject = async (registro: RegistroPendente, novoStatus: 'aprovado' | 'rejeitado') => {
    if (!user) return;
    
    setIsProcessing(true);
    try {
      const reviewerId = user.email ?? user.uid;
      const docRef = doc(db, 'marcacoes', registro.id);
      
      await updateDoc(docRef, {
        status: novoStatus,
        aprovadoPor: reviewerId,
        aprovadoEm: Date.now(),
        observacoes: observacoes || '',
        revisadoEm: new Date().toISOString()
      });
      
      console.log(`✅ Registro ${novoStatus}: ${registro.id}`);
      
      // Atualizar lista local
      setRegistros(prev => prev.map(r => 
        r.id === registro.id 
          ? { ...r, status: novoStatus, aprovadoPor: reviewerId, aprovadoEm: Date.now(), observacoes: observacoes || '' }
          : r
      ));
      
      // Fechar modal
      setShowApprovalModal(false);
      setSelectedRegistro(null);
      setObservacoes('');
      
      notifyUser(`✅ Registro ${novoStatus === 'aprovado' ? 'aprovado' : 'rejeitado'} com sucesso!`);
      
    } catch (error) {
      console.error('❌ Erro ao atualizar registro:', error);
      notifyUser('Erro ao atualizar registro. Tente novamente.');
    } finally {
      setIsProcessing(false);
    }
  };

  const openApprovalModal = (registro: RegistroPendente) => {
    setSelectedRegistro(registro);
    setObservacoes(registro.observacoes || '');
    setShowApprovalModal(true);
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      'pendente': { color: 'bg-yellow-100 text-yellow-800', label: 'Pendente', icon: '⏳' },
      'aprovado': { color: 'bg-green-100 text-green-800', label: 'Aprovado', icon: '✅' },
      'rejeitado': { color: 'bg-red-100 text-red-800', label: 'Rejeitado', icon: '❌' }
    };
    
    const badge = badges[status as keyof typeof badges] || badges['pendente'];
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full font-medium ${badge.color}`}>
        {badge.icon} {badge.label}
      </span>
    );
  };

  const getMotivoIcon = (motivo: string) => {
    if (motivo.includes('facial')) return '🤖';
    if (motivo.includes('backup')) return '📸';
    if (motivo.includes('Falha')) return '⚠️';
    if (motivo.includes('biométricos')) return '🔍';
    return '📋';
  };

  const formatDateTime = (timestamp: number) => {
    return format(new Date(timestamp), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR });
  };

  useEffect(() => {
    loadRegistros();
  }, [user]);

  const statsCards = [
    {
      title: 'Pendentes',
      count: registros.filter(r => r.status === 'pendente').length,
      color: 'bg-yellow-500',
      icon: '⏳'
    },
    {
      title: 'Aprovados',
      count: registros.filter(r => r.status === 'aprovado').length,
      color: 'bg-green-500',
      icon: '✅'
    },
    {
      title: 'Rejeitados',
      count: registros.filter(r => r.status === 'rejeitado').length,
      color: 'bg-red-500',
      icon: '❌'
    },
    {
      title: 'Total',
      count: registros.length,
      color: 'bg-blue-500',
      icon: '📊'
    }
  ];

  const filteredRegistros = statusFilter === 'todos' 
    ? registros 
    : registros.filter(r => r.status === statusFilter);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">📋 Revisão de Registros</h2>
          <p className="text-gray-600 mt-1">
            Revisar e aprovar registros de ponto que necessitam análise manual
          </p>
        </div>
        <button
          onClick={loadRegistros}
          disabled={isLoading}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? '🔄 Carregando...' : '🔄 Atualizar'}
        </button>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {statsCards.map((stat, index) => (
          <div key={index} className="bg-white rounded-lg shadow p-6 border">
            <div className="flex items-center">
              <div className={`text-2xl text-white w-12 h-12 rounded-lg ${stat.color} flex items-center justify-center mr-4`}>
                {stat.icon}
              </div>
              <div>
                <p className="text-sm text-gray-500">{stat.title}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.count}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Filtros</h3>
        <div className="flex flex-wrap gap-2">
          {([
            { key: 'todos', label: '📊 Todos' },
            { key: 'pendente', label: '⏳ Pendentes' },
            { key: 'aprovado', label: '✅ Aprovados' },
            { key: 'rejeitado', label: '❌ Rejeitados' }
          ] as const).map(filter => (
            <button
              key={filter.key}
              onClick={() => setStatusFilter(filter.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === filter.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Registros */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            📋 Registros para Revisão ({filteredRegistros.length})
          </h3>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border-l-4 border-red-500">
            <div className="flex">
              <div className="text-red-500 mr-2">⚠️</div>
              <p className="text-red-700">{error}</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando registros...</p>
          </div>
        ) : filteredRegistros.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="text-4xl mb-4">📭</div>
            <p>Nenhum registro encontrado para os filtros selecionados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Funcionário
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data/Hora
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Motivo Captura
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredRegistros.map((registro) => (
                  <tr key={registro.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {registro.usuarioNome}
                        </div>
                        <div className="text-sm text-gray-500">
                          {registro.usuarioEmail || registro.usuarioId}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDateTime(registro.timestamp)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {normalizePointType(registro.tipo)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center">
                        <span className="mr-2">{getMotivoIcon(registro.motivoCaptura)}</span>
                        {registro.motivoCaptura}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(registro.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      {registro.status === 'pendente' && (
                        <button
                          onClick={() => openApprovalModal(registro)}
                          className="bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1 rounded text-xs transition-colors"
                        >
                          🔍 Revisar
                        </button>
                      )}
                      <button
                        onClick={() => openApprovalModal(registro)}
                        className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1 rounded text-xs transition-colors"
                      >
                        👁️ Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Aprovação/Rejeição */}
      {showApprovalModal && selectedRegistro && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  🔍 Revisão do Registro
                </h3>
                <button
                  onClick={() => setShowApprovalModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <strong>Funcionário:</strong> {selectedRegistro.usuarioNome}
                    {selectedRegistro.usuarioEmail && (
                      <div className="text-gray-500">{selectedRegistro.usuarioEmail}</div>
                    )}
                  </div>
                  <div>
                    <strong>Data/Hora:</strong> {formatDateTime(selectedRegistro.timestamp)}
                  </div>
                  <div>
                    <strong>Tipo:</strong> {normalizePointType(selectedRegistro.tipo)}
                  </div>
                  <div>
                    <strong>Motivo:</strong> {selectedRegistro.motivoCaptura}
                  </div>
                  <div>
                    <strong>Foto/Evidência:</strong> {selectedRegistro.fotoPath || selectedRegistro.photoHash ? '✅ Sim' : '❌ Não'}
                  </div>
                  <div>
                    <strong>Validação facial:</strong> {selectedRegistro.hasFacialValidation ? '✅ Sim' : '❌ Não'}
                  </div>
                  {selectedRegistro.facialSimilarity !== null && selectedRegistro.facialSimilarity !== undefined && (
                    <div>
                      <strong>Similaridade:</strong> {Math.round(selectedRegistro.facialSimilarity * 100)}%
                    </div>
                  )}
                  {selectedRegistro.nsr && (
                    <div>
                      <strong>NSR:</strong> {selectedRegistro.nsr}
                    </div>
                  )}
                  <div>
                    <strong>Origem:</strong> {selectedRegistro.origem}
                  </div>
                  <div>
                    <strong>GPS:</strong> {selectedRegistro.gps ? `${selectedRegistro.gps.lat}, ${selectedRegistro.gps.lng} (${Math.round(selectedRegistro.gps.accuracy || 0)}m)` : 'N/A'}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Observações:
                  </label>
                  <textarea
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    rows={3}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="Adicione observações sobre esta revisão..."
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowApprovalModal(false)}
                  disabled={isProcessing}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                {selectedRegistro.status === 'pendente' && (
                  <>
                    <button
                      onClick={() => handleApproveReject(selectedRegistro, 'rejeitado')}
                      disabled={isProcessing}
                      className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isProcessing ? '⏳' : '❌'} Rejeitar
                    </button>
                    <button
                      onClick={() => handleApproveReject(selectedRegistro, 'aprovado')}
                      disabled={isProcessing}
                      className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isProcessing ? '⏳' : '✅'} Aprovar
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
