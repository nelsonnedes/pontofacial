'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  getDocs, 
  doc, 
  deleteDoc, 
  updateDoc, 
  orderBy
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ✅ INTERFACE DO FUNCIONÁRIO PARA LISTAGEM
export interface Employee {
  id: string;
  
  // Dados básicos
  nomeCompleto: string;
  cpf: string;
  email: string;
  celular: string;
  
  // Dados profissionais
  cargo: string;
  setor: string;
  salario?: string;
  dataAdmissao: string;
  tipoContrato: 'CLT' | 'PJ' | 'Terceirizado' | 'Estagiário' | '';
  
  // Status e controles
  status: 'active' | 'inactive' | 'terminated';
  registrationCompleted: boolean;
  faceEmbedding?: any;
  facialRegistrationDate?: Date;
  
  // Metadados
  createdAt: Date;
  updatedAt?: Date;
  createdBy: string;
}

// ✅ FILTROS DE BUSCA
export interface EmployeeFilters {
  searchTerm: string;
  status: 'all' | 'active' | 'inactive' | 'terminated';
  setor: string;
  tipoContrato: string;
  hasPhoto: 'all' | 'yes' | 'no';
}

const INITIAL_FILTERS: EmployeeFilters = {
  searchTerm: '',
  status: 'all',
  setor: '',
  tipoContrato: '',
  hasPhoto: 'all'
};

export function useEmployeeList() {
  // ✅ ESTADOS
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [filters, setFilters] = useState<EmployeeFilters>(INITIAL_FILTERS);

  // ✅ CARREGAR LISTA DE FUNCIONÁRIOS
  const loadEmployees = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError('');
      console.log('🔄 Carregando lista de funcionários...');

      const employeesQuery = query(
        collection(db, 'employees'),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(employeesQuery);
      const employeesList: Employee[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        
        // ✅ CONVERTER TIMESTAMPS DO FIREBASE
        const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
        const updatedAt = data.updatedAt?.toDate ? data.updatedAt.toDate() : (data.updatedAt ? new Date(data.updatedAt) : undefined);
        const facialRegistrationDate = data.facialRegistrationDate?.toDate ? data.facialRegistrationDate.toDate() : (data.facialRegistrationDate ? new Date(data.facialRegistrationDate) : undefined);

        employeesList.push({
          id: doc.id,
          nomeCompleto: data.nomeCompleto || 'Sem nome',
          cpf: data.cpf || '',
          email: data.email || '',
          celular: data.celular || '',
          cargo: data.cargo || '',
          setor: data.setor || '',
          salario: data.salario || '',
          dataAdmissao: data.dataAdmissao || '',
          tipoContrato: data.tipoContrato || '',
          status: data.status || 'active',
          registrationCompleted: !!data.registrationCompleted,
          faceEmbedding: data.faceEmbedding,
          facialRegistrationDate,
          createdAt,
          updatedAt,
          createdBy: data.createdBy || 'system'
        });
      });

      setEmployees(employeesList);
      console.log(`✅ ${employeesList.length} funcionários carregados`);
      
    } catch (error: any) {
      console.error('❌ Erro ao carregar funcionários:', error);
      setError(`Erro ao carregar funcionários: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ✅ CARREGAR FUNCIONÁRIOS AO MONTAR
  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  // ✅ FILTRAR FUNCIONÁRIOS
  const filteredEmployees = useMemo(() => {
    return employees.filter(employee => {
      // Filtro de busca textual
      if (filters.searchTerm) {
        const searchTerm = filters.searchTerm.toLowerCase();
        const matchesSearch = (
          employee.nomeCompleto.toLowerCase().includes(searchTerm) ||
          employee.email.toLowerCase().includes(searchTerm) ||
          employee.cpf.includes(searchTerm) ||
          employee.cargo.toLowerCase().includes(searchTerm) ||
          employee.setor.toLowerCase().includes(searchTerm)
        );
        if (!matchesSearch) return false;
      }

      // Filtro de status
      if (filters.status !== 'all' && employee.status !== filters.status) {
        return false;
      }

      // Filtro de setor
      if (filters.setor && employee.setor !== filters.setor) {
        return false;
      }

      // Filtro de tipo de contrato
      if (filters.tipoContrato && employee.tipoContrato !== filters.tipoContrato) {
        return false;
      }

      // Filtro de cadastro facial
      if (filters.hasPhoto !== 'all') {
        const hasPhoto = !!employee.faceEmbedding;
        if ((filters.hasPhoto === 'yes' && !hasPhoto) || (filters.hasPhoto === 'no' && hasPhoto)) {
          return false;
        }
      }

      return true;
    });
  }, [employees, filters]);

  // ✅ ATUALIZAR FILTROS
  const updateFilters = useCallback((newFilters: Partial<EmployeeFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  // ✅ LIMPAR FILTROS
  const clearFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
  }, []);

  // ✅ EXCLUIR FUNCIONÁRIO
  const deleteEmployee = useCallback(async (employeeId: string): Promise<boolean> => {
    try {
      console.log('🗑️ Excluindo funcionário:', employeeId);
      
      await deleteDoc(doc(db, 'employees', employeeId));
      
      // Remover da lista local
      setEmployees(prev => prev.filter(emp => emp.id !== employeeId));
      
      console.log('✅ Funcionário excluído com sucesso');
      return true;
      
    } catch (error: any) {
      console.error('❌ Erro ao excluir funcionário:', error);
      setError(`Erro ao excluir funcionário: ${error.message}`);
      return false;
    }
  }, []);

  // ✅ ALTERNAR STATUS DO FUNCIONÁRIO (ATIVAR/DESATIVAR)
  const toggleEmployeeStatus = useCallback(async (employeeId: string, newStatus: 'active' | 'inactive'): Promise<boolean> => {
    try {
      console.log(`🔄 Alterando status do funcionário ${employeeId} para: ${newStatus}`);
      
      await updateDoc(doc(db, 'employees', employeeId), {
        status: newStatus,
        updatedAt: new Date()
      });

      // Atualizar na lista local
      setEmployees(prev => prev.map(emp => 
        emp.id === employeeId 
          ? { ...emp, status: newStatus, updatedAt: new Date() }
          : emp
      ));
      
      console.log('✅ Status do funcionário alterado com sucesso');
      return true;
      
    } catch (error: any) {
      console.error('❌ Erro ao alterar status:', error);
      setError(`Erro ao alterar status: ${error.message}`);
      return false;
    }
  }, []);

  // ✅ REMOVER CADASTRO FACIAL (PARA RECADASTRO)
  const removeFacialRegistration = useCallback(async (employeeId: string): Promise<boolean> => {
    try {
      console.log('🔄 Removendo cadastro facial do funcionário:', employeeId);
      
      await updateDoc(doc(db, 'employees', employeeId), {
        faceEmbedding: null,
        registrationCompleted: false,
        facialRegistrationDate: null,
        updatedAt: new Date()
      });

      // Atualizar na lista local
      setEmployees(prev => prev.map(emp => 
        emp.id === employeeId 
          ? { 
              ...emp, 
              faceEmbedding: null, 
              registrationCompleted: false, 
              facialRegistrationDate: undefined, 
              updatedAt: new Date() 
            }
          : emp
      ));
      
      console.log('✅ Cadastro facial removido com sucesso');
      return true;
      
    } catch (error: any) {
      console.error('❌ Erro ao remover cadastro facial:', error);
      setError(`Erro ao remover cadastro facial: ${error.message}`);
      return false;
    }
  }, []);

  // ✅ BUSCAR FUNCIONÁRIO POR ID
  const getEmployeeById = useCallback((employeeId: string): Employee | undefined => {
    return employees.find(emp => emp.id === employeeId);
  }, [employees]);

  // ✅ ESTATÍSTICAS
  const statistics = useMemo(() => {
    const total = employees.length;
    const active = employees.filter(emp => emp.status === 'active').length;
    const inactive = employees.filter(emp => emp.status === 'inactive').length;
    const terminated = employees.filter(emp => emp.status === 'terminated').length;
    const withPhoto = employees.filter(emp => !!emp.faceEmbedding).length;
    const withoutPhoto = total - withPhoto;

    return {
      total,
      active,
      inactive,
      terminated,
      withPhoto,
      withoutPhoto,
      completedRegistration: employees.filter(emp => emp.registrationCompleted).length
    };
  }, [employees]);

  // ✅ LISTAS ÚNICAS PARA FILTROS
  const uniqueSetores = useMemo(() => {
    const setores = Array.from(new Set(employees.map(emp => emp.setor).filter(Boolean)));
    return setores.sort();
  }, [employees]);

  const uniqueContratos = useMemo(() => {
    const contratos = Array.from(new Set(employees.map(emp => emp.tipoContrato).filter(Boolean)));
    return contratos.sort();
  }, [employees]);

  // ✅ LIMPAR ERRO
  const clearError = useCallback(() => {
    setError('');
  }, []);

  // ✅ FORMATAÇÃO DE DATA
  const formatDate = useCallback((date: Date | string): string => {
    try {
      const dateObj = date instanceof Date ? date : new Date(date);
      return dateObj.toLocaleDateString('pt-BR');
    } catch {
      return 'Data inválida';
    }
  }, []);

  return {
    // ✅ DADOS
    employees: filteredEmployees,
    allEmployees: employees,
    isLoading,
    error,
    filters,
    statistics,
    uniqueSetores,
    uniqueContratos,
    
    // ✅ AÇÕES DE CRUD
    loadEmployees,
    deleteEmployee,
    toggleEmployeeStatus,
    removeFacialRegistration,
    getEmployeeById,
    
    // ✅ AÇÕES DE FILTRO
    updateFilters,
    clearFilters,
    
    // ✅ UTILITÁRIOS
    clearError,
    formatDate
  };
}
