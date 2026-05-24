// ✅ DESENVOLVEDOR SÊNIOR: Tipos de Horário com Regras Detalhadas

export enum ScheduleType {
  DEFAULT = 'default',
  CUSTOM = 'custom',
  FLEXIBLE = 'flexible',
  FLEXIBLE_TOTAL = 'flexible_total',
  FLEXIBLE_WINDOW = 'flexible_window'
}

export interface ScheduleTypeInfo {
  type: ScheduleType;
  label: string;
  icon: string;
  description: string;
  characteristics: string[];
  rules: ScheduleRules;
}

export interface ScheduleRules {
  // Regras gerais
  requiresTimeValidation: boolean;
  requiresGeofence: boolean;
  allowsRemote: boolean;
  
  // Horários fixos
  fixedEntry?: string;
  fixedExit?: string;
  tolerance?: number; // em minutos
  
  // Janela flexível
  windowStart?: string;
  windowEnd?: string;
  
  // Metas
  minHoursPerDay?: number;
  minHoursPerWeek?: number;
  minHoursPerMonth?: number;
  
  // Controles
  requiresJustification?: boolean;
  allowsOvertime?: boolean;
  automaticBreak?: boolean;
  breakDuration?: number; // em minutos
}

// ✅ CONFIGURAÇÕES COMPLETAS DOS TIPOS DE HORÁRIO
export const SCHEDULE_TYPES: ScheduleTypeInfo[] = [
  {
    type: ScheduleType.DEFAULT,
    label: 'Padrão',
    icon: '📅',
    description: 'Horário fixo tradicional com entrada e saída definidas',
    characteristics: [
      '✅ Horários de entrada e saída fixos',
      '✅ Tolerância de 15 minutos',
      '✅ Controle de atrasos e horas extras',
      '✅ Intervalo obrigatório',
      '✅ Validação de geolocalização'
    ],
    rules: {
      requiresTimeValidation: true,
      requiresGeofence: true,
      allowsRemote: false,
      fixedEntry: '08:00',
      fixedExit: '18:00',
      tolerance: 15,
      automaticBreak: true,
      breakDuration: 60,
      allowsOvertime: true
    }
  },
  {
    type: ScheduleType.CUSTOM,
    label: 'Personalizado',
    icon: '⚙️',
    description: 'Horário configurável de acordo com a necessidade',
    characteristics: [
      '✅ Horários personalizáveis por dia',
      '✅ Tolerância configurável',
      '✅ Escalas e turnos',
      '✅ Folgas programadas',
      '✅ Regras específicas por cargo'
    ],
    rules: {
      requiresTimeValidation: true,
      requiresGeofence: true,
      allowsRemote: false,
      tolerance: 10,
      allowsOvertime: true
    }
  },
  {
    type: ScheduleType.FLEXIBLE,
    label: 'Flexível',
    icon: '🔄',
    description: 'Horário flexível com carga horária definida',
    characteristics: [
      '✅ Entrada e saída flexíveis',
      '✅ Cumprimento de carga horária',
      '✅ Banco de horas automático',
      '✅ Compensação de horários',
      '✅ Relatórios de produtividade'
    ],
    rules: {
      requiresTimeValidation: false,
      requiresGeofence: true,
      allowsRemote: true,
      minHoursPerDay: 8,
      minHoursPerWeek: 40,
      allowsOvertime: true
    }
  },
  {
    type: ScheduleType.FLEXIBLE_TOTAL,
    label: 'Flexível Total',
    icon: '🌟',
    description: 'Liberdade total de horário sem restrições',
    characteristics: [
      '✅ Sem restrições de horário',
      '✅ Pode bater ponto a qualquer momento',
      '✅ Sem validação de atrasos',
      '✅ Ideal para consultores e freelancers',
      '✅ Controle apenas de horas trabalhadas',
      '✅ Relatórios mensais de cumprimento'
    ],
    rules: {
      requiresTimeValidation: false,
      requiresGeofence: false,
      allowsRemote: true,
      minHoursPerMonth: 176,
      requiresJustification: false,
      allowsOvertime: true
    }
  },
  {
    type: ScheduleType.FLEXIBLE_WINDOW,
    label: 'Flexível com Janela',
    icon: '⏰',
    description: 'Flexibilidade dentro de uma janela de horário',
    characteristics: [
      '✅ Janela de trabalho definida (ex: 7h às 20h)',
      '✅ Entrada e saída flexíveis dentro da janela',
      '✅ Cumprimento de horas diárias',
      '✅ Ideal para home office',
      '✅ Controle de produtividade',
      '✅ Permite trabalho remoto'
    ],
    rules: {
      requiresTimeValidation: true,
      requiresGeofence: false,
      allowsRemote: true,
      windowStart: '07:00',
      windowEnd: '20:00',
      minHoursPerDay: 8,
      minHoursPerWeek: 40,
      allowsOvertime: false
    }
  }
];

// ✅ FUNÇÃO HELPER PARA OBTER INFORMAÇÕES DO TIPO
export function getScheduleTypeInfo(type: ScheduleType | string): ScheduleTypeInfo | undefined {
  return SCHEDULE_TYPES.find(st => st.type === type);
}

// ✅ FUNÇÃO PARA VALIDAR MARCAÇÃO DE PONTO
export function validatePunchTime(
  scheduleType: ScheduleType | string,
  currentTime: Date,
  punchType: 'entrada' | 'saida' | 'pausa_inicio' | 'pausa_fim'
): { valid: boolean; message?: string } {
  const typeInfo = getScheduleTypeInfo(scheduleType);
  
  if (!typeInfo) {
    return { valid: false, message: 'Tipo de horário não encontrado' };
  }
  
  const rules = typeInfo.rules;
  
  // Flexível Total - sempre permite
  if (scheduleType === ScheduleType.FLEXIBLE_TOTAL) {
    return { valid: true };
  }
  
  // Flexível com Janela - verifica se está dentro da janela
  if (scheduleType === ScheduleType.FLEXIBLE_WINDOW) {
    if (rules.windowStart && rules.windowEnd) {
      const currentHour = currentTime.getHours();
      const currentMinute = currentTime.getMinutes();
      const currentTimeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
      
      if (currentTimeStr < rules.windowStart || currentTimeStr > rules.windowEnd) {
        return {
          valid: false,
          message: `Fora da janela de trabalho (${rules.windowStart} - ${rules.windowEnd})`
        };
      }
    }
    return { valid: true };
  }
  
  // Outros tipos - aplicar regras específicas
  if (rules.requiresTimeValidation) {
    const timeToMinutes = (time: string) => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };
    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    const tolerance = rules.tolerance || 0;

    if (punchType === 'entrada' && rules.fixedEntry) {
      const latestEntry = timeToMinutes(rules.fixedEntry) + tolerance;
      if (currentMinutes > latestEntry) {
        return {
          valid: false,
          message: `Entrada fora da tolerância (${rules.fixedEntry} + ${tolerance}min)`
        };
      }
    }

    if (punchType === 'saida' && rules.fixedExit) {
      const earliestExit = timeToMinutes(rules.fixedExit) - tolerance;
      if (currentMinutes < earliestExit) {
        return {
          valid: false,
          message: `Saída antes da tolerância (${rules.fixedExit} - ${tolerance}min)`
        };
      }
    }
  }
  
  return { valid: true };
}
