'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  onSnapshot,
  increment
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import {
  Geofence,
  Location,
  PointType,
  GeofenceValidation,
  GeofenceStats,
  validateLocationAgainstFences,
  createGeofence as createGeofenceHelper,
  calculateGeofenceStats
} from '@/lib/geofencing';

interface UseGeofencingReturn {
  // Estado
  geofences: Geofence[];
  isLoading: boolean;
  error: string | null;
  stats: GeofenceStats | null;
  
  // Validação
  validateLocation: (location: Location, pointType: PointType) => Promise<GeofenceValidation>;
  
  // CRUD (Admin)
  createGeofence: (
    name: string, 
    center: Location, 
    radius: number, 
    options?: Partial<Geofence>
  ) => Promise<string>;
  updateGeofence: (id: string, updates: Partial<Geofence>) => Promise<void>;
  deleteGeofence: (id: string) => Promise<void>;
  toggleGeofence: (id: string, active: boolean) => Promise<void>;
  
  // Utilitários
  refreshGeofences: () => Promise<void>;
  recordValidation: (validation: GeofenceValidation) => Promise<void>;
  clearError: () => void;
}

export function useGeofencing(): UseGeofencingReturn {
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<GeofenceStats | null>(null);
  const [validationHistory, setValidationHistory] = useState<GeofenceValidation[]>([]);
  
  const { user } = useAuth();

  // Configuração baseada no ambiente
  const isProduction = process.env.NODE_ENV === 'production';
  
  useEffect(() => {
    if (!isProduction) {
      console.log('🚫 Geofencing desabilitado em desenvolvimento');
      setGeofences([]);
      setIsLoading(false);
      setError(null);
      setStats(null);
      return;
    } else {
      console.log('🚀 Geofencing habilitado para produção');
    }
  }, [isProduction]);

  // Coleções do Firebase
  const geofencesCollection = collection(db, 'geofences');
  const validationsCollection = collection(db, 'geofence_validations');

  // Carregar cercas virtuais em tempo real
  useEffect(() => {
    if (!isProduction) {
      console.log('🚫 Geofencing desabilitado em desenvolvimento - não fazendo queries Firebase');
      setGeofences([]);
      setIsLoading(false);
      setError(null);
      setStats(null);
      return;
    }

    if (!user) {
      setGeofences([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    console.log('🔄 Carregando cercas virtuais...');

    // Query para cercas ativas, ordenadas por nome
    const q = query(
      geofencesCollection,
      orderBy('name', 'asc')
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const fencesData: Geofence[] = [];
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          fencesData.push({
            id: doc.id,
            ...data
          } as Geofence);
        });

        console.log(`✅ ${fencesData.length} cercas virtuais carregadas`);
        setGeofences(fencesData);
        setIsLoading(false);
        setError(null);

        // Calcular estatísticas
        if (validationHistory.length > 0) {
          const newStats = calculateGeofenceStats(fencesData, validationHistory);
          setStats(newStats);
        }
      },
      (error) => {
        console.error('❌ Erro ao carregar cercas virtuais:', error);
        
        // Tratamento específico para permissões insuficientes
        if (error.code === 'permission-denied' || error.message?.includes('insufficient permissions')) {
          console.warn('⚠️ Permissões insuficientes para geofencing - sistema funcionará sem cercas virtuais');
          setError(null); // Não tratamos isso como erro fatal
          setGeofences([]); // Usar lista vazia
          setStats(null);
          setIsLoading(false);
          return;
        }
        
        setError('Erro ao carregar cercas virtuais');
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Validar localização contra cercas ativas
  const validateLocation = useCallback(async (
    location: Location,
    pointType: PointType
  ): Promise<GeofenceValidation> => {
    if (!isProduction) {
      return {
        isValid: true,
        message: 'Geofencing desabilitado em desenvolvimento',
        severity: 'success' as const,
        allowMarking: true
      };
    }

    console.log(`🌍 Validando localização para ponto tipo: ${pointType}`);
    
    try {
      // Filtrar apenas cercas ativas
      const activeFences = geofences.filter(fence => fence.active);
      
      if (activeFences.length === 0) {
        const validation: GeofenceValidation = {
          isValid: true,
          message: 'Nenhuma cerca virtual ativa configurada',
          severity: 'success',
          allowMarking: true
        };
        
        // Registrar validação
        await recordValidation(validation);
        return validation;
      }

      // Usar função de validação do geofencing.ts
      const validation = validateLocationAgainstFences(location, activeFences, pointType);
      
      console.log('📍 Resultado da validação:', validation);
      
      // Registrar validação no histórico
      await recordValidation(validation);
      
      // Atualizar estatísticas da cerca se foi usada
      if (validation.fence) {
        await updateDoc(doc(db, 'geofences', validation.fence.id), {
          totalMarkings: increment(1),
          lastUsed: Date.now()
        });
      }
      
      return validation;
      
    } catch (err) {
      console.error('❌ Erro na validação de geofencing:', err);
      const errorValidation: GeofenceValidation = {
        isValid: false,
        message: 'Erro interno na validação de localização',
        severity: 'error',
        allowMarking: true // Permitir em caso de erro do sistema
      };
      
      await recordValidation(errorValidation);
      return errorValidation;
    }
  }, [geofences, isProduction]);

  // Criar nova cerca virtual (Admin)
  const createGeofence = useCallback(async (
    name: string,
    center: Location,
    radius: number,
    options: Partial<Geofence> = {}
  ): Promise<string> => {
    if (!user) {
      throw new Error('Usuário não autenticado');
    }

    try {
      console.log(`🎯 Criando cerca virtual: ${name}`);
      
      const newGeofence = createGeofenceHelper(name, center, radius, user.uid);
      
      // Aplicar opções customizadas
      const geofenceToCreate = {
        ...newGeofence,
        ...options,
        createdBy: user.uid, // Sempre manter o criador correto
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const docRef = await addDoc(geofencesCollection, geofenceToCreate);
      
      console.log(`✅ Cerca virtual criada com ID: ${docRef.id}`);
      return docRef.id;
      
    } catch (err) {
      console.error('❌ Erro ao criar cerca virtual:', err);
      setError('Erro ao criar cerca virtual');
      throw err;
    }
  }, [user]);

  // Atualizar cerca virtual (Admin)
  const updateGeofence = useCallback(async (
    id: string,
    updates: Partial<Geofence>
  ): Promise<void> => {
    if (!user) {
      throw new Error('Usuário não autenticado');
    }

    try {
      console.log(`📝 Atualizando cerca virtual: ${id}`);
      
      const updateData = {
        ...updates,
        updatedAt: Date.now()
      };

      await updateDoc(doc(db, 'geofences', id), updateData);
      
      console.log(`✅ Cerca virtual atualizada: ${id}`);
      
    } catch (err) {
      console.error('❌ Erro ao atualizar cerca virtual:', err);
      setError('Erro ao atualizar cerca virtual');
      throw err;
    }
  }, [user]);

  // Deletar cerca virtual (Admin)
  const deleteGeofence = useCallback(async (id: string): Promise<void> => {
    if (!user) {
      throw new Error('Usuário não autenticado');
    }

    try {
      console.log(`🗑️ Deletando cerca virtual: ${id}`);
      
      await deleteDoc(doc(db, 'geofences', id));
      
      console.log(`✅ Cerca virtual deletada: ${id}`);
      
    } catch (err) {
      console.error('❌ Erro ao deletar cerca virtual:', err);
      setError('Erro ao deletar cerca virtual');
      throw err;
    }
  }, [user]);

  // Ativar/Desativar cerca virtual (Admin)
  const toggleGeofence = useCallback(async (
    id: string,
    active: boolean
  ): Promise<void> => {
    await updateGeofence(id, { active });
  }, [updateGeofence]);

  // Registrar validação no histórico
  const recordValidation = useCallback(async (
    validation: GeofenceValidation
  ): Promise<void> => {
    if (!user) return;

    try {
      const validationRecord = {
        userId: user.uid,
        timestamp: Date.now(),
        isValid: validation.isValid,
        fenceId: validation.fence?.id || null,
        fenceName: validation.fence?.name || null,
        distance: validation.distance || null,
        message: validation.message,
        severity: validation.severity,
        allowMarking: validation.allowMarking
      };

      await addDoc(validationsCollection, validationRecord);
      
      // Atualizar histórico local para estatísticas
      setValidationHistory(prev => [...prev.slice(-99), validation]); // Manter últimos 100
      
    } catch (err) {
      console.error('❌ Erro ao registrar validação:', err);
      // Não propagar erro - é apenas para estatísticas
    }
  }, [user]);

  // Recarregar cercas virtuais
  const refreshGeofences = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const snapshot = await getDocs(query(geofencesCollection, orderBy('name', 'asc')));
      const fencesData: Geofence[] = [];
      
      snapshot.forEach((doc) => {
        fencesData.push({ id: doc.id, ...doc.data() } as Geofence);
      });

      setGeofences(fencesData);
      console.log(`🔄 ${fencesData.length} cercas virtuais recarregadas`);
      
    } catch (err) {
      console.error('❌ Erro ao recarregar cercas:', err);
      setError('Erro ao recarregar cercas virtuais');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Limpar erro
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // Estado
    geofences,
    isLoading,
    error,
    stats,
    
    // Validação
    validateLocation,
    
    // CRUD
    createGeofence,
    updateGeofence,
    deleteGeofence,
    toggleGeofence,
    
    // Utilitários
    refreshGeofences,
    recordValidation,
    clearError
  };
}

// Hook específico para validação simples (não admin)
export function useGeofenceValidation() {
  const { validateLocation, geofences, isLoading } = useGeofencing();
  
  return {
    validateLocation,
    hasGeofences: geofences.length > 0,
    isLoading
  };
}
