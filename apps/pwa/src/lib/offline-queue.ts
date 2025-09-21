import Dexie, { Table } from 'dexie';

// Interface para pendências da fila offline
export interface Pendencia {
  id?: number;
  payload: any;
  timestamp: number;
  createdAt: number;
  retryCount?: number;
  lastRetry?: number;
  status?: 'pending' | 'syncing' | 'synced' | 'failed';
}

// Interface para registros de ponto offline
export interface OfflineTimeRecord {
  id?: number;
  userId: string;
  timestamp: number;
  type: 'entry' | 'exit' | 'break_start' | 'break_end';
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    address?: string;
  };
  faceEmbedding?: string; // Embedding facial criptografado
  deviceInfo: {
    userAgent: string;
    platform: string;
    language: string;
    timezone: string;
  };
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed';
  syncAttempts: number;
  lastSyncAttempt?: number;
  syncError?: string;
  createdAt: number;
  updatedAt: number;
}

// Classe do banco de dados offline
class OfflineDatabase extends Dexie {
  pendencias!: Table<Pendencia, number>;
  timeRecords!: Table<OfflineTimeRecord, number>;

  constructor() {
    super('pf-queue');
    
    this.version(1).stores({
      pendencias: '++id, timestamp, createdAt, status',
      timeRecords: '++id, userId, timestamp, type, syncStatus, createdAt'
    });

    // Hooks para timestamps automáticos
    this.timeRecords.hook('creating', (primKey, obj, trans) => {
      obj.createdAt = Date.now();
      obj.updatedAt = Date.now();
    });

    this.timeRecords.hook('updating', (modifications, primKey, obj, trans) => {
      (modifications as any).updatedAt = Date.now();
    });

    this.pendencias.hook('creating', (primKey, obj, trans) => {
      obj.createdAt = Date.now();
    });
  }
}

// Instância do banco
export const db = new OfflineDatabase();

// Classe gerenciadora da fila offline unificada
export class OfflineQueueManager {
  private static instance: OfflineQueueManager;
  private isProcessing = false;
  private processingInterval?: NodeJS.Timeout;

  static getInstance(): OfflineQueueManager {
    if (!OfflineQueueManager.instance) {
      OfflineQueueManager.instance = new OfflineQueueManager();
    }
    return OfflineQueueManager.instance;
  }

  // Adicionar item à fila (compatibilidade com queue.ts antigo)
  async enqueue(payload: any): Promise<void> {
    await db.pendencias.add({
      payload,
      timestamp: Date.now(),
      createdAt: Date.now(),
      status: 'pending',
      retryCount: 0
    });

    // Tentar processar imediatamente se online
    if (navigator.onLine) {
      this.startProcessing();
    }
  }

  // Adicionar registro de ponto à fila
  async addTimeRecord(record: Omit<OfflineTimeRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
    const id = await db.timeRecords.add({
      ...record,
      syncStatus: 'pending',
      syncAttempts: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    // Adicionar à fila genérica também
    await this.enqueue({
      type: 'time_record',
      timeRecordId: id,
      ...record
    });

    return id;
  }

  // Processar fila (compatibilidade com queue.ts antigo)
  async drain(consumer: (p: Pendencia) => Promise<void>): Promise<void> {
    const all = await db.pendencias.where('status').anyOf(['pending', 'failed']).toArray();
    
    for (const p of all) {
      try {
        await consumer(p);
        await db.pendencias.update(p.id!, { status: 'synced' });
      } catch (error) {
        await db.pendencias.update(p.id!, { 
          status: 'failed',
          retryCount: (p.retryCount || 0) + 1,
          lastRetry: Date.now()
        });
        console.error('Erro ao processar item da fila:', error);
      }
    }
  }

  // Iniciar processamento automático
  startProcessing(): void {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 5000); // Processar a cada 5 segundos

    // Processar imediatamente
    this.processQueue();
  }

  // Parar processamento automático
  stopProcessing(): void {
    this.isProcessing = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
  }

  // Processar itens da fila
  private async processQueue(): Promise<void> {
    if (!navigator.onLine) {
      console.log('🔴 Offline - aguardando conexão para sincronizar');
      return;
    }

    try {
      // Processar registros de ponto pendentes
      const pendingTimeRecords = await db.timeRecords
        .where('syncStatus')
        .anyOf(['pending', 'failed'])
        .limit(5)
        .toArray();

      for (const record of pendingTimeRecords) {
        await this.syncTimeRecord(record);
      }

      // Processar pendências gerais
      const pendingItems = await db.pendencias
        .where('status')
        .anyOf(['pending', 'failed'])
        .limit(5)
        .toArray();

      for (const item of pendingItems) {
        await this.processItem(item);
      }
    } catch (error) {
      console.error('Erro no processamento da fila:', error);
    }
  }

  // Sincronizar registro de ponto
  private async syncTimeRecord(record: OfflineTimeRecord): Promise<void> {
    try {
      // Marcar como sincronizando
      await db.timeRecords.update(record.id!, {
        syncStatus: 'syncing',
        syncAttempts: record.syncAttempts + 1,
        lastSyncAttempt: Date.now()
      });

      // Preparar dados para o Firestore
      const firestoreData = {
        usuarioId: record.userId,
        tipo: this.mapTypeToFirestore(record.type),
        dataHoraTZ: new Date(record.timestamp).toISOString(),
        localizacao: record.location ? {
          latitude: record.location.latitude,
          longitude: record.location.longitude,
          precisao: record.location.accuracy,
          endereco: record.location.address
        } : null,
        faceEmbedding: record.faceEmbedding,
        deviceInfo: record.deviceInfo,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Enviar para AMBAS as coleções para garantir compatibilidade
      
      // 1. Enviar para coleção 'timeRecords' (nova estrutura)
      const responseTimeRecords = await this.sendToFirestore('timeRecords', firestoreData);
      
      // 2. Enviar para coleção 'marcacoes' (compatibilidade com sistema existente)
      const marcacaoData = {
        usuarioId: record.userId,
        tipo: this.mapTypeToFirestore(record.type),
        dataHoraTZ: new Date(record.timestamp).toISOString(),
        gps: record.location ? {
          lat: record.location.latitude,
          lng: record.location.longitude,
          accuracy: record.location.accuracy
        } : null,
        faceEmbedding: record.faceEmbedding,
        deviceInfo: record.deviceInfo,
        metadata: record.metadata,
      };
      const responseMarcacoes = await this.sendToFirestore('marcacoes', marcacaoData);
      
      // Considerar sucesso se pelo menos uma das operações funcionou
      const response = { 
        ok: responseTimeRecords.ok || responseMarcacoes.ok, 
        status: responseTimeRecords.ok ? responseTimeRecords.status : responseMarcacoes.status 
      };
      
      if (response.ok) {
        await db.timeRecords.update(record.id!, {
          syncStatus: 'synced',
          syncError: undefined
        });
        console.log('✅ Registro sincronizado com sucesso');
      } else {
        throw new Error(`Firebase retornou status ${response.status}`);
      }
    } catch (error) {
      await db.timeRecords.update(record.id!, {
        syncStatus: 'failed',
        syncError: error instanceof Error ? error.message : 'Erro desconhecido'
      });
      console.error('❌ Erro ao sincronizar registro:', error);
    }
  }

  // Processar item genérico da fila
  private async processItem(item: Pendencia): Promise<void> {
    try {
      await db.pendencias.update(item.id!, { status: 'syncing' });

      // Simular processamento (substituir por lógica real)
      const success = await this.processPayload(item.payload);
      
      if (success) {
        await db.pendencias.update(item.id!, { status: 'synced' });
      } else {
        throw new Error('Processamento falhou');
      }
    } catch (error) {
      const retryCount = (item.retryCount || 0) + 1;
      await db.pendencias.update(item.id!, {
        status: retryCount >= 3 ? 'failed' : 'pending',
        retryCount,
        lastRetry: Date.now()
      });
    }
  }

  // Mapear tipos para Firestore
  private mapTypeToFirestore(type: string): string {
    const typeMap: { [key: string]: string } = {
      'entry': 'entrada',
      'exit': 'saida',
      'break_start': 'intervalo_inicio',
      'break_end': 'intervalo_fim'
    };
    return typeMap[type] || type;
  }

  // IMPLEMENTAÇÃO REAL para envio ao Firestore
  private async sendToFirestore(collectionName: string, data: any): Promise<{ ok: boolean; status: number }> {
    try {
      console.log(`📤 Enviando REAL para ${collectionName}:`, data);
      
      // Importar Firebase dinamicamente para evitar problemas de SSR
      const { db } = await import('@/lib/firebase');
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
      
      // Preparar dados para o Firestore com timestamp do servidor
      const firestoreData = {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        origem: 'offline-sync',
        // Campos específicos para compatibilidade
        ...(collectionName === 'marcacoes' ? {
          dataHoraTZ: data.dataHoraTZ || new Date().toISOString(),
          nsr: Date.now() % 100000, // Número sequencial simples
        } : {}),
        ...(collectionName === 'timeRecords' ? {
          timestamp: new Date(data.timestamp || Date.now()),
          processed: true,
          syncedAt: serverTimestamp()
        } : {})
      };

      // Enviar para o Firebase
      const docRef = await addDoc(collection(db, collectionName), firestoreData);
      
      console.log(`✅ Documento criado com ID: ${docRef.id} em ${collectionName}`);
      return { ok: true, status: 200 };
      
    } catch (error) {
      console.error(`❌ Erro ao enviar para Firestore (${collectionName}):`, error);
      
      // Retornar detalhes do erro para debugging
      if (error instanceof Error) {
        if (error.message.includes('permission')) {
          return { ok: false, status: 403 };
        }
        if (error.message.includes('network') || error.message.includes('offline')) {
          return { ok: false, status: 503 };
        }
      }
      
      return { ok: false, status: 500 };
    }
  }

  // Processar payload genérico
  private async processPayload(payload: any): Promise<boolean> {
    console.log('📤 Processando payload:', payload);
    // Implementar lógica específica baseada no tipo do payload
    return true;
  }

  // Obter estatísticas da fila
  async getQueueStats(): Promise<{
    pending: number;
    syncing: number;
    synced: number;
    failed: number;
    totalTimeRecords: number;
    unsyncedTimeRecords: number;
  }> {
    const [pendingPendencias, syncingPendencias, syncedPendencias, failedPendencias] = await Promise.all([
      db.pendencias.where('status').equals('pending').count(),
      db.pendencias.where('status').equals('syncing').count(),
      db.pendencias.where('status').equals('synced').count(),
      db.pendencias.where('status').equals('failed').count()
    ]);

    const totalTimeRecords = await db.timeRecords.count();
    const unsyncedTimeRecords = await db.timeRecords
      .where('syncStatus')
      .anyOf(['pending', 'syncing', 'failed'])
      .count();

    return {
      pending: pendingPendencias,
      syncing: syncingPendencias,
      synced: syncedPendencias,
      failed: failedPendencias,
      totalTimeRecords,
      unsyncedTimeRecords
    };
  }

  // Obter registros não sincronizados
  async getUnsyncedRecords(): Promise<OfflineTimeRecord[]> {
    return await db.timeRecords
      .where('syncStatus')
      .anyOf(['pending', 'syncing', 'failed'])
      .toArray();
  }

  // Forçar sincronização de todos os itens
  async forceSyncAll(): Promise<{ success: boolean; processed: number }> {
    if (!navigator.onLine) {
      throw new Error('Sem conexão com a internet');
    }

    try {
      // Resetar itens falhados para pendente
      await db.pendencias.where('status').equals('failed').modify({ status: 'pending', retryCount: 0 });
      await db.timeRecords.where('syncStatus').equals('failed').modify({ syncStatus: 'pending', syncAttempts: 0 });

      // Iniciar processamento
      this.startProcessing();

      // Contar itens processados
      const stats = await this.getQueueStats();
      const processed = stats.pending + stats.failed;

      return { success: true, processed };
    } catch (error) {
      console.error('Erro na sincronização forçada:', error);
      return { success: false, processed: 0 };
    }
  }

  // Limpar dados antigos
  async cleanupOldData(daysToKeep: number = 30): Promise<void> {
    const cutoffDate = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

    // Remover registros sincronizados antigos
    await db.timeRecords
      .where('syncStatus')
      .equals('synced')
      .and(record => record.createdAt < cutoffDate)
      .delete();

    // Remover pendências sincronizadas antigas
    await db.pendencias
      .where('status')
      .equals('synced')
      .and(item => item.createdAt < cutoffDate)
      .delete();

    console.log(`🧹 Limpeza concluída - dados anteriores a ${daysToKeep} dias removidos`);
  }
}

// Instância singleton
export const queueManager = OfflineQueueManager.getInstance();

// Funções de compatibilidade com o queue.ts antigo
export async function enqueue(payload: any): Promise<void> {
  await queueManager.enqueue(payload);
}

export async function drain(consumer: (p: Pendencia) => Promise<void>): Promise<void> {
  await queueManager.drain(consumer);
}

// Inicialização automática
if (typeof window !== 'undefined') {
  // Iniciar processamento quando online
  window.addEventListener('online', () => {
    queueManager.startProcessing();
  });

  // Parar processamento quando offline
  window.addEventListener('offline', () => {
    queueManager.stopProcessing();
  });

  // Iniciar se já estiver online
  if (navigator.onLine) {
    queueManager.startProcessing();
  }

  // Limpeza automática semanal
  setInterval(() => {
    queueManager.cleanupOldData();
  }, 7 * 24 * 60 * 60 * 1000); // A cada 7 dias
}

export default queueManager;

// Re-exportar com nomes alternativos para compatibilidade
export { queueManager as offlineQueueManager };
export { OfflineDatabase as OfflineQueueDB };
export { drain as drainQueue };

// Re-exportar tipos para compatibilidade
export type { OfflineTimeRecord, Pendencia };

// Classe de configurações offline simples
export class OfflineSettings {
  private static storageKey = 'offline_settings';

  static async get<T>(key: string, defaultValue: T): Promise<T> {
    try {
      const stored = localStorage.getItem(`${this.storageKey}_${key}`);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  static async set(key: string, value: any): Promise<void> {
    try {
      localStorage.setItem(`${this.storageKey}_${key}`, JSON.stringify(value));
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
    }
  }
}
