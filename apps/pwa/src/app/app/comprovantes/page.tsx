'use client';

import { notifyUser } from '@/lib/user-dialogs';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, limit, getDocs, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MarcacaoData {
  id: string;
  source: 'timeRecords' | 'marcacoes';
  usuarioId: string;
  authUid?: string;
  employeeId?: string;
  employeeName?: string;
  employeeEmail?: string;
  type?: string;
  estabId: string;
  companyName?: string;
  dataHoraTZ: string;
  gps?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    address?: string;
  };
  fotoPath?: string | null;
  photoHash?: string;
  origem: string;
  status?: string;
  reviewStatus?: string;
  verificationStatus?: string;
  captureMethod?: string;
  hasFacialRecognition?: boolean;
  hasPhotoEvidence?: boolean;
  faceMatch?: {
    similarity?: number;
    confidence?: number;
    method?: string;
  };
  livenessResults?: { [key: string]: boolean };
  createdAt: Timestamp;
  nsr?: number;
}

type FilterPeriod = 'today' | 'week' | 'month' | 'all';

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

function readText(value: unknown, fallback = ''): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function readOptionalText(value: unknown): string | undefined {
  return readText(value) || undefined;
}

function normalizePointType(data: any): string {
  const rawType = String(data.type || data.tipo || '').toLowerCase();
  const labels: Record<string, string> = {
    entry: 'Entrada',
    entrada: 'Entrada',
    exit: 'Saída',
    saida: 'Saída',
    break_start: 'Início de pausa',
    intervalo_inicio: 'Início de pausa',
    pausa_inicio: 'Início de pausa',
    break_end: 'Fim de pausa',
    intervalo_fim: 'Fim de pausa',
    pausa_fim: 'Fim de pausa'
  };

  return labels[rawType] || 'Registro';
}

function normalizeGps(data: any): MarcacaoData['gps'] {
  const location = data.location || data.localizacao || data.gps || {};
  const latitude = Number(location.latitude ?? location.lat ?? data.latitude ?? data.lat);
  const longitude = Number(location.longitude ?? location.lng ?? data.longitude ?? data.lng);
  const accuracy = Number(location.accuracy ?? location.precisao ?? data.accuracy ?? data.precisao ?? 0);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return undefined;
  }

  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : 0,
    address: readOptionalText(location.address || location.endereco || data.endereco)
  };
}

function normalizeComprovanteRecord(
  id: string,
  data: any,
  source: MarcacaoData['source'],
  fallbackUid: string
): MarcacaoData | null {
  const timestampMs = normalizeTimestamp(
    data.timestamp || data.dataHoraTZ || data.serverTimestamp || data.createdAt || data.dataHora
  );

  if (!id || !timestampMs) {
    return null;
  }

  const employeeName = readText(
    data.employeeName || data.usuarioNome || data.userName || data.nomeCompleto || data.metadata?.facialRecognition?.userName
  );
  const companyName = readText(data.companyName || data.empresaNome || data.estabId || data.geofence?.name);
  const locationLabel = readText(
    data.location?.address ||
      data.localizacao?.endereco ||
      data.estabId ||
      data.companyName ||
      data.empresaNome ||
      data.geofence?.name,
    'Localização registrada'
  );
  const userId = readText(data.userId || data.usuarioId || data.employeeId || data.funcionarioId || data.authUid, fallbackUid);
  const employeeId = readText(data.employeeId || data.funcionarioId || data.userId || data.usuarioId);

  return {
    id,
    source,
    usuarioId: userId,
    authUid: readOptionalText(data.authUid || data.actorUid),
    employeeId: employeeId || undefined,
    employeeName: employeeName || undefined,
    employeeEmail: readOptionalText(data.employeeEmail || data.usuarioEmail || data.userEmail),
    type: normalizePointType(data),
    estabId: locationLabel,
    companyName: companyName || undefined,
    dataHoraTZ: new Date(timestampMs).toISOString(),
    gps: normalizeGps(data),
    fotoPath: readOptionalText(data.photoUrl || data.fotoPath) || null,
    photoHash: readOptionalText(data.photoHash),
    origem: readText(data.origem || data.captureMethod, 'server-mark-point'),
    status: readOptionalText(data.status),
    reviewStatus: readOptionalText(data.reviewStatus),
    verificationStatus: readOptionalText(data.verificationStatus),
    captureMethod: readOptionalText(data.captureMethod),
    hasFacialRecognition: data.hasFacialRecognition === true,
    hasPhotoEvidence: data.hasPhotoEvidence === true || !!data.photoHash,
    faceMatch: data.faceMatch,
    livenessResults: data.livenessResults,
    createdAt: Timestamp.fromMillis(timestampMs),
    nsr: Number.isFinite(Number(data.nsr)) ? Number(data.nsr) : undefined
  };
}

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
      const marcacoesData: MarcacaoData[] = [];

      const recordQueries: Array<{
        source: MarcacaoData['source'];
        field: string;
      }> = [
        { source: 'timeRecords', field: 'authUid' },
        { source: 'timeRecords', field: 'actorUid' },
        { source: 'timeRecords', field: 'userId' },
        { source: 'timeRecords', field: 'usuarioId' },
        { source: 'marcacoes', field: 'authUid' },
        { source: 'marcacoes', field: 'actorUid' },
        { source: 'marcacoes', field: 'usuarioId' }
      ];

      const queryResults = await Promise.allSettled(
        recordQueries.map(async ({ source, field }) => {
          const snapshot = await getDocs(query(
            collection(db, source),
            where(field, '==', currentUser.uid),
            limit(100)
          ));
          return { snapshot, source };
        })
      );

      queryResults.forEach((result) => {
        if (result.status !== 'fulfilled') return;

        const { snapshot, source } = result.value;
        snapshot.forEach((document) => {
          const record = normalizeComprovanteRecord(
            document.id,
            document.data(),
            source,
            currentUser.uid
          );
          if (record) {
            marcacoesData.push(record);
          }
        });
      });

      // Ordenar por data mais recente e remover duplicatas
      const byId = new Map<string, MarcacaoData>();
      marcacoesData
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
        .forEach((record) => {
          const existing = byId.get(record.id);
          if (!existing || existing.source === 'marcacoes') {
            byId.set(record.id, record);
          }
        });

      const uniqueRecords = Array.from(byId.values())
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
        .slice(0, 100);
      
      setMarcacoes(uniqueRecords);
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
        (m.employeeName || '').toLowerCase().includes(term) ||
        (m.companyName || '').toLowerCase().includes(term) ||
        (m.type || '').toLowerCase().includes(term) ||
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
      'server-mark-point': { color: 'bg-green-100 text-green-800', label: 'Servidor validado' },
      'facial': { color: 'bg-indigo-100 text-indigo-800', label: 'Reconhecimento Facial' },
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

  const getOperationalStatus = (marcacao: MarcacaoData) => {
    const status = (marcacao.status || '').toLowerCase();
    const reviewStatus = (marcacao.reviewStatus || '').toLowerCase();
    const verificationStatus = (marcacao.verificationStatus || '').toLowerCase();
    const hasEvidence = !!(
      marcacao.hasPhotoEvidence ||
      marcacao.hasFacialRecognition ||
      marcacao.fotoPath ||
      marcacao.photoHash ||
      marcacao.livenessResults
    );

    if (status === 'rejeitado' || reviewStatus === 'rejected') {
      return { label: 'Rejeitado em revisão', className: 'status-rejected' };
    }

    if (status === 'pendente' || reviewStatus.includes('pending')) {
      return { label: 'Pendente de revisão', className: 'status-pending' };
    }

    if (verificationStatus === 'verified' || reviewStatus === 'approved' || status === 'aprovado') {
      return { label: 'Validação confirmada', className: 'status-evidence' };
    }

    if (hasEvidence) {
      return { label: 'Evidência registrada', className: 'status-evidence' };
    }

    return { label: 'Sem validação confirmada', className: 'status-pending' };
  };

  const validateMarcacaoData = (marcacao: MarcacaoData): boolean => {
    // Validar dados essenciais para geração de comprovante
    return !!(
      marcacao.id &&
      marcacao.usuarioId &&
      marcacao.createdAt &&
      marcacao.dataHoraTZ
    );
  };

  const generateComprovante = async (marcacao: MarcacaoData) => {
    // Validar dados antes de gerar comprovante
    if (!validateMarcacaoData(marcacao)) {
      notifyUser('❌ Erro: Dados da marcação incompletos.\n\nNão é possível gerar comprovante para esta marcação.');
      return;
    }

    try {
      // Importar dinamicamente jsPDF e html2canvas
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas')
      ]);
      
      // Criar HTML do comprovante
      const operationalStatus = getOperationalStatus(marcacao);
      const displayName = marcacao.employeeName || marcacao.usuarioId;
      const displayEmail = marcacao.employeeEmail ? `<br><span style="color: #6b7280;">${marcacao.employeeEmail}</span>` : '';
      const displayCompany = marcacao.companyName || marcacao.estabId || 'Não informado';
      const facePercent = typeof marcacao.faceMatch?.similarity === 'number'
        ? `${Math.round(marcacao.faceMatch.similarity * 100)}%`
        : '';
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
            .status-evidence { background: #dcfce7; color: #166534; }
            .status-pending { background: #fef3c7; color: #92400e; }
            .status-rejected { background: #fee2e2; color: #991b1b; }
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
                <span class="label">Funcionário:</span>
                <span class="value">${displayName}${displayEmail}</span>
              </div>
              ${marcacao.employeeId ? `
                <div class="info-row">
                  <span class="label">ID do Funcionário:</span>
                  <span class="value">${marcacao.employeeId}</span>
                </div>
              ` : ''}
              <div class="info-row">
                <span class="label">Data/Hora:</span>
                <span class="value">${formatDateTime(marcacao.createdAt)}</span>
              </div>
              <div class="info-row">
                <span class="label">Tipo:</span>
                <span class="value">${marcacao.type || 'Registro'}</span>
              </div>
              <div class="info-row">
                <span class="label">Empresa/Local:</span>
                <span class="value">${displayCompany}</span>
              </div>
              <div class="info-row">
                <span class="label">Origem:</span>
                <span class="value">${marcacao.origem}</span>
              </div>
              <div class="info-row">
                <span class="label">Status:</span>
                <span class="value"><span class="status-badge ${operationalStatus.className}">${operationalStatus.label}</span></span>
              </div>
              ${marcacao.nsr ? `
                <div class="info-row">
                  <span class="label">NSR:</span>
                  <span class="value">${marcacao.nsr}</span>
                </div>
              ` : ''}
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

            ${marcacao.hasFacialRecognition || marcacao.faceMatch ? `
            <div class="info-section">
              <h3 style="margin-top: 0; color: #2563eb;">✅ Validação Facial</h3>
              <div class="info-row">
                <span class="label">Status facial:</span>
                <span class="value">${marcacao.hasFacialRecognition ? 'Confirmado' : 'Evidência presente'}</span>
              </div>
              ${facePercent ? `
                <div class="info-row">
                  <span class="label">Similaridade:</span>
                  <span class="value">${facePercent}</span>
                </div>
              ` : ''}
            </div>
            ` : ''}
            
            <div class="verification">
              <h3 style="margin-top: 0; color: #1e40af;">🔐 Verificação de Autenticidade</h3>
              <p><strong>ID do Registro:</strong> ${marcacao.id}</p>
              ${marcacao.nsr ? `<p><strong>NSR:</strong> ${marcacao.nsr}</p>` : ''}
              <p><strong>Hash de Verificação:</strong> ${generateVerificationHash(marcacao)}</p>
              <p style="margin-bottom: 0; font-size: 12px; color: #4b5563;">
                Prévia operacional gerada no navegador a partir dos registros encontrados. Para emissão assinada, use uma rotina backend auditável.
              </p>
            </div>
            
            <div class="footer">
              <p>Comprovante gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}</p>
              <p>Sistema de Controle de Ponto Digital</p>
              <p><strong>Prévia operacional sem assinatura backend</strong> - use apenas para conferência interna.</p>
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
          subject: 'Prévia operacional de controle de ponto',
          author: 'Sistema de Controle de Ponto Digital',
          creator: `Sistema Digital - ${window.location.host}`,
          keywords: 'ponto eletrônico, prévia operacional, registro de ponto, controle de jornada'
        });

        // Fazer download do PDF
        const fileName = `comprovante-ponto-${marcacao.id}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
        pdf.save(fileName);

        // Feedback otimizado para produção
        notifyUser('✅ Prévia PDF gerada com sucesso!\n\n📁 Arquivo: ' + fileName + '\n📅 Data: ' + formatDateTime(marcacao.createdAt));

      } finally {
        // Remover elemento temporário
        document.body.removeChild(tempDiv);
      }
      
    } catch (error) {
      console.error('❌ Erro ao gerar comprovante:', error);
      notifyUser('Erro ao gerar comprovante: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
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
                          📍 {marcacao.employeeName || marcacao.usuarioId}
                        </h3>
                        {getOrigemBadge(marcacao.origem)}
                        {getLivenessStatus(marcacao.livenessResults)}
                      </div>
                      
                      <div className="text-sm text-gray-600 space-y-1">
                        {marcacao.employeeEmail && (
                          <p>✉️ <strong>E-mail:</strong> {marcacao.employeeEmail}</p>
                        )}
                        <p>🏷️ <strong>Tipo:</strong> {marcacao.type || 'Registro'}</p>
                        <p>🕐 <strong>Data/Hora:</strong> {formatDateTime(marcacao.createdAt)}</p>
                        <p>🏢 <strong>Empresa/Local:</strong> {marcacao.companyName || marcacao.estabId}</p>
                        <p>🌍 <strong>GPS:</strong> {formatGPS(marcacao.gps)}</p>
                        {marcacao.gps?.address && (
                          <p>📍 <strong>Endereço:</strong> {marcacao.gps.address}</p>
                        )}
                        <p>📸 <strong>Evidência:</strong> {marcacao.hasPhotoEvidence || marcacao.fotoPath || marcacao.photoHash ? 'Registrada' : 'Não disponível'}</p>
                        <p>✅ <strong>Validação facial:</strong> {marcacao.hasFacialRecognition ? 'Confirmada' : 'Não confirmada'}</p>
                        {typeof marcacao.faceMatch?.similarity === 'number' && (
                          <p>🧬 <strong>Similaridade:</strong> {Math.round(marcacao.faceMatch.similarity * 100)}%</p>
                        )}
                        {marcacao.nsr && (
                          <p>🔢 <strong>NSR:</strong> {marcacao.nsr}</p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <span className="inline-block px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                        {getOperationalStatus(marcacao).label}
                      </span>
                      
                      <button 
                        onClick={() => generateComprovante(marcacao)}
                        className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200 transition-colors"
                      >
                        📄 Prévia PDF
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
            <li>• As prévias usam os registros encontrados para conferência operacional</li>
            <li>• O PDF gerado nesta tela é uma prévia operacional para conferência interna</li>
            <li>• Timestamp, localização e evidência são exibidos quando existem no registro</li>
            <li>• Comprovantes assinados devem ser emitidos por rotina backend auditável</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
