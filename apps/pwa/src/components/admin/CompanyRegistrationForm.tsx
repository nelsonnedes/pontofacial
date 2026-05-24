'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import {
  DEFAULT_CERTIFICATE_CONNECTOR_PORT,
  fetchLocalCertificates,
  formatCertificateValidity,
  getLocalCertificateLabel
} from '@/lib/certificate-connector';
import type { LocalCertificate } from '@/lib/certificate-connector';
import { collection, addDoc, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';

interface CompanyData {
  id?: string;
  nomeEmpresa: string;
  razaoSocial: string;
  cnpj: string;
  legalSignature?: LegalSignatureConfig;
  endereco: {
    cep: string;
    logradouro: string;
    numero: string;
    complemento?: string;
    bairro: string;
    cidade: string;
    estado: string;
  };
  coordenadas: {
    latitude: number;
    longitude: number;
    precisao?: number;
  };
  telefone: string;
  email: string;
  ativo: boolean;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
  updatedBy?: string;
}

interface LegalSignatureConfig {
  enabled: boolean;
  certificateType: 'none' | 'ecnpj_a1' | 'ecnpj_a3_token' | 'ecnpj_a3_card' | 'provider_icp';
  holderName: string;
  holderCnpj: string;
  serialNumber: string;
  issuer: string;
  validUntil: string;
  providerName: string;
  providerProtocol: string;
  integrationMode: 'metadata_only' | 'a1_secure_backend' | 'a3_external_workstation' | 'provider_api';
  notes: string;
}

function createInitialCompanyData(): CompanyData {
  return {
    nomeEmpresa: '',
    razaoSocial: '',
    cnpj: '',
    legalSignature: {
      enabled: false,
      certificateType: 'none',
      holderName: '',
      holderCnpj: '',
      serialNumber: '',
      issuer: '',
      validUntil: '',
      providerName: '',
      providerProtocol: '',
      integrationMode: 'metadata_only',
      notes: ''
    },
    endereco: {
      cep: '',
      logradouro: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      estado: ''
    },
    coordenadas: {
      latitude: 0,
      longitude: 0,
      precisao: 0
    },
    telefone: '',
    email: '',
    ativo: true
  };
}

const INITIAL_COMPANY_DATA = createInitialCompanyData();

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

function parseCoordinate(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isValidCompanyCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

function normalizeCompanyData(id: string, data: any): CompanyData {
  return {
    ...createInitialCompanyData(),
    ...data,
    legalSignature: {
      ...createInitialCompanyData().legalSignature,
      ...(data.legalSignature || {})
    },
    id,
    endereco: {
      ...createInitialCompanyData().endereco,
      ...(data.endereco || {})
    },
    coordenadas: {
      latitude: parseCoordinate(data.coordenadas?.latitude ?? data.latitude),
      longitude: parseCoordinate(data.coordenadas?.longitude ?? data.longitude),
      precisao: parseCoordinate(data.coordenadas?.precisao ?? data.precisao)
    },
    ativo: data.ativo !== false && data.active !== false
  };
}

function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 14) return value || 'CNPJ não informado';
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function formatDateTime(value: any): string {
  const timestamp = normalizeTimestamp(value);
  if (!timestamp) return 'Sem data';
  return new Date(timestamp).toLocaleString('pt-BR');
}

function getCertificateTypeLabel(type?: LegalSignatureConfig['certificateType']): string {
  const labels: Record<LegalSignatureConfig['certificateType'], string> = {
    none: 'Não configurado',
    ecnpj_a1: 'e-CNPJ A1',
    ecnpj_a3_token: 'e-CNPJ A3 Token',
    ecnpj_a3_card: 'e-CNPJ A3 Cartão',
    provider_icp: 'Provedor ICP-Brasil/HSM'
  };

  return labels[type || 'none'];
}

function formatThumbprint(value: string): string {
  const cleanValue = value.replace(/\s/g, '');
  if (cleanValue.length <= 12) return cleanValue;
  return `${cleanValue.slice(0, 6)}...${cleanValue.slice(-6)}`;
}

function getLocalCertificateNotes(certificate: LocalCertificate, previousNotes: string): string {
  const manualPreviousNotes = previousNotes
    .split('\n')
    .filter(line => {
      const normalizedLine = line.trim();
      return !(
        normalizedLine.startsWith('Certificado detectado localmente pelo conector Ponto Facial') ||
        normalizedLine.startsWith('Origem:') ||
        normalizedLine.startsWith('Thumbprint:') ||
        normalizedLine.startsWith('Provedor local:')
      );
    })
    .join('\n')
    .trim();
  const lines = [
    `Certificado detectado localmente pelo conector Ponto Facial em ${new Date().toLocaleString('pt-BR')}.`,
    `Origem: ${certificate.store || 'repositório Windows'}.`,
    `Thumbprint: ${certificate.thumbprint}.`
  ];

  if (certificate.privateKeyProvider) {
    lines.push(`Provedor local: ${certificate.privateKeyProvider}.`);
  }

  if (manualPreviousNotes) {
    lines.push('', manualPreviousNotes);
  }

  return lines.join('\n');
}

export default function CompanyRegistrationForm() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [currentCompany, setCurrentCompany] = useState<CompanyData>(INITIAL_COMPANY_DATA);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [companiesError, setCompaniesError] = useState('');
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState('');
  const [localCertificates, setLocalCertificates] = useState<LocalCertificate[]>([]);
  const [selectedLocalCertificate, setSelectedLocalCertificate] = useState('');
  const [isDetectingCertificates, setIsDetectingCertificates] = useState(false);
  const [certificateConnectorMessage, setCertificateConnectorMessage] = useState('');
  const [certificateConnectorUrl, setCertificateConnectorUrl] = useState('');
  const [certificateConnectorPort, setCertificateConnectorPort] = useState(DEFAULT_CERTIFICATE_CONNECTOR_PORT);

  // Carregar empresas existentes
  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      setCompaniesLoading(true);
      setCompaniesError('');
      const querySnapshot = await getDocs(collection(db, 'empresas'));
      const companiesData: CompanyData[] = [];
      
      querySnapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        companiesData.push(normalizeCompanyData(docSnapshot.id, data));
      });

      companiesData.sort((a, b) => {
        const bTimestamp = normalizeTimestamp(b.updatedAt || b.createdAt);
        const aTimestamp = normalizeTimestamp(a.updatedAt || a.createdAt);
        return bTimestamp - aTimestamp;
      });
      
      setCompanies(companiesData);
      console.log(`✅ Carregadas ${companiesData.length} empresas`);
    } catch (error) {
      console.error('❌ Erro ao carregar empresas:', error);
      setCompaniesError('Não foi possível carregar as empresas cadastradas no banco de dados.');
    } finally {
      setCompaniesLoading(false);
    }
  };

  // Limpar mensagens
  const clearMessages = () => {
    setErrors({});
    setSuccessMessage('');
  };

  // Atualizar campos do formulário
  const updateField = (field: string, value: string) => {
    clearMessages();
    
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      const normalizedValue = parent === 'coordenadas'
        ? parseCoordinate(value)
        : value;

      setCurrentCompany(prev => ({
        ...prev,
        [parent]: {
          ...(prev[parent as keyof CompanyData] as object),
          [child]: normalizedValue
        }
      }));
    } else {
      setCurrentCompany(prev => ({ ...prev, [field]: value }));
    }
  };

  const applyLocalCertificate = (certificate: LocalCertificate) => {
    clearMessages();
    setCurrentCompany(prev => {
      const previousLegalSignature = prev.legalSignature || createInitialCompanyData().legalSignature!;
      const holderCnpj = certificate.holderCnpj || prev.cnpj.replace(/\D/g, '');
      const validUntil = certificate.notAfter ? certificate.notAfter.slice(0, 10) : previousLegalSignature.validUntil;
      const holderName = certificate.subjectName || previousLegalSignature.holderName || prev.razaoSocial || prev.nomeEmpresa;
      const issuer = certificate.issuerName || certificate.issuer || previousLegalSignature.issuer;

      return {
        ...prev,
        legalSignature: {
          ...previousLegalSignature,
          enabled: true,
          certificateType: certificate.detectedCertificateType,
          holderName,
          holderCnpj,
          serialNumber: certificate.serialNumber || previousLegalSignature.serialNumber,
          issuer,
          validUntil,
          providerName: certificate.privateKeyProvider || previousLegalSignature.providerName,
          providerProtocol: certificate.thumbprint || previousLegalSignature.providerProtocol,
          integrationMode: certificate.integrationMode,
          notes: getLocalCertificateNotes(certificate, previousLegalSignature.notes)
        }
      };
    });

    setSuccessMessage(
      `✅ Certificado carregado: ${certificate.subjectName || certificate.friendlyName || 'titular detectado'} (${formatCertificateValidity(certificate.notAfter)}).`
    );
  };

  const handleLocalCertificateSelection = (thumbprint: string) => {
    setSelectedLocalCertificate(thumbprint);
    const certificate = localCertificates.find(item => item.thumbprint === thumbprint);
    if (certificate) {
      applyLocalCertificate(certificate);
    }
  };

  const detectLocalCertificates = async () => {
    clearMessages();
    setIsDetectingCertificates(true);
    setCertificateConnectorMessage('');
    setCertificateConnectorUrl('');

    try {
      const result = await fetchLocalCertificates(certificateConnectorPort);
      setLocalCertificates(result.certificates);
      setCertificateConnectorUrl(result.connectorUrl);

      if (result.certificates.length === 0) {
        setSelectedLocalCertificate('');
        setCertificateConnectorMessage(
          'Conector ativo, mas nenhum certificado com chave privada foi encontrado. Conecte o token/cartão A3, instale o driver do fabricante ou instale o A1 no repositório pessoal do Windows.'
        );
        return;
      }

      const preferredCnpj = currentCompany.cnpj.replace(/\D/g, '');
      const preferredCertificate =
        result.certificates.find(certificate => preferredCnpj && certificate.holderCnpj === preferredCnpj) ||
        result.certificates[0];

      setSelectedLocalCertificate(preferredCertificate.thumbprint);
      applyLocalCertificate(preferredCertificate);
      setCertificateConnectorMessage(
        `${result.certificates.length} certificado(s) encontrado(s). ${result.warnings.length > 0 ? result.warnings.join(' ') : 'Selecione outro certificado se necessário.'}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível detectar certificados locais.';
      setLocalCertificates([]);
      setSelectedLocalCertificate('');
      setCertificateConnectorMessage(message);
    } finally {
      setIsDetectingCertificates(false);
    }
  };

  // Buscar CEP automaticamente
  const fetchCEP = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();
        
        if (!data.erro) {
          setCurrentCompany(prev => ({
            ...prev,
            endereco: {
              ...prev.endereco,
              logradouro: data.logradouro || '',
              bairro: data.bairro || '',
              cidade: data.localidade || '',
              estado: data.uf || ''
            }
          }));
        }
      } catch (error) {
        console.error('Erro ao buscar CEP:', error);
      }
    }
  };

  // Obter localização atual
  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setErrors({ location: 'Geolocalização não é suportada neste navegador.' });
      return;
    }

    console.log('📍 Solicitando localização da empresa...');
    setIsGettingLocation(true);

    const options = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('✅ Localização da empresa obtida:', {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });

        setCurrentCompany(prev => ({
          ...prev,
          coordenadas: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            precisao: position.coords.accuracy
          }
        }));

        setIsGettingLocation(false);
        setSuccessMessage(`✅ Localização obtida com sucesso!\n📍 Latitude: ${position.coords.latitude.toFixed(6)}\n📍 Longitude: ${position.coords.longitude.toFixed(6)}\n🎯 Precisão: ${Math.round(position.coords.accuracy)}m`);
      },
      (error) => {
        console.error('❌ Erro ao obter localização da empresa:', error);
        setIsGettingLocation(false);
        
        let errorMessage = 'Erro desconhecido ao obter localização.';
        
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = '❌ Permissão de localização negada.\nVá nas configurações do navegador e permita acesso à localização.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = '❌ Localização indisponível.\nVerifique se o GPS está ativado.';
            break;
          case error.TIMEOUT:
            errorMessage = '❌ Tempo limite excedido.\nTente novamente.';
            break;
        }
        
        setErrors({ location: errorMessage });
      },
      options
    );
  }, []);

  // Validar formulário
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    const latitude = parseCoordinate(currentCompany.coordenadas.latitude);
    const longitude = parseCoordinate(currentCompany.coordenadas.longitude);

    if (!currentCompany.nomeEmpresa.trim()) {
      newErrors.nomeEmpresa = 'Nome da empresa é obrigatório';
    }

    if (!currentCompany.cnpj.trim()) {
      newErrors.cnpj = 'CNPJ é obrigatório';
    } else if (currentCompany.cnpj.replace(/\D/g, '').length !== 14) {
      newErrors.cnpj = 'CNPJ deve ter 14 dígitos';
    }

    if (!currentCompany.endereco.cep.trim()) {
      newErrors.cep = 'CEP é obrigatório';
    }

    if (!isValidCompanyCoordinate(latitude, longitude)) {
      newErrors.coordenadas = 'Informe latitude e longitude reais da empresa';
    }

    if (!currentCompany.email.trim()) {
      newErrors.email = 'Email é obrigatório';
    }

    const legalSignature = currentCompany.legalSignature || createInitialCompanyData().legalSignature!;
    if (legalSignature.enabled) {
      if (legalSignature.certificateType === 'none') {
        newErrors.legalSignatureType = 'Selecione o tipo de certificado/provedor ICP-Brasil';
      }

      if (!legalSignature.holderCnpj.trim()) {
        newErrors.legalSignatureCnpj = 'Informe o CNPJ titular do e-CNPJ';
      } else if (legalSignature.holderCnpj.replace(/\D/g, '').length !== 14) {
        newErrors.legalSignatureCnpj = 'CNPJ do certificado deve ter 14 dígitos';
      }

      if (!legalSignature.validUntil.trim()) {
        newErrors.legalSignatureValidUntil = 'Informe a validade do certificado';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Salvar empresa
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm() || !user?.uid) return;

    setIsLoading(true);
    clearMessages();

    try {
      const latitude = parseCoordinate(currentCompany.coordenadas.latitude);
      const longitude = parseCoordinate(currentCompany.coordenadas.longitude);
      const precision = parseCoordinate(currentCompany.coordenadas.precisao);
      const id = currentCompany.id;
      const legalSignature = currentCompany.legalSignature || createInitialCompanyData().legalSignature!;
      const companyWithoutMeta = {
        nomeEmpresa: currentCompany.nomeEmpresa,
        razaoSocial: currentCompany.razaoSocial,
        cnpj: currentCompany.cnpj,
        legalSignature: currentCompany.legalSignature,
        endereco: currentCompany.endereco,
        coordenadas: currentCompany.coordenadas,
        telefone: currentCompany.telefone,
        email: currentCompany.email,
        ativo: currentCompany.ativo
      };
      const companyData = {
        ...companyWithoutMeta,
        cnpj: currentCompany.cnpj.replace(/\D/g, ''), // Apenas números
        endereco: {
          ...currentCompany.endereco,
          cep: currentCompany.endereco.cep.replace(/\D/g, '') // Apenas números
        },
        coordenadas: {
          latitude,
          longitude,
          ...(precision > 0 ? { precisao: precision } : {})
        },
        legalSignature: {
          enabled: legalSignature.enabled,
          certificateType: legalSignature.enabled ? legalSignature.certificateType : 'none',
          holderName: legalSignature.holderName.trim(),
          holderCnpj: legalSignature.holderCnpj.replace(/\D/g, ''),
          serialNumber: legalSignature.serialNumber.trim(),
          issuer: legalSignature.issuer.trim(),
          validUntil: legalSignature.validUntil,
          providerName: legalSignature.providerName.trim(),
          providerProtocol: legalSignature.providerProtocol.trim(),
          integrationMode: legalSignature.enabled ? legalSignature.integrationMode : 'metadata_only',
          notes: legalSignature.notes.trim(),
          status: legalSignature.enabled ? 'metadata_registered_pending_backend_signature' : 'not_configured',
          updatedAt: new Date().toISOString()
        },
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      };

      if (isEditing && id) {
        // Atualizar empresa existente
        await updateDoc(doc(db, 'empresas', id), companyData);
        setSuccessMessage('✅ Empresa atualizada com sucesso!');
      } else {
        // Criar nova empresa
        const docRef = await addDoc(collection(db, 'empresas'), {
          ...companyData,
          createdAt: serverTimestamp(),
          createdBy: user.uid
        });
        setSuccessMessage(`✅ Empresa cadastrada com sucesso! ID: ${docRef.id}`);
      }

      await loadCompanies();
      resetForm();
      
    } catch (error: any) {
      console.error('❌ Erro ao salvar empresa:', error);
      setErrors({ general: `Erro ao salvar empresa: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  // Resetar formulário
  const resetForm = () => {
    setCurrentCompany(createInitialCompanyData());
    setIsEditing(false);
    setSelectedLocalCertificate('');
    setCertificateConnectorMessage('');
    clearMessages();
  };

  // Editar empresa
  const editCompany = (company: CompanyData) => {
    setCurrentCompany(normalizeCompanyData(company.id || '', company));
    setIsEditing(true);
    clearMessages();
  };

  const selectedCertificateDetails = localCertificates.find(
    certificate => certificate.thumbprint === selectedLocalCertificate
  );

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          🏢 Gerenciamento de Empresas
        </h1>

        {/* Mensagens */}
        {errors.general && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
            <div className="text-red-700">{errors.general}</div>
          </div>
        )}

        {successMessage && (
          <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-4">
            <div className="text-green-700 whitespace-pre-line">{successMessage}</div>
          </div>
        )}

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Dados da Empresa */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome da Empresa <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={currentCompany.nomeEmpresa}
                onChange={(e) => updateField('nomeEmpresa', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Nome fantasia"
              />
              {errors.nomeEmpresa && <p className="text-red-500 text-xs mt-1">{errors.nomeEmpresa}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Razão Social
              </label>
              <input
                type="text"
                value={currentCompany.razaoSocial}
                onChange={(e) => updateField('razaoSocial', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Razão social da empresa"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                CNPJ <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={currentCompany.cnpj}
                onChange={(e) => updateField('cnpj', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="00.000.000/0000-00"
                maxLength={18}
              />
              {errors.cnpj && <p className="text-red-500 text-xs mt-1">{errors.cnpj}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={currentCompany.email}
                onChange={(e) => updateField('email', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="contato@empresa.com"
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Telefone
              </label>
              <input
                type="text"
                value={currentCompany.telefone}
                onChange={(e) => updateField('telefone', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="(11) 99999-9999"
              />
            </div>

            <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2">
              <input
                type="checkbox"
                checked={currentCompany.ativo}
                onChange={(event) => {
                  clearMessages();
                  setCurrentCompany(prev => ({ ...prev, ativo: event.target.checked }));
                }}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                <span className="block text-sm font-medium text-gray-700">Empresa ativa</span>
                <span className="block text-xs text-gray-500">Conta nos indicadores desta tela</span>
              </span>
            </label>
          </div>

          {/* Endereço */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">📍 Endereço da Empresa</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CEP <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={currentCompany.endereco.cep}
                  onChange={(e) => {
                    updateField('endereco.cep', e.target.value);
                    if (e.target.value.replace(/\D/g, '').length === 8) {
                      fetchCEP(e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="00000-000"
                  maxLength={9}
                />
                {errors.cep && <p className="text-red-500 text-xs mt-1">{errors.cep}</p>}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Logradouro</label>
                <input
                  type="text"
                  value={currentCompany.endereco.logradouro}
                  onChange={(e) => updateField('endereco.logradouro', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Rua, Avenida, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                <input
                  type="text"
                  value={currentCompany.endereco.numero}
                  onChange={(e) => updateField('endereco.numero', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="123"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Complemento</label>
                <input
                  type="text"
                  value={currentCompany.endereco.complemento}
                  onChange={(e) => updateField('endereco.complemento', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Sala, Andar, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
                <input
                  type="text"
                  value={currentCompany.endereco.bairro}
                  onChange={(e) => updateField('endereco.bairro', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Bairro"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                <input
                  type="text"
                  value={currentCompany.endereco.cidade}
                  onChange={(e) => updateField('endereco.cidade', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Cidade"
                />
              </div>
            </div>
          </div>

          {/* Localização */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">🌍 Localização GPS da Empresa</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Latitude <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={currentCompany.coordenadas.latitude || ''}
                  onChange={(e) => updateField('coordenadas.latitude', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="-23.550520"
                  step="any"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Longitude <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={currentCompany.coordenadas.longitude || ''}
                  onChange={(e) => updateField('coordenadas.longitude', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="-46.633308"
                  step="any"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={getCurrentLocation}
                disabled={isGettingLocation}
                className="text-sm text-blue-600 hover:text-blue-700 underline disabled:text-gray-400 disabled:no-underline flex items-center gap-1"
              >
                {isGettingLocation ? (
                  <>
                    <div className="animate-spin w-3 h-3 border border-blue-500 border-t-transparent rounded-full"></div>
                    🔄 Obtendo localização da empresa...
                  </>
                ) : (
                  '📍 Usar localização atual da empresa'
                )}
              </button>

              {parseCoordinate(currentCompany.coordenadas.precisao) > 0 && (
                <span className="text-xs text-gray-500">
                  Precisão: {Math.round(parseCoordinate(currentCompany.coordenadas.precisao))}m
                </span>
              )}
            </div>

            {errors.coordenadas && <p className="text-red-500 text-xs mt-1">{errors.coordenadas}</p>}
            {errors.location && <p className="text-red-500 text-xs mt-1 whitespace-pre-line">{errors.location}</p>}
          </div>

          {/* Assinatura legal */}
          <div className="border-t pt-6">
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <h3 className="text-lg font-semibold text-amber-950">🔐 Certificado ICP-Brasil para emissão oficial</h3>
              <p className="mt-2 leading-6">
                Configure apenas os metadados do e-CNPJ ou provedor que a empresa já possui. Não envie arquivo A1, senha, PIN,
                chave privada, PFX, PEM ou dados sensíveis nesta tela. A assinatura legal só será ativada após integração backend segura.
              </p>
            </div>

            <label className="mb-4 flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-3">
              <input
                type="checkbox"
                checked={currentCompany.legalSignature?.enabled || false}
                onChange={(event) => {
                  clearMessages();
                  const enabled = event.target.checked;
                  setCurrentCompany(prev => ({
                    ...prev,
                    legalSignature: {
                      ...(prev.legalSignature || createInitialCompanyData().legalSignature!),
                      enabled,
                      certificateType: enabled
                        ? (prev.legalSignature?.certificateType === 'none' ? 'ecnpj_a1' : prev.legalSignature?.certificateType || 'ecnpj_a1')
                        : 'none',
                      integrationMode: enabled
                        ? (prev.legalSignature?.integrationMode || 'metadata_only')
                        : 'metadata_only'
                    }
                  }));
                }}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                <span className="block text-sm font-medium text-gray-800">Empresa possui e-CNPJ/provedor para assinatura oficial</span>
                <span className="block text-xs text-gray-500">Use para preparar PAdES/CAdES. Prévia operacional continua sem valor de documento assinado até integração final.</span>
              </span>
            </label>

            {currentCompany.legalSignature?.enabled && (
              <div className="space-y-4">
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h4 className="font-semibold text-sky-950">Detectar certificados instalados neste PC</h4>
                      <p className="mt-1 leading-6">
                        O navegador não acessa certificados do Windows ou token USB diretamente. Rode o conector local no PC do administrador
                        para listar certificados A1 instalados e A3 conectados com driver ativo.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={detectLocalCertificates}
                      disabled={isDetectingCertificates}
                      className="inline-flex items-center justify-center rounded-lg bg-sky-700 px-4 py-2 font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isDetectingCertificates ? 'Detectando...' : 'Detectar certificados deste PC'}
                    </button>
                  </div>

                  <div className="mt-3 rounded-md bg-white/80 px-3 py-2 font-mono text-xs text-sky-900">
                    {certificateConnectorPort === DEFAULT_CERTIFICATE_CONNECTOR_PORT
                      ? 'cd C:\\ponto-facial && pnpm cert:connector'
                      : `$env:PONTO_FACIAL_CERT_PORT="${certificateConnectorPort}"; pnpm cert:connector`}
                  </div>

                  <div className="mt-3 max-w-xs">
                    <label className="block text-xs font-semibold uppercase text-sky-900">
                      Porta do conector local
                    </label>
                    <select
                      value={certificateConnectorPort}
                      onChange={(event) => {
                        setCertificateConnectorPort(Number(event.target.value));
                        setCertificateConnectorMessage('');
                        setCertificateConnectorUrl('');
                      }}
                      className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
                    >
                      <option value={8765}>8765 padrão</option>
                      <option value={8766}>8766 alternativa</option>
                    </select>
                  </div>

                  {certificateConnectorUrl && (
                    <p className="mt-2 text-xs text-sky-800">
                      Conector ativo em {certificateConnectorUrl}. A lista abaixo carrega somente metadados seguros.
                    </p>
                  )}

                  {certificateConnectorMessage && (
                    <p className="mt-2 whitespace-pre-line text-xs text-sky-900">{certificateConnectorMessage}</p>
                  )}

                  {localCertificates.length > 0 && (
                    <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                      <div>
                        <label className="block text-xs font-semibold uppercase text-sky-900">
                          Certificados encontrados
                        </label>
                        <select
                          value={selectedLocalCertificate}
                          onChange={(event) => handleLocalCertificateSelection(event.target.value)}
                          className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
                        >
                          {localCertificates.map((certificate) => (
                            <option key={certificate.thumbprint} value={certificate.thumbprint}>
                              {getLocalCertificateLabel(certificate)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => selectedCertificateDetails && applyLocalCertificate(selectedCertificateDetails)}
                        disabled={!selectedCertificateDetails}
                        className="rounded-lg border border-sky-300 bg-white px-4 py-2 font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Recarregar dados
                      </button>
                    </div>
                  )}

                  {selectedCertificateDetails && (
                    <div className="mt-4 grid grid-cols-1 gap-2 rounded-lg border border-sky-100 bg-white p-3 text-xs text-gray-700 md:grid-cols-2">
                      <div>
                        <span className="font-semibold text-gray-900">Titular:</span>{' '}
                        {selectedCertificateDetails.subjectName || selectedCertificateDetails.subject || 'Não informado'}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-900">CNPJ detectado:</span>{' '}
                        {selectedCertificateDetails.holderCnpj || 'não encontrado no certificado'}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-900">Emissor:</span>{' '}
                        {selectedCertificateDetails.issuerName || selectedCertificateDetails.issuer || 'Não informado'}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-900">Validade:</span>{' '}
                        {formatCertificateValidity(selectedCertificateDetails.notAfter)}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-900">Origem:</span>{' '}
                        {selectedCertificateDetails.store || 'Repositório Windows'}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-900">Thumbprint:</span>{' '}
                        {formatThumbprint(selectedCertificateDetails.thumbprint)}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tipo disponível <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={currentCompany.legalSignature.certificateType}
                      onChange={(e) => {
                        const certificateType = e.target.value as LegalSignatureConfig['certificateType'];
                        const integrationMode: LegalSignatureConfig['integrationMode'] =
                          certificateType === 'ecnpj_a1'
                            ? 'a1_secure_backend'
                            : certificateType === 'ecnpj_a3_token' || certificateType === 'ecnpj_a3_card'
                              ? 'a3_external_workstation'
                              : certificateType === 'provider_icp'
                                ? 'provider_api'
                                : 'metadata_only';

                        updateField('legalSignature.certificateType', certificateType);
                        setCurrentCompany(prev => ({
                          ...prev,
                          legalSignature: {
                            ...(prev.legalSignature || createInitialCompanyData().legalSignature!),
                            certificateType,
                            integrationMode
                          }
                        }));
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="ecnpj_a1">e-CNPJ A1 (arquivo/software)</option>
                      <option value="ecnpj_a3_token">e-CNPJ A3 Token</option>
                      <option value="ecnpj_a3_card">e-CNPJ A3 Cartão</option>
                      <option value="provider_icp">Provedor ICP-Brasil/HSM</option>
                    </select>
                    {errors.legalSignatureType && <p className="text-red-500 text-xs mt-1">{errors.legalSignatureType}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Titular do certificado
                    </label>
                    <input
                      type="text"
                      value={currentCompany.legalSignature.holderName}
                      onChange={(e) => updateField('legalSignature.holderName', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Razão social no certificado"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      CNPJ do e-CNPJ <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={currentCompany.legalSignature.holderCnpj}
                      onChange={(e) => updateField('legalSignature.holderCnpj', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="00.000.000/0000-00"
                      maxLength={18}
                    />
                    {errors.legalSignatureCnpj && <p className="text-red-500 text-xs mt-1">{errors.legalSignatureCnpj}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Validade <span className="text-red-500">*</span></label>
                    <input
                      type="date"
                      value={currentCompany.legalSignature.validUntil}
                      onChange={(e) => updateField('legalSignature.validUntil', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {errors.legalSignatureValidUntil && <p className="text-red-500 text-xs mt-1">{errors.legalSignatureValidUntil}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Número de série</label>
                    <input
                      type="text"
                      value={currentCompany.legalSignature.serialNumber}
                      onChange={(e) => updateField('legalSignature.serialNumber', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Opcional, sem chave privada"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Autoridade Certificadora</label>
                    <input
                      type="text"
                      value={currentCompany.legalSignature.issuer}
                      onChange={(e) => updateField('legalSignature.issuer', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Ex.: Serasa, Certisign, Caixa..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Modo de integração</label>
                    <select
                      value={currentCompany.legalSignature.integrationMode}
                      onChange={(e) => updateField('legalSignature.integrationMode', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="metadata_only">Somente cadastro/preparação</option>
                      <option value="a1_secure_backend">A1 via backend seguro/provedor</option>
                      <option value="a3_external_workstation">A3 token/cartão em estação externa</option>
                      <option value="provider_api">API de provedor ICP-Brasil/HSM</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Provedor/HSM contratado</label>
                    <input
                      type="text"
                      value={currentCompany.legalSignature.providerName}
                      onChange={(e) => updateField('legalSignature.providerName', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Opcional"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contrato/protocolo interno</label>
                    <input
                      type="text"
                      value={currentCompany.legalSignature.providerProtocol}
                      onChange={(e) => updateField('legalSignature.providerProtocol', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Opcional"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Observações de implantação</label>
                  <textarea
                    value={currentCompany.legalSignature.notes}
                    onChange={(e) => updateField('legalSignature.notes', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ex.: certificado A3 fica na contabilidade; A1 será integrado via provedor; responsável técnico..."
                  />
                </div>

                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                  {currentCompany.legalSignature.certificateType === 'ecnpj_a1' && (
                    <p>
                      A1 é o caminho mais simples para assinatura automatizada, desde que a chave fique em cofre/HSM/provedor seguro. Não armazene PFX ou senha no Firestore.
                    </p>
                  )}
                  {(currentCompany.legalSignature.certificateType === 'ecnpj_a3_token' || currentCompany.legalSignature.certificateType === 'ecnpj_a3_card') && (
                    <p>
                      A3 token/cartão é válido, mas exige dispositivo físico e PIN. Para Firebase/Cloud Functions, use uma estação de assinatura controlada ou provedor que opere o A3 de forma compatível.
                    </p>
                  )}
                  {currentCompany.legalSignature.certificateType === 'provider_icp' && (
                    <p>
                      Provedor ICP-Brasil/HSM é o caminho recomendado para produção web: o backend chama a API do provedor e recebe PAdES/CAdES sem manipular chave privada.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Botões */}
          <div className="flex justify-between items-center pt-6 border-t">
            <button
              type="button"
              onClick={resetForm}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                  Salvando...
                </>
              ) : (
                <>
                  {isEditing ? '✅ Atualizar Empresa' : '🏢 Cadastrar Empresa'}
                </>
              )}
            </button>
          </div>
        </form>

        {/* Lista de Empresas */}
        <div className="mt-8 border-t pt-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h3 className="text-lg font-semibold text-gray-800">🏢 Empresas Cadastradas</h3>
            <button
              type="button"
              onClick={loadCompanies}
              disabled={companiesLoading}
              className="text-sm text-blue-600 hover:text-blue-700 disabled:text-gray-400"
            >
              {companiesLoading ? 'Atualizando...' : 'Atualizar lista'}
            </button>
          </div>

          {companiesError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {companiesError}
            </div>
          )}

          {companiesLoading ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              Carregando empresas cadastradas...
            </div>
          ) : companies.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              Nenhuma empresa cadastrada no banco de dados.
            </div>
          ) : (
            <div className="space-y-4">
              {companies.map((company) => {
                const latitude = parseCoordinate(company.coordenadas.latitude);
                const longitude = parseCoordinate(company.coordenadas.longitude);
                const hasGps = isValidCompanyCoordinate(latitude, longitude);

                return (
                  <div key={company.id} className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <h4 className="font-semibold text-gray-900">{company.nomeEmpresa}</h4>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            company.ativo
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-200 text-gray-600'
                          }`}>
                            {company.ativo ? 'Ativa' : 'Inativa'}
                          </span>
                        </div>
                        <p className="text-gray-600">{company.razaoSocial || 'Razão social não informada'}</p>
                        <p className="text-sm text-gray-500">CNPJ: {formatCnpj(company.cnpj)}</p>
                        <p className="text-sm text-gray-500">
                          📍 {[company.endereco.logradouro, company.endereco.numero, company.endereco.bairro]
                            .filter(Boolean)
                            .join(', ') || 'Endereço não informado'}
                          {company.endereco.cidade && ` - ${company.endereco.cidade}/${company.endereco.estado || ''}`}
                        </p>
                        <p className="text-xs text-gray-400">
                          {hasGps
                            ? `🌍 Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}`
                            : '🌍 Coordenadas GPS não informadas ou inválidas'}
                        </p>
                        <p className="text-xs text-gray-400">
                          Atualizado em: {formatDateTime(company.updatedAt || company.createdAt)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className={`rounded-full px-2 py-1 font-medium ${
                            company.legalSignature?.enabled
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-gray-200 text-gray-600'
                          }`}>
                            🔐 Assinatura: {company.legalSignature?.enabled ? getCertificateTypeLabel(company.legalSignature.certificateType) : 'não configurada'}
                          </span>
                          {company.legalSignature?.validUntil && (
                            <span className="rounded-full bg-white px-2 py-1 text-gray-600">
                              Validade: {new Date(`${company.legalSignature.validUntil}T00:00:00`).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <button
                        onClick={() => editCompany(company)}
                        className="self-start text-blue-600 hover:text-blue-700 text-sm underline"
                      >
                        ✏️ Editar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
