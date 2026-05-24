'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, addDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

interface GeofenceConfig {
  latitude: number;
  longitude: number;
  radius: number; // metros
  name: string;
}

interface GeolocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

interface GeofencingState {
  currentLocation: GeolocationData | null;
  isInsideFence: boolean | null;
  isLoadingLocation: boolean;
  locationError: string | null;
  distanceFromFence: number | null;
}

interface GeofenceViolation {
  userId: string;
  userName: string;
  userEmail: string;
  timestamp: Date;
  attemptedAction: 'marcar_ponto';
  pontoType: string;
  location: GeolocationData;
  fence: GeofenceConfig;
  distanceFromFence: number;
  deviceInfo: string;
}

/**
 * Hook profissional para controle de geofencing
 * - Busca cerca ativa do Firestore
 * - Monitora localização em tempo real
 * - Calcula distância da cerca geográfica
 * - Registra violações automaticamente
 * - Integra com sistema de ocorrências
 */
export function useGeofencing() {
  const { user } = useAuth();
  
  const [state, setState] = useState<GeofencingState>({
    currentLocation: null,
    isInsideFence: null,
    isLoadingLocation: true,
    locationError: null,
    distanceFromFence: null,
  });
  
  // ✅ CORREÇÃO CRÍTICA: Estado para cerca ativa do Firestore
  const [activeFence, setActiveFence] = useState<GeofenceConfig | null>(null);
  const [isLoadingFence, setIsLoadingFence] = useState(true);
  
  // ✅ NOVA FUNÇÃO: Carregar cerca ativa do Firestore
  const loadActiveFence = useCallback(async () => {
    try {
      console.log('📡 Buscando cerca ativa no Firestore...');
      setIsLoadingFence(true);
      
      // ✅ PRIMEIRO: Listar TODAS as cercas para debug
      console.log('🔍 DEBUG: Listando TODAS as cercas existentes...');
      const allFencesRef = collection(db, 'geofences');
      const allQuery = query(allFencesRef, orderBy('createdAt', 'desc'));
      const allSnapshot = await getDocs(allQuery);
      
      console.log(`🔍 Total de cercas encontradas: ${allSnapshot.size}`);
      allSnapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        console.log(`🔍 Cerca ${index + 1}:`, {
          id: doc.id,
          name: data.name,
          active: data.active,
          latitude: data.center?.latitude || data.latitude,
          longitude: data.center?.longitude || data.longitude,
          radius: data.radius,
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() || 'sem data'
        });
      });
      
      // ✅ SEGUNDO: Buscar cercas ativas especificamente (SEM orderBy para evitar índice composto)
      const fencesRef = collection(db, 'geofences');
      const q = query(
        fencesRef,
        where('active', '==', true),
        limit(1)
      );
      
      console.log('🔍 Buscando cercas com active === true...');
      const querySnapshot = await getDocs(q);
      console.log(`🔍 Cercas ativas encontradas: ${querySnapshot.size}`);
      
      if (!querySnapshot.empty) {
        const fenceDoc = querySnapshot.docs[0];
        const fenceData = fenceDoc.data();
        
        console.log('🔍 Dados da cerca ativa encontrada:', {
          id: fenceDoc.id,
          raw: fenceData,
          center: fenceData.center,
          latitude: fenceData.latitude,
          longitude: fenceData.longitude,
          active: fenceData.active
        });
        
        const fence: GeofenceConfig = {
          latitude: fenceData.center?.latitude || fenceData.latitude,
          longitude: fenceData.center?.longitude || fenceData.longitude,
          radius: fenceData.radius || 100,
          name: fenceData.name || 'Cerca da Empresa'
        };
        
        setActiveFence(fence);
        console.log('✅ Cerca ativa definida:', fence.name, `${fence.latitude}, ${fence.longitude} (${fence.radius}m)`);
      } else {
        setActiveFence(null);
        console.warn('⚠️ NENHUMA cerca ativa encontrada; marcação de ponto bloqueada por segurança');
      }
    } catch (error) {
      console.error('❌ Erro ao buscar cerca ativa:', error);
      console.error('❌ Stack trace:', error instanceof Error ? error.stack : undefined);
      setActiveFence(null);
      setState(prev => ({
        ...prev,
        isLoadingLocation: false,
        locationError: 'Falha ao carregar cerca ativa'
      }));
    } finally {
      setIsLoadingFence(false);
    }
  }, []);
  
  // ✅ Carregar cerca na inicialização
  useEffect(() => {
    loadActiveFence();
  }, [loadActiveFence]);

  // Calcular distância entre dois pontos (Haversine)
  const calculateDistance = useCallback((
    lat1: number, 
    lon1: number, 
    lat2: number, 
    lon2: number
  ): number => {
    const R = 6371000; // Raio da Terra em metros
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distância em metros
  }, []);

  // Registrar violação de geofencing
  const registerViolation = useCallback(async (
    action: string,
    pontoType: string,
    location: GeolocationData,
    distance: number
  ) => {
    if (!user) return;

    try {
      const violation: GeofenceViolation = {
        userId: user.uid,
        userName: user.displayName || 'Usuário sem nome',
        userEmail: user.email || 'Email não disponível',
        timestamp: new Date(),
        attemptedAction: action as any,
        pontoType,
        location,
        fence: activeFence!,
        distanceFromFence: distance,
        deviceInfo: `${navigator.userAgent} | ${window.screen.width}x${window.screen.height}`
      };

      await addDoc(collection(db, 'geofence_violations'), violation);
      console.log('🚨 Violação de geofencing registrada:', violation);
      
    } catch (error) {
      console.error('❌ Erro ao registrar violação:', error);
    }
  }, [user, activeFence]);

  // Atualizar localização
  const updateLocation = useCallback((position: GeolocationPosition) => {
    const location: GeolocationData = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: Date.now(),
    };

    if (!activeFence) {
      console.warn('⚠️ Nenhuma cerca ativa - bloqueando marcação');
      setState({
        currentLocation: location,
        isInsideFence: false,
        isLoadingLocation: false,
        locationError: 'Nenhuma cerca ativa configurada',
        distanceFromFence: null,
      });
      return;
    }

    // Calcular distância da cerca ativa
    const distance = calculateDistance(
      location.latitude,
      location.longitude,
      activeFence.latitude,
      activeFence.longitude
    );

    const isInside = distance <= activeFence.radius;

    setState({
      currentLocation: location,
      isInsideFence: isInside,
      isLoadingLocation: false,
      locationError: null,
      distanceFromFence: distance,
    });

    console.log(`📍 Localização atualizada: ${Math.round(distance)}m da cerca "${activeFence.name}" (${isInside ? 'DENTRO' : 'FORA'})`);
  }, [activeFence, calculateDistance]);

  // ✅ INICIALIZAR GEOLOCALIZAÇÃO: Só após carregar cerca ou determinar que não há cerca
  useEffect(() => {
    // ✅ CRÍTICO: Só iniciar geolocalização após carregar cerca
    if (isLoadingFence) {
      console.log('⏳ Aguardando carregamento de cerca...');
      return;
    }
    
    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        isLoadingLocation: false,
        locationError: 'Geolocalização não suportada',
      }));
      return;
    }
    
    console.log('📍 Iniciando geolocalização...');
    console.log('🏢 Cerca ativa:', activeFence ? `${activeFence.name} (${activeFence.latitude}, ${activeFence.longitude})` : 'Nenhuma');

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000, // Cache por 30 segundos
    };

    // Obter localização inicial
    navigator.geolocation.getCurrentPosition(
      updateLocation,
      (error) => {
        console.error('❌ Erro de geolocalização:', error);
        let errorMessage = 'Erro ao obter localização';
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Permissão de localização negada';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Localização indisponível';
            break;
          case error.TIMEOUT:
            errorMessage = 'Timeout na obtenção da localização';
            break;
        }
        
        setState(prev => ({
          ...prev,
          isLoadingLocation: false,
          locationError: errorMessage,
        }));
      },
      options
    );

    // Monitorar mudanças de localização
    const watchId = navigator.geolocation.watchPosition(
      updateLocation,
      (error) => {
        console.warn('⚠️ Erro no monitoramento:', error);
      },
      {
        ...options,
        maximumAge: 60000, // Update a cada minuto
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isLoadingFence, activeFence]); // ✅ CORREÇÃO: Removido updateLocation das dependências

  // Função para tentar marcar ponto (com validação de geofencing)
  const attemptPointMarking = useCallback(async (pontoType: string): Promise<{
    allowed: boolean;
    reason?: string;
  }> => {
    const { isInsideFence, currentLocation, distanceFromFence } = state;

    // Se ainda está carregando localização
    if (state.isLoadingLocation) {
      return {
        allowed: false,
        reason: 'Aguardando localização...'
      };
    }

    // Se houve erro na localização
    if (state.locationError) {
      return {
        allowed: false,
        reason: `Erro de localização: ${state.locationError}`
      };
    }

    if (!activeFence) {
      return {
        allowed: false,
        reason: 'Nenhuma cerca ativa configurada'
      };
    }

    if (!currentLocation) {
      return {
        allowed: false,
        reason: 'Localização atual indisponível'
      };
    }

    if (currentLocation.accuracy > 100) {
      return {
        allowed: false,
        reason: `Precisão de GPS insuficiente (${Math.round(currentLocation.accuracy)}m)`
      };
    }

    // Se está fora da cerca geográfica
    if (isInsideFence !== true && distanceFromFence !== null) {
      // Registrar violação
      await registerViolation('marcar_ponto', pontoType, currentLocation, distanceFromFence);
      
      return {
        allowed: false,
        reason: `Você está fora da área permitida (${Math.round(distanceFromFence)}m de distância)`
      };
    }

    // Tudo OK para marcar ponto
    return { allowed: true };
  }, [state, activeFence, registerViolation]);

  // ✅ FUNÇÃO UTILITÁRIA: Listar e ativar cercas
  const debugFences = useCallback(async () => {
    try {
      const allFencesRef = collection(db, 'geofences');
      const allQuery = query(allFencesRef, orderBy('createdAt', 'desc'));
      const allSnapshot = await getDocs(allQuery);
      
      console.log('=== TODAS AS CERCAS NO FIRESTORE ===');
      const fences: Array<{
        id: string;
        name: any;
        active: any;
        latitude: any;
        longitude: any;
        radius: any;
        createdAt: any;
      }> = [];
      allSnapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        const fence = {
          id: doc.id,
          name: data.name,
          active: data.active,
          latitude: data.center?.latitude || data.latitude,
          longitude: data.center?.longitude || data.longitude,
          radius: data.radius,
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() || 'sem data'
        };
        fences.push(fence);
        console.log(`🔍 Cerca ${index + 1}:`, fence);
      });
      
      return fences;
    } catch (error) {
      console.error('❌ Erro ao listar cercas:', error);
      return [];
    }
  }, []);

  return {
    ...state,
    fence: activeFence, // ✅ Retornar cerca ativa do Firestore
    isLoadingFence, // ✅ Indicar se ainda está carregando cerca
    attemptPointMarking,
    refreshLocation: () => {
      setState(prev => ({ ...prev, isLoadingLocation: true }));
    },
    reloadFence: loadActiveFence, // ✅ Permitir recarregar cerca manualmente
    debugFences // ✅ Função para debug das cercas
  };
}
