'use client';

import { notifyUser, confirmUser } from '@/lib/user-dialogs';
import { useState, useMemo } from 'react';
import { useUsers, AppUser, AppUserRole, CreateUserData, UpdateUserData } from '@/hooks/useUsers';
import {
  DirectoryCompany,
  DirectoryEmployee,
  useUserProfileDirectory
} from '@/hooks/useUserProfileDirectory';

const roleOptions: Array<{ value: AppUserRole; label: string; description: string }> = [
  {
    value: 'employee',
    label: 'Funcionário',
    description: 'Bate ponto, vê comprovantes e cadastra a própria face.'
  },
  {
    value: 'kiosk',
    label: 'Portaria/Kiosk',
    description: 'Uso fixo em portaria: marcação e verificação facial assistida.'
  },
  {
    value: 'rh',
    label: 'RH',
    description: 'Funcionários, horários, registros, RH e relatórios operacionais.'
  },
  {
    value: 'manager',
    label: 'Gestor',
    description: 'Consulta registros e relatórios da operação.'
  },
  {
    value: 'admin',
    label: 'Administrador',
    description: 'Acesso total, inclusive usuários, empresas e configurações.'
  }
];

function getRoleLabel(role?: AppUserRole) {
  const option = roleOptions.find(item => item.value === role);
  if (option) return option.label;
  return role === 'user' ? 'Usuário' : 'Funcionário';
}

function getRoleClasses(role?: AppUserRole) {
  if (role === 'admin') return 'bg-purple-100 text-purple-800';
  if (role === 'rh') return 'bg-emerald-100 text-emerald-800';
  if (role === 'manager') return 'bg-indigo-100 text-indigo-800';
  if (role === 'kiosk') return 'bg-amber-100 text-amber-800';
  return 'bg-blue-100 text-blue-800';
}

type UserFormState = {
  email: string;
  password: string;
  name: string;
  role: AppUserRole;
  isActive: boolean;
  employeeId: string;
  empresaId: string;
  department: string;
  position: string;
};

const INITIAL_USER_FORM: UserFormState = {
  email: '',
  password: '',
  name: '',
  role: 'employee',
  isActive: true,
  employeeId: '',
  empresaId: '',
  department: '',
  position: ''
};

function normalizeSearchText(value?: string) {
  return (value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function getEmployeeEmail(employee: DirectoryEmployee) {
  return employee.corporateEmail || employee.email;
}

function getCompanyDisplayName(company?: DirectoryCompany, fallbackId?: string) {
  if (!company) return fallbackId || 'Empresa não vinculada';
  return company.name || company.legalName || company.id;
}

function getEmployeeCompanyId(employee?: DirectoryEmployee) {
  return employee?.empresaId || employee?.companyId || '';
}

function getEmployeeReferenceValues(employee: DirectoryEmployee) {
  return [
    employee.id,
    employee.registration,
    employee.cpf,
    employee.pisPasep,
    employee.authUid,
    employee.userId,
    employee.email,
    employee.corporateEmail
  ].filter(Boolean).map(value => value.toLowerCase());
}

function findEmployeeByReference(employees: DirectoryEmployee[], reference?: string) {
  const normalizedReference = reference?.trim().toLowerCase();
  if (!normalizedReference) return undefined;

  return employees.find(employee => getEmployeeReferenceValues(employee).includes(normalizedReference));
}

function hydrateFormFromEmployee(
  form: UserFormState,
  employee: DirectoryEmployee,
  options: { preserveEmail: boolean }
): UserFormState {
  const employeeCompanyId = getEmployeeCompanyId(employee);

  return {
    ...form,
    email: options.preserveEmail ? form.email : getEmployeeEmail(employee) || form.email,
    name: employee.name || form.name,
    employeeId: employee.id,
    empresaId: employeeCompanyId || form.empresaId,
    department: employee.department || form.department,
    position: employee.position || form.position
  };
}

export default function AdminUsersPage() {
  const {
    users,
    isLoading,
    error,
    createUser,
    updateUser,
    deleteUser,
    toggleUserStatus,
    refreshUsers,
    clearError
  } = useUsers();
  const {
    companies,
    employees,
    isLoading: directoryLoading,
    error: directoryError,
    refresh: refreshDirectory
  } = useUserProfileDirectory();

  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [userForm, setUserForm] = useState<UserFormState>(INITIAL_USER_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const companyById = useMemo(() => {
    return new Map(companies.map(company => [company.id, company]));
  }, [companies]);

  const employeeByProfileId = useMemo(() => {
    const map = new Map<string, AppUser>();

    for (const profile of users) {
      const employee = findEmployeeByReference(employees, profile.employeeId || profile.funcionarioId);
      const key = employee?.id || profile.employeeId || profile.funcionarioId;
      if (key) {
        map.set(key, profile);
      }
    }

    return map;
  }, [employees, users]);

  const selectedEmployee = useMemo(() => {
    return findEmployeeByReference(employees, userForm.employeeId);
  }, [employees, userForm.employeeId]);

  const selectedCompany = useMemo(() => {
    return companyById.get(userForm.empresaId);
  }, [companyById, userForm.empresaId]);

  const employeesAvailableForSelectedCompany = useMemo(() => {
    if (!userForm.empresaId) return employees;

    return employees.filter(employee => {
      const employeeCompanyId = getEmployeeCompanyId(employee);
      return !employeeCompanyId || employeeCompanyId === userForm.empresaId;
    });
  }, [employees, userForm.empresaId]);

  const employeesWithoutProfile = useMemo(() => {
    return employees.filter(employee => {
      const linkedProfile = employeeByProfileId.get(employee.id);
      return !linkedProfile || linkedProfile.id === editingUser?.id;
    }).length;
  }, [editingUser?.id, employeeByProfileId, employees]);

  // Filtrar usuários com base na busca e no diretório carregado
  const filteredUsers = useMemo(() => {
    const term = normalizeSearchText(searchTerm);
    if (!term) return users;

    return users.filter(user => {
      const companyId = user.empresaId || user.companyId || '';
      const employee = findEmployeeByReference(employees, user.employeeId || user.funcionarioId);
      const company = companyById.get(companyId || getEmployeeCompanyId(employee));
      const searchPool = [
        user.email,
        user.name,
        user.displayName,
        user.employeeId,
        user.funcionarioId,
        user.empresaId,
        user.companyId,
        user.department,
        user.position,
        user.role,
        employee?.name,
        employee?.email,
        employee?.corporateEmail,
        employee?.cpf,
        employee?.registration,
        employee?.department,
        employee?.position,
        company?.name,
        company?.legalName,
        company?.cnpj
      ];

      return searchPool.some(value => normalizeSearchText(value).includes(term));
    });
  }, [companyById, employees, searchTerm, users]);

  // Abrir modal para criar usuário
  const openCreateModal = () => {
    const activeCompanies = companies.filter(company => company.isActive);
    setEditingUser(null);
    setUserForm({
      ...INITIAL_USER_FORM,
      empresaId: activeCompanies.length === 1 ? activeCompanies[0].id : ''
    });
    setShowModal(true);
    clearError();
  };

  // Abrir modal para editar usuário
  const openEditModal = (user: AppUser) => {
    const employee = findEmployeeByReference(employees, user.employeeId || user.funcionarioId);
    const baseForm: UserFormState = {
      ...INITIAL_USER_FORM,
      email: user.email,
      password: '', // Não mostrar senha existente
      name: user.name || '',
      role: user.role || 'employee',
      isActive: user.isActive,
      employeeId: user.employeeId || user.funcionarioId || '',
      empresaId: user.empresaId || user.companyId || '',
      department: user.department || '',
      position: user.position || ''
    };

    setEditingUser(user);
    setUserForm(employee ? hydrateFormFromEmployee(baseForm, employee, { preserveEmail: true }) : baseForm);
    setShowModal(true);
    clearError();
  };

  // Fechar modal
  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setUserForm(INITIAL_USER_FORM);
    clearError();
  };

  const handleCompanyChange = (empresaId: string) => {
    setUserForm(prev => {
      const currentEmployee = findEmployeeByReference(employees, prev.employeeId);
      const currentEmployeeCompanyId = getEmployeeCompanyId(currentEmployee);
      const shouldClearEmployee = Boolean(
        empresaId &&
        currentEmployeeCompanyId &&
        currentEmployeeCompanyId !== empresaId
      );

      return {
        ...prev,
        empresaId,
        ...(shouldClearEmployee ? {
          employeeId: '',
          department: '',
          position: ''
        } : {})
      };
    });
  };

  const handleEmployeeSelect = (employeeId: string) => {
    if (!employeeId) {
      setUserForm(prev => ({
        ...prev,
        employeeId: '',
        name: editingUser ? prev.name : '',
        email: editingUser ? prev.email : '',
        department: '',
        position: ''
      }));
      return;
    }

    const employee = employees.find(item => item.id === employeeId);
    if (!employee) {
      setUserForm(prev => ({ ...prev, employeeId }));
      return;
    }

    const linkedProfile = employeeByProfileId.get(employee.id);
    const isLinkedToAnotherProfile = linkedProfile && linkedProfile.id !== editingUser?.id;
    if (isLinkedToAnotherProfile) {
      notifyUser(`❌ Este funcionário já está vinculado ao perfil ${linkedProfile.name || linkedProfile.email}.`);
      return;
    }

    setUserForm(prev => hydrateFormFromEmployee(prev, employee, { preserveEmail: editingUser !== null }));
  };

  // Salvar usuário (criar ou editar)
  const handleSaveUser = async () => {
    if (!userForm.email.trim()) {
      notifyUser('❌ Email é obrigatório');
      return;
    }

    if (!editingUser && !userForm.password.trim()) {
      notifyUser('❌ Senha é obrigatória para novos usuários');
      return;
    }

    if (userForm.role === 'kiosk' && !userForm.empresaId.trim()) {
      notifyUser('❌ Perfil Portaria/Kiosk precisa estar vinculado a uma empresa');
      return;
    }

    setIsSaving(true);
    
    try {
      if (editingUser) {
        // Editar usuário existente
        console.log('✏️ Editando usuário:', editingUser.id);
        
        const updates: UpdateUserData = {
          name: userForm.name.trim(),
          role: userForm.role,
          isActive: userForm.isActive,
          employeeId: userForm.employeeId.trim(),
          empresaId: userForm.empresaId.trim(),
          department: userForm.department.trim(),
          position: userForm.position.trim()
        };

        await updateUser(editingUser.id, updates);
        notifyUser('✅ Perfil atualizado com sucesso!');
      } else {
        // Criar novo usuário
        console.log('➕ Criando novo perfil:', userForm.email);
        
        const userData: CreateUserData = {
          email: userForm.email.trim(),
          password: userForm.password,
          name: userForm.name.trim(),
          role: userForm.role,
          isActive: userForm.isActive,
          employeeId: userForm.employeeId.trim(),
          empresaId: userForm.empresaId.trim(),
          department: userForm.department.trim(),
          position: userForm.position.trim()
        };

        await createUser(userData);
        notifyUser('✅ Perfil criado com login seguro no Firebase Auth!');
      }
      
      closeModal();
    } catch (error: any) {
      console.error('❌ Erro ao salvar usuário:', error);
      notifyUser(`❌ Erro ao salvar usuário: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Deletar usuário
  const handleDeleteUser = async (user: AppUser) => {
    const confirmDelete = confirmUser(
      `⚠️ Tem certeza que deseja desativar o perfil "${user.name || user.email}"?\n\n` +
      `A conta será bloqueada no Firebase Auth e o histórico será preservado.`
    );
    
    if (!confirmDelete) return;

    try {
      console.log('🗑️ Desativando perfil:', user.id);
      await deleteUser(user.id);
      notifyUser('✅ Perfil desativado com sucesso!');
    } catch (error: any) {
      console.error('❌ Erro ao desativar perfil:', error);
      notifyUser(`❌ Erro ao desativar perfil: ${error.message}`);
    }
  };

  // Alternar status do usuário
  const handleToggleUserStatus = async (user: AppUser) => {
    const newStatus = !user.isActive;
    const action = newStatus ? 'ativar' : 'desativar';
    
    const confirmToggle = confirmUser(
      `Tem certeza que deseja ${action} o usuário "${user.name || user.email}"?`
    );
    
    if (!confirmToggle) return;

    try {
      await toggleUserStatus(user.id, newStatus);
      console.log(`✅ Status do usuário ${user.id} alterado para: ${newStatus ? 'ativo' : 'inativo'}`);
    } catch (error: any) {
      console.error('❌ Erro ao alterar status:', error);
      notifyUser(`❌ Erro ao alterar status: ${error.message}`);
    }
  };

  // Formatação de datas
  const formatDate = (dateValue: string | any) => {
    try {
      let date: Date;
      
      if (typeof dateValue === 'string') {
        date = new Date(dateValue);
      } else if (typeof dateValue === 'number') {
        date = new Date(dateValue);
      } else if (dateValue?.toDate) {
        // Timestamp do Firebase
        date = dateValue.toDate();
      } else if (dateValue?.seconds) {
        // Timestamp do Firebase formato alternativo
        date = new Date(dateValue.seconds * 1000);
      } else {
        return 'Data inválida';
      }
      
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch (error) {
      console.warn('Erro ao formatar data:', dateValue, error);
      return 'Data inválida';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 rounded w-48 animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-gray-200 h-24 rounded-lg animate-pulse"></div>
          ))}
        </div>
        <div className="bg-gray-200 h-96 rounded-lg animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header e Ações */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold text-gray-900">👥 Gerenciar Usuários</h1>
        <div className="flex gap-3">
          <button
            onClick={refreshUsers}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            🔄 Atualizar
          </button>
          <button 
            onClick={openCreateModal}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          >
            ➕ Novo Perfil
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        Esta tela lista perfis reais das coleções <strong>users</strong> e <strong>usuarios</strong>. Novos perfis são criados por Cloud Function segura, com Firebase Auth, custom claims e vínculo opcional ao funcionário.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Empresas carregadas</p>
          <p className="text-2xl font-bold text-blue-700">{directoryLoading ? '...' : companies.length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Funcionários cadastrados</p>
          <p className="text-2xl font-bold text-indigo-700">{directoryLoading ? '...' : employees.length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Funcionários sem perfil</p>
          <p className="text-2xl font-bold text-emerald-700">{directoryLoading ? '...' : employeesWithoutProfile}</p>
        </div>
      </div>

      {directoryError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Não foi possível carregar todo o diretório de empresas/funcionários. Você ainda pode editar perfis existentes, mas o vínculo assistido ficará limitado. Detalhe: {directoryError}
        </div>
      )}

      {/* Mensagem de Erro */}
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

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Total de Perfis</p>
          <p className="text-2xl font-bold text-gray-900">{users.length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Perfis Ativos</p>
          <p className="text-2xl font-bold text-green-600">{users.filter(u => u.isActive).length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Perfis Inativos</p>
          <p className="text-2xl font-bold text-red-600">{users.filter(u => !u.isActive).length}</p>
        </div>
      </div>

      {/* Barra de Busca */}
      <div className="bg-white p-4 rounded-lg shadow-sm border flex items-center gap-3">
        <span className="text-gray-400 text-xl">🔍</span>
        <input
          type="text"
          placeholder="Buscar por nome, email, matrícula, departamento..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 border-none focus:ring-0 text-gray-900 placeholder-gray-500"
        />
      </div>

      {/* Tabela de Usuários */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {filteredUsers.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usuário
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Função/Dept.
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Criado Em
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map((user) => {
                const employee = findEmployeeByReference(employees, user.employeeId || user.funcionarioId);
                const companyId = user.empresaId || user.companyId || getEmployeeCompanyId(employee);
                const company = companyById.get(companyId);

                return (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-medium">
                        {user.name?.charAt(0)?.toUpperCase() || user.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {user.name || 'Sem nome'}
                        </div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                        {(user.employeeId || employee) && (
                          <div className="text-xs text-gray-400">
                            Funcionário: {employee?.name || user.employeeId}
                          </div>
                        )}
                        {companyId && (
                          <div className="text-xs text-gray-400">
                            Empresa: {getCompanyDisplayName(company, companyId)}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {user.position || 'Não informado'}
                    </div>
                    <div className="text-sm text-gray-500">
                      {user.department || 'Não informado'}
                    </div>
                    <span className={`
                      inline-flex px-2 py-1 text-xs font-semibold rounded-full
                      ${getRoleClasses(user.role)}
                    `}>
                      {getRoleLabel(user.role)}
                    </span>
                    {user.source && (
                      <span className="ml-2 inline-flex px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">
                        {user.source}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`
                      inline-flex px-2 py-1 text-xs font-semibold rounded-full
                      ${user.isActive 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                      }
                    `}>
                      {user.isActive ? '✅ Ativo' : '❌ Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button
                      onClick={() => handleToggleUserStatus(user)}
                      className={`
                        px-3 py-1 rounded text-xs transition-colors
                        ${user.isActive 
                          ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' 
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }
                      `}
                    >
                      {user.isActive ? '⏸️ Desativar' : '▶️ Ativar'}
                    </button>
                    <button 
                      onClick={() => openEditModal(user)}
                      className="px-3 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded text-xs transition-colors"
                    >
                      ✏️ Editar
                    </button>
                    <button 
                      onClick={() => handleDeleteUser(user)}
                      className="px-3 py-1 bg-red-100 text-red-700 hover:bg-red-200 rounded text-xs transition-colors"
                    >
                      🗑️ Desativar
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-6 text-center text-gray-500">
            <p className="text-lg font-medium mb-2">👥 Nenhum perfil encontrado</p>
            <p className="text-sm">
              {searchTerm 
                ? 'Tente ajustar os termos de busca.' 
                : 'Não há perfis de acesso cadastrados no sistema.'
              }
            </p>
          </div>
        )}
      </div>

      {/* Modal para Criar/Editar Usuário */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {editingUser ? '✏️ Editar Perfil' : '➕ Novo Perfil'}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="font-semibold text-blue-950">Vínculo com cadastros reais</h4>
                    <p className="mt-1 text-sm text-blue-800">
                      Selecione a empresa e o funcionário já cadastrado para preencher nome, e-mail, cargo e departamento automaticamente.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={refreshDirectory}
                    disabled={directoryLoading}
                    className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {directoryLoading ? 'Atualizando...' : 'Atualizar cadastros'}
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-blue-950 mb-1">
                      Empresa vinculada
                    </label>
                    <select
                      value={userForm.empresaId}
                      onChange={(e) => handleCompanyChange(e.target.value)}
                      disabled={directoryLoading}
                      className="w-full px-3 py-2 border border-blue-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Selecionar empresa cadastrada...</option>
                      {userForm.empresaId && !selectedCompany && (
                        <option value={userForm.empresaId}>ID atual: {userForm.empresaId}</option>
                      )}
                      {companies.map(company => (
                        <option key={company.id} value={company.id}>
                          {company.name} {company.cnpj ? `• ${company.cnpj}` : ''} {!company.isActive ? '• inativa' : ''}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-blue-700">
                      Para Portaria/Kiosk, a empresa é obrigatória.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-blue-950 mb-1">
                      Funcionário cadastrado
                    </label>
                    <select
                      value={selectedEmployee?.id || userForm.employeeId}
                      onChange={(e) => handleEmployeeSelect(e.target.value)}
                      disabled={directoryLoading || employees.length === 0}
                      className="w-full px-3 py-2 border border-blue-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Nenhum funcionário vinculado</option>
                      {userForm.employeeId && !selectedEmployee && (
                        <option value={userForm.employeeId}>Referência atual: {userForm.employeeId}</option>
                      )}
                      {employeesAvailableForSelectedCompany.map(employee => {
                        const linkedProfile = employeeByProfileId.get(employee.id);
                        const isLinkedToAnotherProfile = linkedProfile && linkedProfile.id !== editingUser?.id;
                        const employeeCompany = companyById.get(getEmployeeCompanyId(employee));
                        const employeeContact = getEmployeeEmail(employee) || employee.cpf || employee.registration || employee.id;

                        return (
                          <option
                            key={employee.id}
                            value={employee.id}
                            disabled={isLinkedToAnotherProfile}
                          >
                            {employee.name} • {employeeContact} • {getCompanyDisplayName(employeeCompany, getEmployeeCompanyId(employee) || 'sem empresa')}
                            {isLinkedToAnotherProfile ? ` • já vinculado a ${linkedProfile.name || linkedProfile.email}` : ''}
                          </option>
                        );
                      })}
                    </select>
                    <p className="mt-1 text-xs text-blue-700">
                      Selecionar um funcionário grava o ID real do documento em employees.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-blue-950 mb-1">
                      Referência gravada do funcionário
                    </label>
                    <input
                      type="text"
                      value={userForm.employeeId}
                      onChange={(e) => setUserForm(prev => ({ ...prev, employeeId: e.target.value }))}
                      onBlur={() => {
                        const employee = findEmployeeByReference(employees, userForm.employeeId);
                        if (employee) {
                          handleEmployeeSelect(employee.id);
                        }
                      }}
                      className="w-full px-3 py-2 border border-blue-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="ID, matrícula, CPF ou PIS"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-blue-950 mb-1">
                      ID gravado da empresa
                    </label>
                    <input
                      type="text"
                      value={userForm.empresaId}
                      onChange={(e) => handleCompanyChange(e.target.value)}
                      className="w-full px-3 py-2 border border-blue-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="ID da empresa no Firestore"
                    />
                  </div>
                </div>

                {selectedEmployee && (
                  <div className="mt-4 rounded-md border border-blue-200 bg-white p-3 text-sm text-gray-700">
                    <div className="font-semibold text-gray-900">Dados carregados do funcionário</div>
                    <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
                      <span>Nome: {selectedEmployee.name}</span>
                      <span>E-mail: {getEmployeeEmail(selectedEmployee) || 'não informado'}</span>
                      <span>Cargo: {selectedEmployee.position || 'não informado'}</span>
                      <span>Departamento: {selectedEmployee.department || 'não informado'}</span>
                      <span>Empresa: {getCompanyDisplayName(companyById.get(getEmployeeCompanyId(selectedEmployee)), getEmployeeCompanyId(selectedEmployee) || userForm.empresaId)}</span>
                      <span>Status: {selectedEmployee.status}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="usuario@exemplo.com"
                  required
                  disabled={editingUser !== null} // Não permitir editar email
                />
              </div>

              {/* Senha (apenas para criação) */}
              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Senha *
                  </label>
                  <input
                    type="password"
                    value={userForm.password}
                    onChange={(e) => setUserForm(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="********"
                    required
                  />
                </div>
              )}

              {/* Nome */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome Completo
                </label>
                <input
                  type="text"
                  value={userForm.name}
                  onChange={(e) => setUserForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nome do usuário"
                />
              </div>

              {/* Cargo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cargo
                </label>
                <input
                  type="text"
                  value={userForm.position}
                  onChange={(e) => setUserForm(prev => ({ ...prev, position: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Desenvolvedor, Analista, etc."
                />
              </div>

              {/* Departamento */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Departamento
                </label>
                <input
                  type="text"
                  value={userForm.department}
                  onChange={(e) => setUserForm(prev => ({ ...prev, department: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="TI, RH, Financeiro, etc."
                />
              </div>

              {/* Função */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Função no Sistema
                </label>
                <select
                  value={userForm.role}
                  onChange={(e) => setUserForm(prev => ({ ...prev, role: e.target.value as AppUserRole }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {roleOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {roleOptions.find(option => option.value === userForm.role)?.description || 'Permissões operacionais básicas.'}
                </p>
              </div>

              {/* Status Ativo */}
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">
                  Usuário Ativo
                </label>
                <input
                  type="checkbox"
                  checked={userForm.isActive}
                  onChange={(e) => setUserForm(prev => ({ ...prev, isActive: e.target.checked }))}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={closeModal}
                disabled={isSaving}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveUser}
                disabled={isSaving || !userForm.email.trim() || (!editingUser && !userForm.password.trim())}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isSaving 
                  ? '💾 Salvando...' 
                  : editingUser ? '💾 Salvar Alterações' : '➕ Criar Perfil'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
