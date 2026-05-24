'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, query, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './useAuth';
import { EmployeeSchedule, PointAnalysis, HolidayConfig, ScheduleUtils } from '@/lib/scheduling';

interface UseScheduleManagerReturn {
  // Schedules
  schedules: EmployeeSchedule[];
  isLoadingSchedules: boolean;
  createSchedule: (schedule: Omit<EmployeeSchedule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => Promise<void>;
  updateSchedule: (id: string, schedule: Partial<EmployeeSchedule>) => Promise<void>;
  deleteSchedule: (id: string) => Promise<void>;
  getEmployeeSchedule: (employeeId: string) => EmployeeSchedule | null;

  // Point Analysis
  pendingAnalysis: PointAnalysis[];
  isLoadingAnalysis: boolean;
  createAnalysis: (analysis: Omit<PointAnalysis, 'id' | 'createdAt'>) => Promise<void>;
  updateAnalysisStatus: (id: string, status: PointAnalysis['status'], notes?: string) => Promise<void>;
  getEmployeeAnalysis: (employeeId: string) => PointAnalysis[];

  // Holidays
  holidays: HolidayConfig[];
  isLoadingHolidays: boolean;
  createHoliday: (holiday: Omit<HolidayConfig, 'id' | 'createdBy' | 'createdAt'>) => Promise<void>;
  updateHoliday: (id: string, holiday: Partial<HolidayConfig>) => Promise<void>;
  deleteHoliday: (id: string) => Promise<void>;

  // Utilities
  analyzePointRecord: (employeeId: string, pointType: 'entrada' | 'saida' | 'pausa_inicio' | 'pausa_fim', actualTime: string, date: Date) => Promise<PointAnalysis | null>;
  
  error: string | null;
  clearError: () => void;
}

export function useScheduleManager(): UseScheduleManagerReturn {
  const { user } = useAuth();
  
  // States
  const [schedules, setSchedules] = useState<EmployeeSchedule[]>([]);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(true);
  
  const [pendingAnalysis, setPendingAnalysis] = useState<PointAnalysis[]>([]);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(true);
  
  const [holidays, setHolidays] = useState<HolidayConfig[]>([]);
  const [isLoadingHolidays, setIsLoadingHolidays] = useState(true);
  
  const [error, setError] = useState<string | null>(null);

  // Load schedules
  useEffect(() => {
    if (!user) {
      setIsLoadingSchedules(false);
      return;
    }

    const q = query(collection(db, 'employee_schedules'), orderBy('employeeName'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedSchedules: EmployeeSchedule[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as EmployeeSchedule));
      setSchedules(fetchedSchedules);
      setIsLoadingSchedules(false);
    }, (err) => {
      console.error('Erro ao carregar horários:', err);
      setError('Falha ao carregar horários dos funcionários.');
      setIsLoadingSchedules(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Load pending analysis - CORRIGIDO: Query simplificada para evitar erro de índice
  useEffect(() => {
    if (!user) {
      setIsLoadingAnalysis(false);
      return;
    }

    // ✅ CORREÇÃO: Usando apenas where sem orderBy para evitar erro de índice composto
    const q = query(
      collection(db, 'point_analysis'), 
      where('status', '==', 'pending')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedAnalysis: PointAnalysis[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as PointAnalysis));
      
      // ✅ CORREÇÃO: Ordenação manual no frontend após fetch
      const sortedAnalysis = fetchedAnalysis.sort((a, b) => {
        // Ordena por createdAt descrescente (mais recente primeiro)
        const aDate = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const bDate = b.createdAt ? new Date(b.createdAt) : new Date(0);
        return bDate.getTime() - aDate.getTime();
      });
      
      setPendingAnalysis(sortedAnalysis);
      setIsLoadingAnalysis(false);
    }, (err) => {
      console.error('❌ Erro ao carregar análises pendentes:', err);
      setError('Falha ao carregar análises pendentes.');
      setIsLoadingAnalysis(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Load holidays
  useEffect(() => {
    if (!user) {
      setIsLoadingHolidays(false);
      return;
    }

    const q = query(collection(db, 'holidays'), orderBy('date'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedHolidays: HolidayConfig[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as HolidayConfig));
      setHolidays(fetchedHolidays);
      setIsLoadingHolidays(false);
    }, (err) => {
      console.error('Erro ao carregar feriados:', err);
      setError('Falha ao carregar feriados.');
      setIsLoadingHolidays(false);
    });

    return () => unsubscribe();
  }, [user]);

  const clearError = useCallback(() => setError(null), []);

  // Schedule management
  const createSchedule = useCallback(async (scheduleData: Omit<EmployeeSchedule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => {
    if (!user) {
      setError('Usuário não autenticado.');
      return;
    }
    
    try {
      await addDoc(collection(db, 'employee_schedules'), {
        ...scheduleData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user.uid,
      });
      clearError();
    } catch (e: any) {
      console.error('Erro ao criar horário:', e);
      setError(e.message || 'Falha ao criar horário.');
    }
  }, [user, clearError]);

  const updateSchedule = useCallback(async (id: string, scheduleData: Partial<EmployeeSchedule>) => {
    if (!user) {
      setError('Usuário não autenticado.');
      return;
    }
    
    try {
      const scheduleRef = doc(db, 'employee_schedules', id);
      await updateDoc(scheduleRef, {
        ...scheduleData,
        updatedAt: serverTimestamp(),
      });
      clearError();
    } catch (e: any) {
      console.error('Erro ao atualizar horário:', e);
      setError(e.message || 'Falha ao atualizar horário.');
    }
  }, [user, clearError]);

  const deleteSchedule = useCallback(async (id: string) => {
    if (!user) {
      setError('Usuário não autenticado.');
      return;
    }
    
    try {
      await deleteDoc(doc(db, 'employee_schedules', id));
      clearError();
    } catch (e: any) {
      console.error('Erro ao deletar horário:', e);
      setError(e.message || 'Falha ao deletar horário.');
    }
  }, [user, clearError]);

  const getEmployeeSchedule = useCallback((employeeId: string): EmployeeSchedule | null => {
    return schedules.find(s => s.employeeId === employeeId) || null;
  }, [schedules]);

  // Analysis management
  const createAnalysis = useCallback(async (analysisData: Omit<PointAnalysis, 'id' | 'createdAt'>) => {
    if (!user) {
      setError('Usuário não autenticado.');
      return;
    }
    
    try {
      await addDoc(collection(db, 'point_analysis'), {
        ...analysisData,
        createdAt: serverTimestamp(),
      });
      clearError();
    } catch (e: any) {
      console.error('Erro ao criar análise:', e);
      setError(e.message || 'Falha ao criar análise.');
    }
  }, [user, clearError]);

  const updateAnalysisStatus = useCallback(async (id: string, status: PointAnalysis['status'], notes?: string) => {
    if (!user) {
      setError('Usuário não autenticado.');
      return;
    }
    
    try {
      const analysisRef = doc(db, 'point_analysis', id);
      await updateDoc(analysisRef, {
        status,
        hrNotes: notes,
        analyzedBy: user.uid,
        analyzedAt: serverTimestamp(),
      });
      clearError();
    } catch (e: any) {
      console.error('Erro ao atualizar análise:', e);
      setError(e.message || 'Falha ao atualizar análise.');
    }
  }, [user, clearError]);

  const getEmployeeAnalysis = useCallback((employeeId: string): PointAnalysis[] => {
    return pendingAnalysis.filter(a => a.employeeId === employeeId);
  }, [pendingAnalysis]);

  // Holiday management
  const createHoliday = useCallback(async (holidayData: Omit<HolidayConfig, 'id' | 'createdBy' | 'createdAt'>) => {
    if (!user) {
      setError('Usuário não autenticado.');
      return;
    }
    
    try {
      await addDoc(collection(db, 'holidays'), {
        ...holidayData,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });
      clearError();
    } catch (e: any) {
      console.error('Erro ao criar feriado:', e);
      setError(e.message || 'Falha ao criar feriado.');
    }
  }, [user, clearError]);

  const updateHoliday = useCallback(async (id: string, holidayData: Partial<HolidayConfig>) => {
    if (!user) {
      setError('Usuário não autenticado.');
      return;
    }
    
    try {
      const holidayRef = doc(db, 'holidays', id);
      await updateDoc(holidayRef, holidayData);
      clearError();
    } catch (e: any) {
      console.error('Erro ao atualizar feriado:', e);
      setError(e.message || 'Falha ao atualizar feriado.');
    }
  }, [user, clearError]);

  const deleteHoliday = useCallback(async (id: string) => {
    if (!user) {
      setError('Usuário não autenticado.');
      return;
    }
    
    try {
      await deleteDoc(doc(db, 'holidays', id));
      clearError();
    } catch (e: any) {
      console.error('Erro ao deletar feriado:', e);
      setError(e.message || 'Falha ao deletar feriado.');
    }
  }, [user, clearError]);

  // Utility: Analyze point record
  const analyzePointRecord = useCallback(async (
    employeeId: string, 
    pointType: 'entrada' | 'saida' | 'pausa_inicio' | 'pausa_fim', 
    actualTime: string, 
    date: Date
  ): Promise<PointAnalysis | null> => {
    const schedule = getEmployeeSchedule(employeeId);
    if (!schedule) {
      console.warn(`Horário não encontrado para funcionário ${employeeId}`);
      return null;
    }

    const dateString = date.toISOString().split('T')[0];
    
    // Verificar se é feriado
    if (ScheduleUtils.isHoliday(dateString, holidays.filter(h => h.active).map(h => h.date))) {
      console.log('Data é feriado, não criando análise');
      return null;
    }

    // Verificar se está de férias
    if (ScheduleUtils.isOnVacation(dateString, schedule.vacations)) {
      console.log('Funcionário está de férias, não criando análise');
      return null;
    }

    // Verificar se está de atestado
    if (ScheduleUtils.isOnMedicalLeave(dateString, schedule.medicalLeave)) {
      console.log('Funcionário está de atestado, não criando análise');
      return null;
    }

    const expectedTime = ScheduleUtils.getExpectedTime(schedule, date, pointType);
    if (!expectedTime) {
      console.log('Horário esperado não encontrado para este dia/tipo');
      return null;
    }

    const dayOfWeek = date.getDay();
    const daySchedule = schedule.weekSchedule.find(d => d.dayOfWeek === dayOfWeek);
    if (!daySchedule) {
      console.warn('Configuração do dia não encontrada');
      return null;
    }

    let toleranceMinutes = 0;
    switch (pointType) {
      case 'entrada':
        toleranceMinutes = daySchedule.tolerance.entryMinutes;
        break;
      case 'saida':
        toleranceMinutes = daySchedule.tolerance.exitMinutes;
        break;
      case 'pausa_inicio':
      case 'pausa_fim':
        toleranceMinutes = daySchedule.tolerance.breakMinutes;
        break;
    }

    const isWithinTolerance = ScheduleUtils.isWithinTolerance(
      expectedTime,
      actualTime,
      toleranceMinutes,
      pointType === 'entrada' ? 'entry' : 'exit'
    );

    if (isWithinTolerance) {
      console.log('Dentro da tolerância, não criando análise');
      return null;
    }

    // Fora da tolerância, criar análise
    const delayMinutes = ScheduleUtils.timeDifference(expectedTime, actualTime);
    
    const analysis: Omit<PointAnalysis, 'id' | 'createdAt'> = {
      employeeId,
      employeeName: schedule.employeeName,
      pointRecordId: '', // Será preenchido depois
      date: dateString,
      type: pointType,
      scheduledTime: expectedTime,
      actualTime,
      toleranceMinutes,
      delayMinutes,
      status: 'pending'
    };

    console.log('Criando análise para ponto fora da tolerância:', analysis);
    await createAnalysis(analysis);
    
    return analysis as PointAnalysis;
  }, [getEmployeeSchedule, holidays, createAnalysis]);

  return {
    // Schedules
    schedules,
    isLoadingSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    getEmployeeSchedule,

    // Point Analysis
    pendingAnalysis,
    isLoadingAnalysis,
    createAnalysis,
    updateAnalysisStatus,
    getEmployeeAnalysis,

    // Holidays
    holidays,
    isLoadingHolidays,
    createHoliday,
    updateHoliday,
    deleteHoliday,

    // Utilities
    analyzePointRecord,

    error,
    clearError,
  };
}
