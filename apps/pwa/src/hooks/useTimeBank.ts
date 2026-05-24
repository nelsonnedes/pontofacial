'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  onSnapshot
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import {
  TimeRecord,
  TimeEntry,
  TimeBankBalance,
  TimeBankTransaction,
  WorkSchedule,
  CompensationRule,
  calculateTimeBankBalance,
  generateTimeBankAlerts,
  suggestCompensation,
  calculateDailyHours
} from '@/lib/time-bank';

interface UseTimeBankReturn {
  balance: TimeBankBalance | null;
  records: TimeRecord[];
  transactions: TimeBankTransaction[];
  schedule: WorkSchedule | null;
  rules: CompensationRule | null;
  isLoading: boolean;
  error: string | null;
  refreshBalance: () => Promise<void>;
  requestCompensation: (_hours: number, _description: string) => Promise<boolean>;
  approveRecord: (_recordId: string) => Promise<boolean>;
  updateSchedule: (_newSchedule: Partial<WorkSchedule>) => Promise<boolean>;
  alerts: Array<{ type: 'warning' | 'error' | 'info'; message: string }>;
  suggestions: Array<{ type: 'take_time_off' | 'work_extra'; hours: number; description: string }>;
  clearError: () => void;
}

const DEFAULT_SCHEDULE: WorkSchedule = {
  userId: '',
  weeklyHours: 40,
  dailyHours: 8,
  workDays: [1, 2, 3, 4, 5],
  startTime: '08:00',
  endTime: '17:00',
  lunchBreakMinutes: 60,
  nightShiftStart: '22:00',
  nightShiftEnd: '06:00',
  overtimeMultiplier: 1.5,
  weekendMultiplier: 2.0,
  holidayMultiplier: 2.0
};

const DEFAULT_RULES: CompensationRule = {
  id: 'default',
  name: 'Regras CLT operacionais',
  maxDailyOvertime: 2,
  maxMonthlyOvertime: 40,
  maxBankBalance: 80,
  minBankBalance: -40,
  compensationPeriod: 30,
  autoApproval: false,
  alertThreshold: 20
};

const RECORD_OWNER_FIELDS = ['authUid', 'userId', 'usuarioId'];

function normalizeTimestamp(value: any, fallback = Date.now()): number {
  if (!value) return fallback;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizePointType(data: any): TimeEntry['type'] {
  const rawType = String(data.type || data.tipo || '').toLowerCase();
  const typeMap: Record<string, TimeEntry['type']> = {
    entry: 'entry',
    entrada: 'entry',
    exit: 'exit',
    saida: 'exit',
    break_start: 'break_start',
    intervalo_inicio: 'break_start',
    pausa_inicio: 'break_start',
    break_end: 'break_end',
    intervalo_fim: 'break_end',
    pausa_fim: 'break_end'
  };

  return typeMap[rawType] || 'entry';
}

function normalizeLocation(data: any): TimeEntry['location'] {
  const location = data.location || data.localizacao || data.gps || {};
  const latitude = Number(location.latitude ?? location.lat ?? data.latitude ?? data.lat);
  const longitude = Number(location.longitude ?? location.lng ?? data.longitude ?? data.lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return undefined;
  }

  return { latitude, longitude };
}

function normalizeText(value: unknown, fallback = ''): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function toTimeString(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function normalizeMethod(data: any): TimeEntry['method'] {
  if (data.captureMethod === 'facial' || data.hasFacialRecognition === true) return 'facial';
  if (data.captureMethod === 'photo' || data.hasPhotoEvidence === true) return 'photo';
  return 'manual';
}

function groupPointDocuments(documents: Array<{ id: string; data: any }>, fallbackUserId: string): TimeRecord[] {
  const grouped = new Map<string, TimeRecord>();

  documents.forEach(({ id, data }) => {
    const timestamp = normalizeTimestamp(
      data.timestamp || data.dataHoraTZ || data.serverTimestamp || data.createdAt || data.dataHora
    );
    const date = new Date(timestamp);
    const userId = normalizeText(
      data.employeeId || data.funcionarioId || data.userId || data.usuarioId || data.authUid,
      fallbackUserId
    );
    const key = `${userId}:${dateKey(date)}`;
    const approved = (
      data.approved === true ||
      data.status === 'aprovado' ||
      data.reviewStatus === 'approved' ||
      data.verificationStatus === 'verified'
    );

    const entry: TimeEntry = {
      time: toTimeString(date),
      type: normalizePointType(data),
      method: normalizeMethod(data),
      location: normalizeLocation(data)
    };

    const existing = grouped.get(key);
    if (existing) {
      existing.entries.push(entry);
      existing.approved = existing.approved && approved;
      return;
    }

    grouped.set(key, {
      id,
      userId,
      date,
      entries: [entry],
      calculatedHours: {
        regular: 0,
        overtime: 0,
        deficit: 0,
        nightShift: 0,
        weekendHours: 0,
        holidayHours: 0
      },
      approved,
      approvedBy: normalizeText(data.approvedBy, undefined as any) || undefined,
      approvedAt: data.approvedAt ? new Date(normalizeTimestamp(data.approvedAt)) : undefined
    });
  });

  return Array.from(grouped.values())
    .map((record) => ({
      ...record,
      entries: record.entries.sort((a, b) => a.time.localeCompare(b.time))
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

function calculateMinutesBetween(start: string, end: string): number {
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  return Math.max(0, (endHour * 60 + endMinute) - (startHour * 60 + startMinute));
}

function scheduleFromEmployeeSchedule(data: any, userId: string): WorkSchedule {
  const weekSchedule = Array.isArray(data.weekSchedule) ? data.weekSchedule : [];
  const workingDays = weekSchedule.filter((day: any) => day?.isWorkingDay);
  const firstShift = workingDays[0]?.shifts?.[0] || {};
  const workDays = workingDays
    .map((day: any) => Number(day.dayOfWeek))
    .filter((day: number) => Number.isInteger(day) && day >= 0 && day <= 6);

  const dailyMinutes = workingDays.length > 0
    ? Math.max(...workingDays.map((day: any) => {
        const shift = day?.shifts?.[0] || {};
        const gross = calculateMinutesBetween(shift.start || '08:00', shift.end || '17:00');
        const lunch = shift.breakStart && shift.breakEnd
          ? calculateMinutesBetween(shift.breakStart, shift.breakEnd)
          : 60;
        return Math.max(0, gross - lunch);
      }))
    : DEFAULT_SCHEDULE.dailyHours * 60;

  const weeklyMinutes = workingDays.reduce((total: number, day: any) => {
    const shift = day?.shifts?.[0] || {};
    const gross = calculateMinutesBetween(shift.start || '08:00', shift.end || '17:00');
    const lunch = shift.breakStart && shift.breakEnd
      ? calculateMinutesBetween(shift.breakStart, shift.breakEnd)
      : 60;
    return total + Math.max(0, gross - lunch);
  }, 0);

  return {
    ...DEFAULT_SCHEDULE,
    userId: normalizeText(data.employeeId || data.userId, userId),
    workDays: workDays.length > 0 ? workDays : DEFAULT_SCHEDULE.workDays,
    startTime: firstShift.start || DEFAULT_SCHEDULE.startTime,
    endTime: firstShift.end || DEFAULT_SCHEDULE.endTime,
    lunchBreakMinutes: firstShift.breakStart && firstShift.breakEnd
      ? calculateMinutesBetween(firstShift.breakStart, firstShift.breakEnd)
      : DEFAULT_SCHEDULE.lunchBreakMinutes,
    dailyHours: dailyMinutes / 60,
    weeklyHours: weeklyMinutes > 0 ? weeklyMinutes / 60 : DEFAULT_SCHEDULE.weeklyHours
  };
}

export function useTimeBank(): UseTimeBankReturn {
  const [balance, setBalance] = useState<TimeBankBalance | null>(null);
  const [records, setRecords] = useState<TimeRecord[]>([]);
  const [transactions] = useState<TimeBankTransaction[]>([]);
  const [schedule, setSchedule] = useState<WorkSchedule | null>(null);
  const [rules, setRules] = useState<CompensationRule | null>(DEFAULT_RULES);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Array<{ type: 'warning' | 'error' | 'info'; message: string }>>([]);
  const [suggestions, setSuggestions] = useState<Array<{ type: 'take_time_off' | 'work_extra'; hours: number; description: string }>>([]);
  const unsubscribeRef = useRef<Array<() => void>>([]);

  const { user } = useAuth();
  const subjectUserId = useMemo(() => records[0]?.userId || user?.uid || '', [records, user?.uid]);

  useEffect(() => {
    if (!user) {
      setRecords([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    unsubscribeRef.current.forEach((unsubscribe) => unsubscribe());
    unsubscribeRef.current = [];

    const buckets = new Map<string, Array<{ id: string; data: any }>>();

    const publish = () => {
      const documents = Array.from(buckets.values()).flat();
      const unique = new Map<string, { id: string; data: any }>();
      documents.forEach((document) => {
        if (!unique.has(document.id)) {
          unique.set(document.id, document);
        }
      });
      setRecords(groupPointDocuments(Array.from(unique.values()), user.uid));
      setIsLoading(false);
    };

    RECORD_OWNER_FIELDS.forEach((field) => {
      const bucketKey = `timeRecords:${field}`;
      const q = query(collection(db, 'timeRecords'), where(field, '==', user.uid));
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          buckets.set(bucketKey, snapshot.docs.map((document) => ({
            id: document.id,
            data: document.data()
          })));
          publish();
        },
        (err) => {
          console.warn(`Nao foi possivel escutar banco de horas por ${field}:`, err);
          buckets.set(bucketKey, []);
          publish();
        }
      );

      unsubscribeRef.current.push(unsubscribe);
    });

    return () => {
      unsubscribeRef.current.forEach((unsubscribe) => unsubscribe());
      unsubscribeRef.current = [];
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setSchedule(null);
      return;
    }

    let cancelled = false;

    const loadSchedule = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'employee_schedules'));
        const scheduleDoc = snapshot.docs.find((document) => {
          const data = document.data();
          return data.employeeId === subjectUserId || data.employeeId === user.uid || data.userId === user.uid;
        });

        if (cancelled) return;

        if (scheduleDoc) {
          setSchedule(scheduleFromEmployeeSchedule(scheduleDoc.data(), subjectUserId || user.uid));
        } else {
          setSchedule({ ...DEFAULT_SCHEDULE, userId: subjectUserId || user.uid });
        }
      } catch (err) {
        console.error('Erro ao carregar horario para banco de horas:', err);
        if (!cancelled) {
          setSchedule({ ...DEFAULT_SCHEDULE, userId: subjectUserId || user.uid });
        }
      }
    };

    loadSchedule();

    return () => {
      cancelled = true;
    };
  }, [user, subjectUserId]);

  useEffect(() => {
    setRules(DEFAULT_RULES);
  }, []);

  useEffect(() => {
    if (!user || !schedule) {
      setBalance(null);
      setIsLoading(false);
      return;
    }

    try {
      const updatedRecords = records.map((record) => ({
        ...record,
        calculatedHours: calculateDailyHours([...record.entries], schedule, record.date)
      }));

      const newBalance = calculateTimeBankBalance(updatedRecords, transactions, schedule.userId || subjectUserId || user.uid);
      setBalance(newBalance);

      if (rules) {
        setAlerts(generateTimeBankAlerts(newBalance, rules));
        setSuggestions(suggestCompensation(newBalance, schedule));
      }

      setIsLoading(false);
      setError(null);
    } catch (err) {
      console.error('Erro ao calcular banco de horas:', err);
      setError('Erro ao calcular banco de horas com os registros reais.');
      setIsLoading(false);
    }
  }, [user, records, transactions, schedule, rules, subjectUserId]);

  const refreshBalance = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    await new Promise((resolve) => setTimeout(resolve, 250));
    setIsLoading(false);
  }, []);

  const requestCompensation = useCallback(async (): Promise<boolean> => {
    setError('Solicitação de compensação ainda precisa de fluxo backend/regras antes de gravar em produção.');
    return false;
  }, []);

  const approveRecord = useCallback(async (recordId: string): Promise<boolean> => {
    if (!user) {
      setError('Usuário não autenticado');
      return false;
    }

    try {
      await updateDoc(doc(db, 'timeRecords', recordId), {
        approved: true,
        status: 'aprovado',
        reviewStatus: 'approved',
        approvedBy: user.uid,
        approvedAt: new Date()
      });
      return true;
    } catch (err) {
      console.error('Erro ao aprovar registro:', err);
      setError('Erro ao aprovar registro');
      return false;
    }
  }, [user]);

  const updateSchedule = useCallback(async (newSchedule: Partial<WorkSchedule>): Promise<boolean> => {
    if (!user || !schedule) {
      setError('Configuração não disponível');
      return false;
    }

    try {
      const snapshot = await getDocs(collection(db, 'employee_schedules'));
      const scheduleDoc = snapshot.docs.find((document) => {
        const data = document.data();
        return data.employeeId === schedule.userId || data.employeeId === user.uid || data.userId === user.uid;
      });

      if (!scheduleDoc) {
        setError('Crie a escala do funcionário em Horários antes de ajustar o banco de horas.');
        return false;
      }

      await updateDoc(scheduleDoc.ref, {
        ...newSchedule,
        updatedAt: new Date()
      });
      return true;
    } catch (err) {
      console.error('Erro ao atualizar configuração:', err);
      setError('Erro ao atualizar configuração');
      return false;
    }
  }, [user, schedule]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    balance,
    records,
    transactions,
    schedule,
    rules,
    isLoading,
    error,
    refreshBalance,
    requestCompensation,
    approveRecord,
    updateSchedule,
    alerts,
    suggestions,
    clearError
  };
}

export function useTimeBankBalance() {
  const { balance, isLoading, error } = useTimeBank();

  return {
    balance: balance?.currentBalance || 0,
    monthlyBalance: balance?.monthlyBalance || 0,
    formatted: balance ? `${balance.currentBalance >= 0 ? '+' : ''}${balance.currentBalance.toFixed(1)}h` : '0h',
    isLoading,
    error
  };
}
