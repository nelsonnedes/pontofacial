'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { doc, getDoc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

interface EmployeeFormData {
  // Dados pessoais básicos
  nomeCompleto: string;
  cpf: string;
  rg: string;
  orgaoEmissor: string;
  dataNascimento: string;
  sexo: 'M' | 'F' | '';
  estadoCivil: string;
  nacionalidade: string;
  naturalidade: string;
  
  // Endereço
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  
  // Contato
  telefone: string;
  celular: string;
  email: string;
  emailCorporativo: string;
  
  // Dados profissionais
  cargo: string;
  setor: string;
  salario: string;
  dataAdmissao: string;
  tipoContrato: 'CLT' | 'PJ' | 'Terceirizado' | 'Estagiário' | '';
  cargaHoraria: string;
  horarioTrabalho: string;
  
  // Dados bancários
  banco: string;
  agencia: string;
  conta: string;
  tipoConta: 'Corrente' | 'Poupança' | '';
  
  // Documentos trabalhistas
  pisPasep: string;
  tituloEleitor: string;
  zonaEleitoral: string;
  secaoEleitoral: string;
  reservista: string;
  carteiraTrabalho: string;
  serieCtps: string;
  
  // Dados familiares/dependentes
  nomeMae: string;
  nomePai: string;
  estadoCivilConjuge?: string;
  nomeConjuge?: string;
  cpfConjuge?: string;
  
  // Observações
  observacoes: string;
}

const INITIAL_FORM_DATA: EmployeeFormData = {
  nomeCompleto: '',
  cpf: '',
  rg: '',
  orgaoEmissor: '',
  dataNascimento: '',
  sexo: '',
  estadoCivil: '',
  nacionalidade: 'Brasileira',
  naturalidade: '',
  
  cep: '',
  endereco: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
  
  telefone: '',
  celular: '',
  email: '',
  emailCorporativo: '',
  
  cargo: '',
  setor: '',
  salario: '',
  dataAdmissao: '',
  tipoContrato: '',
  cargaHoraria: '40',
  horarioTrabalho: '08:00 às 17:00',
  
  banco: '',
  agencia: '',
  conta: '',
  tipoConta: '',
  
  pisPasep: '',
  tituloEleitor: '',
  zonaEleitoral: '',
  secaoEleitoral: '',
  reservista: '',
  carteiraTrabalho: '',
  serieCtps: '',
  
  nomeMae: '',
  nomePai: '',
  estadoCivilConjuge: '',
  nomeConjuge: '',
  cpfConjuge: '',
  
  observacoes: ''
};

const EMPLOYEE_FORM_FIELDS = Object.keys(INITIAL_FORM_DATA) as Array<keyof EmployeeFormData>;
const employeeDebugEnabled =
  process.env.NODE_ENV === 'development' &&
  process.env.NEXT_PUBLIC_VERBOSE_EMPLOYEE_LOGS === 'true';

function logEmployeeDebug(...args: unknown[]): void {
  if (employeeDebugEnabled) {
    console.debug('[employee-management]', ...args);
  }
}

function normalizeEmployeeFormData(
  source: Partial<Record<keyof EmployeeFormData, unknown>> = {}
): EmployeeFormData {
  const normalized: EmployeeFormData = { ...INITIAL_FORM_DATA };

  for (const field of EMPLOYEE_FORM_FIELDS) {
    const value = source[field];

    if (typeof value === 'string') {
      (normalized as Record<keyof EmployeeFormData, string>)[field] = value;
    } else if (typeof value === 'number') {
      (normalized as Record<keyof EmployeeFormData, string>)[field] = String(value);
    }
  }

  return normalized;
}

export interface EmployeeManagementResult {
  success: boolean;
  message: string;
  employeeId?: string;
  shouldProceedToFacialRegistration?: boolean;
}

export function useEmployeeManagement() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  
  const [formData, setFormData] = useState<EmployeeFormData>(INITIAL_FORM_DATA);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [employeeId, setEmployeeId] = useState<string>('');

  // ✅ INICIALIZAR BASEADO NOS PARÂMETROS DA URL
  useEffect(() => {
    const modeParam = searchParams.get('mode') as 'create' | 'edit';
    const empId = searchParams.get('employeeId');
    
    if (modeParam) {
      setMode(modeParam);
    }
    
    if (empId && modeParam === 'edit') {
      setEmployeeId(empId);
      loadEmployeeData(empId);
    }
  }, [searchParams]);

  // ✅ CARREGAR DADOS DO FUNCIONÁRIO PARA EDIÇÃO
  const loadEmployeeData = useCallback(async (empId: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      logEmployeeDebug('Carregando dados do funcionário para edição:', empId);
      
      const employeeDoc = await getDoc(doc(db, 'employees', empId));
      
      if (!employeeDoc.exists()) {
        setError('Funcionário não encontrado');
        return false;
      }
      
      const data = normalizeEmployeeFormData(
        employeeDoc.data() as Partial<Record<keyof EmployeeFormData, unknown>>
      );
      logEmployeeDebug('Dados carregados para edição:', data.nomeCompleto);
      
      setFormData(data);
      return true;
    } catch (error) {
      console.error('❌ Erro ao carregar funcionário:', error);
      setError('Erro ao carregar dados do funcionário');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ✅ ATUALIZAR CAMPO DO FORMULÁRIO
  const updateField = useCallback((field: keyof EmployeeFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Limpar erro do campo quando usuário digita
    if (error) setError('');
  }, [error]);

  // ✅ VALIDAR CPF
  const validateCPF = useCallback((cpf: string): boolean => {
    const cleanCPF = cpf.replace(/\D/g, '');
    if (cleanCPF.length !== 11) return false;
    
    // Verificar se não é uma sequência igual
    if (/^(\d)\1+$/.test(cleanCPF)) return false;
    
    // Algoritmo de validação do CPF
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(cleanCPF[i]) * (10 - i);
    }
    let digit = (sum * 10) % 11;
    if (digit === 10) digit = 0;
    if (digit !== parseInt(cleanCPF[9])) return false;
    
    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(cleanCPF[i]) * (11 - i);
    }
    digit = (sum * 10) % 11;
    if (digit === 10) digit = 0;
    return digit === parseInt(cleanCPF[10]);
  }, []);

  // ✅ FORMATAR CPF
  const formatCPF = useCallback((value: string): string => {
    const cleanValue = value.replace(/\D/g, '');
    return cleanValue
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }, []);

  // ✅ BUSCAR CEP
  const fetchCEP = useCallback(async (cep: string) => {
    try {
      const cleanCEP = cep.replace(/\D/g, '');
      if (cleanCEP.length !== 8) return;

      const response = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`);
      const data = await response.json();

      if (data.erro) {
        setError('CEP não encontrado');
        return;
      }

      setFormData(prev => ({
        ...prev,
        endereco: data.logradouro || '',
        bairro: data.bairro || '',
        cidade: data.localidade || '',
        estado: data.uf || ''
      }));

    } catch (error) {
      console.error('Erro ao buscar CEP:', error);
      setError('Erro ao buscar CEP');
    }
  }, []);

  // ✅ VALIDAR FORMULÁRIO
  const validateForm = useCallback((): { isValid: boolean; errors: Record<string, string> } => {
    const errors: Record<string, string> = {};

    // Validações obrigatórias
    if (!formData.nomeCompleto.trim()) errors.nomeCompleto = 'Nome completo é obrigatório';
    if (!formData.cpf || !validateCPF(formData.cpf)) errors.cpf = 'CPF inválido';
    if (!formData.rg.trim()) errors.rg = 'RG é obrigatório';
    if (!formData.dataNascimento) errors.dataNascimento = 'Data de nascimento é obrigatória';
    if (!formData.email.trim()) errors.email = 'Email é obrigatório';
    if (!formData.celular.trim()) errors.celular = 'Celular é obrigatório';
    if (!formData.cargo.trim()) errors.cargo = 'Cargo é obrigatório';
    if (!formData.setor.trim()) errors.setor = 'Setor é obrigatório';
    if (!formData.dataAdmissao) errors.dataAdmissao = 'Data de admissão é obrigatória';

    // Validação de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (formData.email && !emailRegex.test(formData.email)) {
      errors.email = 'Email inválido';
    }

    return { isValid: Object.keys(errors).length === 0, errors };
  }, [formData, validateCPF]);

  // ✅ SALVAR FUNCIONÁRIO (CRIAR OU EDITAR)
  const saveEmployee = useCallback(async (): Promise<EmployeeManagementResult> => {
    try {
      setIsLoading(true);
      setError('');

      // Validar formulário
      const validation = validateForm();
      if (!validation.isValid) {
        const firstError = Object.values(validation.errors)[0];
        setError(firstError);
        return {
          success: false,
          message: firstError
        };
      }

      // Preparar dados para salvamento
      const normalizedFormData = normalizeEmployeeFormData(formData);
      const now = new Date();
      const employeeData = {
        ...normalizedFormData,
        updatedAt: now,
        ...(mode === 'create'
          ? {
              status: 'active',
              createdBy: user?.uid || 'system',
              createdAt: now,
              registrationCompleted: false,
              faceEmbedding: null,
              facialRegistrationDate: null
            }
          : {})
      };

      let savedEmployeeId = employeeId;

      if (mode === 'create') {
        // Criar novo funcionário
        logEmployeeDebug('Salvando novo funcionário:', normalizedFormData.nomeCompleto);
        const docRef = await addDoc(collection(db, 'employees'), employeeData);
        savedEmployeeId = docRef.id;
        logEmployeeDebug('Funcionário criado com ID:', savedEmployeeId);
      } else {
        if (!employeeId) {
          throw new Error('Identificador do funcionário não informado para edição.');
        }

        // Atualizar funcionário existente
        logEmployeeDebug('Atualizando funcionário:', employeeId);
        await updateDoc(doc(db, 'employees', employeeId), employeeData);
        logEmployeeDebug('Funcionário atualizado');
      }

      return {
        success: true,
        message: mode === 'create' ? 
          'Funcionário cadastrado com sucesso!' : 
          'Funcionário atualizado com sucesso!',
        employeeId: savedEmployeeId,
        shouldProceedToFacialRegistration: mode === 'create'
      };

    } catch (error: any) {
      console.error('❌ Erro ao salvar funcionário:', error);
      const errorMessage = error.code === 'permission-denied' 
        ? 'Sem permissão para salvar. Contate o administrador.'
        : `Erro ao salvar: ${error.message}`;
      
      setError(errorMessage);
      return {
        success: false,
        message: errorMessage
      };
    } finally {
      setIsLoading(false);
    }
  }, [formData, mode, employeeId, user, validateForm]);

  // ✅ CANCELAR E VOLTAR
  const cancel = useCallback(() => {
    router.back();
  }, [router]);

  return {
    // Estados
    formData,
    isLoading,
    error,
    mode,
    employeeId,
    
    // Ações
    updateField,
    validateCPF,
    formatCPF,
    fetchCEP,
    saveEmployee,
    cancel,
    
    // Utilitários
    validateForm,
    
    // Setters
    setError
  };
}
