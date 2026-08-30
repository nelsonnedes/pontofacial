/**
 * P1-7 — Alias unificado para coleções de funcionário
 * Menos é Mais: uma fonte para resolver employees ↔ usuarios ↔ users
 * Produção deve migrar para `employees` (primária) + `users` (auth); `usuarios` é alias legado.
 * Este helper centraliza a resolução já implementada em functions/src/index.ts:1496 (resolvePointSubjectProfile)
 * e deve ser usado por novos códigos PWA.
 */

export const PRIMARY_EMPLOYEE_COLLECTION = 'employees' as const;
export const LEGACY_COLLECTIONS = ['usuarios', 'users'] as const;
export const ALL_EMPLOYEE_COLLECTIONS = ['employees', 'usuarios', 'users'] as const;

export type EmployeeCollection = typeof ALL_EMPLOYEE_COLLECTIONS[number];

/**
 * Ordem de resolução — tenta primária primeiro, fallback legado.
 * Usado por hooks e lib/offline-queue para evitar duplicação de loops.
 */
export function getEmployeeCollectionPriority(): EmployeeCollection[] {
  return [...ALL_EMPLOYEE_COLLECTIONS];
}

/**
 * Totem: documenta que `funcionarios` subcollection em `empresas/{id}/funcionarios` é legado
 * e deve ser migrado para `employees` com campo `empresaId`.
 */
export const DEPRECATED_SUBCOLLECTION = 'empresas/{empresaId}/funcionarios' as const;
