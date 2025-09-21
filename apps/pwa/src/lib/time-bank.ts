'use client';

// Sistema de Banco de Horas - Inspirado no Ponto Web Secullum
// Cálculo automático de horas extras, débitos e compensações

export interface TimeRecord {
  id: string;
  userId: string;
  date: Date;
  entries: TimeEntry[];
  calculatedHours: {
    regular: number;        // Horas normais trabalhadas
    overtime: number;       // Horas extras
    deficit: number;        // Déficit de horas
    nightShift: number;     // Adicional noturno
    weekendHours: number;   // Horas em fim de semana
    holidayHours: number;   // Horas em feriado
  };
  approved: boolean;
  approvedBy?: string;
  approvedAt?: Date;
}

export interface TimeEntry {
  time: string;           // "08:00"
  type: 'entry' | 'exit' | 'break_start' | 'break_end';
  method: 'facial' | 'photo' | 'manual';
  location?: {
    latitude: number;
    longitude: number;
  };
}

export interface WorkSchedule {
  userId: string;
  weeklyHours: number;        // Horas semanais (ex: 40)
  dailyHours: number;         // Horas diárias (ex: 8)
  workDays: number[];         // Dias da semana [1,2,3,4,5]
  startTime: string;          // "08:00"
  endTime: string;            // "17:00"
  lunchBreakMinutes: number;  // 60
  nightShiftStart: string;    // "22:00"
  nightShiftEnd: string;      // "06:00"
  overtimeMultiplier: number; // 1.5 (150%)
  weekendMultiplier: number;  // 2.0 (200%)
  holidayMultiplier: number;  // 2.0 (200%)
}

export interface TimeBankBalance {
  userId: string;
  currentBalance: number;     // Saldo atual em horas
  monthlyBalance: number;     // Saldo do mês
  yearlyBalance: number;      // Saldo do ano
  totalCredits: number;       // Total de créditos
  totalDebits: number;        // Total de débitos
  lastCalculated: Date;
  breakdown: {
    overtime: number;         // Horas extras acumuladas
    compensated: number;      // Horas compensadas
    deficit: number;          // Déficit acumulado
    pending: number;          // Horas pendentes de aprovação
  };
}

export interface TimeBankTransaction {
  id: string;
  userId: string;
  date: Date;
  type: 'credit' | 'debit' | 'compensation' | 'adjustment';
  hours: number;
  description: string;
  reference?: string;        // ID do registro de ponto
  approvedBy?: string;
  approved: boolean;
  createdAt: Date;
}

export interface CompensationRule {
  id: string;
  name: string;
  maxDailyOvertime: number;   // Máximo de horas extras por dia
  maxMonthlyOvertime: number; // Máximo de horas extras por mês
  maxBankBalance: number;     // Saldo máximo no banco
  minBankBalance: number;     // Saldo mínimo (negativo)
  compensationPeriod: number; // Período para compensação (dias)
  autoApproval: boolean;      // Aprovação automática
  alertThreshold: number;     // Limite para alertas
}

// Feriados nacionais (configurável)
export const NATIONAL_HOLIDAYS = [
  '01-01', // Ano Novo
  '04-21', // Tiradentes
  '05-01', // Dia do Trabalhador
  '09-07', // Independência do Brasil
  '10-12', // Nossa Senhora Aparecida
  '11-02', // Finados
  '11-15', // Proclamação da República
  '12-25'  // Natal
];

/**
 * Converte tempo em string para minutos
 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Converte minutos para string de tempo
 */
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(Math.abs(minutes) / 60);
  const mins = Math.abs(minutes) % 60;
  const sign = minutes < 0 ? '-' : '';
  return `${sign}${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Converte minutos para horas decimais
 */
export function minutesToHours(minutes: number): number {
  return minutes / 60;
}

/**
 * Verifica se uma data é feriado
 */
export function isHoliday(date: Date, customHolidays: string[] = []): boolean {
  const monthDay = `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  return NATIONAL_HOLIDAYS.includes(monthDay) || customHolidays.includes(monthDay);
}

/**
 * Verifica se uma hora está no turno noturno
 */
export function isNightShift(time: string, nightStart: string, nightEnd: string): boolean {
  const timeMinutes = timeToMinutes(time);
  const startMinutes = timeToMinutes(nightStart);
  const endMinutes = timeToMinutes(nightEnd);
  
  // Se o turno noturno cruza a meia-noite
  if (startMinutes > endMinutes) {
    return timeMinutes >= startMinutes || timeMinutes <= endMinutes;
  } else {
    return timeMinutes >= startMinutes && timeMinutes <= endMinutes;
  }
}

/**
 * Calcula o tempo trabalhado em um dia
 */
export function calculateDailyHours(
  entries: TimeEntry[],
  schedule: WorkSchedule,
  date: Date
): TimeRecord['calculatedHours'] {
  const result = {
    regular: 0,
    overtime: 0,
    deficit: 0,
    nightShift: 0,
    weekendHours: 0,
    holidayHours: 0
  };

  if (entries.length < 2) {
    // Dia incompleto - calcular déficit
    const isWorkDay = schedule.workDays.includes(date.getDay());
    if (isWorkDay) {
      result.deficit = schedule.dailyHours;
    }
    return result;
  }

  // Ordenar entradas por horário
  const sortedEntries = entries.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  
  let totalMinutes = 0;
  let nightMinutes = 0;
  let currentEntry: TimeEntry | null = null;

  for (const entry of sortedEntries) {
    if (entry.type === 'entry' || entry.type === 'break_end') {
      currentEntry = entry;
    } else if (entry.type === 'exit' || entry.type === 'break_start') {
      if (currentEntry) {
        const startMinutes = timeToMinutes(currentEntry.time);
        const endMinutes = timeToMinutes(entry.time);
        const segmentMinutes = endMinutes - startMinutes;
        
        if (segmentMinutes > 0) {
          totalMinutes += segmentMinutes;
          
          // Calcular horas noturnas neste segmento
          for (let i = 0; i < segmentMinutes; i++) {
            const checkTime = minutesToTime(startMinutes + i);
            if (isNightShift(checkTime, schedule.nightShiftStart, schedule.nightShiftEnd)) {
              nightMinutes++;
            }
          }
        }
        currentEntry = null;
      }
    }
  }

  const totalHours = minutesToHours(totalMinutes);
  result.nightShift = minutesToHours(nightMinutes);

  const dayOfWeek = date.getDay();
  const isWorkDay = schedule.workDays.includes(dayOfWeek);
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isHol = isHoliday(date);

  if (isHol) {
    result.holidayHours = totalHours;
  } else if (isWeekend) {
    result.weekendHours = totalHours;
  } else if (isWorkDay) {
    if (totalHours <= schedule.dailyHours) {
      result.regular = totalHours;
      if (totalHours < schedule.dailyHours) {
        result.deficit = schedule.dailyHours - totalHours;
      }
    } else {
      result.regular = schedule.dailyHours;
      result.overtime = totalHours - schedule.dailyHours;
    }
  } else {
    // Dia não previsto na escala
    result.overtime = totalHours;
  }

  return result;
}

/**
 * Calcula o saldo do banco de horas
 */
export function calculateTimeBankBalance(
  records: TimeRecord[],
  transactions: TimeBankTransaction[],
  userId: string
): TimeBankBalance {
  let totalCredits = 0;
  let totalDebits = 0;
  let overtime = 0;
  let compensated = 0;
  let deficit = 0;
  let pending = 0;

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  let monthlyCredits = 0;
  let monthlyDebits = 0;

  // Processar registros de ponto
  for (const record of records.filter(r => r.userId === userId)) {
    const recordDate = new Date(record.date);
    const isCurrentMonth = recordDate.getMonth() === currentMonth && recordDate.getFullYear() === currentYear;
    
    if (record.approved) {
      if (record.calculatedHours.overtime > 0) {
        const credit = record.calculatedHours.overtime;
        totalCredits += credit;
        overtime += credit;
        
        if (isCurrentMonth) {
          monthlyCredits += credit;
        }
      }
      
      if (record.calculatedHours.deficit > 0) {
        const debit = record.calculatedHours.deficit;
        totalDebits += debit;
        deficit += debit;
        
        if (isCurrentMonth) {
          monthlyDebits += debit;
        }
      }
    } else {
      // Horas pendentes de aprovação
      pending += record.calculatedHours.overtime - record.calculatedHours.deficit;
    }
  }

  // Processar transações do banco de horas
  for (const transaction of transactions.filter(t => t.userId === userId && t.approved)) {
    const transactionDate = new Date(transaction.date);
    const isCurrentMonth = transactionDate.getMonth() === currentMonth && transactionDate.getFullYear() === currentYear;
    
    if (transaction.type === 'credit') {
      totalCredits += transaction.hours;
      if (isCurrentMonth) monthlyCredits += transaction.hours;
    } else if (transaction.type === 'debit') {
      totalDebits += transaction.hours;
      if (isCurrentMonth) monthlyDebits += transaction.hours;
    } else if (transaction.type === 'compensation') {
      compensated += Math.abs(transaction.hours);
    }
  }

  const currentBalance = totalCredits - totalDebits;
  const monthlyBalance = monthlyCredits - monthlyDebits;

  return {
    userId,
    currentBalance,
    monthlyBalance,
    yearlyBalance: currentBalance, // Simplificado - mesmo que atual
    totalCredits,
    totalDebits,
    lastCalculated: now,
    breakdown: {
      overtime,
      compensated,
      deficit,
      pending
    }
  };
}

/**
 * Gera alertas baseado no saldo do banco de horas
 */
export function generateTimeBankAlerts(
  balance: TimeBankBalance,
  rules: CompensationRule
): Array<{ type: 'warning' | 'error' | 'info'; message: string }> {
  const alerts = [];

  // Alerta para saldo máximo
  if (balance.currentBalance > rules.maxBankBalance) {
    alerts.push({
      type: 'warning' as const,
      message: `Saldo de ${balance.currentBalance.toFixed(2)}h excede o limite máximo de ${rules.maxBankBalance}h. Considere compensar as horas.`
    });
  }

  // Alerta para saldo mínimo
  if (balance.currentBalance < rules.minBankBalance) {
    alerts.push({
      type: 'error' as const,
      message: `Déficit de ${Math.abs(balance.currentBalance).toFixed(2)}h excede o limite de ${Math.abs(rules.minBankBalance)}h. Ação necessária.`
    });
  }

  // Alerta de threshold
  if (Math.abs(balance.currentBalance) > rules.alertThreshold) {
    alerts.push({
      type: 'warning' as const,
      message: `Saldo de ${balance.currentBalance.toFixed(2)}h próximo ao limite. Monitore regularmente.`
    });
  }

  // Horas pendentes
  if (balance.breakdown.pending > 0) {
    alerts.push({
      type: 'info' as const,
      message: `${balance.breakdown.pending.toFixed(2)}h pendentes de aprovação.`
    });
  }

  return alerts;
}

/**
 * Sugere compensações baseado no saldo
 */
export function suggestCompensation(
  balance: TimeBankBalance,
  schedule: WorkSchedule
): Array<{ type: 'take_time_off' | 'work_extra'; hours: number; description: string }> {
  const suggestions = [];

  if (balance.currentBalance > 8) {
    // Sugerir folga
    const suggestedDays = Math.floor(balance.currentBalance / schedule.dailyHours);
    suggestions.push({
      type: 'take_time_off' as const,
      hours: suggestedDays * schedule.dailyHours,
      description: `Considere tirar ${suggestedDays} dia(s) de folga para compensar ${(suggestedDays * schedule.dailyHours).toFixed(1)}h`
    });
  } else if (balance.currentBalance < -4) {
    // Sugerir trabalho extra
    const neededHours = Math.abs(balance.currentBalance);
    suggestions.push({
      type: 'work_extra' as const,
      hours: neededHours,
      description: `Trabalhe ${neededHours.toFixed(1)}h extras para equilibrar o déficit`
    });
  }

  return suggestions;
}

/**
 * Formatar saldo de horas para exibição
 */
export function formatHoursBalance(hours: number): string {
  const absHours = Math.abs(hours);
  const sign = hours >= 0 ? '+' : '-';
  const hoursInt = Math.floor(absHours);
  const minutes = Math.round((absHours - hoursInt) * 60);
  
  return `${sign}${hoursInt}h ${minutes.toString().padStart(2, '0')}m`;
}

/**
 * Validar registro de ponto
 */
export function validateTimeRecord(record: TimeRecord, schedule: WorkSchedule): Array<string> {
  const errors = [];

  if (record.entries.length === 0) {
    errors.push('Nenhuma marcação encontrada');
    return errors;
  }

  const entries = record.entries.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  
  // Verificar sequência lógica
  let expectedType: TimeEntry['type'] = 'entry';
  for (const entry of entries) {
    if (entry.type !== expectedType) {
      errors.push(`Sequência incorreta: esperado ${expectedType}, encontrado ${entry.type} às ${entry.time}`);
    }
    
    // Próximo tipo esperado
    switch (entry.type) {
      case 'entry':
        expectedType = record.entries.some(e => e.type === 'break_start') ? 'break_start' : 'exit';
        break;
      case 'break_start':
        expectedType = 'break_end';
        break;
      case 'break_end':
        expectedType = 'exit';
        break;
      case 'exit':
        expectedType = 'entry'; // Para múltiplas entradas no mesmo dia
        break;
    }
  }

  // Verificar intervalos mínimos
  for (let i = 1; i < entries.length; i++) {
    const prevTime = timeToMinutes(entries[i-1].time);
    const currTime = timeToMinutes(entries[i].time);
    const interval = currTime - prevTime;
    
    if (interval < 0) {
      errors.push(`Horário ${entries[i].time} é anterior ao ${entries[i-1].time}`);
    } else if (interval < 15) {
      errors.push(`Intervalo muito curto entre ${entries[i-1].time} e ${entries[i].time}`);
    }
  }

  return errors;
}

export default {
  timeToMinutes,
  minutesToTime,
  minutesToHours,
  isHoliday,
  isNightShift,
  calculateDailyHours,
  calculateTimeBankBalance,
  generateTimeBankAlerts,
  suggestCompensation,
  formatHoursBalance,
  validateTimeRecord
};
