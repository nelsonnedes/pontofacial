'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs,
  addDoc,
  updateDoc,
  doc,
  onSnapshot 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import {
  TimeRecord,
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
  // Estado
  balance: TimeBankBalance | null;
  records: TimeRecord[];
  transactions: TimeBankTransaction[];
  schedule: WorkSchedule | null;
  rules: CompensationRule | null;
  isLoading: boolean;
  error: string | null;
  
  // Funções
  refreshBalance: () => Promise<void>;
  requestCompensation: (hours: number, description: string) => Promise<boolean>;
  approveRecord: (recordId: string) => Promise<boolean>;
  updateSchedule: (newSchedule: Partial<WorkSchedule>) => Promise<boolean>;
  
  // Utilitários
  alerts: Array<{ type: 'warning' | 'error' | 'info'; message: string }>;
  suggestions: Array<{ type: 'take_time_off' | 'work_extra'; hours: number; description: string }>;
  clearError: () => void;
}

// Configuração padrão de horário de trabalho
const DEFAULT_SCHEDULE: WorkSchedule = {
  userId: '',
  weeklyHours: 40,
  dailyHours: 8,
  workDays: [1, 2, 3, 4, 5], // Segunda a sexta
  startTime: '08:00',
  endTime: '17:00',
  lunchBreakMinutes: 60,
  nightShiftStart: '22:00',
  nightShiftEnd: '06:00',
  overtimeMultiplier: 1.5,
  weekendMultiplier: 2.0,
  holidayMultiplier: 2.0
};

// Regras padrão de compensação
const DEFAULT_RULES: CompensationRule = {
  id: 'default',
  name: 'Regras Padrão CLT',
  maxDailyOvertime: 2,     // 2h extras por dia
  maxMonthlyOvertime: 40,  // 40h extras por mês
  maxBankBalance: 80,      // 80h máximo no banco
  minBankBalance: -40,     // 40h de déficit máximo
  compensationPeriod: 30,  // 30 dias para compensar
  autoApproval: false,     // Não aprovar automaticamente
  alertThreshold: 20       // Alertar com 20h
};

export function useTimeBank(): UseTimeBankReturn {
  const [balance, setBalance] = useState<TimeBankBalance | null>(null);
  const [records, setRecords] = useState<TimeRecord[]>([]);
  const [transactions, setTransactions] = useState<TimeBankTransaction[]>([]);
  const [schedule, setSchedule] = useState<WorkSchedule | null>(null);
  const [rules, setRules] = useState<CompensationRule | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Array<{ type: 'warning' | 'error' | 'info'; message: string }>>([]);
  const [suggestions, setSuggestions] = useState<Array<{ type: 'take_time_off' | 'work_extra'; hours: number; description: string }>>([]);

  const { user } = useAuth();

  // Coleções do Firebase
  const timeRecordsCollection = collection(db, 'time_records');
  const transactionsCollection = collection(db, 'time_bank_transactions');
  const schedulesCollection = collection(db, 'work_schedules');

  // Carregar registros de ponto do usuário
  useEffect(() => {
    if (!user) {
      setRecords([]);
      return;
    }

    const q = query(
      timeRecordsCollection,
      where('userId', '==', user.uid),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const recordsData: TimeRecord[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        recordsData.push({
          id: doc.id,
          ...data,
          date: data.date.toDate ? data.date.toDate() : new Date(data.date)
        } as TimeRecord);
      });

      console.log(`✅ ${recordsData.length} registros de ponto carregados`);
      setRecords(recordsData);
    });

    return () => unsubscribe();
  }, [user]);

  // Carregar transações do banco de horas
  useEffect(() => {
    if (!user) {
      setTransactions([]);
      return;
    }

    const q = query(
      transactionsCollection,
      where('userId', '==', user.uid),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const transactionsData: TimeBankTransaction[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        transactionsData.push({
          id: doc.id,
          ...data,
          date: data.date.toDate ? data.date.toDate() : new Date(data.date),
          createdAt: data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)
        } as TimeBankTransaction);
      });

      console.log(`✅ ${transactionsData.length} transações carregadas`);
      setTransactions(transactionsData);
    });

    return () => unsubscribe();
  }, [user]);

  // Carregar configuração de horário
  useEffect(() => {
    if (!user) {
      setSchedule(null);
      return;
    }

    const loadSchedule = async () => {
      try {
        const q = query(schedulesCollection, where('userId', '==', user.uid));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          const scheduleData = snapshot.docs[0].data() as WorkSchedule;
          setSchedule(scheduleData);
          console.log('✅ Configuração de horário carregada');
        } else {
          // Criar configuração padrão
          const defaultSchedule = { ...DEFAULT_SCHEDULE, userId: user.uid };
          await addDoc(schedulesCollection, defaultSchedule);
          setSchedule(defaultSchedule);
          console.log('✅ Configuração padrão criada');
        }
      } catch (err) {
        console.error('❌ Erro ao carregar configuração:', err);
      }
    };

    loadSchedule();
  }, [user]);

  // Inicializar regras padrão
  useEffect(() => {
    setRules(DEFAULT_RULES);
  }, []);

  // Recalcular saldo quando dados mudarem
  useEffect(() => {
    if (!user || !schedule) {
      setBalance(null);
      setIsLoading(false);
      return;
    }

    try {
      // Calcular horas para cada registro
      const updatedRecords = records.map(record => ({
        ...record,
        calculatedHours: calculateDailyHours(record.entries, schedule, record.date)
      }));

      // Calcular saldo do banco de horas
      const newBalance = calculateTimeBankBalance(updatedRecords, transactions, user.uid);
      setBalance(newBalance);

      // Gerar alertas
      if (rules) {
        const newAlerts = generateTimeBankAlerts(newBalance, rules);
        setAlerts(newAlerts);

        // Gerar sugestões
        const newSuggestions = suggestCompensation(newBalance, schedule);
        setSuggestions(newSuggestions);
      }

      console.log('✅ Saldo de banco de horas calculado:', newBalance);
      setIsLoading(false);
      setError(null);

    } catch (err) {
      console.error('❌ Erro ao calcular saldo:', err);
      setError('Erro ao calcular banco de horas');
      setIsLoading(false);
    }
  }, [user, records, transactions, schedule, rules]);

  // Recarregar saldo
  const refreshBalance = useCallback(async (): Promise<void> => {
    if (!user || !schedule) return;

    setIsLoading(true);
    setError(null);

    try {
      // Os dados são atualizados automaticamente via listeners
      // Esta função é mais para forçar um recálculo se necessário
      console.log('🔄 Atualizando saldo do banco de horas...');
      
      // Aguardar um momento para os listeners atualizarem
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (err) {
      console.error('❌ Erro ao atualizar saldo:', err);
      setError('Erro ao atualizar banco de horas');
    } finally {
      setIsLoading(false);
    }
  }, [user, schedule]);

  // Solicitar compensação de horas
  const requestCompensation = useCallback(async (
    hours: number,
    description: string
  ): Promise<boolean> => {
    if (!user) {
      setError('Usuário não autenticado');
      return false;
    }

    try {
      const transaction: Omit<TimeBankTransaction, 'id'> = {
        userId: user.uid,
        date: new Date(),
        type: hours > 0 ? 'credit' : 'debit',
        hours: Math.abs(hours),
        description,
        approved: rules?.autoApproval || false,
        createdAt: new Date()
      };

      await addDoc(transactionsCollection, transaction);
      console.log('✅ Solicitação de compensação criada');
      return true;

    } catch (err) {
      console.error('❌ Erro ao solicitar compensação:', err);
      setError('Erro ao solicitar compensação');
      return false;
    }
  }, [user, rules]);

  // Aprovar registro de ponto (admin)
  const approveRecord = useCallback(async (recordId: string): Promise<boolean> => {
    if (!user) {
      setError('Usuário não autenticado');
      return false;
    }

    try {
      await updateDoc(doc(db, 'time_records', recordId), {
        approved: true,
        approvedBy: user.uid,
        approvedAt: new Date()
      });

      console.log('✅ Registro aprovado:', recordId);
      return true;

    } catch (err) {
      console.error('❌ Erro ao aprovar registro:', err);
      setError('Erro ao aprovar registro');
      return false;
    }
  }, [user]);

  // Atualizar configuração de horário
  const updateSchedule = useCallback(async (
    newSchedule: Partial<WorkSchedule>
  ): Promise<boolean> => {
    if (!user || !schedule) {
      setError('Configuração não disponível');
      return false;
    }

    try {
      const q = query(schedulesCollection, where('userId', '==', user.uid));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const docRef = snapshot.docs[0].ref;
        await updateDoc(docRef, newSchedule);
      }

      console.log('✅ Configuração de horário atualizada');
      return true;

    } catch (err) {
      console.error('❌ Erro ao atualizar configuração:', err);
      setError('Erro ao atualizar configuração');
      return false;
    }
  }, [user, schedule]);

  // Limpar erro
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // Estado
    balance,
    records,
    transactions,
    schedule,
    rules,
    isLoading,
    error,
    
    // Funções
    refreshBalance,
    requestCompensation,
    approveRecord,
    updateSchedule,
    
    // Utilitários
    alerts,
    suggestions,
    clearError
  };
}

// Hook simplificado para apenas visualizar saldo
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
