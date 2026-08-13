'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

// ✅ USAR HOOK PERSONALIZADO - SEM DEPENDÊNCIA CIRCULAR
import { useEmployeeManagement } from '@/hooks/useEmployeeManagement';

// ✅ INTERFACES E TIPOS
interface FormFieldProps {
  label: string;
  field: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  formData: any;
  errors: Record<string, string>;
  updateField: (field: string, value: string) => void;
  fetchCEP: (cep: string) => void;
  formatCPF: (value: string) => string;
}

// ✅ COMPONENTE FORMFIELD MOVIDO PARA FORA PARA EVITAR PERDA DE FOCO
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
    
    {type === 'birthday' ? (
      (() => {
        const parts = (formData[field] || '').split('-');
        const currentYear = parts[0] || '';
        const currentMonth = parts[1] || '';
        const currentDay = parts[2] || '';

        const updateDate = (y: string, m: string, d: string) => {
          if (y && m && d) {
            updateField(field, `${y}-${m}-${d}`);
          } else {
            updateField(field, '');
          }
        };

        const currentYearNum = new Date().getFullYear();
        const startYear = currentYearNum - 14; // Idade mínima de 14 anos
        const endYear = 1920;
        const yearsList = [];
        for (let y = startYear; y >= endYear; y--) {
          yearsList.push(String(y));
        }

        return (
          <div className="grid grid-cols-3 gap-2">
            <select
              value={currentDay}
              onChange={(e) => updateDate(currentYear, currentMonth, e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors[field] ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">Dia</option>
              {Array.from({ length: 31 }, (_, i) => {
                const d = String(i + 1).padStart(2, '0');
                return <option key={d} value={d}>{d}</option>;
              })}
            </select>

            <select
              value={currentMonth}
              onChange={(e) => updateDate(currentYear, e.target.value, currentDay)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors[field] ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">Mês</option>
              {[
                { value: '01', label: 'Janeiro' },
                { value: '02', label: 'Fevereiro' },
                { value: '03', label: 'Março' },
                { value: '04', label: 'Abril' },
                { value: '05', label: 'Maio' },
                { value: '06', label: 'Junho' },
                { value: '07', label: 'Julho' },
                { value: '08', label: 'Agosto' },
                { value: '09', label: 'Setembro' },
                { value: '10', label: 'Outubro' },
                { value: '11', label: 'Novembro' },
                { value: '12', label: 'Dezembro' }
              ].map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>

            <select
              value={currentYear}
              onChange={(e) => updateDate(e.target.value, currentMonth, currentDay)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors[field] ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">Ano</option>
              {yearsList.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        );
      })()
    ) : options ? (
      <select
        value={formData[field] || ''}
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
        value={formData[field] || ''}
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
  
  // ✅ USAR HOOK PERSONALIZADO - SEM DEPENDÊNCIA CIRCULAR
  const {
    // Estados
    formData,
    isLoading,
    error,
    mode,
    
    // Ações
    updateField,
    formatCPF,
    fetchCEP,
    saveEmployee,
    cancel,
    
    // Utilitários
    validateForm,
    
    // Setters
    setError
  } = useEmployeeManagement();

  const [currentStep, setCurrentStep] = useState(1);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const totalSteps = 6;

  // ✅ HELPER PARA RENDERIZAR CAMPOS
  const renderFormField = (
    label: string, 
    field: string, 
    options: { 
      type?: string; 
      required?: boolean; 
      placeholder?: string;
      options?: Array<{ value: string; label: string }>;
    } = {}
  ) => (
    <FormField
      key={field}
      label={label}
      field={field}
      type={options.type}
      required={options.required}
      placeholder={options.placeholder}
      options={options.options}
      formData={formData}
      errors={validationErrors}
      updateField={(field, value) => updateField(field as Parameters<typeof updateField>[0], value)}
      fetchCEP={fetchCEP}
      formatCPF={formatCPF}
    />
  );

  // ✅ VALIDAR STEP ATUAL
  const validateCurrentStep = (): boolean => {
    const validation = validateForm();
    setValidationErrors(validation.errors);
    
    // Validações específicas por step
    switch (currentStep) {
      case 1:
        return !validation.errors.nomeCompleto && !validation.errors.cpf && !validation.errors.rg && !validation.errors.dataNascimento;
      case 2:
        return !validation.errors.cep && !validation.errors.endereco && !validation.errors.cidade;
      case 3:
        return !validation.errors.celular && !validation.errors.email;
      case 4:
        return !validation.errors.cargo && !validation.errors.setor && !validation.errors.dataAdmissao;
      case 5:
        return true; // Dados bancários opcionais
      case 6:
        return true; // Documentos e familiares opcionais
      default:
        return true;
    }
  };

  // ✅ AVANÇAR STEP
  const nextStep = () => {
    if (validateCurrentStep()) {
      setCurrentStep(prev => Math.min(prev + 1, totalSteps));
      setError(''); // Limpar erro geral
    }
  };

  // ✅ VOLTAR STEP
  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
    setError(''); // Limpar erro geral
  };

  // ✅ FINALIZAR FORMULÁRIO
  const handleSubmit = async () => {
    const validation = validateForm();
    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      setError('Por favor, corrija os erros nos campos obrigatórios');
      return;
    }

    const result = await saveEmployee();
    
    if (result.success && result.employeeId && result.shouldProceedToFacialRegistration) {
      // Redirecionar para cadastro facial
      router.push(`/app/cadastro-facial?employeeId=${result.employeeId}`);
    } else if (result.success) {
      router.push('/admin/funcionarios');
    }
  };

  // ✅ RENDERIZAR CONTEÚDO DO STEP
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
              {renderFormField("Data de Nascimento", "dataNascimento", { type: "birthday", required: true })}
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
              {renderFormField("CEP", "cep", { placeholder: "00000-000" })}
              {renderFormField("Endereço", "endereco", { required: true })}
              {renderFormField("Número", "numero", { required: true })}
              {renderFormField("Complemento", "complemento", { placeholder: "Apto, Sala, etc." })}
              {renderFormField("Bairro", "bairro", { required: true })}
              {renderFormField("Cidade", "cidade", { required: true })}
              {renderFormField("Estado", "estado", { placeholder: "UF" })}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Contato</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderFormField("Telefone", "telefone", { placeholder: "(00) 0000-0000" })}
              {renderFormField("Celular", "celular", { required: true, placeholder: "(00) 00000-0000" })}
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
              {renderFormField("Salário", "salario", { type: "number", placeholder: "0.00" })}
              {renderFormField("Data de Admissão", "dataAdmissao", { type: "date", required: true })}
              {renderFormField("Tipo de Contrato", "tipoContrato", {
                options: [
                  { value: 'CLT', label: 'CLT' },
                  { value: 'PJ', label: 'Pessoa Jurídica' },
                  { value: 'Terceirizado', label: 'Terceirizado' },
                  { value: 'Estagiário', label: 'Estagiário' }
                ]
              })}
              {renderFormField("Carga Horária", "cargaHoraria", { placeholder: "40h" })}
              {renderFormField("Horário de Trabalho", "horarioTrabalho", { placeholder: "08:00 às 17:00" })}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Dados Bancários</h3>
            
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
            <h3 className="text-lg font-semibold text-gray-800">Documentos e Dados Familiares</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderFormField("PIS/PASEP", "pisPasep")}
              {renderFormField("Título de Eleitor", "tituloEleitor")}
              {renderFormField("Zona Eleitoral", "zonaEleitoral")}
              {renderFormField("Seção Eleitoral", "secaoEleitoral")}
              {renderFormField("Reservista", "reservista")}
              {renderFormField("Carteira de Trabalho", "carteiraTrabalho")}
              {renderFormField("Série CTPS", "serieCtps")}
              {renderFormField("Nome da Mãe", "nomeMae")}
              {renderFormField("Nome do Pai", "nomePai")}
              {renderFormField("Nome do Cônjuge", "nomeConjuge")}
              {renderFormField("CPF do Cônjuge", "cpfConjuge")}
            </div>
            
            <div className="col-span-full">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observações
              </label>
              <textarea
                value={formData.observacoes || ''}
                onChange={(e) => updateField('observacoes', e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Observações gerais sobre o funcionário..."
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-t-2xl">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">
                {mode === 'edit' ? 'Editar Funcionário' : 'Cadastro de Funcionário'}
              </h1>
              <p className="text-blue-100">
                {mode === 'edit' ? 
                  'Atualize os dados do funcionário' : 
                  'Preencha as informações para cadastrar o funcionário'
                }
              </p>
            </div>
            {mode === 'edit' && (
              <div className="bg-green-500 px-3 py-1 rounded-full text-sm font-medium">
                Modo Edição
              </div>
            )}
          </div>
          
          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-blue-100">Etapa {currentStep} de {totalSteps}</span>
              <span className="text-sm text-blue-100">{Math.round((currentStep / totalSteps) * 100)}%</span>
            </div>
            <div className="w-full bg-blue-500/30 rounded-full h-2">
              <div
                className="bg-white rounded-full h-2 transition-all duration-300"
                style={{ width: `${(currentStep / totalSteps) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Form Content */}
        <div className="p-6">
          {/* Erro geral */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800 font-medium">❌ {error}</p>
            </div>
          )}

          {/* Step Content */}
          {renderStep()}

          {/* Navigation Buttons */}
          <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={currentStep === 1 ? cancel : prevStep}
              className="flex items-center px-6 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              {currentStep === 1 ? '❌ Cancelar' : '⬅️ Anterior'}
            </button>

            <div className="flex space-x-2">
              {Array.from({ length: totalSteps }).map((_, index) => (
                <div
                  key={index}
                  className={`w-3 h-3 rounded-full ${
                    index + 1 <= currentStep ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>

            {currentStep < totalSteps ? (
              <button
                type="button"
                onClick={nextStep}
                className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Próxima ➡️
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isLoading}
                className="flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Salvando...
                  </>
                ) : (
                  <>
                    {mode === 'edit' ? '💾 Atualizar Funcionário' : '💾 Cadastrar e Prosseguir'}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
