'use client';

import { useState, useMemo } from 'react';
import { useUsers, AppUser, CreateUserData, UpdateUserData } from '@/hooks/useUsers';

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
    clearError,
    searchUsers
  } = useUsers();

  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [userForm, setUserForm] = useState<{
    email: string;
    password: string;
    name: string;
    role: 'user' | 'admin';
    isActive: boolean;
    employeeId: string;
    department: string;
    position: string;
  }>({
    email: '',
    password: '',
    name: '',
    role: 'user',
    isActive: true,
    employeeId: '',
    department: '',
    position: ''
  });
  const [isSaving, setIsSaving] = useState(false);

  // Filtrar usuários com base na busca
  const filteredUsers = useMemo(() => {
    return searchUsers(searchTerm);
  }, [searchUsers, searchTerm]);

  // Abrir modal para criar usuário
  const openCreateModal = () => {
    setEditingUser(null);
    setUserForm({
      email: '',
      password: '',
      name: '',
      role: 'user',
      isActive: true,
      employeeId: '',
      department: '',
      position: ''
    });
    setShowModal(true);
    clearError();
  };

  // Abrir modal para editar usuário
  const openEditModal = (user: AppUser) => {
    setEditingUser(user);
    setUserForm({
      email: user.email,
      password: '', // Não mostrar senha existente
      name: user.name || '',
      role: user.role || 'user',
      isActive: user.isActive,
      employeeId: user.employeeId || '',
      department: user.department || '',
      position: user.position || ''
    });
    setShowModal(true);
    clearError();
  };

  // Fechar modal
  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setUserForm({
      email: '',
      password: '',
      name: '',
      role: 'user',
      isActive: true,
      employeeId: '',
      department: '',
      position: ''
    });
    clearError();
  };

  // Salvar usuário (criar ou editar)
  const handleSaveUser = async () => {
    if (!userForm.email.trim()) {
      alert('❌ Email é obrigatório');
      return;
    }

    if (!editingUser && !userForm.password.trim()) {
      alert('❌ Senha é obrigatória para novos usuários');
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
          department: userForm.department.trim(),
          position: userForm.position.trim()
        };

        await updateUser(editingUser.id, updates);
        alert('✅ Usuário atualizado com sucesso!');
      } else {
        // Criar novo usuário
        console.log('➕ Criando novo usuário:', userForm.email);
        
        const userData: CreateUserData = {
          email: userForm.email.trim(),
          password: userForm.password,
          name: userForm.name.trim(),
          role: userForm.role,
          isActive: userForm.isActive,
          employeeId: userForm.employeeId.trim(),
          department: userForm.department.trim(),
          position: userForm.position.trim()
        };

        await createUser(userData);
        alert('✅ Usuário criado com sucesso!');
      }
      
      closeModal();
    } catch (error: any) {
      console.error('❌ Erro ao salvar usuário:', error);
      alert(`❌ Erro ao salvar usuário: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Deletar usuário
  const handleDeleteUser = async (user: AppUser) => {
    const confirmDelete = window.confirm(
      `⚠️ Tem certeza que deseja excluir o usuário "${user.name || user.email}"?\n\n` +
      `Esta ação não pode ser desfeita.`
    );
    
    if (!confirmDelete) return;

    try {
      console.log('🗑️ Excluindo usuário:', user.id);
      await deleteUser(user.id);
      alert('✅ Usuário excluído com sucesso!');
    } catch (error: any) {
      console.error('❌ Erro ao excluir usuário:', error);
      alert(`❌ Erro ao excluir usuário: ${error.message}`);
    }
  };

  // Alternar status do usuário
  const handleToggleUserStatus = async (user: AppUser) => {
    const newStatus = !user.isActive;
    const action = newStatus ? 'ativar' : 'desativar';
    
    const confirmToggle = window.confirm(
      `Tem certeza que deseja ${action} o usuário "${user.name || user.email}"?`
    );
    
    if (!confirmToggle) return;

    try {
      await toggleUserStatus(user.id, newStatus);
      console.log(`✅ Status do usuário ${user.id} alterado para: ${newStatus ? 'ativo' : 'inativo'}`);
    } catch (error: any) {
      console.error('❌ Erro ao alterar status:', error);
      alert(`❌ Erro ao alterar status: ${error.message}`);
    }
  };

  // Formatação de datas
  const formatDate = (dateValue: string | any) => {
    try {
      let date: Date;
      
      if (typeof dateValue === 'string') {
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
            ➕ Novo Usuário
          </button>
        </div>
      </div>

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
          <p className="text-sm text-gray-500">Total de Usuários</p>
          <p className="text-2xl font-bold text-gray-900">{users.length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Usuários Ativos</p>
          <p className="text-2xl font-bold text-green-600">{users.filter(u => u.isActive).length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-sm text-gray-500">Usuários Inativos</p>
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
              {filteredUsers.map((user) => (
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
                        {user.employeeId && (
                          <div className="text-xs text-gray-400">ID: {user.employeeId}</div>
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
                      ${user.role === 'admin' 
                        ? 'bg-purple-100 text-purple-800' 
                        : 'bg-blue-100 text-blue-800'
                      }
                    `}>
                      {user.role === 'admin' ? '👑 Admin' : '👤 Usuário'}
                    </span>
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
                      🗑️ Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-6 text-center text-gray-500">
            <p className="text-lg font-medium mb-2">👥 Nenhum usuário encontrado</p>
            <p className="text-sm">
              {searchTerm 
                ? 'Tente ajustar os termos de busca.' 
                : 'Não há usuários cadastrados no sistema.'
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
              {editingUser ? '✏️ Editar Usuário' : '➕ Novo Usuário'}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

              {/* ID do Funcionário */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Matrícula/ID
                </label>
                <input
                  type="text"
                  value={userForm.employeeId}
                  onChange={(e) => setUserForm(prev => ({ ...prev, employeeId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="123456"
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
                  onChange={(e) => setUserForm(prev => ({ ...prev, role: e.target.value as 'user' | 'admin' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="user">👤 Usuário</option>
                  <option value="admin">👑 Administrador</option>
                </select>
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
                  : editingUser ? '💾 Salvar Alterações' : '➕ Criar Usuário'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}