'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

export interface DirectoryCompany {
  id: string;
  name: string;
  legalName: string;
  cnpj: string;
  isActive: boolean;
}

export interface DirectoryEmployee {
  id: string;
  name: string;
  email: string;
  corporateEmail: string;
  cpf: string;
  registration: string;
  pisPasep: string;
  department: string;
  position: string;
  empresaId: string;
  companyId: string;
  status: string;
  authUid: string;
  userId: string;
}

interface UseUserProfileDirectoryReturn {
  companies: DirectoryCompany[];
  employees: DirectoryEmployee[];
  isLoading: boolean;
  error: string;
  refresh: () => Promise<void>;
}

function readString(data: Record<string, any>, fields: string[]): string {
  for (const field of fields) {
    const value = data[field];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }
  }

  return '';
}

function normalizeCompany(id: string, data: Record<string, any>): DirectoryCompany {
  const name = readString(data, ['nomeEmpresa', 'name', 'nome', 'fantasia', 'displayName']);
  const legalName = readString(data, ['razaoSocial', 'legalName', 'razao_social']);

  return {
    id,
    name: name || legalName || id,
    legalName,
    cnpj: readString(data, ['cnpj', 'document']),
    isActive: data.ativo !== false && data.active !== false && data.isActive !== false
  };
}

function normalizeEmployee(id: string, data: Record<string, any>): DirectoryEmployee {
  const empresaId = readString(data, ['empresaId', 'companyId']);
  const email = readString(data, ['email', 'employeeEmail']);
  const corporateEmail = readString(data, ['emailCorporativo', 'corporateEmail']);

  return {
    id,
    name: readString(data, ['nomeCompleto', 'name', 'displayName', 'nome']) || id,
    email,
    corporateEmail,
    cpf: readString(data, ['cpf']),
    registration: readString(data, ['matricula', 'employeeId', 'funcionarioId']),
    pisPasep: readString(data, ['pisPasep', 'pis']),
    department: readString(data, ['setor', 'department', 'departamento']),
    position: readString(data, ['cargo', 'position']),
    empresaId,
    companyId: empresaId,
    status: readString(data, ['status']) || 'active',
    authUid: readString(data, ['authUid', 'uid']),
    userId: readString(data, ['userId', 'usuarioId'])
  };
}

export function useUserProfileDirectory(): UseUserProfileDirectoryReturn {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<DirectoryCompany[]>([]);
  const [employees, setEmployees] = useState<DirectoryEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!user) {
      setCompanies([]);
      setEmployees([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const [companiesSnapshot, employeesSnapshot] = await Promise.all([
        getDocs(collection(db, 'empresas')),
        getDocs(collection(db, 'employees'))
      ]);

      const loadedCompanies = companiesSnapshot.docs
        .map(document => normalizeCompany(document.id, document.data()))
        .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, 'pt-BR'));

      const loadedEmployees = employeesSnapshot.docs
        .map(document => normalizeEmployee(document.id, document.data()))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

      setCompanies(loadedCompanies);
      setEmployees(loadedEmployees);
    } catch (loadError: any) {
      console.error('Erro ao carregar empresas/funcionários para perfis:', loadError);
      setError(loadError.message || 'Não foi possível carregar empresas e funcionários cadastrados.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return useMemo(() => ({
    companies,
    employees,
    isLoading,
    error,
    refresh
  }), [companies, employees, error, isLoading, refresh]);
}
