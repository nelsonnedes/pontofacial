'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './useAuth';

type FirebaseRecordType = 'entry' | 'exit' | 'break_start' | 'break_end';

export interface FirebaseTimeRecord {
  id: string;
  userId: string;
  employeeId?: string;
  authUid?: string;
  timestamp: number;
  type: FirebaseRecordType;
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
  createdAt: number;
  syncedAt: number;
  source?: 'timeRecords' | 'marcacoes';
}

function normalizeTimestamp(val: any, fallback = Date.now()): number {
  if (!val) return fallback;
  if (typeof val === 'number') return val;
  if (typeof val.toMillis === 'function') return val.toMillis();
  if (val instanceof Date) return val.getTime();
  if (typeof val.seconds === 'number') return val.seconds * 1000;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRecordType(data: any): FirebaseRecordType {
  const rawType = String(data.type || data.tipo || data.pointType || '').toLowerCase();
  const typeMap: Record<string, FirebaseRecordType> = {
    entry: 'entry',
    entrada: 'entry',
    in: 'entry',
    exit: 'exit',
    saida: 'exit',
    out: 'exit',
    break_start: 'break_start',
    intervalo_inicio: 'break_start',
    pausa_inicio: 'break_start',
    break_end: 'break_end',
    intervalo_fim: 'break_end',
    pausa_fim: 'break_end'
  };

  return typeMap[rawType] || 'entry';
}

function normalizeLocation(data: any): FirebaseTimeRecord['location'] {
  const location = data.location || data.localizacao || data.gps || {};
  const latitude = Number(location.latitude ?? location.lat ?? data.latitude ?? data.lat);
  const longitude = Number(location.longitude ?? location.lng ?? data.longitude ?? data.lng);
  const accuracy = Number(location.accuracy ?? location.precisao ?? data.accuracy ?? data.precisao ?? 0);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return undefined;
  }

  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : 0
  };
}

function normalizeUserId(value: unknown, fallback = ''): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function normalizeRecord(
  id: string,
  data: any,
  source: FirebaseTimeRecord['source'],
  fallbackUserId: string
): FirebaseTimeRecord {
  const timestamp = normalizeTimestamp(
    data.timestamp || data.dataHoraTZ || data.serverTimestamp || data.createdAt || data.dataHora
  );
  const employeeId = normalizeUserId(data.employeeId || data.funcionarioId || data.userId || data.usuarioId, fallbackUserId);
  const authUid = normalizeUserId(data.authUid || data.uid, '');
  const userId = normalizeUserId(data.userId || data.usuarioId || employeeId || authUid, fallbackUserId);

  return {
    id,
    userId,
    ...(employeeId ? { employeeId } : {}),
    ...(authUid ? { authUid } : {}),
    timestamp,
    type: normalizeRecordType(data),
    location: normalizeLocation(data),
    createdAt: normalizeTimestamp(data.createdAt, timestamp),
    syncedAt: normalizeTimestamp(data.syncedAt || data.updatedAt, timestamp),
    source
  };
}

function dedupeAndSort(records: FirebaseTimeRecord[], limitCount?: number): FirebaseTimeRecord[] {
  const byRecordId = new Map<string, FirebaseTimeRecord>();
  const seenSemanticKeys = new Set<string>();

  for (const record of records.sort((a, b) => b.timestamp - a.timestamp)) {
    const semanticKey = `${record.userId}_${record.authUid || ''}_${Math.floor(record.timestamp / 1000)}_${record.type}`;
    if (seenSemanticKeys.has(semanticKey)) continue;
    seenSemanticKeys.add(semanticKey);

    const idKey = record.id;
    if (!byRecordId.has(idKey)) {
      byRecordId.set(idKey, record);
    }
  }

  const sorted = Array.from(byRecordId.values()).sort((a, b) => b.timestamp - a.timestamp);
  return typeof limitCount === 'number' ? sorted.slice(0, limitCount) : sorted;
}

const USER_RECORD_QUERIES: Array<{ collectionName: 'timeRecords' | 'marcacoes'; field: string }> = [
  { collectionName: 'timeRecords', field: 'authUid' },
  { collectionName: 'timeRecords', field: 'userId' },
  { collectionName: 'timeRecords', field: 'usuarioId' },
  { collectionName: 'marcacoes', field: 'authUid' },
  { collectionName: 'marcacoes', field: 'usuarioId' }
];

export function useFirebaseTimeRecords() {
  const [records, setRecords] = useState<FirebaseTimeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const { user } = useAuth();

  const unsubscribeRef = useRef<Array<() => void>>([]);
  const isMountedRef = useRef(true);

  const loadRecordsForCurrentUser = useCallback(async (
    userId: string,
    limitCount?: number
  ): Promise<FirebaseTimeRecord[]> => {
    const snapshots = await Promise.allSettled(
      USER_RECORD_QUERIES.map(({ collectionName, field }) => {
        const q = query(collection(db, collectionName), where(field, '==', userId));
        return getDocs(q).then((snapshot) => ({ snapshot, collectionName }));
      })
    );

    const loaded: FirebaseTimeRecord[] = [];
    snapshots.forEach((result) => {
      if (result.status !== 'fulfilled') return;

      const { snapshot, collectionName } = result.value;
      snapshot.forEach((document) => {
        loaded.push(normalizeRecord(document.id, document.data(), collectionName, userId));
      });
    });

    return dedupeAndSort(loaded, limitCount);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    if (!user) {
      setRecords([]);
      setTotalCount(0);
      setIsLoading(false);
      return;
    }

    unsubscribeRef.current.forEach((unsubscribe) => unsubscribe());
    unsubscribeRef.current = [];

    setIsLoading(true);
    setError(null);

    const LIMIT = 100;
    const buckets = new Map<string, FirebaseTimeRecord[]>();

    const publish = () => {
      if (!isMountedRef.current) return;

      const merged = dedupeAndSort(Array.from(buckets.values()).flat(), LIMIT);
      setRecords(merged);
      setTotalCount(merged.length);
      setIsLoading(false);
    };

    USER_RECORD_QUERIES.forEach(({ collectionName, field }) => {
      const bucketKey = `${collectionName}:${field}`;
      const q = query(collection(db, collectionName), where(field, '==', user.uid));

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const loaded: FirebaseTimeRecord[] = [];
          snapshot.forEach((document) => {
            loaded.push(normalizeRecord(document.id, document.data(), collectionName, user.uid));
          });
          buckets.set(bucketKey, loaded);
          publish();
        },
        (err) => {
          console.warn(`Nao foi possivel escutar ${bucketKey}:`, err);
          buckets.set(bucketKey, []);
          publish();
        }
      );

      unsubscribeRef.current.push(unsubscribe);
    });

    return () => {
      isMountedRef.current = false;
      unsubscribeRef.current.forEach((unsubscribe) => unsubscribe());
      unsubscribeRef.current = [];
    };
  }, [user]);

  const loadRecordsByPeriod = useCallback(async (startDate: Date, endDate: Date) => {
    if (!user) return;

    setIsLoading(true);
    setError(null);

    try {
      const startTimestamp = startDate.getTime();
      const endTimestamp = endDate.getTime();
      const allRecords = await loadRecordsForCurrentUser(user.uid);
      const filtered = allRecords.filter((record) => (
        record.timestamp >= startTimestamp &&
        record.timestamp <= endTimestamp
      ));

      if (isMountedRef.current) {
        setRecords(filtered);
        setTotalCount(filtered.length);
      }
    } catch (err: any) {
      console.error('Erro ao carregar registros por periodo:', err);
      if (isMountedRef.current) {
        setError(err.message || 'Erro ao carregar registros');
        setRecords([]);
        setTotalCount(0);
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [user, loadRecordsForCurrentUser]);

  const refresh = useCallback(() => {
    if (!user) return;

    setIsLoading(true);
    loadRecordsForCurrentUser(user.uid, 100)
      .then((loaded) => {
        if (!isMountedRef.current) return;
        setRecords(loaded);
        setTotalCount(loaded.length);
        setError(null);
      })
      .catch((err) => {
        if (!isMountedRef.current) return;
        setError(err.message || 'Erro ao recarregar registros');
      })
      .finally(() => {
        if (isMountedRef.current) setIsLoading(false);
      });
  }, [user, loadRecordsForCurrentUser]);

  return {
    records,
    isLoading,
    error,
    totalCount,
    loadRecordsByPeriod,
    refresh
  };
}
