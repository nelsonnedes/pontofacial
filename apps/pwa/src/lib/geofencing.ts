'use client';

// Sistema de Geofencing - Cercas Virtuais como Ponto Web Secullum
// Permite controlar onde os funcionários podem bater ponto

export interface Location {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
}

export interface Geofence {
  id: string;
  name: string;
  description?: string;
  center: Location;
  radius: number; // metros
  allowedTypes: PointType[];
  active: boolean;
  createdAt: number;
  updatedAt: number;
  createdBy: string; // userId do admin
  
  // Configurações avançadas
  strictMode: boolean; // Se true, bloqueia marcação fora da cerca
  alertMode: boolean;  // Se true, apenas alerta mas permite marcação
  workingHours?: {     // Horários permitidos para esta cerca
    start: string;     // "08:00"
    end: string;       // "18:00"
    days: number[];    // [1,2,3,4,5] = Seg-Sex
  };
  
  // Estatísticas
  totalMarkings: number;
  lastUsed?: number;
}

export type PointType = 'entrada' | 'saida' | 'pausa_inicio' | 'pausa_fim';

export interface GeofenceValidation {
  isValid: boolean;
  fence?: Geofence;
  distance?: number;
  message: string;
  severity: 'success' | 'warning' | 'error';
  allowMarking: boolean; // Se deve permitir marcação mesmo com erro
}

export interface GeofenceStats {
  totalFences: number;
  activeFences: number;
  totalValidations: number;
  successRate: number;
  averageAccuracy: number;
}

/**
 * Calcula a distância entre duas coordenadas usando a fórmula de Haversine
 * @param point1 Primeira coordenada
 * @param point2 Segunda coordenada
 * @returns Distância em metros
 */
export function calculateDistance(point1: Location, point2: Location): number {
  const R = 6371000; // Raio da Terra em metros
  
  const φ1 = (point1.latitude * Math.PI) / 180;
  const φ2 = (point2.latitude * Math.PI) / 180;
  const Δφ = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const Δλ = ((point2.longitude - point1.longitude) * Math.PI) / 180;

  const a = 
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

/**
 * Verifica se uma localização está dentro de uma cerca virtual
 * @param userLocation Localização do usuário
 * @param fence Cerca virtual para validar
 * @returns Resultado da validação
 */
export function validateLocationInFence(
  userLocation: Location,
  fence: Geofence
): GeofenceValidation {
  if (!fence.active) {
    return {
      isValid: false,
      fence,
      message: `Cerca virtual "${fence.name}" está desativada`,
      severity: 'error',
      allowMarking: false
    };
  }

  const distance = calculateDistance(userLocation, fence.center);
  const isWithinRadius = distance <= fence.radius;
  
  // Verificar horário de trabalho se definido
  if (fence.workingHours) {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const currentDay = now.getDay(); // 0 = Domingo, 1 = Segunda, etc.
    
    const isWorkingDay = fence.workingHours.days.includes(currentDay);
    const isWorkingTime = currentTime >= fence.workingHours.start && currentTime <= fence.workingHours.end;
    
    if (!isWorkingDay || !isWorkingTime) {
      return {
        isValid: false,
        fence,
        distance,
        message: `Marcação fora do horário permitido para "${fence.name}"`,
        severity: fence.alertMode ? 'warning' : 'error',
        allowMarking: fence.alertMode
      };
    }
  }

  if (isWithinRadius) {
    return {
      isValid: true,
      fence,
      distance,
      message: `Localização válida em "${fence.name}" (${Math.round(distance)}m do centro)`,
      severity: 'success',
      allowMarking: true
    };
  } else {
    const extraDistance = distance - fence.radius;
    return {
      isValid: false,
      fence,
      distance,
      message: `Você está ${Math.round(extraDistance)}m fora da área permitida "${fence.name}"`,
      severity: fence.alertMode ? 'warning' : 'error',
      allowMarking: fence.alertMode
    };
  }
}

/**
 * Valida uma localização contra todas as cercas ativas
 * @param userLocation Localização do usuário
 * @param fences Lista de cercas virtuais
 * @param pointType Tipo de ponto sendo marcado
 * @returns Resultado da validação
 */
export function validateLocationAgainstFences(
  userLocation: Location,
  fences: Geofence[],
  pointType: PointType
): GeofenceValidation {
  // Filtrar cercas que permitem este tipo de ponto
  const applicableFences = fences.filter(
    fence => fence.active && fence.allowedTypes.includes(pointType)
  );

  if (applicableFences.length === 0) {
    return {
      isValid: true,
      message: 'Nenhuma cerca virtual configurada para este tipo de ponto',
      severity: 'success',
      allowMarking: true
    };
  }

  // Verificar cada cerca aplicável
  const validations = applicableFences.map(fence => 
    validateLocationInFence(userLocation, fence)
  );

  // Se pelo menos uma cerca é válida, permite marcação
  const validFence = validations.find(v => v.isValid);
  if (validFence) {
    return validFence;
  }

  // Se nenhuma cerca é válida, usar a mais próxima para feedback
  const closestValidation = validations.reduce((closest, current) => {
    const closestDistance = closest.distance || Infinity;
    const currentDistance = current.distance || Infinity;
    return currentDistance < closestDistance ? current : closest;
  });

  return closestValidation;
}

/**
 * Cria uma cerca virtual padrão
 * @param name Nome da cerca
 * @param center Centro da cerca
 * @param radius Raio em metros
 * @param createdBy ID do usuário criador
 * @returns Nova cerca virtual
 */
export function createGeofence(
  name: string,
  center: Location,
  radius: number,
  createdBy: string
): Geofence {
  const now = Date.now();
  
  return {
    id: `fence_${now}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    center,
    radius,
    allowedTypes: ['entrada', 'saida', 'pausa_inicio', 'pausa_fim'], // Todos por padrão
    active: true,
    strictMode: true,    // Modo rigoroso por padrão
    alertMode: false,    // Não permite por padrão
    createdAt: now,
    updatedAt: now,
    createdBy,
    totalMarkings: 0
  };
}

/**
 * Formatar distância em texto legível
 * @param meters Distância em metros
 * @returns Texto formatado
 */
export function formatDistance(meters: number): string {
  if (meters < 1) {
    return `${Math.round(meters * 100)}cm`;
  } else if (meters < 1000) {
    return `${Math.round(meters)}m`;
  } else {
    return `${(meters / 1000).toFixed(1)}km`;
  }
}

/**
 * Verificar se uma localização tem precisão adequada para geofencing
 * @param location Localização a verificar
 * @returns Se a precisão é adequada
 */
export function hasGoodAccuracy(location: Location): boolean {
  // Considera boa precisão se accuracy <= 100 metros
  return !location.accuracy || location.accuracy <= 100;
}

/**
 * Calcular estatísticas de geofencing
 * @param fences Lista de cercas
 * @param validations Lista de validações realizadas
 * @returns Estatísticas
 */
export function calculateGeofenceStats(
  fences: Geofence[],
  validations: GeofenceValidation[]
): GeofenceStats {
  const activeFences = fences.filter(f => f.active).length;
  const successfulValidations = validations.filter(v => v.isValid).length;
  const totalValidations = validations.length;
  const successRate = totalValidations > 0 ? (successfulValidations / totalValidations) * 100 : 0;
  
  // Calcular precisão média das validações
  const accuracies = validations
    .map(v => v.distance)
    .filter((d): d is number => d !== undefined);
  const averageAccuracy = accuracies.length > 0 
    ? accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length 
    : 0;

  return {
    totalFences: fences.length,
    activeFences,
    totalValidations,
    successRate,
    averageAccuracy
  };
}

// Cercas virtuais pré-definidas para exemplo
export const DEFAULT_GEOFENCES: Partial<Geofence>[] = [
  {
    name: 'Escritório Principal',
    description: 'Sede da empresa - todos os tipos de ponto permitidos',
    radius: 50, // 50 metros
    allowedTypes: ['entrada', 'saida', 'pausa_inicio', 'pausa_fim'],
    strictMode: true,
    workingHours: {
      start: '07:00',
      end: '19:00',
      days: [1, 2, 3, 4, 5] // Segunda a sexta
    }
  },
  {
    name: 'Filial Norte',
    description: 'Filial do setor norte da cidade',
    radius: 30,
    allowedTypes: ['entrada', 'saida'],
    strictMode: true,
    workingHours: {
      start: '08:00',
      end: '18:00',
      days: [1, 2, 3, 4, 5]
    }
  },
  {
    name: 'Home Office',
    description: 'Trabalho remoto - modo flexível',
    radius: 200, // Raio maior para trabalho remoto
    allowedTypes: ['entrada', 'saida'],
    strictMode: false,
    alertMode: true, // Só alerta, não bloqueia
  }
];

const geofencing = {
  calculateDistance,
  validateLocationInFence,
  validateLocationAgainstFences,
  createGeofence,
  formatDistance,
  hasGoodAccuracy,
  calculateGeofenceStats,
  DEFAULT_GEOFENCES
};

export default geofencing;
