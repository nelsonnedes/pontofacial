'use client';

import { notifyUser, confirmUser, promptUser } from '@/lib/user-dialogs';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEmployeeList, Employee } from '@/hooks/useEmployeeList';
import ResponsiveTable, { Column, Action } from '@/components/ui/ResponsiveTable';

export default function EmployeeList() {
  const router = useRouter();
  const {
    employees,
    isLoading,
    error,
    filters,
    statistics,
    uniqueSetores,
    uniqueContratos,
    loadEmployees,
    deleteEmployee,
    toggleEmployeeStatus,
    removeFacialRegistration,
    updateFilters,
    clearFilters,
    clearError,
    formatDate
  } = useEmployeeList();

  const [operationLoading, setOperationLoading] = useState<{ [key: string]: boolean }>({});

  // ✅ FUNÇÕES DE AÇÃO (MOVIDAS PARA CIMA PARA EVITAR TDZ)
  const handleEditEmployee = (employeeId: string) => {
    router.push(`/app/cadastro-funcionario?mode=edit&employeeId=${employeeId}`);
  };

  const handleFacialRegistration = (employeeId: string) => {
    router.push(`/app/cadastro-facial?employeeId=${employeeId}`);
  };

  const handleDeleteEmployee = async (employee: Employee) => {
    const confirmDelete = confirmUser(
      `⚠️ ATENÇÃO: Tem certeza que deseja excluir o funcionário?\n\n` +
      `🧑‍💼 Nome: ${employee.nomeCompleto}\n` +
      `📧 Email: ${employee.email}\n` +
      `🏢 Cargo: ${employee.cargo} - ${employee.setor}\n\n` +
      `❗ Esta ação NÃO PODE ser desfeita!\n` +
      `❗ Todos os registros de ponto deste funcionário permanecerão no sistema.\n\n` +
      `Digite "EXCLUIR" para confirmar:`
    );

    if (!confirmDelete) return;

    const confirmText = promptUser('⚠️ Digite "EXCLUIR" para confirmar:');
    if (confirmText !== 'EXCLUIR') {
      notifyUser('❌ Exclusão cancelada - texto de confirmação incorreto');
      return;
    }

    setOperationLoading(prev => ({ ...prev, [`delete-${employee.id}`]: true }));
    
    try {
      const success = await deleteEmployee(employee.id);
      if (success) {
        notifyUser('✅ Funcionário excluído com sucesso!');
      }
    } catch (error) {
      notifyUser('❌ Erro ao excluir funcionário');
    } finally {
      setOperationLoading(prev => ({ ...prev, [`delete-${employee.id}`]: false }));
    }
  };

  const handleToggleStatus = async (employee: Employee) => {
    const newStatus = employee.status === 'active' ? 'inactive' : 'active';
    const action = newStatus === 'active' ? 'ativar' : 'desativar';
    
    const confirmToggle = confirmUser(
      `Tem certeza que deseja ${action} o funcionário?\n\n` +
      `🧑‍💼 ${employee.nomeCompleto}\n` +
      `📧 ${employee.email}\n` +
      `Status atual: ${employee.status === 'active' ? '✅ Ativo' : '❌ Inativo'}\n` +
      `Novo status: ${newStatus === 'active' ? '✅ Ativo' : '❌ Inativo'}`
    );

    if (!confirmToggle) return;

    setOperationLoading(prev => ({ ...prev, [`toggle-${employee.id}`]: true }));
    
    try {
      const success = await toggleEmployeeStatus(employee.id, newStatus);
      if (success) {
        notifyUser(`✅ Funcionário ${action === 'ativar' ? 'ativado' : 'desativado'} com sucesso!`);
      }
    } catch (error) {
      notifyUser(`❌ Erro ao ${action} funcionário`);
    } finally {
      setOperationLoading(prev => ({ ...prev, [`toggle-${employee.id}`]: false }));
    }
  };

  const handleRemoveFacialRegistration = async (employee: Employee) => {
    const confirmRemove = confirmUser(
      `⚠️ ATENÇÃO: Deseja remover o cadastro facial?\n\n` +
      `🧑‍💼 ${employee.nomeCompleto}\n` +
      `📧 ${employee.email}\n\n` +
      `❗ O funcionário precisará cadastrar a face novamente para usar o reconhecimento facial.`
    );

    if (!confirmRemove) return;

    setOperationLoading(prev => ({ ...prev, [`facial-${employee.id}`]: true }));
    
    try {
      const success = await removeFacialRegistration(employee.id);
      if (success) {
        notifyUser('✅ Cadastro facial removido com sucesso!');
      }
    } catch (error) {
      notifyUser('❌ Erro ao remover cadastro facial');
    } finally {
      setOperationLoading(prev => ({ ...prev, [`facial-${employee.id}`]: false }));
    }
  };

  // ✅ CONFIGURAÇÃO DA TABELA RESPONSIVA
  const tableColumns = useMemo<Column[]>(() => [
    {
      key: 'employee',
      label: 'Funcionário',
      render: (_, row: Employee) => (
        <div className="flex items-center">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium ${
            row.registrationCompleted ? 'bg-green-600' : 'bg-blue-600'
          }`}>
            {row.faceEmbedding ? '📸' : row.nomeCompleto.charAt(0)?.toUpperCase() || 'F'}
          </div>
          <div className="ml-4">
            <div className="text-sm font-medium text-gray-900">
              {row.nomeCompleto}
            </div>
            <div className="text-sm text-gray-500">{row.email}</div>
            <div className="text-xs text-gray-400">
              CPF: {row.cpf || 'Não informado'}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'position',
      label: 'Cargo/Setor',
      render: (_, row: Employee) => (
        <div>
          <div className="text-sm text-gray-900">{row.cargo || 'Não informado'}</div>
          <div className="text-sm text-gray-500">{row.setor || 'Não informado'}</div>
        </div>
      ),
      hideOnMobile: true,
    },
    {
      key: 'contract',
      label: 'Contrato',
      render: (_, row: Employee) => (
        <div>
          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
            row.tipoContrato === 'CLT' ? 'bg-blue-100 text-blue-800' :
            row.tipoContrato === 'PJ' ? 'bg-purple-100 text-purple-800' :
            row.tipoContrato === 'Terceirizado' ? 'bg-orange-100 text-orange-800' :
            row.tipoContrato === 'Estagiário' ? 'bg-yellow-100 text-yellow-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {row.tipoContrato || 'Não informado'}
          </span>
          <div className="text-xs text-gray-500 mt-1">
            Admissão: {row.dataAdmissao ? formatDate(row.dataAdmissao) : 'N/A'}
          </div>
        </div>
      ),
      hideOnMobile: true,
    },
    {
      key: 'registration',
      label: 'Cadastro',
      render: (_, row: Employee) => (
        <div className="space-y-1">
          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
            row.registrationCompleted ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
          }`}>
            {row.registrationCompleted ? '✅ Completo' : '⏳ Pendente'}
          </span>
          <div className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
            row.faceEmbedding ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
          }`}>
            {row.faceEmbedding ? '📸 Com Foto' : '❌ Sem Foto'}
          </div>
          {row.facialRegistrationDate && (
            <div className="text-xs text-gray-500">
              {formatDate(row.facialRegistrationDate)}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row: Employee) => (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          row.status === 'active' ? 'bg-green-100 text-green-800' :
          row.status === 'inactive' ? 'bg-yellow-100 text-yellow-800' :
          'bg-red-100 text-red-800'
        }`}>
          {row.status === 'active' ? '✅ Ativo' :
           row.status === 'inactive' ? '⏸️ Inativo' : '🚫 Demitido'}
        </span>
      ),
    }
  ], [formatDate]);

  // ✅ AÇÕES DA TABELA RESPONSIVA
  const tableActions = useMemo<Action[]>(() => [
    {
      label: 'Editar',
      icon: '✏️',
      onClick: (row: Employee) => handleEditEmployee(row.id),
      className: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
    },
    {
      label: row => row.faceEmbedding ? 'Recadastrar Face' : 'Cadastrar Face',
      icon: row => row.faceEmbedding ? '🔄' : '📸',
      onClick: (row: Employee) => handleFacialRegistration(row.id),
      className: row => row.faceEmbedding 
        ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
        : 'bg-green-100 text-green-700 hover:bg-green-200',
    },
    {
      label: 'Remover Face',
      icon: '🗑️',
      onClick: (row: Employee) => handleRemoveFacialRegistration(row),
      className: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
      disabled: (row: Employee) => !row.faceEmbedding || operationLoading[`facial-${row.id}`],
    },
    {
      label: row => row.status === 'active' ? 'Desativar' : 'Ativar',
      icon: row => row.status === 'active' ? '⏸️' : '▶️',
      onClick: (row: Employee) => handleToggleStatus(row),
      className: row => row.status === 'active'
        ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
        : 'bg-green-100 text-green-700 hover:bg-green-200',
      disabled: (row: Employee) => operationLoading[`toggle-${row.id}`],
    },
    {
      label: 'Excluir',
      icon: '🗑️',
      onClick: (row: Employee) => handleDeleteEmployee(row),
      className: 'bg-red-100 text-red-700 hover:bg-red-200',
      disabled: (row: Employee) => operationLoading[`delete-${row.id}`],
    }
  ], [handleEditEmployee, handleFacialRegistration, handleRemoveFacialRegistration, 
      handleToggleStatus, handleDeleteEmployee, operationLoading]);


  // ✅ LOADING STATE
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 rounded w-64 animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-gray-200 h-24 rounded-lg animate-pulse"></div>
          ))}
        </div>
        <div className="bg-gray-200 h-96 rounded-lg animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ✅ CABEÇALHO E AÇÕES */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold text-gray-900">👥 Gerenciar Funcionários</h1>
        <div className="flex gap-3">
          <button
            onClick={loadEmployees}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            🔄 Atualizar
          </button>
          <Link 
            href="/app/cadastro-funcionario?mode=create"
            className="inline-block px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          >
            ➕ Novo Funcionário
          </Link>
        </div>
      </div>

      {/* ✅ MENSAGEM DE ERRO */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="text-red-600 text-xl">❌</div>
            <div>
              <h3 className="font-semibold text-red-800">Erro:</h3>
              <p className="text-red-700 text-sm mt-1">{error}</p>
              <button
                onClick={clearError}
                className="text-red-600 hover:text-red-800 text-sm underline mt-2"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ ESTATÍSTICAS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Total de Funcionários</p>
          <p className="text-2xl font-bold text-gray-900">{statistics.total}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Ativos</p>
          <p className="text-2xl font-bold text-green-600">{statistics.active}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Com Foto Cadastrada</p>
          <p className="text-2xl font-bold text-blue-600">{statistics.withPhoto}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Cadastros Completos</p>
          <p className="text-2xl font-bold text-purple-600">{statistics.completedRegistration}</p>
        </div>
      </div>

      {/* ✅ FILTROS */}
      <div className="bg-white p-4 rounded-lg shadow-sm border space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Busca */}
          <div className="flex-1 min-w-64">
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">🔍</span>
              <input
                type="text"
                placeholder="Buscar por nome, email, CPF, cargo..."
                value={filters.searchTerm}
                onChange={(e) => updateFilters({ searchTerm: e.target.value })}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Status */}
          <select
            value={filters.status}
            onChange={(e) => updateFilters({ status: e.target.value as any })}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">📊 Todos os Status</option>
            <option value="active">✅ Ativos</option>
            <option value="inactive">❌ Inativos</option>
            <option value="terminated">🚫 Demitidos</option>
          </select>

          {/* Setor */}
          <select
            value={filters.setor}
            onChange={(e) => updateFilters({ setor: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">🏢 Todos os Setores</option>
            {uniqueSetores.map(setor => (
              <option key={setor} value={setor}>{setor}</option>
            ))}
          </select>

          {/* Tipo de Contrato */}
          <select
            value={filters.tipoContrato}
            onChange={(e) => updateFilters({ tipoContrato: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">📄 Todos os Contratos</option>
            {uniqueContratos.map(contrato => (
              <option key={contrato} value={contrato}>{contrato}</option>
            ))}
          </select>

          {/* Cadastro Facial */}
          <select
            value={filters.hasPhoto}
            onChange={(e) => updateFilters({ hasPhoto: e.target.value as any })}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">📸 Todos</option>
            <option value="yes">✅ Com Foto</option>
            <option value="no">❌ Sem Foto</option>
          </select>

          {/* Limpar Filtros */}
          <button
            onClick={clearFilters}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
          >
            🧹 Limpar
          </button>
        </div>
      </div>

      {/* ✅ TABELA RESPONSIVA DE FUNCIONÁRIOS */}
      <ResponsiveTable
        data={employees}
        columns={tableColumns}
        actions={tableActions}
        loading={isLoading}
        emptyMessage="Nenhum funcionário encontrado"
        emptyIcon="👥"
        searchTerm={Object.values(filters).some(f => f) ? 'filtrado' : ''}
        cardTitle={(row: Employee) => row.nomeCompleto}
        cardSubtitle={(row: Employee) => `${row.email} • ${row.cargo || 'Cargo não informado'}`}
      />
    </div>
  );
}
