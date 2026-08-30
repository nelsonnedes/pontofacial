'use client';

import { useEffect, useMemo, useState } from 'react';
import { getIdTokenResult } from 'firebase/auth';
import { useAuth } from '@/hooks/useAuth';

export type AccessRole = 'admin' | 'rh' | 'manager' | 'kiosk' | 'employee' | 'user';

interface AccessProfile {
  isLoading: boolean;
  isAuthenticated: boolean;
  uid?: string;
  email?: string | null;
  displayName?: string | null;
  role: AccessRole;
  isAdmin: boolean;
  isKiosk: boolean;
  employeeId?: string;
  empresaId?: string;
  permissions: string[];
  hasPermission: (_permission: string) => boolean;
  hasAnyPermission: (_permissions: string[]) => boolean;
}

const DEFAULT_ROLE: AccessRole = 'user';
const VALID_ROLES = new Set<AccessRole>(['admin', 'rh', 'manager', 'kiosk', 'employee', 'user']);

function normalizeRole(value: unknown, isAdmin: boolean, isKiosk: boolean): AccessRole {
  if (isAdmin) return 'admin';
  if (isKiosk) return 'kiosk';
  return typeof value === 'string' && VALID_ROLES.has(value as AccessRole)
    ? value as AccessRole
    : DEFAULT_ROLE;
}

function normalizePermissions(value: unknown, role: AccessRole, isAdmin: boolean): string[] {
  if (isAdmin) {
    return ['*'];
  }

  if (Array.isArray(value)) {
    const permissions = value
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map(entry => entry.trim());

    if (permissions.length > 0) {
      return [...new Set(permissions)];
    }
  }

  if (role === 'kiosk') {
    return ['app:mark-point', 'app:face-verification', 'app:manual'];
  }

  if (role === 'employee' || role === 'user') {
    return ['app:dashboard', 'app:mark-point', 'app:history', 'app:receipts', 'app:face-registration', 'app:manual'];
  }

  return ['app:manual'];
}

function readClaimText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function useAccessProfile(): AccessProfile {
  const { user, loading } = useAuth();
  const [claimsLoading, setClaimsLoading] = useState(true);
  const [role, setRole] = useState<AccessRole>(DEFAULT_ROLE);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isKiosk, setIsKiosk] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [empresaId, setEmpresaId] = useState<string | undefined>();

  useEffect(() => {
    let active = true;

    async function loadClaims() {
      if (!user) {
        if (active) {
          setRole(DEFAULT_ROLE);
          setIsAdmin(false);
          setIsKiosk(false);
          setPermissions([]);
          setEmployeeId(undefined);
          setEmpresaId(undefined);
          setClaimsLoading(false);
        }
        return;
      }

      setClaimsLoading(true);

      try {
        const token = await getIdTokenResult(user, true);
        const nextIsAdmin = token.claims.admin === true;
        const nextIsKiosk = token.claims.kiosk === true || token.claims.role === 'kiosk';
        const nextRole = normalizeRole(token.claims.role, nextIsAdmin, nextIsKiosk);

        if (active) {
          setRole(nextRole);
          setIsAdmin(nextIsAdmin);
          setIsKiosk(nextIsKiosk);
          setPermissions(normalizePermissions(token.claims.permissions, nextRole, nextIsAdmin));
          setEmployeeId(readClaimText(token.claims.employeeId));
          setEmpresaId(readClaimText(token.claims.empresaId || token.claims.companyId));
        }
      } catch (error) {
        console.error('Erro ao carregar permissões do usuário:', error);
        if (active) {
          setRole(DEFAULT_ROLE);
          setIsAdmin(false);
          setIsKiosk(false);
          setPermissions(user ? normalizePermissions([], DEFAULT_ROLE, false) : []);
          setEmployeeId(undefined);
          setEmpresaId(undefined);
        }
      } finally {
        if (active) {
          setClaimsLoading(false);
        }
      }
    }

    loadClaims();

    return () => {
      active = false;
    };
  }, [user]);

  const permissionSet = useMemo(() => new Set(permissions), [permissions]);

  const hasPermission = (permission: string) => {
    return permissionSet.has('*') || permissionSet.has(permission);
  };

  const hasAnyPermission = (permissionList: string[]) => {
    return permissionSet.has('*') || permissionList.some(permission => permissionSet.has(permission));
  };

  return {
    isLoading: loading || claimsLoading,
    isAuthenticated: !!user,
    uid: user?.uid,
    email: user?.email,
    displayName: user?.displayName,
    role,
    isAdmin,
    isKiosk,
    employeeId,
    empresaId,
    permissions,
    hasPermission,
    hasAnyPermission
  };
}
