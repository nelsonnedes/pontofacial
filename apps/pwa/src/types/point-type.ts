/**
 * P2-3 — PointType central DRY
 * Substitui 5× mapeamentos PT↔EN espalhados:
 *  - functions/src/index.ts:73 VALID_POINT_TYPES + 82 LEGACY_POINT_TYPES
 *  - lib/offline-queue.ts:359,483 normalizePointType
 *  - lib/sync.ts:7 legacyTypeMap
 *  - lib/geofencing.ts:39 PointType PT
 *  - components/marcar-ponto/SelectTypeScreen:8 + OptimizedCaptureScreen:17
 * Menos é Mais: uma fonte, zod validado, helpers puros testáveis.
 */

import { z } from 'zod';

export const POINT_TYPES = ['entry', 'exit', 'break_start', 'break_end'] as const;
export type PointType = typeof POINT_TYPES[number];

export const POINT_TYPES_PT = ['entrada', 'saida', 'pausa_inicio', 'pausa_fim'] as const;
export type PointTypePT = typeof POINT_TYPES_PT[number];

export const POINT_TYPE_MAP_TO_PT: Record<PointType, PointTypePT> = {
  entry: 'entrada',
  exit: 'saida',
  break_start: 'pausa_inicio',
  break_end: 'pausa_fim',
};

export const POINT_TYPE_MAP_TO_EN: Record<PointTypePT, PointType> = {
  entrada: 'entry',
  saida: 'exit',
  pausa_inicio: 'break_start',
  pausa_fim: 'break_end',
};

// Legacy compat (firestore marcacoes usa 'entrada' etc.)
export const LEGACY_POINT_TYPES: Record<PointType, string> = {
  entry: 'entrada',
  exit: 'saida',
  break_start: 'intervalo_inicio',
  break_end: 'intervalo_fim',
};

export const pointTypeSchema = z.enum(POINT_TYPES);
export const pointTypePTSchema = z.enum(POINT_TYPES_PT);

export function isValidPointType(value: unknown): value is PointType {
  return typeof value === 'string' && (POINT_TYPES as readonly string[]).includes(value);
}

export function normalizePointType(value: unknown): PointType | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if ((POINT_TYPES as readonly string[]).includes(v)) return v as PointType;
  if ((POINT_TYPES_PT as readonly string[]).includes(v)) return POINT_TYPE_MAP_TO_EN[v as PointTypePT];
  // legacy intervalo_*
  if (v === 'intervalo_inicio') return 'break_start';
  if (v === 'intervalo_fim') return 'break_end';
  return null;
}

export function mapToPT(type: PointType): PointTypePT {
  return POINT_TYPE_MAP_TO_PT[type];
}

export function mapToEN(type: PointTypePT): PointType {
  return POINT_TYPE_MAP_TO_EN[type];
}

export function mapToFirestoreLegacy(type: PointType): string {
  return LEGACY_POINT_TYPES[type];
}

// UI helpers — DRY para SelectTypeScreen + OptimizedCaptureScreen
export const POINT_TYPE_LABELS: Record<PointType, string> = {
  entry: 'Entrada',
  exit: 'Saída',
  break_start: 'Pausa Início',
  break_end: 'Pausa Fim',
};

export const POINT_TYPE_ICONS: Record<PointType, string> = {
  entry: '🟢',
  exit: '🔴',
  break_start: '⏸️',
  break_end: '▶️',
};
