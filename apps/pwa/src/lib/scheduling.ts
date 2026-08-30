/**
 * @deprecated P2-4 — Use src/types/schedule.ts (ScheduleType enum) ou packages/core-rules/src/compute.ts (calcDia).
 * Mantido por compat com HRManagement/ScheduleConfiguration. Será removido em P3 (unificar em core-rules).
 */
// Sistema de Horários e Tolerâncias — DEPRECATED

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Domingo, 1 = Segunda, etc.

export interface TimeSlot {
  start: string; // HH:MM formato
  end: string; // HH:MM formato
  breakStart?: string; // Intervalo opcional
  breakEnd?: string;
}

export interface DaySchedule {
  dayOfWeek: DayOfWeek;
  isWorkingDay: boolean;
  shifts: TimeSlot[];
  tolerance: {
    entryMinutes: number; // Tolerância entrada (ex: 15 min)
    exitMinutes: number; // Tolerância saída (ex: 15 min)
    breakMinutes: number; // Tolerância intervalo (ex: 10 min)
  };
}

export interface EmployeeSchedule {
  id?: string;
  employeeId: string;
  employeeName: string;
  scheduleType: 'default' | 'custom' | 'flexible';
  weekSchedule: DaySchedule[];
  holidays: string[]; // Array de datas em formato YYYY-MM-DD
  vacations: {
    startDate: string;
    endDate: string;
    approved: boolean;
    approvedBy?: string;
    approvedAt?: string;
  }[];
  medicalLeave: {
    startDate: string;
    endDate: string;
    reason: string;
    documentUrl?: string;
    approved: boolean;
    approvedBy?: string;
    approvedAt?: string;
  }[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface PointAnalysis {
  id?: string;
  employeeId: string;
  employeeName: string;
  pointRecordId: string;
  date: string; // YYYY-MM-DD
  type: 'entrada' | 'saida' | 'pausa_inicio' | 'pausa_fim';
  scheduledTime: string; // HH:MM - horário previsto
  actualTime: string; // HH:MM - horário real
  toleranceMinutes: number;
  delayMinutes: number; // Diferença em minutos (positivo = atraso, negativo = antecipado)
  status: 'pending' | 'approved' | 'rejected' | 'justified';
  reason?: string;
  justification?: string;
  hrNotes?: string;
  analyzedBy?: string;
  analyzedAt?: string;
  createdAt: string;
}

export interface HolidayConfig {
  id?: string;
  date: string; // YYYY-MM-DD
  name: string;
  type: 'national' | 'state' | 'municipal' | 'company';
  recurrent: boolean; // Se repete anualmente
  active: boolean;
  createdBy: string;
  createdAt: string;
}

// Utilitários para horários
export class ScheduleUtils {
  /**
   * Converte string HH:MM para minutos desde 00:00
   */
  static timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Converte minutos para string HH:MM
   */
  static minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * Calcula diferença em minutos entre dois horários
   */
  static timeDifference(time1: string, time2: string): number {
    return this.timeToMinutes(time2) - this.timeToMinutes(time1);
  }

  /**
   * Verifica se um horário está dentro da tolerância
   */
  static isWithinTolerance(
    scheduledTime: string,
    actualTime: string,
    toleranceMinutes: number,
    type: 'entry' | 'exit'
  ): boolean {
    const scheduled = this.timeToMinutes(scheduledTime);
    const actual = this.timeToMinutes(actualTime);
    const difference = actual - scheduled;

    if (type === 'entry') {
      // Para entrada: pode chegar até toleranceMinutes antes ou depois
      return Math.abs(difference) <= toleranceMinutes;
    } else {
      // Para saída: pode sair até toleranceMinutes antes ou depois
      return Math.abs(difference) <= toleranceMinutes;
    }
  }

  /**
   * Obtém o horário esperado para um tipo de ponto em uma data específica
   */
  static getExpectedTime(
    schedule: EmployeeSchedule,
    date: Date,
    pointType: 'entrada' | 'saida' | 'pausa_inicio' | 'pausa_fim'
  ): string | null {
    const dayOfWeek = date.getDay() as DayOfWeek;
    const daySchedule = schedule.weekSchedule.find(d => d.dayOfWeek === dayOfWeek);

    if (!daySchedule || !daySchedule.isWorkingDay || daySchedule.shifts.length === 0) {
      return null;
    }

    const shift = daySchedule.shifts[0]; // Assumindo um turno por dia por enquanto

    switch (pointType) {
      case 'entrada':
        return shift.start;
      case 'saida':
        return shift.end;
      case 'pausa_inicio':
        return shift.breakStart || null;
      case 'pausa_fim':
        return shift.breakEnd || null;
      default:
        return null;
    }
  }

  /**
   * Verifica se uma data é feriado
   */
  static isHoliday(date: string, holidays: string[]): boolean {
    return holidays.includes(date);
  }

  /**
   * Verifica se um funcionário está de férias em uma data
   */
  static isOnVacation(date: string, vacations: EmployeeSchedule['vacations']): boolean {
    const checkDate = new Date(date);
    return vacations.some(vacation => {
      if (!vacation.approved) return false;
      const start = new Date(vacation.startDate);
      const end = new Date(vacation.endDate);
      return checkDate >= start && checkDate <= end;
    });
  }

  /**
   * Verifica se um funcionário está de atestado médico em uma data
   */
  static isOnMedicalLeave(date: string, medicalLeave: EmployeeSchedule['medicalLeave']): boolean {
    const checkDate = new Date(date);
    return medicalLeave.some(leave => {
      if (!leave.approved) return false;
      const start = new Date(leave.startDate);
      const end = new Date(leave.endDate);
      return checkDate >= start && checkDate <= end;
    });
  }

  /**
   * Cria horário padrão (Segunda a Sexta 8h-17h com 1h de almoço)
   */
  static createDefaultSchedule(employeeId: string, employeeName: string, createdBy: string): EmployeeSchedule {
    const defaultTolerance = {
      entryMinutes: 15,
      exitMinutes: 15,
      breakMinutes: 10
    };

    const weekSchedule: DaySchedule[] = [];

    // Domingo (0) - Não trabalha
    weekSchedule.push({
      dayOfWeek: 0,
      isWorkingDay: false,
      shifts: [],
      tolerance: defaultTolerance
    });

    // Segunda a Sexta (1-5) - 8h às 17h com almoço 12h-13h
    for (let day = 1; day <= 5; day++) {
      weekSchedule.push({
        dayOfWeek: day as DayOfWeek,
        isWorkingDay: true,
        shifts: [{
          start: '08:00',
          end: '17:00',
          breakStart: '12:00',
          breakEnd: '13:00'
        }],
        tolerance: defaultTolerance
      });
    }

    // Sábado (6) - Não trabalha
    weekSchedule.push({
      dayOfWeek: 6,
      isWorkingDay: false,
      shifts: [],
      tolerance: defaultTolerance
    });

    const now = new Date().toISOString();

    return {
      employeeId,
      employeeName,
      scheduleType: 'default',
      weekSchedule,
      holidays: [],
      vacations: [],
      medicalLeave: [],
      active: true,
      createdAt: now,
      updatedAt: now,
      createdBy
    };
  }
}

export default ScheduleUtils;
