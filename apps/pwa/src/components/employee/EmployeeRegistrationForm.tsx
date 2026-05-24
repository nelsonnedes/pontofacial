'use client';

import { notifyUser } from '@/lib/user-dialogs';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, addDoc } from 'firebase/firestore';
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
  
  observacoes: '',
};

// ✅ COMPONENTE FORMFIELD MOVIDO PARA FORA PARA EVITAR PERDA DE FOCO
interface FormFieldProps {
  label: string;
  field: keyof EmployeeFormData;
  type?: string;
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  formData: EmployeeFormData;
  errors: Partial<Record<keyof EmployeeFormData, string>>;
  updateField: (field: keyof EmployeeFormData, value: string) => void;
  fetchCEP: (cep: string) => void;
  formatCPF: (value: string) => string;
}

const FormField: React.FC<FormFieldProps> = ({ 
  label, 
  field, 
  type = 'text', 
  required, 
  placeholder, 
  options,
  formData,
  errors,
  updateField,
  fetchCEP,
  formatCPF
}) => (
  <div className="mb-4">
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    
    {options ? (
      <select
        value={formData[field]}
        onChange={(e) => updateField(field, e.target.value)}
        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
          errors[field] ? 'border-red-500' : 'border-gray-300'
        }`}
      >
        <option value="">Selecione...</option>
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    ) : (
      <input
        type={type}
        value={formData[field]}
        onChange={(e) => {
          let value = e.target.value;
          
          // Aplicar formatação específica
          if (field === 'cpf') {
            value = formatCPF(value);
          }
          
          updateField(field, value);
          
          // Auto-buscar CEP
          if (field === 'cep' && value.replace(/\D/g, '').length === 8) {
            fetchCEP(value);
          }
        }}
        placeholder={placeholder}
        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
          errors[field] ? 'border-red-500' : 'border-gray-300'
        }`}
      />
    )}
    
    {errors[field] && (
      <p className="text-red-500 text-xs mt-1">{errors[field]}</p>
    )}
  </div>
);

export default function EmployeeRegistrationForm() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [formData, setFormData] = useState<EmployeeFormData>(INITIAL_FORM_DATA);
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof EmployeeFormData | 'general', string>>>({});

  const totalSteps = 6;

  // Validar CPF
  const validateCPF = (cpf: string): boolean => {
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
  };

  // Formatar CPF
  const formatCPF = (value: string): string => {
    const cleanValue = value.replace(/\D/g, '');
    return cleanValue
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  };

  // Buscar CEP
  const fetchCEP = async (cep: string) => {
    const cleanCEP = cep.replace(/\D/g, '');
    if (cleanCEP.length === 8) {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`);
        const data = await response.json();
        
        if (!data.erro) {
          setFormData(prev => ({
            ...prev,
            endereco: data.logradouro || '',
            bairro: data.bairro || '',
            cidade: data.localidade || '',
            estado: data.uf || '',
          }));
        }
      } catch (error) {
        console.error('Erro ao buscar CEP:', error);
      }
    }
  };

  // Validar step atual
  const validateCurrentStep = (): boolean => {
    const stepErrors: Partial<Record<keyof EmployeeFormData, string>> = {};
    
    switch (currentStep) {
      case 1: // Dados pessoais
        if (!formData.nomeCompleto.trim()) stepErrors.nomeCompleto = 'Nome completo é obrigatório';
        if (!formData.cpf) stepErrors.cpf = 'CPF é obrigatório';
        else if (!validateCPF(formData.cpf)) stepErrors.cpf = 'CPF inválido';
        if (!formData.rg) stepErrors.rg = 'RG é obrigatório';
        if (!formData.dataNascimento) stepErrors.dataNascimento = 'Data de nascimento é obrigatória';
        break;
        
      case 2: // Endereço
        if (!formData.cep) stepErrors.cep = 'CEP é obrigatório';
        if (!formData.endereco) stepErrors.endereco = 'Endereço é obrigatório';
        if (!formData.numero) stepErrors.numero = 'Número é obrigatório';
        if (!formData.cidade) stepErrors.cidade = 'Cidade é obrigatória';
        if (!formData.estado) stepErrors.estado = 'Estado é obrigatório';
        break;
        
      case 3: // Contato
        if (!formData.celular) stepErrors.celular = 'Celular é obrigatório';
        if (!formData.email) stepErrors.email = 'Email é obrigatório';
        break;
        
      case 4: // Dados profissionais
        if (!formData.cargo) stepErrors.cargo = 'Cargo é obrigatório';
        if (!formData.setor) stepErrors.setor = 'Setor é obrigatório';
        if (!formData.dataAdmissao) stepErrors.dataAdmissao = 'Data de admissão é obrigatória';
        if (!formData.tipoContrato) stepErrors.tipoContrato = 'Tipo de contrato é obrigatório';
        break;
        
      case 5: // Documentos
        if (!formData.pisPasep) stepErrors.pisPasep = 'PIS/PASEP é obrigatório';
        if (!formData.carteiraTrabalho) stepErrors.carteiraTrabalho = 'CTPS é obrigatória';
        break;
    }
    
    setErrors(stepErrors);
    return Object.keys(stepErrors).length === 0;
  };

  // Próximo step
  const handleNextStep = () => {
    if (validateCurrentStep()) {
      setCurrentStep(prev => Math.min(prev + 1, totalSteps));
    }
  };

  // Step anterior
  const handlePrevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  // Salvar funcionário
  const handleSubmit = async () => {
    if (!validateCurrentStep()) {
      console.log('⚠️ Validação do step falhou');
      return;
    }
    
    if (!user?.uid) {
      console.error('❌ Usuário não autenticado');
      notifyUser('Você precisa estar logado para cadastrar funcionários.');
      return;
    }
    
    setIsLoading(true);
    try {
      console.log('📝 Dados do formulário antes do envio:', formData);
      
      // Validar campos obrigatórios críticos
      const requiredFields = ['nomeCompleto', 'cpf', 'email', 'cargo'];
      const missingFields = requiredFields.filter(field => !formData[field as keyof EmployeeFormData]);
      
      if (missingFields.length > 0) {
        throw new Error(`Campos obrigatórios não preenchidos: ${missingFields.join(', ')}`);
      }
      
      const employeeData = {
        // Dados pessoais
        nomeCompleto: formData.nomeCompleto || '',
        cpf: formData.cpf?.replace(/\D/g, '') || '', // Apenas números
        rg: formData.rg || '',
        orgaoEmissor: formData.orgaoEmissor || '',
        dataNascimento: formData.dataNascimento || '',
        sexo: formData.sexo || '',
        estadoCivil: formData.estadoCivil || '',
        nacionalidade: formData.nacionalidade || 'Brasileira',
        naturalidade: formData.naturalidade || '',
        
        // Endereço
        endereco: {
          cep: formData.cep?.replace(/\D/g, '') || '',
          logradouro: formData.endereco || '',
          numero: formData.numero || '',
          complemento: formData.complemento || '',
          bairro: formData.bairro || '',
          cidade: formData.cidade || '',
          estado: formData.estado || ''
        },
        
        // Contato
        telefone: formData.telefone?.replace(/\D/g, '') || '',
        celular: formData.celular?.replace(/\D/g, '') || '',
        email: formData.email || '',
        emailCorporativo: formData.emailCorporativo || '',
        
        // Dados profissionais
        cargo: formData.cargo || '',
        setor: formData.setor || '',
        salario: parseFloat(formData.salario) || 0,
        dataAdmissao: formData.dataAdmissao || '',
        tipoContrato: formData.tipoContrato || 'CLT',
        cargaHoraria: formData.cargaHoraria || '40',
        horarioTrabalho: formData.horarioTrabalho || '08:00 às 17:00',
        
        // Dados bancários
        dadosBancarios: {
          banco: formData.banco || '',
          agencia: formData.agencia || '',
          conta: formData.conta || '',
          tipoConta: formData.tipoConta || ''
        },
        
        // Documentos
        documentos: {
          pisPasep: formData.pisPasep || '',
          tituloEleitor: formData.tituloEleitor || '',
          zonaEleitoral: formData.zonaEleitoral || '',
          secaoEleitoral: formData.secaoEleitoral || '',
          reservista: formData.reservista || '',
          carteiraTrabalho: formData.carteiraTrabalho || '',
          serieCtps: formData.serieCtps || ''
        },
        
        // Dados familiares
        dadosFamiliares: {
          nomeMae: formData.nomeMae || '',
          nomePai: formData.nomePai || '',
          nomeConjuge: formData.nomeConjuge || '',
          cpfConjuge: formData.cpfConjuge || ''
        },
        
        // Observações
        observacoes: formData.observacoes || '',
        
        // Metadados
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending_facial_registration',
        registrationCompleted: false,
        active: true
      };
      
      console.log('📤 Enviando dados estruturados:', employeeData);
      
      const docRef = await addDoc(collection(db, 'employees'), employeeData);
      console.log('✅ Funcionário cadastrado com sucesso:', docRef.id);
      
      // Redirecionar para cadastro facial
      router.push(`/app/cadastro-facial?employeeId=${docRef.id}`);
      
    } catch (error: any) {
      console.error('❌ Erro detalhado ao salvar funcionário:', {
        message: error.message,
        code: error.code,
        details: error.details,
        stack: error.stack,
        formData: formData
      });
      
      let errorMessage = 'Erro desconhecido ao salvar funcionário.';
      
      if (error.code === 'permission-denied') {
        errorMessage = 'Você não tem permissão para cadastrar funcionários.';
      } else if (error.code === 'network-request-failed') {
        errorMessage = 'Erro de conexão. Verifique sua internet e tente novamente.';
      } else if (error.message) {
        errorMessage = `Erro: ${error.message}`;
      }
      
      setErrors(prev => ({
        ...prev,
        general: errorMessage
      }));
      
      notifyUser(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Atualizar campo
  const updateField = (field: keyof EmployeeFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Limpar erro do campo
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // ✅ FUNÇÃO AUXILIAR PARA SIMPLIFICAR FormField
  const renderFormField = (
    label: string,
    field: keyof EmployeeFormData,
    options?: {
      type?: string;
      required?: boolean;
      placeholder?: string;
      options?: Array<{ value: string; label: string }>;
    }
  ) => (
    <FormField
      label={label}
      field={field}
      type={options?.type}
      required={options?.required}
      placeholder={options?.placeholder}
      options={options?.options}
      formData={formData}
      errors={errors}
      updateField={updateField}
      fetchCEP={fetchCEP}
      formatCPF={formatCPF}
    />
  );


  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Dados Pessoais</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderFormField("Nome Completo", "nomeCompleto", { required: true })}
              {renderFormField("CPF", "cpf", { required: true, placeholder: "000.000.000-00" })}
              {renderFormField("RG", "rg", { required: true })}
              {renderFormField("Órgão Emissor", "orgaoEmissor", { placeholder: "SSP, DETRAN, etc." })}
              {renderFormField("Data de Nascimento", "dataNascimento", { type: "date", required: true })}
              {renderFormField("Sexo", "sexo", { 
                options: [
                  { value: 'M', label: 'Masculino' },
                  { value: 'F', label: 'Feminino' }
                ]
              })}
              {renderFormField("Estado Civil", "estadoCivil", {
                options: [
                  { value: 'Solteiro(a)', label: 'Solteiro(a)' },
                  { value: 'Casado(a)', label: 'Casado(a)' },
                  { value: 'Divorciado(a)', label: 'Divorciado(a)' },
                  { value: 'Viúvo(a)', label: 'Viúvo(a)' }
                ]
              })}
              {renderFormField("Nacionalidade", "nacionalidade")}
              {renderFormField("Naturalidade", "naturalidade", { placeholder: "Cidade/UF" })}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Endereço</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderFormField("CEP", "cep", { required: true, placeholder: "00000-000" })}
              {renderFormField("Endereço", "endereco", { required: true })}
              {renderFormField("Número", "numero", { required: true })}
              {renderFormField("Complemento", "complemento", { placeholder: "Apt, Bloco, etc." })}
              {renderFormField("Bairro", "bairro")}
              {renderFormField("Cidade", "cidade", { required: true })}
              {renderFormField("Estado", "estado", { required: true })}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Contato</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderFormField("Telefone Fixo", "telefone", { placeholder: "(11) 0000-0000" })}
              {renderFormField("Celular", "celular", { required: true, placeholder: "(11) 90000-0000" })}
              {renderFormField("Email Pessoal", "email", { type: "email", required: true })}
              {renderFormField("Email Corporativo", "emailCorporativo", { type: "email" })}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Dados Profissionais</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderFormField("Cargo", "cargo", { required: true })}
              {renderFormField("Setor", "setor", { required: true })}
              {renderFormField("Salário", "salario", { placeholder: "R$ 0,00" })}
              {renderFormField("Data de Admissão", "dataAdmissao", { type: "date", required: true })}
              {renderFormField("Tipo de Contrato", "tipoContrato", {
                required: true,
                options: [
                  { value: 'CLT', label: 'CLT' },
                  { value: 'PJ', label: 'Pessoa Jurídica' },
                  { value: 'Terceirizado', label: 'Terceirizado' },
                  { value: 'Estagiário', label: 'Estagiário' }
                ]
              })}
              {renderFormField("Carga Horária", "cargaHoraria", { placeholder: "40h/semana" })}
              {renderFormField("Horário de Trabalho", "horarioTrabalho", { placeholder: "08:00 às 17:00" })}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Documentos Trabalhistas</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderFormField("PIS/PASEP", "pisPasep", { required: true })}
              {renderFormField("Título de Eleitor", "tituloEleitor")}
              {renderFormField("Zona Eleitoral", "zonaEleitoral")}
              {renderFormField("Seção Eleitoral", "secaoEleitoral")}
              {renderFormField("Reservista", "reservista")}
              {renderFormField("CTPS", "carteiraTrabalho", { required: true })}
              {renderFormField("Série CTPS", "serieCtps")}
            </div>
            
            <h4 className="text-md font-semibold text-gray-800 mt-6">Dados Bancários</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderFormField("Banco", "banco")}
              {renderFormField("Agência", "agencia")}
              {renderFormField("Conta", "conta")}
              {renderFormField("Tipo de Conta", "tipoConta", {
                options: [
                  { value: 'Corrente', label: 'Conta Corrente' },
                  { value: 'Poupança', label: 'Poupança' }
                ]
              })}
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Dados Familiares e Observações</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderFormField("Nome da Mãe", "nomeMae")}
              {renderFormField("Nome do Pai", "nomePai")}
              
              {formData.estadoCivil === 'Casado(a)' && (
                <>
                  {renderFormField("Nome do Cônjuge", "nomeConjuge")}
                  {renderFormField("CPF do Cônjuge", "cpfConjuge")}
                </>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observações
              </label>
              <textarea
                value={formData.observacoes}
                onChange={(e) => updateField('observacoes', e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Informações adicionais relevantes..."
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-t-2xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">
              👤 Cadastro de Funcionário
            </h1>
            <div className="text-sm text-gray-600">
              Passo {currentStep} de {totalSteps}
            </div>
          </div>
          
          {/* Progress bar */}
          <div className="mt-4 bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {/* Erro geral */}
        {errors.general && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
            <div className="flex">
              <div className="text-red-400 text-xl mr-3">⚠️</div>
              <div>
                <h3 className="text-sm font-medium text-red-800">Erro no cadastro</h3>
                <p className="text-sm text-red-700 mt-1">{errors.general}</p>
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        <div className="bg-white shadow-lg p-6">
          {renderStep()}
        </div>

        {/* Footer */}
        <div className="bg-white rounded-b-2xl shadow-lg p-6 flex justify-between">
          <button
            onClick={handlePrevStep}
            disabled={currentStep === 1}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Anterior
          </button>

          {currentStep < totalSteps ? (
            <button
              onClick={handleNextStep}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Próximo →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                  Salvando...
                </>
              ) : (
                '✅ Finalizar Cadastro'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
