'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
// TODO: Implementar conexão real com core-legal
// import { afdGenerator, aejGenerator } from '@/packages/core-legal/src/index';

// Mock das funções por enquanto
const afdGenerator = {
  generateAFD: (data: any) => {
    return `AFD Mock Data\n${JSON.stringify(data, null, 2)}`;
  }
};

const aejGenerator = {
  generateAEJ: (data: any) => {
    return `AEJ Mock Data\n${JSON.stringify(data, null, 2)}`;
  }
};

interface ReportsManagerProps {
  className?: string;
}

type ReportType = 'afd' | 'aej' | 'espelho';
type ReportPeriod = 'current_month' | 'last_month' | 'custom';

interface ReportRequest {
  type: ReportType;
  period: ReportPeriod;
  startDate?: string;
  endDate?: string;
  employeeId?: string;
  companyId?: string;
}

interface ReportResult {
  type: ReportType;
  period: string;
  filename: string;
  content: string | Blob;
  generatedAt: number;
  recordCount: number;
}

export default function ReportsManager({ className = '' }: ReportsManagerProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentReport, setCurrentReport] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  // Estado do formulário
  const [formData, setFormData] = useState<ReportRequest>({
    type: 'afd',
    period: 'current_month',
    startDate: '',
    endDate: '',
    employeeId: '',
    companyId: ''
  });

  // Obter dados de marcações de ponto para o relatório
  const fetchTimeRecords = useCallback(async (request: ReportRequest) => {
    // TODO: Implementar busca real no Firebase
    // Por enquanto, dados simulados para demonstração
    
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    let startDate: Date, endDate: Date;
    
    switch (request.period) {
      case 'current_month':
        startDate = new Date(currentYear, currentMonth, 1);
        endDate = new Date(currentYear, currentMonth + 1, 0);
        break;
      case 'last_month':
        startDate = new Date(currentYear, currentMonth - 1, 1);
        endDate = new Date(currentYear, currentMonth, 0);
        break;
      case 'custom':
        if (!request.startDate || !request.endDate) {
          throw new Error('Datas de início e fim são obrigatórias para período customizado');
        }
        startDate = new Date(request.startDate);
        endDate = new Date(request.endDate);
        break;
      default:
        throw new Error('Período inválido');
    }

    // Simular dados de marcações para demonstração
    const mockRecords = [
      {
        employeeId: request.employeeId || user?.uid || '001',
        employeeName: 'João da Silva',
        employeePin: '001',
        timestamp: new Date(2024, 0, 15, 8, 0, 0),
        type: 'entry',
        location: { latitude: -23.5505, longitude: -46.6333 },
        method: 'facial'
      },
      {
        employeeId: request.employeeId || user?.uid || '001',
        employeeName: 'João da Silva', 
        employeePin: '001',
        timestamp: new Date(2024, 0, 15, 12, 0, 0),
        type: 'break_start',
        location: { latitude: -23.5505, longitude: -46.6333 },
        method: 'photo'
      },
      {
        employeeId: request.employeeId || user?.uid || '001',
        employeeName: 'João da Silva',
        employeePin: '001', 
        timestamp: new Date(2024, 0, 15, 13, 0, 0),
        type: 'break_end',
        location: { latitude: -23.5505, longitude: -46.6333 },
        method: 'facial'
      },
      {
        employeeId: request.employeeId || user?.uid || '001',
        employeeName: 'João da Silva',
        employeePin: '001',
        timestamp: new Date(2024, 0, 15, 17, 0, 0),
        type: 'exit',
        location: { latitude: -23.5505, longitude: -46.6333 },
        method: 'photo'
      }
    ];

    return mockRecords.filter(record => 
      record.timestamp >= startDate && record.timestamp <= endDate
    );
  }, [user]);

  // Gerar relatório AFD
  const generateAFDReport = useCallback(async (request: ReportRequest) => {
    const records = await fetchTimeRecords(request);
    
    const afdData = {
      companyData: {
        cnpj: '12.345.678/0001-90',
        companyName: 'Empresa Exemplo LTDA',
        cei: '12.345.678.90',
        address: 'Rua Exemplo, 123 - São Paulo, SP'
      },
      period: {
        startDate: request.startDate || new Date().toISOString().split('T')[0],
        endDate: request.endDate || new Date().toISOString().split('T')[0]
      },
      employees: records.map(record => ({
        pin: record.employeePin,
        name: record.employeeName,
        records: [{
          timestamp: record.timestamp,
          type: record.type,
          method: record.method
        }]
      }))
    };

    const afdContent = afdGenerator.generateAFD(afdData);
    
    return {
      content: afdContent,
      filename: `AFD_${afdData.period.startDate}_${afdData.period.endDate}.txt`,
      recordCount: records.length
    };
  }, [fetchTimeRecords]);

  // Gerar relatório AEJ
  const generateAEJReport = useCallback(async (request: ReportRequest) => {
    const records = await fetchTimeRecords(request);
    
    const aejData = {
      companyData: {
        cnpj: '12.345.678/0001-90',
        companyName: 'Empresa Exemplo LTDA',
        cei: '12.345.678.90'
      },
      employeeData: {
        pin: '001',
        name: 'João da Silva',
        cpf: '123.456.789-00',
        admission: new Date(2023, 0, 1)
      },
      period: {
        startDate: request.startDate || new Date().toISOString().split('T')[0],
        endDate: request.endDate || new Date().toISOString().split('T')[0]
      },
      records: records.map(record => ({
        date: record.timestamp,
        entries: [
          { time: '08:00', type: 'entry' },
          { time: '12:00', type: 'break_start' },
          { time: '13:00', type: 'break_end' },
          { time: '17:00', type: 'exit' }
        ]
      }))
    };

    const aejContent = aejGenerator.generateAEJ(aejData);
    
    return {
      content: aejContent,
      filename: `AEJ_${aejData.employeeData.pin}_${aejData.period.startDate}_${aejData.period.endDate}.txt`,
      recordCount: records.length
    };
  }, [fetchTimeRecords]);

  // Gerar espelho de ponto
  const generateEspelhoReport = useCallback(async (request: ReportRequest) => {
    const records = await fetchTimeRecords(request);
    
    // Gerar HTML do espelho de ponto
    const espelhoHTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Espelho de Ponto</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { text-align: center; border-bottom: 2px solid #000; margin-bottom: 20px; padding-bottom: 10px; }
        .employee-info { margin-bottom: 20px; }
        .records-table { width: 100%; border-collapse: collapse; }
        .records-table th, .records-table td { border: 1px solid #000; padding: 8px; text-align: left; }
        .records-table th { background-color: #f0f0f0; }
        .total-hours { margin-top: 20px; font-weight: bold; }
        .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="header">
        <h1>ESPELHO DE PONTO</h1>
        <h2>Empresa Exemplo LTDA</h2>
        <p>CNPJ: 12.345.678/0001-90</p>
    </div>
    
    <div class="employee-info">
        <p><strong>Funcionário:</strong> João da Silva</p>
        <p><strong>Matrícula:</strong> 001</p>
        <p><strong>Período:</strong> ${request.startDate || 'Mês atual'} a ${request.endDate || 'Presente'}</p>
    </div>
    
    <table class="records-table">
        <thead>
            <tr>
                <th>Data</th>
                <th>Entrada</th>
                <th>Saída Almoço</th>
                <th>Volta Almoço</th>
                <th>Saída</th>
                <th>Total Horas</th>
                <th>Método</th>
            </tr>
        </thead>
        <tbody>
            ${records.map((_, index) => `
            <tr>
                <td>15/01/2024</td>
                <td>08:00</td>
                <td>12:00</td>
                <td>13:00</td>
                <td>17:00</td>
                <td>08:00</td>
                <td>Facial + Foto</td>
            </tr>
            `).join('')}
        </tbody>
    </table>
    
    <div class="total-hours">
        <p>Total de Horas Trabalhadas: ${records.length * 8}h</p>
        <p>Total de Registros: ${records.length}</p>
    </div>
    
    <div class="footer">
        <p>Relatório gerado automaticamente pelo Sistema Ponto Facial PWA</p>
        <p>Data/Hora: ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`;

    return {
      content: espelhoHTML,
      filename: `Espelho_Ponto_${request.startDate || 'atual'}.html`,
      recordCount: records.length
    };
  }, [fetchTimeRecords]);

  // Gerar relatório
  const generateReport = useCallback(async () => {
    if (!user) {
      setError('Usuário não autenticado');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setCurrentReport(null);

    try {
      let result: any;
      
      switch (formData.type) {
        case 'afd':
          result = await generateAFDReport(formData);
          break;
        case 'aej':
          result = await generateAEJReport(formData);
          break;
        case 'espelho':
          result = await generateEspelhoReport(formData);
          break;
        default:
          throw new Error('Tipo de relatório não suportado');
      }

      const periodText = formData.period === 'current_month' ? 'Mês Atual' :
                        formData.period === 'last_month' ? 'Mês Anterior' :
                        `${formData.startDate} a ${formData.endDate}`;

      const reportResult: ReportResult = {
        type: formData.type,
        period: periodText,
        filename: result.filename,
        content: result.content,
        generatedAt: Date.now(),
        recordCount: result.recordCount
      };

      setCurrentReport(reportResult);
      console.log(`✅ Relatório ${formData.type.toUpperCase()} gerado com sucesso`);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao gerar relatório';
      console.error('❌ Erro ao gerar relatório:', err);
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  }, [user, formData, generateAFDReport, generateAEJReport, generateEspelhoReport]);

  // Download do relatório
  const downloadReport = useCallback(() => {
    if (!currentReport) return;

    const blob = new Blob([currentReport.content], {
      type: currentReport.type === 'espelho' ? 'text/html' : 'text/plain'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentReport.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`📥 Download iniciado: ${currentReport.filename}`);
  }, [currentReport]);

  return (
    <div className={`p-6 ${className}`}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">📋 Relatórios Legais</h2>
          <p className="text-gray-600">
            Gere relatórios AFD, AEJ e Espelho de Ponto em conformidade com a legislação trabalhista.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Formulário */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold mb-4">Gerar Relatório</h3>
            
            <div className="space-y-4">
              {/* Tipo de relatório */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Relatório
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as ReportType }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="afd">📁 AFD - Arquivo de Frequência Digital</option>
                  <option value="aej">👤 AEJ - Arquivo de Espelho de Jornada</option>
                  <option value="espelho">📄 Espelho de Ponto (HTML)</option>
                </select>
              </div>

              {/* Período */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Período
                </label>
                <select
                  value={formData.period}
                  onChange={(e) => setFormData(prev => ({ ...prev, period: e.target.value as ReportPeriod }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="current_month">📅 Mês Atual</option>
                  <option value="last_month">📅 Mês Anterior</option>
                  <option value="custom">📅 Período Customizado</option>
                </select>
              </div>

              {/* Datas customizadas */}
              {formData.period === 'custom' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data Início
                    </label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data Fim
                    </label>
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}

              {/* ID do funcionário (para AEJ) */}
              {formData.type === 'aej' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ID do Funcionário
                  </label>
                  <input
                    type="text"
                    value={formData.employeeId}
                    onChange={(e) => setFormData(prev => ({ ...prev, employeeId: e.target.value }))}
                    placeholder="Deixe vazio para usuário atual"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              )}

              {/* Botão gerar */}
              <button
                onClick={generateReport}
                disabled={isGenerating}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? '⏳ Gerando...' : '📊 Gerar Relatório'}
              </button>
            </div>
          </div>

          {/* Resultado */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold mb-4">Resultado</h3>
            
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
                <div className="flex items-start">
                  <div className="text-red-600 mr-2">⚠️</div>
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              </div>
            )}

            {currentReport ? (
              <div className="space-y-4">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-green-800 font-medium">
                      ✅ Relatório gerado com sucesso!
                    </div>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div><strong>Tipo:</strong> {currentReport.type.toUpperCase()}</div>
                    <div><strong>Período:</strong> {currentReport.period}</div>
                    <div><strong>Registros:</strong> {currentReport.recordCount}</div>
                    <div><strong>Arquivo:</strong> {currentReport.filename}</div>
                    <div><strong>Gerado:</strong> {new Date(currentReport.generatedAt).toLocaleString('pt-BR')}</div>
                  </div>
                </div>

                <button
                  onClick={downloadReport}
                  className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors"
                >
                  📥 Baixar Relatório
                </button>

                {/* Preview para espelho de ponto */}
                {currentReport.type === 'espelho' && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Preview:</h4>
                    <div 
                      className="border rounded p-4 bg-gray-50 text-xs overflow-auto max-h-40"
                      dangerouslySetInnerHTML={{ __html: currentReport.content as string }}
                    />
                  </div>
                )}
              </div>
            ) : !isGenerating && (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">📋</div>
                <p>Selecione as opções e clique em "Gerar Relatório" para começar</p>
              </div>
            )}

            {isGenerating && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Gerando relatório...</p>
              </div>
            )}
          </div>
        </div>

        {/* Informações sobre os relatórios */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h4 className="text-lg font-semibold text-blue-900 mb-4">ℹ️ Sobre os Relatórios</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <h5 className="font-medium text-blue-800 mb-2">📁 AFD - Arquivo de Frequência Digital</h5>
              <p className="text-blue-700">
                Arquivo exigido pela legislação trabalhista que contém todos os registros de ponto da empresa.
                Usado para fiscalizações e auditorias.
              </p>
            </div>
            <div>
              <h5 className="font-medium text-blue-800 mb-2">👤 AEJ - Arquivo de Espelho de Jornada</h5>
              <p className="text-blue-700">
                Relatório individual do funcionário com detalhamento das jornadas de trabalho.
                Essencial para cálculos trabalhistas.
              </p>
            </div>
            <div>
              <h5 className="font-medium text-blue-800 mb-2">📄 Espelho de Ponto</h5>
              <p className="text-blue-700">
                Relatório visual em HTML com formatação para impressão ou visualização.
                Ideal para apresentação e conferência.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { ReportsManagerProps };
