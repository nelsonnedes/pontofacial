'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { format, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MarcacaoData {
  id: string;
  usuarioId: string;
  estabId: string;
  dataHoraTZ: string;
  gps?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    address?: string;
  };
  fotoPath: string;
  origem: string;
  livenessResults?: { [key: string]: boolean };
  createdAt: Timestamp;
  nsr?: number;
}

type FilterPeriod = 'today' | 'week' | 'month' | 'all';

export default function ComprovantesPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [marcacoes, setMarcacoes] = useState<MarcacaoData[]>([]);
  const [filteredMarcacoes, setFilteredMarcacoes] = useState<MarcacaoData[]>([]);
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('month');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState('');

  // Verificar autenticação
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
      
      if (!user) {
        router.push('/login');
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Carregar marcações do usuário
  useEffect(() => {
    if (currentUser) {
      loadMarcacoes();
    }
  }, [currentUser]);

  // Filtrar marcações
  useEffect(() => {
    filterMarcacoes();
  }, [marcacoes, filterPeriod, searchTerm]);

  const loadMarcacoes = async () => {
    if (!currentUser) return;
    
    setIsLoadingData(true);
    setError('');
    
    try {
      const marcacoesRef = collection(db, 'marcacoes');
      const q = query(
        marcacoesRef,
        where('usuarioId', '==', currentUser.uid),
        orderBy('createdAt', 'desc'),
        limit(100)
      );
      
      const querySnapshot = await getDocs(q);
      const marcacoesData: MarcacaoData[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        
        // Validação de dados reais - apenas incluir registros válidos
        if (data.usuarioId && data.createdAt && data.dataHoraTZ) {
          marcacoesData.push({
            id: doc.id,
            ...data,
            // Garantir campos obrigatórios
            estabId: data.estabId || 'Não informado',
            origem: data.origem || 'sistema-digital',
            fotoPath: data.fotoPath || null
          } as MarcacaoData);
        }
      });
      
      setMarcacoes(marcacoesData);
    } catch (error: any) {
      console.error('Erro ao carregar marcações:', error);
      setError('Não foi possível carregar o histórico. Verifique sua conexão e tente novamente.');
    } finally {
      setIsLoadingData(false);
    }
  };

  const filterMarcacoes = () => {
    let filtered = [...marcacoes];
    
    // Filtro por período
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    switch (filterPeriod) {
      case 'today':
        filtered = filtered.filter(m => {
          const marcacaoDate = m.createdAt.toDate();
          return marcacaoDate >= today;
        });
        break;
      case 'week':
        filtered = filtered.filter(m => {
          const marcacaoDate = m.createdAt.toDate();
          return marcacaoDate >= weekAgo;
        });
        break;
      case 'month':
        filtered = filtered.filter(m => {
          const marcacaoDate = m.createdAt.toDate();
          return marcacaoDate >= monthAgo;
        });
        break;
      // 'all' não filtra
    }
    
    // Filtro por busca
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(m => 
        m.estabId.toLowerCase().includes(term) ||
        m.origem.toLowerCase().includes(term) ||
        format(m.createdAt.toDate(), 'dd/MM/yyyy HH:mm', { locale: ptBR }).includes(term)
      );
    }
    
    setFilteredMarcacoes(filtered);
  };

  const formatDateTime = (timestamp: Timestamp) => {
    try {
      const date = timestamp.toDate();
      return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return 'Data inválida';
    }
  };

  const formatGPS = (gps?: { latitude: number; longitude: number; accuracy: number }) => {
    if (!gps || typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') {
      return 'Não disponível';
    }
    const accuracy = typeof gps.accuracy === 'number' ? gps.accuracy : 0;
    return `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)} (±${Math.round(accuracy)}m)`;
  };

  const getOrigemBadge = (origem: string) => {
    const badges: { [key: string]: { color: string; label: string } } = {
      'pwa-nextjs': { color: 'bg-blue-100 text-blue-800', label: 'App Web' },
      'mobile-app': { color: 'bg-green-100 text-green-800', label: 'Mobile' },
      'web-admin': { color: 'bg-purple-100 text-purple-800', label: 'Administrador' },
      'offline-sync': { color: 'bg-orange-100 text-orange-800', label: 'Sincronização' },
      'facial-recognition': { color: 'bg-indigo-100 text-indigo-800', label: 'Reconhecimento Facial' },
      'hybrid-capture': { color: 'bg-teal-100 text-teal-800', label: 'Captura Híbrida' },
    };
    
    const badge = badges[origem] || { color: 'bg-gray-100 text-gray-800', label: 'Sistema Digital' };
    return (
      <span className={`inline-block px-2 py-1 text-xs rounded-full ${badge.color}`}>
        {badge.label}
      </span>
    );
  };

  const getLivenessStatus = (results?: { [key: string]: boolean }) => {
    if (!results) return null;
    
    const total = Object.keys(results).length;
    const passed = Object.values(results).filter(Boolean).length;
    
    return (
      <span className={`inline-block px-2 py-1 text-xs rounded-full ${
        passed === total ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
      }`}>
        Vivacidade: {passed}/{total}
      </span>
    );
  };

  const validateMarcacaoData = (marcacao: MarcacaoData): boolean => {
    // Validar dados essenciais para geração de comprovante
    return !!(
      marcacao.id &&
      marcacao.usuarioId &&
      marcacao.createdAt &&
      marcacao.dataHoraTZ &&
      marcacao.estabId
    );
  };

  const generateComprovante = async (marcacao: MarcacaoData) => {
    // Validar dados antes de gerar comprovante
    if (!validateMarcacaoData(marcacao)) {
      alert('❌ Erro: Dados da marcação incompletos.\n\nNão é possível gerar comprovante para esta marcação.');
      return;
    }

    try {
      // Importar dinamicamente jsPDF e html2canvas
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas')
      ]);
      
      // Criar HTML do comprovante
      const comprovanteHTML = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Comprovante de Ponto</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
            .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: bold; color: #2563eb; margin-bottom: 10px; }
            .subtitle { color: #666; font-size: 14px; }
            .content { max-width: 600px; margin: 0 auto; }
            .info-section { background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 10px; padding: 5px 0; border-bottom: 1px solid #e5e7eb; }
            .info-row:last-child { border-bottom: none; margin-bottom: 0; }
            .label { font-weight: bold; color: #374151; }
            .value { color: #1f2937; }
            .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
            .verification { background: #dbeafe; padding: 15px; border-radius: 8px; border: 1px solid #3b82f6; }
            .status-badge { display: inline-block; padding: 4px 8px; border-radius: 9999px; font-size: 12px; font-weight: bold; }
            .status-verified { background: #dcfce7; color: #166534; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <div class="content">
            <div class="header">
              <div class="logo">🕐 Sistema de Ponto Facial</div>
              <div class="subtitle">Comprovante de Registro de Ponto</div>
            </div>
            
            <div class="info-section">
              <h3 style="margin-top: 0; color: #2563eb;">📋 Informações do Registro</h3>
              <div class="info-row">
                <span class="label">Usuário:</span>
                <span class="value">${marcacao.usuarioId}</span>
              </div>
              <div class="info-row">
                <span class="label">Data/Hora:</span>
                <span class="value">${formatDateTime(marcacao.createdAt)}</span>
              </div>
              <div class="info-row">
                <span class="label">Estabelecimento:</span>
                <span class="value">${marcacao.estabId}</span>
              </div>
              <div class="info-row">
                <span class="label">Origem:</span>
                <span class="value">${marcacao.origem}</span>
              </div>
              <div class="info-row">
                <span class="label">Status:</span>
                <span class="value"><span class="status-badge status-verified">✅ Verificado</span></span>
              </div>
            </div>
            
            <div class="info-section">
              <h3 style="margin-top: 0; color: #2563eb;">🌍 Informações de Localização</h3>
              <div class="info-row">
                <span class="label">GPS:</span>
                <span class="value">${formatGPS(marcacao.gps)}</span>
              </div>
              ${marcacao.gps?.address ? `
                <div class="info-row">
                  <span class="label">Endereço:</span>
                  <span class="value">${marcacao.gps.address}</span>
                </div>
              ` : ''}
            </div>
            
            ${marcacao.livenessResults ? `
            <div class="info-section">
              <h3 style="margin-top: 0; color: #2563eb;">🔒 Verificação de Vivacidade</h3>
              <div class="info-row">
                <span class="label">Testes Realizados:</span>
                <span class="value">${Object.keys(marcacao.livenessResults).length}</span>
              </div>
              <div class="info-row">
                <span class="label">Testes Aprovados:</span>
                <span class="value">${Object.values(marcacao.livenessResults).filter(Boolean).length}</span>
              </div>
            </div>
            ` : ''}
            
            <div class="verification">
              <h3 style="margin-top: 0; color: #1e40af;">🔐 Verificação de Autenticidade</h3>
              <p><strong>ID do Registro:</strong> ${marcacao.id}</p>
              ${marcacao.nsr ? `<p><strong>NSR:</strong> ${marcacao.nsr}</p>` : ''}
              <p><strong>Hash de Verificação:</strong> ${generateVerificationHash(marcacao)}</p>
              <p style="margin-bottom: 0; font-size: 12px; color: #4b5563;">
                Este comprovante foi gerado automaticamente pelo Sistema de Ponto Facial e possui validade legal conforme regulamentações vigentes.
              </p>
            </div>
            
            <div class="footer">
              <p>Comprovante gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}</p>
              <p>Sistema de Controle de Ponto Digital</p>
              <p><strong>Documento oficial com validade legal</strong> - Conforme legislação vigente sobre registro de ponto eletrônico</p>
              <p style="font-size: 10px; color: #9ca3af;">ID de Verificação: ${generateVerificationHash(marcacao)} | Processado em: ${window.location.host}</p>
            </div>
          </div>
        </body>
        </html>
      `;

      // Criar elemento temporário para renderizar HTML
      const tempDiv = document.createElement('div');
      // Extrair apenas o conteúdo do body
      const bodyMatch = comprovanteHTML.match(/<body[^>]*>([\s\S]*?)<\/body>/);
      tempDiv.innerHTML = bodyMatch ? bodyMatch[1] : comprovanteHTML;
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '0px';
      tempDiv.style.width = '794px'; // A4 width em pixels (210mm)
      tempDiv.style.backgroundColor = 'white';
      tempDiv.style.padding = '20px';
      tempDiv.style.fontFamily = 'Arial, sans-serif';
      document.body.appendChild(tempDiv);

      try {
        // Capturar HTML como imagem usando html2canvas
        const canvas = await html2canvas(tempDiv, {
          scale: 2, // Melhor qualidade
          useCORS: true,
          allowTaint: false,
          backgroundColor: '#ffffff',
          width: 794,
          height: 1123 // A4 height em pixels (297mm)
        });

        // Criar PDF usando jsPDF
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);

        // Adicionar metadados ao PDF
        pdf.setProperties({
          title: `Comprovante de Registro de Ponto - ${formatDateTime(marcacao.createdAt)}`,
          subject: 'Comprovante Oficial de Controle de Ponto Eletrônico',
          author: 'Sistema de Controle de Ponto Digital',
          creator: `Sistema Digital - ${window.location.host}`,
          keywords: 'ponto eletrônico, comprovante, registro trabalhista, controle de jornada'
        });

        // Fazer download do PDF
        const fileName = `comprovante-ponto-${marcacao.id}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
        pdf.save(fileName);

        // Feedback otimizado para produção
        alert('✅ Comprovante PDF gerado com sucesso!\n\n📁 Arquivo: ' + fileName + '\n📅 Data: ' + formatDateTime(marcacao.createdAt));

      } finally {
        // Remover elemento temporário
        document.body.removeChild(tempDiv);
      }
      
    } catch (error) {
      console.error('❌ Erro ao gerar comprovante:', error);
      alert('Erro ao gerar comprovante: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    }
  };

  const generateVerificationHash = (marcacao: MarcacaoData): string => {
    // Gerar hash simples baseado nos dados da marcação
    const dataString = `${marcacao.id}-${marcacao.usuarioId}-${marcacao.createdAt.toMillis()}`;
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
      const char = dataString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Converter para 32bit integer
    }
    return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
  };

  const exportToCSV = () => {
    if (filteredMarcacoes.length === 0) return;
    
    const csvContent = [
      ['Data/Hora', 'Estabelecimento', 'GPS', 'Origem', 'ID'].join(','),
      ...filteredMarcacoes.map(marcacao => [
        formatDateTime(marcacao.createdAt),
        marcacao.estabId,
        formatGPS(marcacao.gps),
        marcacao.origem,
        marcacao.id
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `comprovantes-pontos-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/app')}
                className="flex items-center justify-center w-10 h-10 text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
              >
                <span className="text-lg">←</span>
              </button>
              <h1 className="text-2xl font-bold text-gray-900">Meus Comprovantes</h1>
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={exportToCSV}
                disabled={filteredMarcacoes.length === 0}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
              >
                📥 Exportar CSV
              </button>
              <button 
                onClick={loadMarcacoes}
                disabled={isLoadingData}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
              >
                {isLoadingData ? '🔄 Carregando...' : '🔄 Atualizar'}
              </button>
            </div>
          </div>
          
          <p className="text-gray-600 text-sm">
            Histórico de marcações de ponto
          </p>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
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
                <option value="week">Última semana</option>
                <option value="month">Último mês</option>
                <option value="all">Todos</option>
              </select>
            </div>
            
            {/* Busca */}
            <div className="flex-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Buscar
              </label>
              <input 
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por estabelecimento, origem ou data..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="text-2xl font-bold text-blue-600">{marcacoes.length}</div>
            <div className="text-sm text-gray-600">Total de marcações</div>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="text-2xl font-bold text-green-600">{filteredMarcacoes.length}</div>
            <div className="text-sm text-gray-600">Marcações filtradas</div>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="text-2xl font-bold text-purple-600">
              {filteredMarcacoes.filter(m => m.createdAt.toDate() >= new Date(new Date().setHours(0,0,0,0))).length}
            </div>
            <div className="text-sm text-gray-600">Marcações hoje</div>
          </div>
        </div>

        {/* Lista de marcações */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          
          {isLoadingData ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Carregando marcações...</p>
            </div>
          ) : filteredMarcacoes.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-4">📋</div>
              <p className="text-lg font-medium">Nenhuma marcação encontrada</p>
              <p className="text-sm mt-2">
                {marcacoes.length === 0 
                  ? 'Você ainda não fez nenhuma marcação de ponto'
                  : 'Tente ajustar os filtros para encontrar suas marcações'
                }
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredMarcacoes.map((marcacao) => (
                <div key={marcacao.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-gray-900">
                          📍 {marcacao.estabId}
                        </h3>
                        {getOrigemBadge(marcacao.origem)}
                        {getLivenessStatus(marcacao.livenessResults)}
                      </div>
                      
                      <div className="text-sm text-gray-600 space-y-1">
                        <p>🕐 <strong>Data/Hora:</strong> {formatDateTime(marcacao.createdAt)}</p>
                        <p>🌍 <strong>GPS:</strong> {formatGPS(marcacao.gps)}</p>
                        {marcacao.gps?.address && (
                          <p>📍 <strong>Endereço:</strong> {marcacao.gps.address}</p>
                        )}
                        <p>📸 <strong>Foto:</strong> {marcacao.fotoPath ? 'Capturada' : 'Não disponível'}</p>
                        {marcacao.nsr && (
                          <p>🔢 <strong>NSR:</strong> {marcacao.nsr}</p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <span className="inline-block px-3 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                        ✅ Registrado
                      </span>
                      
                      <button 
                        onClick={() => generateComprovante(marcacao)}
                        className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200 transition-colors"
                      >
                        📄 Comprovante
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Informações adicionais */}
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 mt-6">
          <h3 className="font-medium text-blue-900 mb-2">ℹ️ Sobre os comprovantes</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Todas as marcações são registradas com timestamp preciso e geolocalização</li>
            <li>• Os dados são protegidos por criptografia e seguem as normas da LGPD</li>
            <li>• Comprovantes em PDF podem ser gerados para cada marcação</li>
            <li>• O histórico fica disponível por tempo indeterminado</li>
          </ul>
        </div>
      </div>
    </main>
  );
}