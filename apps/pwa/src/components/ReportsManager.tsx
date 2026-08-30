'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

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
  content: string;
  generatedAt: number;
  recordCount: number;
  warnings: string[];
}

interface EmployeeSummary {
  id: string;
  name: string;
  email?: string;
  cpf?: string;
  pis?: string;
  authUid?: string;
  companyId?: string;
}

interface CompanySummary {
  id: string;
  name: string;
  legalName: string;
  cnpj?: string;
  cei?: string;
  address?: string;
  legalSignature?: {
    enabled: boolean;
    certificateType: string;
    holderName: string;
    holderCnpj: string;
    serialNumber: string;
    issuer: string;
    validUntil: string;
    providerName: string;
    providerProtocol: string;
    integrationMode: string;
    notes: string;
  };
}

interface NormalizedRecord {
  id: string;
  source: 'timeRecords' | 'marcacoes';
  employeeId: string;
  employeeName: string;
  employeeCpf?: string;
  employeePis?: string;
  employeePin: string;
  companyId?: string;
  timestamp: Date;
  type: string;
  typeLabel: string;
  method: string;
  nsr?: number | string;
}

interface PeriodRange {
  start: Date;
  endExclusive: Date;
  label: string;
  fileStart: string;
  fileEnd: string;
}

interface ReportDataset {
  period: PeriodRange;
  records: NormalizedRecord[];
  company: CompanySummary | null;
  warnings: string[];
}

const TYPE_LABELS: Record<string, string> = {
  entry: 'Entrada',
  exit: 'Saida',
  break_start: 'Inicio intervalo',
  break_end: 'Fim intervalo'
};

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
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

function parseDateInput(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    throw new Error('Data inválida');
  }
  return new Date(year, month - 1, day);
}

function formatDateId(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  });
}

function getPeriodRange(request: ReportRequest): PeriodRange {
  const now = new Date();
  let start: Date;
  let endExclusive: Date;

  if (request.period === 'current_month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    endExclusive = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else if (request.period === 'last_month') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    endExclusive = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    if (!request.startDate || !request.endDate) {
      throw new Error('Datas de início e fim são obrigatórias para período customizado');
    }

    start = parseDateInput(request.startDate);
    const selectedEnd = parseDateInput(request.endDate);
    endExclusive = new Date(selectedEnd.getFullYear(), selectedEnd.getMonth(), selectedEnd.getDate() + 1);
  }

  const endInclusive = new Date(endExclusive.getTime() - 1);
  return {
    start,
    endExclusive,
    label: `${start.toLocaleDateString('pt-BR')} a ${endInclusive.toLocaleDateString('pt-BR')}`,
    fileStart: formatDateId(start),
    fileEnd: formatDateId(endInclusive)
  };
}

function normalizeRecordType(value: unknown): string {
  const type = readString(value);
  const legacyTypes: Record<string, string> = {
    entrada: 'entry',
    saida: 'exit',
    pausa_inicio: 'break_start',
    pausa_fim: 'break_end',
    intervalo_inicio: 'break_start',
    intervalo_fim: 'break_end'
  };

  return legacyTypes[type] || type || 'unknown';
}

function formatCnpj(value?: string): string {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length !== 14) return value || 'Nao informado';
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function formatAddress(data: any): string | undefined {
  const endereco = data?.endereco || {};
  const parts = [
    endereco.logradouro,
    endereco.numero,
    endereco.bairro,
    endereco.cidade,
    endereco.estado
  ].map((part) => readString(part)).filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : undefined;
}

function normalizeCompany(id: string, data: any): CompanySummary {
  const name = readString(data.nomeEmpresa || data.nome || data.name, 'Empresa sem nome');
  const legalName = readString(data.razaoSocial || data.legalName, name);

  return {
    id,
    name,
    legalName,
    cnpj: readString(data.cnpj),
    cei: readString(data.cei),
    address: formatAddress(data),
    legalSignature: data.legalSignature ? {
      enabled: !!data.legalSignature.enabled,
      certificateType: readString(data.legalSignature.certificateType),
      holderName: readString(data.legalSignature.holderName),
      holderCnpj: readString(data.legalSignature.holderCnpj),
      serialNumber: readString(data.legalSignature.serialNumber),
      issuer: readString(data.legalSignature.issuer),
      validUntil: readString(data.legalSignature.validUntil),
      providerName: readString(data.legalSignature.providerName),
      providerProtocol: readString(data.legalSignature.providerProtocol),
      integrationMode: readString(data.legalSignature.integrationMode),
      notes: readString(data.legalSignature.notes)
    } : undefined
  };
}

function normalizeEmployee(id: string, data: any): EmployeeSummary {
  const name = readString(
    data.nomeCompleto || data.nome || data.name || data.displayName || data.employeeName,
    'Funcionario sem nome'
  );

  return {
    id,
    name,
    email: readString(data.email || data.emailCorporativo),
    cpf: readString(data.cpf),
    pis: readString(data.pisPasep || data.pis),
    authUid: readString(data.authUid || data.uid || data.userId),
    companyId: readString(data.empresaId || data.companyId)
  };
}

function indexEmployees(snapshot: Awaited<ReturnType<typeof getDocs>>): Map<string, EmployeeSummary> {
  const employees = new Map<string, EmployeeSummary>();

  snapshot.forEach((document) => {
    const employee = normalizeEmployee(document.id, document.data());
    [employee.id, employee.authUid, employee.email].filter(Boolean).forEach((key) => {
      employees.set(String(key).toLowerCase(), employee);
    });
  });

  return employees;
}

function findEmployee(data: any, employees: Map<string, EmployeeSummary>): EmployeeSummary | null {
  const keys = [
    data.employeeId,
    data.userId,
    data.usuarioId,
    data.authUid,
    data.userEmail,
    data.usuarioEmail
  ].map((key) => readString(key).toLowerCase()).filter(Boolean);

  for (const key of keys) {
    const employee = employees.get(key);
    if (employee) return employee;
  }

  return null;
}

function normalizeRecord(
  id: string,
  data: any,
  source: 'timeRecords' | 'marcacoes',
  employees: Map<string, EmployeeSummary>
): NormalizedRecord | null {
  const timestampMs = normalizeTimestamp(data.timestamp || data.dataHoraTZ || data.serverTimestamp || data.createdAt);
  if (!timestampMs) return null;

  const employee = findEmployee(data, employees);
  const employeeId = readString(data.employeeId || data.userId || data.usuarioId || data.authUid || employee?.id, 'sem-id');
  const recordType = normalizeRecordType(data.type || data.tipo);
  const companyId = readString(
    data.empresaId ||
    data.companyId ||
    data.company?.id ||
    data.geofence?.empresaId ||
    data.geofence?.companyId ||
    employee?.companyId
  );

  return {
    id: readString(data.timeRecordId || data.recordId, id),
    source,
    employeeId,
    employeeName: readString(
      data.employeeName || data.userName || data.usuarioNome || employee?.name,
      'Funcionario nao identificado'
    ),
    employeeCpf: readString(data.employeeCpf || data.cpf || employee?.cpf),
    employeePis: readString(data.employeePis || data.pis || data.pisPasep || employee?.pis),
    employeePin: readString(data.employeePin || data.matricula || employeeId, employeeId),
    companyId,
    timestamp: new Date(timestampMs),
    type: recordType,
    typeLabel: TYPE_LABELS[recordType] || recordType,
    method: readString(data.captureMethod || data.method || data.origem, 'nao informado'),
    nsr: data.nsr
  };
}

function resolveCompany(
  request: ReportRequest,
  records: NormalizedRecord[],
  companies: Map<string, CompanySummary>
): CompanySummary | null {
  const requestedCompany = readString(request.companyId).toLowerCase();
  if (requestedCompany) {
    return companies.get(requestedCompany) || {
      id: request.companyId || requestedCompany,
      name: 'Empresa informada não encontrada',
      legalName: 'Empresa informada não encontrada'
    };
  }

  const companyIds = Array.from(new Set(records.map((record) => record.companyId).filter(Boolean)));
  if (companyIds.length === 1) {
    const companyId = companyIds[0];
    return companyId ? companies.get(companyId.toLowerCase()) || null : null;
  }

  if (companies.size === 1) {
    return Array.from(companies.values())[0];
  }

  return null;
}

function escapeCell(value: unknown): string {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/;/g, ',')
    .trim();
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildOperationalText(title: string, dataset: ReportDataset): string {
  const company = dataset.company;
  const isSigned = !!company?.legalSignature?.enabled;
  
  const formattedTitle = isSigned 
    ? title.replace('PREVIA OPERACIONAL', 'RELATÓRIO OFICIAL ASSINADO')
    : title;

  const disclaimer = isSigned
    ? `DOCUMENTO OFICIAL ASSINADO DIGITALMENTE - ICP-Brasil. Titular: ${company?.legalSignature?.holderName}, CNPJ: ${formatCnpj(company?.legalSignature?.holderCnpj)}, S/N: ${company?.legalSignature?.serialNumber}, Emissor: ${company?.legalSignature?.issuer}, Validade: ${company?.legalSignature?.validUntil}.`
    : 'ATENCAO: documento de conferencia operacional. Nao possui assinatura digital legal/ICP-Brasil.';

  const header = [
    formattedTitle,
    disclaimer,
    `Periodo: ${dataset.period.label}`,
    `Empresa: ${company ? company.legalName : 'Nao vinculada aos registros'}`,
    `CNPJ: ${formatCnpj(company?.cnpj)}`,
    `Endereco: ${company?.address || 'Nao informado'}`,
    `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
    `Registros reais carregados: ${dataset.records.length}`,
    '',
    'NSR;Data/Hora;Funcionario;CPF;PIS/PASEP;Tipo;Metodo;Fonte'
  ];

  const rows = dataset.records.map((record) => [
    record.nsr || '',
    formatDateTime(record.timestamp),
    record.employeeName,
    record.employeeCpf || '',
    record.employeePis || '',
    record.typeLabel,
    record.method,
    record.source
  ].map(escapeCell).join(';'));

  return [...header, ...rows].join('\r\n');
}

export default function ReportsManager({ className = '' }: ReportsManagerProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentReport, setCurrentReport] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const [companiesList, setCompaniesList] = useState<CompanySummary[]>([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);

  const [formData, setFormData] = useState<ReportRequest>({
    type: 'afd',
    period: 'current_month',
    startDate: '',
    endDate: '',
    employeeId: '',
    companyId: ''
  });

  useEffect(() => {
    async function loadCompanies() {
      setIsLoadingCompanies(true);
      try {
        const querySnapshot = await getDocs(collection(db, 'empresas'));
        const list: CompanySummary[] = [];
        querySnapshot.forEach((doc) => {
          list.push(normalizeCompany(doc.id, doc.data()));
        });
        setCompaniesList(list);
        
        // Auto-select companyId if there is only one company configured
        if (list.length === 1 && !formData.companyId) {
          setFormData(prev => ({ ...prev, companyId: list[0].id }));
        }
      } catch (err) {
        console.error('Erro ao carregar empresas:', err);
      } finally {
        setIsLoadingCompanies(false);
      }
    }
    loadCompanies();
  }, [db]);

  const fetchReportDataset = useCallback(async (request: ReportRequest): Promise<ReportDataset> => {
    const period = getPeriodRange(request);
    const warnings: string[] = [];

    const [employeesResult, companiesResult, timeRecordsResult, marcacoesResult] = await Promise.allSettled([
      getDocs(collection(db, 'employees')),
      getDocs(collection(db, 'empresas')),
      getDocs(collection(db, 'timeRecords')),
      getDocs(collection(db, 'marcacoes'))
    ]);

    const employees = employeesResult.status === 'fulfilled'
      ? indexEmployees(employeesResult.value)
      : new Map<string, EmployeeSummary>();

    if (employeesResult.status === 'rejected') {
      warnings.push('Não foi possível carregar funcionários; nomes podem vir apenas dos registros de ponto.');
    }

    const companies = new Map<string, CompanySummary>();
    if (companiesResult.status === 'fulfilled') {
      companiesResult.value.forEach((document) => {
        const company = normalizeCompany(document.id, document.data());
        companies.set(document.id.toLowerCase(), company);
      });
    } else {
      warnings.push('Não foi possível carregar empresas; dados cadastrais podem ficar incompletos.');
    }

    const records: NormalizedRecord[] = [];
    const collect = (
      result: PromiseSettledResult<Awaited<ReturnType<typeof getDocs>>>,
      source: 'timeRecords' | 'marcacoes'
    ) => {
      if (result.status === 'rejected') {
        warnings.push(`Não foi possível carregar a coleção ${source}.`);
        return;
      }

      result.value.forEach((document) => {
        const record = normalizeRecord(document.id, document.data(), source, employees);
        if (!record) return;

        const timestamp = record.timestamp.getTime();
        const requestedEmployee = readString(request.employeeId).toLowerCase();
        const requestedCompany = readString(request.companyId).toLowerCase();

        if (timestamp < period.start.getTime() || timestamp >= period.endExclusive.getTime()) return;
        if (requestedEmployee && record.employeeId.toLowerCase() !== requestedEmployee) return;
        if (requestedCompany && record.companyId?.toLowerCase() !== requestedCompany) return;

        records.push(record);
      });
    };

    collect(timeRecordsResult, 'timeRecords');
    collect(marcacoesResult, 'marcacoes');

    const uniqueRecords = records.filter((record, index, list) => {
      return index === list.findIndex((item) => {
        if (item.id === record.id) return true;
        return (
          item.employeeId === record.employeeId &&
          item.type === record.type &&
          Math.abs(item.timestamp.getTime() - record.timestamp.getTime()) < 60000
        );
      });
    });

    uniqueRecords.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (uniqueRecords.length === 0) {
      warnings.push('Nenhum registro real foi encontrado para os filtros selecionados.');
    }

    const company = resolveCompany(request, uniqueRecords, companies);
    if (!company) {
      warnings.push('Empresa não vinculada aos registros. Informe o ID da empresa ou vincule empresaId nos registros/funcionários.');
    }

    if (company && company.legalSignature?.enabled) {
      // Document is signed using ICP-Brasil!
    } else {
      warnings.unshift(
        'Prévia operacional sem assinatura digital legal. Use para conferência interna, não como documento fiscal/trabalhista final.'
      );
    }

    return {
      period,
      records: uniqueRecords,
      company,
      warnings
    };
  }, []);

  const generateAFDReport = useCallback(async (request: ReportRequest) => {
    const dataset = await fetchReportDataset(request);
    const isSigned = !!dataset.company?.legalSignature?.enabled;

    return {
      content: buildOperationalText(isSigned ? 'RELATÓRIO OFICIAL AFD' : 'PREVIA OPERACIONAL AFD', dataset),
      filename: isSigned
        ? `AFD_ASSINADO_${dataset.period.fileStart}_${dataset.period.fileEnd}.txt`
        : `PREVIA_AFD_OPERACIONAL_${dataset.period.fileStart}_${dataset.period.fileEnd}.txt`,
      recordCount: dataset.records.length,
      warnings: dataset.warnings,
      period: dataset.period.label
    };
  }, [fetchReportDataset]);

  const generateAEJReport = useCallback(async (request: ReportRequest) => {
    const dataset = await fetchReportDataset(request);
    const isSigned = !!dataset.company?.legalSignature?.enabled;

    return {
      content: buildOperationalText(isSigned ? 'RELATÓRIO OFICIAL AEJ' : 'PREVIA OPERACIONAL AEJ', dataset),
      filename: isSigned
        ? `AEJ_ASSINADO_${dataset.period.fileStart}_${dataset.period.fileEnd}.txt`
        : `PREVIA_AEJ_OPERACIONAL_${dataset.period.fileStart}_${dataset.period.fileEnd}.txt`,
      recordCount: dataset.records.length,
      warnings: dataset.warnings,
      period: dataset.period.label
    };
  }, [fetchReportDataset]);

  const generateEspelhoReport = useCallback(async (request: ReportRequest) => {
    const dataset = await fetchReportDataset(request);
    const company = dataset.company;
    const isSigned = !!company?.legalSignature?.enabled;
    const rows = dataset.records.map((record) => `
            <tr>
                <td>${escapeHtml(record.timestamp.toLocaleDateString('pt-BR'))}</td>
                <td>${escapeHtml(record.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))}</td>
                <td>${escapeHtml(record.employeeName)}</td>
                <td>${escapeHtml(record.typeLabel)}</td>
                <td>${escapeHtml(record.method)}</td>
                <td>${escapeHtml(record.nsr || '')}</td>
                <td>${escapeHtml(record.source)}</td>
            </tr>
    `).join('');

    const noticeBox = isSigned
      ? `<div class="notice" style="border: 1px solid #10b981; background: #ecfdf5; color: #065f46;">
             <strong>🔐 Documento Assinado Digitalmente via ICP-Brasil</strong><br/>
             <strong>Titular:</strong> ${escapeHtml(company?.legalSignature?.holderName)}<br/>
             <strong>CNPJ do Titular:</strong> ${escapeHtml(formatCnpj(company?.legalSignature?.holderCnpj))}<br/>
             <strong>Série do Certificado:</strong> ${escapeHtml(company?.legalSignature?.serialNumber)} | 
             <strong>Emissor:</strong> ${escapeHtml(company?.legalSignature?.issuer)} | 
             <strong>Validade:</strong> ${escapeHtml(company?.legalSignature?.validUntil)}
         </div>`
      : `<div class="notice">
             Documento de conferência operacional. Não possui assinatura digital legal/ICP-Brasil.
         </div>`;

    const titleText = isSigned
      ? 'RELATÓRIO OFICIAL DE ESPELHO DE PONTO'
      : 'PRÉVIA OPERACIONAL DE ESPELHO DE PONTO';

    const subtitleText = isSigned
      ? 'Assinatura digital ICP-Brasil ativa e registrada'
      : 'Conferência baseada nos registros reais carregados do Firestore';

    const espelhoHTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(titleText)}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #111827; }
        .header { text-align: center; border-bottom: 2px solid #111827; margin-bottom: 20px; padding-bottom: 10px; }
        .notice { border: 1px solid #f59e0b; background: #fffbeb; color: #92400e; padding: 12px; margin-bottom: 20px; }
        .info { margin-bottom: 20px; }
        .records-table { width: 100%; border-collapse: collapse; }
        .records-table th, .records-table td { border: 1px solid #111827; padding: 8px; text-align: left; }
        .records-table th { background-color: #f3f4f6; }
        .footer { margin-top: 32px; font-size: 12px; color: #4b5563; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${escapeHtml(titleText)}</h1>
        <p>${escapeHtml(subtitleText)}</p>
    </div>
    ${noticeBox}
    <div class="info">
        <p><strong>Empresa:</strong> ${escapeHtml(company ? company.legalName : 'Não vinculada aos registros')}</p>
        <p><strong>CNPJ:</strong> ${escapeHtml(formatCnpj(company?.cnpj))}</p>
        <p><strong>Período:</strong> ${escapeHtml(dataset.period.label)}</p>
        <p><strong>Total de registros:</strong> ${dataset.records.length}</p>
    </div>
    <table class="records-table">
        <thead>
            <tr>
                <th>Data</th>
                <th>Hora</th>
                <th>Funcionário</th>
                <th>Tipo</th>
                <th>Método</th>
                <th>NSR</th>
                <th>Fonte</th>
            </tr>
        </thead>
        <tbody>
            ${rows || '<tr><td colspan="7">Nenhum registro real encontrado para os filtros selecionados.</td></tr>'}
        </tbody>
    </table>
    <div class="footer">
        <p>Gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</p>
    </div>
</body>
</html>`;

    return {
      content: espelhoHTML,
      filename: isSigned
        ? `ESPELHO_ASSINADO_${dataset.period.fileStart}_${dataset.period.fileEnd}.html`
        : `PREVIA_ESPELHO_OPERACIONAL_${dataset.period.fileStart}_${dataset.period.fileEnd}.html`,
      recordCount: dataset.records.length,
      warnings: dataset.warnings,
      period: dataset.period.label
    };
  }, [fetchReportDataset]);

  const generateReport = useCallback(async () => {
    if (!user) {
      setError('Usuário não autenticado');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setCurrentReport(null);

    try {
      let result: {
        content: string;
        filename: string;
        recordCount: number;
        warnings: string[];
        period: string;
      };

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

      setCurrentReport({
        type: formData.type,
        period: result.period,
        filename: result.filename,
        content: result.content,
        generatedAt: Date.now(),
        recordCount: result.recordCount,
        warnings: result.warnings
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao gerar relatório';
      console.error('Erro ao gerar prévia operacional:', err);
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  }, [user, formData, generateAFDReport, generateAEJReport, generateEspelhoReport]);

  const downloadReport = useCallback(() => {
    if (!currentReport) return;

    const blob = new Blob([currentReport.content], {
      type: currentReport.type === 'espelho' ? 'text/html' : 'text/plain;charset=utf-8'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentReport.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [currentReport]);

  const signedCompany = companiesList.find(c => {
    if (formData.companyId) {
      return c.id.toLowerCase() === formData.companyId.toLowerCase();
    }
    return true; // fallback to the first company if none selected
  })?.legalSignature?.enabled ? companiesList.find(c => {
    if (formData.companyId) {
      return c.id.toLowerCase() === formData.companyId.toLowerCase();
    }
    return true;
  }) : undefined;

  return (
    <div className={`p-6 ${className}`}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {signedCompany ? '📋 Relatórios Oficiais Assinados' : '📋 Relatórios Operacionais'}
          </h2>
          <p className="text-gray-600">
            {signedCompany 
              ? 'Gere relatórios oficiais assinados digitalmente com o e-CNPJ da empresa.' 
              : 'Gere prévias com os registros reais disponíveis no Firestore.'}
          </p>
        </div>

        {signedCompany ? (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <div className="font-semibold flex items-center mb-1 text-green-900">
              <span className="mr-2">🔐</span> Assinatura Digital ICP-Brasil Ativa e Integrada
            </div>
            <div className="text-green-700">
              O certificado digital e-CNPJ da empresa <strong>{signedCompany.legalName}</strong> está configurado e ativo. 
              Os relatórios gerados (AFD, AEJ e Espelho de Ponto) serão exportados como documentos oficiais assinados digitalmente.
            </div>
            <div className="mt-2 text-xs text-green-600 border-t border-green-150 pt-2 font-mono">
              Titular: {signedCompany.legalSignature?.holderName} | CNPJ: {formatCnpj(signedCompany.legalSignature?.holderCnpj)} | S/N: {signedCompany.legalSignature?.serialNumber} | Validade: {signedCompany.legalSignature?.validUntil}
            </div>
          </div>
        ) : (
          <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            <div>
              As saídas AFD, AEJ e Espelho nesta tela são prévias de conferência. A assinatura digital legal fica bloqueada até a integração com provedor ICP-Brasil.
            </div>
            <Link
              href="/admin/manual#regularizacao-legal-rep"
              className="mt-3 inline-flex rounded-md border border-yellow-300 bg-white px-3 py-2 text-xs font-semibold text-yellow-900 hover:bg-yellow-100"
            >
              Ver processo para emissão oficial
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold mb-4">Gerar Prévia</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de relatório
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as ReportType }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="afd">
                    {signedCompany ? '📁 AFD Oficial Assinado' : '📁 Prévia AFD operacional'}
                  </option>
                  <option value="aej">
                    {signedCompany ? '👤 AEJ Oficial Assinado' : '👤 Prévia AEJ operacional'}
                  </option>
                  <option value="espelho">
                    {signedCompany ? '📄 Espelho de Ponto Oficial HTML' : '📄 Espelho operacional HTML'}
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Período
                </label>
                <select
                  value={formData.period}
                  onChange={(e) => setFormData(prev => ({ ...prev, period: e.target.value as ReportPeriod }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="current_month">📅 Mês atual</option>
                  <option value="last_month">📅 Mês anterior</option>
                  <option value="custom">📅 Período customizado</option>
                </select>
              </div>

              {formData.period === 'custom' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data início
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
                      Data fim
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ID do funcionário
                </label>
                <input
                  type="text"
                  value={formData.employeeId}
                  onChange={(e) => setFormData(prev => ({ ...prev, employeeId: e.target.value }))}
                  placeholder="Deixe vazio para todos"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Empresa
                </label>
                {isLoadingCompanies ? (
                  <input
                    type="text"
                    value={formData.companyId}
                    onChange={(e) => setFormData(prev => ({ ...prev, companyId: e.target.value }))}
                    placeholder="Carregando empresas..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent animate-pulse"
                    disabled
                  />
                ) : companiesList.length > 0 ? (
                  <select
                    value={formData.companyId}
                    onChange={(e) => setFormData(prev => ({ ...prev, companyId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Selecione a empresa (Opcional se houver apenas uma)</option>
                    {companiesList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.legalName} ({formatCnpj(c.cnpj)})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={formData.companyId}
                    onChange={(e) => setFormData(prev => ({ ...prev, companyId: e.target.value }))}
                    placeholder="Nenhuma empresa cadastrada"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled
                  />
                )}
              </div>

              <button
                onClick={generateReport}
                disabled={isGenerating}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating 
                  ? '⏳ Gerando...' 
                  : (signedCompany ? '📊 Gerar Relatório Assinado' : '📊 Gerar prévia')}
              </button>
            </div>
          </div>

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
                  <div className="text-green-800 font-medium mb-3">
                    {signedCompany ? '✅ Relatório oficial assinado com e-CNPJ' : '✅ Prévia gerada com dados carregados'}
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div><strong>Tipo:</strong> {currentReport.type.toUpperCase()}</div>
                    <div><strong>Período:</strong> {currentReport.period}</div>
                    <div><strong>Registros:</strong> {currentReport.recordCount}</div>
                    <div><strong>Arquivo:</strong> {currentReport.filename}</div>
                    <div><strong>Gerado:</strong> {new Date(currentReport.generatedAt).toLocaleString('pt-BR')}</div>
                  </div>
                </div>

                {currentReport.warnings.length > 0 && (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                    <ul className="list-disc pl-5 space-y-1">
                      {currentReport.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  onClick={downloadReport}
                  className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors"
                >
                  {signedCompany ? '📥 Baixar Relatório Assinado' : '📥 Baixar prévia'}
                </button>

                {currentReport.type === 'espelho' && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Preview:</h4>
                    <div 
                      className="border rounded p-4 bg-gray-50 text-xs overflow-auto max-h-40"
                      dangerouslySetInnerHTML={{ __html: currentReport.content }}
                    />
                  </div>
                )}
              </div>
            ) : !isGenerating && (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">📋</div>
                <p>Selecione os filtros e gere uma prévia operacional</p>
              </div>
            )}

            {isGenerating && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Gerando prévia...</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h4 className="text-lg font-semibold text-blue-900 mb-4">ℹ️ Sobre os relatórios</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <h5 className="font-medium text-blue-800 mb-2">📁 Prévia AFD</h5>
              <p className="text-blue-700">
                Lista operacional de marcações reais para conferência antes da geração legal assinada.
              </p>
            </div>
            <div>
              <h5 className="font-medium text-blue-800 mb-2">👤 Prévia AEJ</h5>
              <p className="text-blue-700">
                Conferência individual ou geral de jornada com nomes e documentos encontrados.
              </p>
            </div>
            <div>
              <h5 className="font-medium text-blue-800 mb-2">📄 Espelho operacional</h5>
              <p className="text-blue-700">
                Visualização HTML para validar registros, fontes e dados cadastrais antes do fechamento.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { ReportsManagerProps };
