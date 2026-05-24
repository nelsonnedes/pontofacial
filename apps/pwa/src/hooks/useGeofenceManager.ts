'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  query,
  orderBy 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Geofence, PointType } from '@/lib/geofencing';

interface GeofenceData {
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  radius: number;
  allowedTypes: PointType[];
  active: boolean;
  strictMode: boolean;
  alertMode: boolean;
  workingHours?: {
    enabled: boolean;
    start: string;
    end: string;
    days: number[];
  };
}

/**
 * Hook para gerenciamento de múltiplas cercas virtuais (admin)
 * Diferente do useGeofencing que é para validação durante marcação
 */
export function useGeofenceManager() {
  const { user } = useAuth();
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Carregar todas as cercas do Firestore
  const loadGeofences = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const geofencesRef = collection(db, 'geofences');
      const q = query(geofencesRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      
      const fences: Geofence[] = [];
      querySnapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        fences.push({
          id: docSnapshot.id,
          name: data.name || 'Cerca sem nome',
          description: data.description || '',
          center: {
            latitude: data.center?.latitude || data.latitude || 0,
            longitude: data.center?.longitude || data.longitude || 0
          },
          radius: data.radius || 100,
          allowedTypes: data.allowedTypes || ['entrada', 'saida', 'pausa_inicio', 'pausa_fim'],
          active: data.active !== false, // Default true
          createdAt: data.createdAt?.toMillis?.() || Date.now(),
          updatedAt: data.updatedAt?.toMillis?.() || Date.now(),
          createdBy: data.createdBy || 'unknown',
          strictMode: data.strictMode !== false, // Default true
          alertMode: data.alertMode === true, // Default false
          workingHours: data.workingHours || undefined,
          totalMarkings: data.totalMarkings || 0,
          lastUsed: data.lastUsed?.toMillis?.() || undefined
        });
      });
      
      setGeofences(fences);
      console.log(`✅ Carregadas ${fences.length} cercas virtuais`);
      
    } catch (err: any) {
      console.error('❌ Erro ao carregar cercas:', err);
      setError(`Erro ao carregar cercas: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Carregar cercas na inicialização
  useEffect(() => {
    loadGeofences();
  }, [loadGeofences]);

  // Criar nova cerca
  const createGeofence = useCallback(async (data: GeofenceData): Promise<boolean> => {
    if (!user) {
      setError('Usuário não autenticado');
      return false;
    }

    try {
      setError(null);
      
      console.log('🔍 Dados recebidos para criar cerca:', data);
      
      const newGeofence = {
        name: data.name,
        description: data.description || '',
        center: {
          latitude: data.latitude,
          longitude: data.longitude
        },
        // Manter compatibilidade com versão antiga
        latitude: data.latitude,
        longitude: data.longitude,
        radius: data.radius,
        allowedTypes: data.allowedTypes,
        active: data.active,
        strictMode: data.strictMode,
        alertMode: data.alertMode,
        workingHours: data.workingHours?.enabled ? {
          start: data.workingHours.start,
          end: data.workingHours.end,
          days: data.workingHours.days
        } : undefined,
        totalMarkings: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user.uid
      };

      console.log('🔍 Dados que serão salvos no Firestore:', newGeofence);

      const docRef = await addDoc(collection(db, 'geofences'), newGeofence);
      console.log('✅ Documento criado com ID:', docRef.id);
      
      await loadGeofences(); // Recarregar lista
      
      console.log('✅ Cerca criada com sucesso:', data.name);
      return true;
      
    } catch (err: any) {
      console.error('❌ Erro ao criar cerca:', err);
      setError(`Erro ao criar cerca: ${err.message}`);
      return false;
    }
  }, [user, loadGeofences]);

  // Atualizar cerca existente
  const updateGeofence = useCallback(async (id: string, data: Partial<GeofenceData>): Promise<boolean> => {
    if (!user) {
      setError('Usuário não autenticado');
      return false;
    }

    try {
      setError(null);
      
      const updateData: any = {
        ...data,
        updatedAt: serverTimestamp()
      };

      // Se tem coordenadas, atualizar center também
      if (data.latitude !== undefined || data.longitude !== undefined) {
        const currentFence = geofences.find(f => f.id === id);
        updateData.center = {
          latitude: data.latitude ?? currentFence?.center.latitude ?? 0,
          longitude: data.longitude ?? currentFence?.center.longitude ?? 0
        };
      }

      await updateDoc(doc(db, 'geofences', id), updateData);
      await loadGeofences(); // Recarregar lista
      
      console.log('✅ Cerca atualizada com sucesso:', id);
      return true;
      
    } catch (err: any) {
      console.error('❌ Erro ao atualizar cerca:', err);
      setError(`Erro ao atualizar cerca: ${err.message}`);
      return false;
    }
  }, [user, loadGeofences, geofences]);

  // Deletar cerca
  const deleteGeofence = useCallback(async (id: string): Promise<boolean> => {
    if (!user) {
      setError('Usuário não autenticado');
      return false;
    }

    try {
      setError(null);
      
      await deleteDoc(doc(db, 'geofences', id));
      await loadGeofences(); // Recarregar lista
      
      console.log('✅ Cerca deletada com sucesso:', id);
      return true;
      
    } catch (err: any) {
      console.error('❌ Erro ao deletar cerca:', err);
      setError(`Erro ao deletar cerca: ${err.message}`);
      return false;
    }
  }, [user, loadGeofences]);

  // Toggle ativo/inativo
  const toggleGeofence = useCallback(async (id: string, active?: boolean): Promise<boolean> => {
    const fence = geofences.find(f => f.id === id);
    if (!fence) return false;
    
    const newActive = active !== undefined ? active : !fence.active;
    return await updateGeofence(id, { active: newActive });
  }, [geofences, updateGeofence]);

  // Limpar erro
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    geofences,
    isLoading,
    error,
    createGeofence,
    updateGeofence,
    deleteGeofence,
    toggleGeofence,
    clearError,
    reloadGeofences: loadGeofences
  };
}
