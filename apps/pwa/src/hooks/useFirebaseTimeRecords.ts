'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './useAuth';

export interface FirebaseTimeRecord {
  id: string;
  userId: string;
  timestamp: number;
  type: 'entry' | 'exit' | 'break_start' | 'break_end';
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
  createdAt: number;
  syncedAt: number;
}

export function useFirebaseTimeRecords() {
  const [records, setRecords] = useState<FirebaseTimeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const { user } = useAuth();

  const loadRecords = async (limitCount = 100) => {
    if (!user) {
      console.log('👤 useFirebaseTimeRecords: Usuário não autenticado');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('🔍 Buscando registros Firebase para usuário:', user.uid);
      
      // Buscar registros de ambas as coleções: 'timeRecords' e 'marcacoes'
      const allRecords: FirebaseTimeRecord[] = [];
      
      // 1. Buscar da coleção 'timeRecords' (novo formato)
      try {
        const timeRecordsQuery = query(
          collection(db, 'timeRecords'),
          where('userId', '==', user.uid),
          orderBy('timestamp', 'desc'),
          limit(limitCount)
        );
        
        const timeRecordsSnapshot = await getDocs(timeRecordsQuery);
        console.log(`📊 Encontrados ${timeRecordsSnapshot.size} registros em timeRecords`);
        
        timeRecordsSnapshot.forEach((doc) => {
          const data = doc.data();
          allRecords.push({
            id: doc.id,
            userId: data.userId,
            timestamp: data.timestamp,
            type: data.type,
            location: data.location,
            createdAt: data.createdAt || data.timestamp,
            syncedAt: data.syncedAt || Date.now()
          });
        });
      } catch (timeRecordsError: any) {
        console.warn('⚠️ Erro ao buscar timeRecords (pode não existir):', timeRecordsError.message);
      }
      
      // 2. Buscar da coleção 'marcacoes' (formato antigo, convertido)
      try {
        const marcacoesQuery = query(
          collection(db, 'marcacoes'),
          where('usuarioId', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        );
        
        const marcacoesSnapshot = await getDocs(marcacoesQuery);
        console.log(`📊 Encontrados ${marcacoesSnapshot.size} registros em marcacoes`);
        
        marcacoesSnapshot.forEach((doc) => {
          const data = doc.data();
          
          // Converter formato antigo para novo
          const timestamp = data.createdAt?.toMillis?.() || Date.now();
          allRecords.push({
            id: doc.id,
            userId: data.usuarioId,
            timestamp: timestamp,
            type: 'entry' as const, // Marcações antigas são sempre entrada
            location: data.gps ? {
              latitude: data.gps.latitude,
              longitude: data.gps.longitude,
              accuracy: data.gps.accuracy || 0
            } : undefined,
            createdAt: timestamp,
            syncedAt: timestamp
          });
        });
      } catch (marcacoesError: any) {
        console.warn('⚠️ Erro ao buscar marcacoes (pode não existir):', marcacoesError.message);
      }
      
      // Remover duplicatas e ordenar por timestamp
      const uniqueRecords = allRecords
        .filter((record, index, self) => 
          index === self.findIndex(r => r.timestamp === record.timestamp && r.userId === record.userId)
        )
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limitCount); // Aplicar limite final
      
      console.log(`✅ Total de ${uniqueRecords.length} registros únicos carregados`);
      setRecords(uniqueRecords);
      setTotalCount(uniqueRecords.length);
      
    } catch (err: any) {
      console.error('❌ Erro ao carregar registros do Firebase:', err);
      setError(err.message || 'Erro ao carregar registros');
      setRecords([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  };

  const loadRecordsByPeriod = async (startDate: Date, endDate: Date) => {
    if (!user) {
      console.log('👤 useFirebaseTimeRecords: Usuário não autenticado para busca por período');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('🔍 Buscando registros por período:', startDate.toISOString(), 'até', endDate.toISOString());
      
      const startTimestamp = startDate.getTime();
      const endTimestamp = endDate.getTime();
      const allRecords: FirebaseTimeRecord[] = [];
      
      // 1. Buscar da coleção 'timeRecords' por período
      try {
        const timeRecordsQuery = query(
          collection(db, 'timeRecords'),
          where('userId', '==', user.uid),
          where('timestamp', '>=', startTimestamp),
          where('timestamp', '<=', endTimestamp),
          orderBy('timestamp', 'desc')
        );
        
        const timeRecordsSnapshot = await getDocs(timeRecordsQuery);
        console.log(`📊 Período - Encontrados ${timeRecordsSnapshot.size} registros em timeRecords`);
        
        timeRecordsSnapshot.forEach((doc) => {
          const data = doc.data();
          allRecords.push({
            id: doc.id,
            userId: data.userId,
            timestamp: data.timestamp,
            type: data.type,
            location: data.location,
            createdAt: data.createdAt || data.timestamp,
            syncedAt: data.syncedAt || Date.now()
          });
        });
      } catch (timeRecordsError: any) {
        console.warn('⚠️ Erro ao buscar timeRecords por período:', timeRecordsError.message);
      }
      
      // 2. Buscar da coleção 'marcacoes' por período (usando createdAt timestamp)
      try {
        const marcacoesQuery = query(
          collection(db, 'marcacoes'),
          where('usuarioId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        
        const marcacoesSnapshot = await getDocs(marcacoesQuery);
        console.log(`📊 Período - Encontrados ${marcacoesSnapshot.size} registros totais em marcacoes`);
        
        let filteredCount = 0;
        marcacoesSnapshot.forEach((doc) => {
          const data = doc.data();
          const timestamp = data.createdAt?.toMillis?.() || 0;
          
          // Filtrar por período no cliente (já que Firestore não suporta range em campos diferentes)
          if (timestamp >= startTimestamp && timestamp <= endTimestamp) {
            allRecords.push({
              id: doc.id,
              userId: data.usuarioId,
              timestamp: timestamp,
              type: 'entry' as const,
              location: data.gps ? {
                latitude: data.gps.latitude,
                longitude: data.gps.longitude,
                accuracy: data.gps.accuracy || 0
              } : undefined,
              createdAt: timestamp,
              syncedAt: timestamp
            });
            filteredCount++;
          }
        });
        console.log(`📊 Período - ${filteredCount} registros de marcacoes no período`);
      } catch (marcacoesError: any) {
        console.warn('⚠️ Erro ao buscar marcacoes por período:', marcacoesError.message);
      }
      
      // Remover duplicatas e ordenar por timestamp
      const uniqueRecords = allRecords
        .filter((record, index, self) => 
          index === self.findIndex(r => r.timestamp === record.timestamp && r.userId === record.userId)
        )
        .sort((a, b) => b.timestamp - a.timestamp);
      
      console.log(`✅ Período - Total de ${uniqueRecords.length} registros únicos no período`);
      setRecords(uniqueRecords);
      setTotalCount(uniqueRecords.length);
      
    } catch (err: any) {
      console.error('❌ Erro ao carregar registros por período:', err);
      setError(err.message || 'Erro ao carregar registros por período');
      setRecords([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      console.log('🔄 useFirebaseTimeRecords: Carregando registros automaticamente para usuário:', user.uid);
      loadRecords();
    } else {
      console.log('👤 useFirebaseTimeRecords: Limpando registros - usuário não autenticado');
      setRecords([]);
      setTotalCount(0);
    }
  }, [user]);

  return {
    records,
    isLoading,
    error,
    totalCount,
    loadRecords,
    loadRecordsByPeriod,
    refresh: () => loadRecords()
  };
}