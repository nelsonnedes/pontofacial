'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  getDocs,
  Timestamp
} from 'firebase/firestore';
import { getIdTokenResult } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, db, getFirebaseApp } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

export type AppUserRole = 'admin' | 'rh' | 'manager' | 'kiosk' | 'employee' | 'user';

export interface AppUser {
  id: string;
  uid?: string;
  authUid?: string;
  email: string;
  name?: string;
  displayName?: string;
  role?: AppUserRole;
  permissions?: string[];
  isActive: boolean;
  createdAt: string | number | Timestamp;
  updatedAt: string | number | Timestamp;
  lastLogin?: string | number | Timestamp;
  totalRegistrations?: number;
  photoURL?: string;
  source?: 'users' | 'usuarios' | 'auth';
  employeeId?: string;
  funcionarioId?: string;
  empresaId?: string;
  companyId?: string;
  department?: string;
  position?: string;
}

export interface CreateUserData {
  email: string;
  password: string;
  name?: string;
  role?: AppUserRole;
  permissions?: string[];
  isActive?: boolean;
  employeeId?: string;
  empresaId?: string;
  department?: string;
  position?: string;
}

export interface UpdateUserData {
  name?: string;
  displayName?: string;
  role?: AppUserRole;
  permissions?: string[];
  isActive?: boolean;
  employeeId?: string;
  empresaId?: string;
  department?: string;
  position?: string;
}

interface UseUsersReturn {
  users: AppUser[];
  isLoading: boolean;
  error: string | null;
  createUser: (_userData: CreateUserData) => Promise<string>;
  updateUser: (_userId: string, _updates: UpdateUserData) => Promise<void>;
  deleteUser: (_userId: string) => Promise<void>;
  toggleUserStatus: (_userId: string, _isActive: boolean) => Promise<void>;
  refreshUsers: () => Promise<void>;
  clearError: () => void;
  searchUsers: (_searchTerm: string) => AppUser[];
}

interface UserProfileCallableResponse {
  uid?: string;
  userId?: string;
  success?: boolean;
}

const ROLE_FALLBACK: AppUserRole = 'employee';
const VALID_ROLES = new Set<AppUserRole>(['admin', 'rh', 'manager', 'kiosk', 'employee', 'user']);

function getUserFunctions() {
  return getFunctions(getFirebaseApp(), 'us-east1');
}

function readString(data: Record<string, any>, fields: string[]): string {
  for (const field of fields) {
    const value = data[field];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function normalizeRole(value: unknown, fallback: AppUserRole = ROLE_FALLBACK): AppUserRole {
  return typeof value === 'string' && VALID_ROLES.has(value as AppUserRole)
    ? value as AppUserRole
    : fallback;
}

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof (value as any).toDate === 'function') return (value as any).toDate().getTime();
  if (typeof (value as any).seconds === 'number') return (value as any).seconds * 1000;
  return 0;
}

function normalizePermissions(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function normalizeUserDoc(
  id: string,
  data: Record<string, any>,
  source: AppUser['source'],
  claimRole?: AppUserRole
): AppUser {
  const email = readString(data, ['email', 'userEmail', 'employeeEmail']);
  const name = readString(data, ['name', 'displayName', 'nome', 'nomeCompleto']);
  const employeeId = readString(data, ['employeeId', 'funcionarioId', 'matricula']);
  const empresaId = readString(data, ['empresaId', 'companyId']);

  return {
    id,
    uid: readString(data, ['uid']) || id,
    authUid: readString(data, ['authUid', 'uid']) || id,
    email,
    name,
    displayName: readString(data, ['displayName', 'name', 'nome']) || name,
    role: claimRole || normalizeRole(data.role),
    permissions: normalizePermissions(data.permissions),
    isActive: data.isActive !== undefined ? data.isActive !== false : data.ativo !== false,
    createdAt: data.createdAt || data.created_at || Date.now(),
    updatedAt: data.updatedAt || data.updated_at || data.createdAt || Date.now(),
    lastLogin: data.lastLogin || data.lastLoginAt,
    totalRegistrations: Number(data.totalRegistrations || data.faceVerificationCount || 0),
    photoURL: data.photoURL,
    source,
    employeeId,
    funcionarioId: readString(data, ['funcionarioId']) || employeeId,
    empresaId,
    companyId: readString(data, ['companyId']) || empresaId,
    department: readString(data, ['department', 'departamento']),
    position: readString(data, ['position', 'cargo'])
  };
}

function mergeProfiles(primary: AppUser[], secondary: AppUser[]): AppUser[] {
  const merged = new Map<string, AppUser>();

  for (const profile of secondary) {
    merged.set(profile.authUid || profile.uid || profile.id, profile);
  }

  for (const profile of primary) {
    const key = profile.authUid || profile.uid || profile.id;
    const existing = merged.get(key);
    merged.set(key, existing ? { ...existing, ...profile, source: profile.source } : profile);
  }

  return [...merged.values()]
    .filter(profile => profile.email || profile.name || profile.id)
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export function useUsers(): UseUsersReturn {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user: currentUser } = useAuth();

  const loadUsers = useCallback(async (): Promise<void> => {
    if (!currentUser) {
      setUsers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = await getIdTokenResult(currentUser, true);
      const currentRole = token.claims.admin === true
        ? 'admin'
        : normalizeRole(token.claims.role, ROLE_FALLBACK);

      const [usersSnapshot, usuariosSnapshot] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'usuarios'))
      ]);

      const usersProfiles = usersSnapshot.docs.map(doc =>
        normalizeUserDoc(doc.id, doc.data(), 'users', doc.id === currentUser.uid ? currentRole : undefined)
      );
      const usuariosProfiles = usuariosSnapshot.docs.map(doc =>
        normalizeUserDoc(doc.id, doc.data(), 'usuarios', doc.id === currentUser.uid ? currentRole : undefined)
      );
      const mergedProfiles = mergeProfiles(usersProfiles, usuariosProfiles);

      if (!mergedProfiles.some(profile => profile.id === currentUser.uid || profile.authUid === currentUser.uid)) {
        mergedProfiles.unshift({
          id: currentUser.uid,
          uid: currentUser.uid,
          authUid: currentUser.uid,
          email: currentUser.email || '',
          name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Administrador',
          displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Administrador',
          role: currentRole,
          permissions: [],
          isActive: true,
          createdAt: currentUser.metadata.creationTime || Date.now(),
          updatedAt: Date.now(),
          source: 'auth'
        });
      }

      setUsers(mergedProfiles);
    } catch (loadError: any) {
      console.error('Erro ao carregar perfis de acesso:', loadError);
      setUsers(currentUser ? [{
        id: currentUser.uid,
        uid: currentUser.uid,
        authUid: currentUser.uid,
        email: currentUser.email || '',
        name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Usuário autenticado',
        displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Usuário autenticado',
        role: 'user',
        permissions: [],
        isActive: true,
        createdAt: currentUser.metadata.creationTime || Date.now(),
        updatedAt: Date.now(),
        source: 'auth'
      }] : []);
      setError(loadError.message || 'Erro ao carregar perfis de acesso');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const createUser = useCallback(async (userData: CreateUserData): Promise<string> => {
    if (!auth.currentUser) {
      throw new Error('Usuário não autenticado');
    }

    try {
      setError(null);
      const callable = httpsCallable<CreateUserData, UserProfileCallableResponse>(
        getUserFunctions(),
        'createUserProfile'
      );
      const result = await callable(userData);
      await loadUsers();
      return result.data.uid || result.data.userId || '';
    } catch (createError: any) {
      const message = createError.message || 'Erro desconhecido ao criar perfil';
      setError(message);
      throw new Error(message);
    }
  }, [loadUsers]);

  const updateUser = useCallback(async (userId: string, updates: UpdateUserData): Promise<void> => {
    if (!auth.currentUser) {
      throw new Error('Usuário não autenticado');
    }

    try {
      setError(null);
      const callable = httpsCallable<UpdateUserData & { uid: string }, UserProfileCallableResponse>(
        getUserFunctions(),
        'updateUserProfile'
      );
      await callable({ uid: userId, ...updates });
      await loadUsers();
    } catch (updateError: any) {
      const message = updateError.message || 'Erro desconhecido ao atualizar perfil';
      setError(message);
      throw new Error(message);
    }
  }, [loadUsers]);

  const toggleUserStatus = useCallback(async (userId: string, isActive: boolean): Promise<void> => {
    await updateUser(userId, { isActive });
  }, [updateUser]);

  const deleteUser = useCallback(async (userId: string): Promise<void> => {
    if (!auth.currentUser) {
      throw new Error('Usuário não autenticado');
    }

    try {
      setError(null);
      const callable = httpsCallable<{ uid: string }, UserProfileCallableResponse>(
        getUserFunctions(),
        'deleteUserProfile'
      );
      await callable({ uid: userId });
      await loadUsers();
    } catch (deleteError: any) {
      const message = deleteError.message || 'Erro desconhecido ao desativar perfil';
      setError(message);
      throw new Error(message);
    }
  }, [loadUsers]);

  const refreshUsers = useCallback(async (): Promise<void> => {
    await loadUsers();
  }, [loadUsers]);

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
      user.empresaId?.toLowerCase().includes(term) ||
      user.department?.toLowerCase().includes(term) ||
      user.position?.toLowerCase().includes(term) ||
      user.role?.toLowerCase().includes(term)
    );
  }, [users]);

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
