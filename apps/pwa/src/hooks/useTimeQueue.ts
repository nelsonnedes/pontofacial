'use client';
/**
 * P1-5 — Hook unificado DRY para fila offline
 * Substitui useOfflineTimeRecords + useOfflineSync + useSyncStatus
 * Fonte autoritativa: offline-queue.ts:159 (queueManager.startProcessing 5s)
 * Menos é Mais: um import para toda a app.
 */
export { useOfflineTimeRecords as useTimeQueue } from './useOfflineTimeRecords';
export { useOfflineTimeRecords } from './useOfflineTimeRecords';
