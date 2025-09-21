'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  query,
  orderBy,
  where,
  onSnapshot,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { createUserWithEmailAndPassword, updateProfile, deleteUser as deleteAuthUser } from 'firebase/auth';
import { useAuth } from '@/hooks/useAuth';

export interface AppUser {
  id: string;
  email: string;
  name?: string;
  displayName?: string;
  role?: 'user' | 'admin';
  isActive: boolean;
  createdAt: string | Timestamp;
  updatedAt: string | Timestamp;
  lastLogin?: string | Timestamp;
  totalRegistrations?: number;
  photoURL?: string;
  // Campos específicos do sistema de ponto
  employeeId?: string;
  department?: string;
  position?: string;
}

export interface CreateUserData {
  email: string;
  password: string;
  name?: string;
  role?: 'user' | 'admin';
  isActive?: boolean;
  employeeId?: string;
  department?: string;
  position?: string;
}

export interface UpdateUserData {
  name?: string;
  displayName?: string;
  role?: 'user' | 'admin';
  isActive?: boolean;
  employeeId?: string;
  department?: string;
  position?: string;
}

interface UseUsersReturn {
  users: AppUser[];
  isLoading: boolean;
  error: string | null;
  
  // CRUD Operations
  createUser: (userData: CreateUserData) => Promise<string>;
  updateUser: (userId: string, updates: UpdateUserData) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  toggleUserStatus: (userId: string, isActive: boolean) => Promise<void>;
  
  // Utilities
  refreshUsers: () => Promise<void>;
  clearError: () => void;
  searchUsers: (searchTerm: string) => AppUser[];
}

export function useUsers(): UseUsersReturn {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { user: currentUser } = useAuth();
  const usersCollection = collection(db, 'users');

  // Carregar usuários em tempo real
  useEffect(() => {
    if (!currentUser) {
      setUsers([]);
      setIsLoading(false);
      return;
    }

    console.log('🔄 Carregando usuários...');
    setIsLoading(true);

    const q = query(usersCollection, orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const usersData: AppUser[] = [];
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          usersData.push({
            id: doc.id,
            email: data.email || '',
            name: data.name || data.displayName || '',
            displayName: data.displayName || data.name || '',
            role: data.role || 'user',
            isActive: data.isActive !== undefined ? data.isActive : true,
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt || data.createdAt || new Date().toISOString(),
            lastLogin: data.lastLogin,
            totalRegistrations: data.totalRegistrations || 0,
            photoURL: data.photoURL,
            employeeId: data.employeeId,
            department: data.department,
            position: data.position
          });
        });

        console.log(`✅ ${usersData.length} usuários carregados`);
        setUsers(usersData);
        setIsLoading(false);
        setError(null);
      },
      (error) => {
        console.error('❌ Erro ao carregar usuários:', error);
        setError(`Erro ao carregar usuários: ${error.message}`);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  // Criar novo usuário
  const createUser = useCallback(async (userData: CreateUserData): Promise<string> => {
    if (!currentUser) {
      throw new Error('Usuário não autenticado');
    }

    try {
      console.log('➕ Criando novo usuário:', userData.email);
      setError(null);

      // Dados do usuário para Firestore
      const userDocument = {
        email: userData.email,
        name: userData.name || '',
        displayName: userData.name || '',
        role: userData.role || 'user',
        isActive: userData.isActive !== undefined ? userData.isActive : true,
        employeeId: userData.employeeId || '',
        department: userData.department || '',
        position: userData.position || '',
        totalRegistrations: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: currentUser.uid
      };

      // Adicionar documento no Firestore
      const docRef = await addDoc(usersCollection, userDocument);
      
      console.log(`✅ Usuário criado no Firestore com ID: ${docRef.id}`);
      
      // Nota: Em um sistema real de produção, a criação de contas Firebase Auth
      // deve ser feita pelo servidor (Cloud Functions) por questões de segurança
      
      return docRef.id;
      
    } catch (error: any) {
      console.error('❌ Erro ao criar usuário:', error);
      const errorMessage = error.message || 'Erro desconhecido ao criar usuário';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [currentUser]);

  // Atualizar usuário
  const updateUser = useCallback(async (userId: string, updates: UpdateUserData): Promise<void> => {
    if (!currentUser) {
      throw new Error('Usuário não autenticado');
    }

    try {
      console.log(`📝 Atualizando usuário: ${userId}`, updates);
      setError(null);

      const updateData = {
        ...updates,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      };

      // Se houver mudança no displayName, sincronizar com name
      if (updates.name && !updates.displayName) {
        updateData.displayName = updates.name;
      }

      await updateDoc(doc(db, 'users', userId), updateData);
      
      console.log(`✅ Usuário ${userId} atualizado com sucesso`);
      
    } catch (error: any) {
      console.error('❌ Erro ao atualizar usuário:', error);
      const errorMessage = error.message || 'Erro desconhecido ao atualizar usuário';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [currentUser]);

  // Alternar status do usuário
  const toggleUserStatus = useCallback(async (userId: string, isActive: boolean): Promise<void> => {
    await updateUser(userId, { isActive });
  }, [updateUser]);

  // Deletar usuário
  const deleteUser = useCallback(async (userId: string): Promise<void> => {
    if (!currentUser) {
      throw new Error('Usuário não autenticado');
    }

    try {
      console.log(`🗑️ Deletando usuário: ${userId}`);
      setError(null);

      // Deletar documento do Firestore
      await deleteDoc(doc(db, 'users', userId));
      
      console.log(`✅ Usuário ${userId} deletado com sucesso`);
      
      // Nota: Em produção, também seria necessário deletar a conta do Firebase Auth
      // via Cloud Functions por questões de segurança
      
    } catch (error: any) {
      console.error('❌ Erro ao deletar usuário:', error);
      const errorMessage = error.message || 'Erro desconhecido ao deletar usuário';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [currentUser]);

  // Recarregar usuários manualmente
  const refreshUsers = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const snapshot = await getDocs(query(usersCollection, orderBy('createdAt', 'desc')));
      const usersData: AppUser[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        usersData.push({
          id: doc.id,
          email: data.email || '',
          name: data.name || data.displayName || '',
          displayName: data.displayName || data.name || '',
          role: data.role || 'user',
          isActive: data.isActive !== undefined ? data.isActive : true,
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || data.createdAt || new Date().toISOString(),
          lastLogin: data.lastLogin,
          totalRegistrations: data.totalRegistrations || 0,
          photoURL: data.photoURL,
          employeeId: data.employeeId,
          department: data.department,
          position: data.position
        });
      });
      
      setUsers(usersData);
      console.log(`🔄 ${usersData.length} usuários recarregados manualmente`);
      
    } catch (error: any) {
      console.error('❌ Erro ao recarregar usuários:', error);
      setError(`Erro ao recarregar usuários: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Buscar usuários
  const searchUsers = useCallback((searchTerm: string): AppUser[] => {
    if (!searchTerm.trim()) {
      return users;
    }
    
    const term = searchTerm.toLowerCase().trim();
    return users.filter(user => 
      user.email.toLowerCase().includes(term) ||
      user.name?.toLowerCase().includes(term) ||
      user.displayName?.toLowerCase().includes(term) ||
      user.employeeId?.toLowerCase().includes(term) ||
      user.department?.toLowerCase().includes(term) ||
      user.position?.toLowerCase().includes(term)
    );
  }, [users]);

  // Limpar erros
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
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
  };
}
