import Dexie, { Table } from 'dexie';
import { db as firebaseDb, getFirebaseApp } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { encryptLocalData, decryptLocalData } from './encryption';

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
  metadata?: Record<string, any>;
  deviceInfo: {
    userAgent: string;
    platform: string;
    language: string;
    timezone: string;
  };
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed' | 'failed_permanent';
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
    this.timeRecords.hook('creating', (_primKey, obj, _trans) => {
      obj.createdAt = Date.now();
      obj.updatedAt = Date.now();
    });

    this.timeRecords.hook('updating', (modifications, _primKey, _obj, _trans) => {
      (modifications as any).updatedAt = Date.now();
    });

    this.pendencias.hook('creating', (_primKey, obj, _trans) => {
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

  // Adicionar registro de ponto à fila com criptografia local AES-GCM
  async addTimeRecord(record: Omit<OfflineTimeRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
    let encryptedEmbedding = record.faceEmbedding;
    
    if (record.faceEmbedding && record.faceEmbedding.trim()) {
      try {
        const { iv, ciphertext } = await encryptLocalData(record.faceEmbedding, record.userId);
        encryptedEmbedding = JSON.stringify({ iv, ciphertext });
      } catch (encryptError) {
        console.error('⚠️ Falha ao criptografar evidência facial localmente:', encryptError);
      }
    }

    const id = await db.timeRecords.add({
      ...record,
      faceEmbedding: encryptedEmbedding,
      syncStatus: 'pending',
      syncAttempts: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    return id;
  }

  // Processar fila (compatibilidade com queue.ts antigo)
  async drain(consumer: (p: Pendencia) => Promise<void>): Promise<void> {
    const all = await db.pendencias.where('status').anyOf(['pending', 'failed']).toArray();
    
    for (const p of all) {
      try {
        await consumer(p);
        await db.pendencias.update(p.id!, {
          status: 'synced',
          payload: {
            purged: true,
            purgedAt: Date.now(),
            originalType: p.payload?.type || p.payload?.tipo || 'unknown'
          }
        });
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
    
    // Resetar registros que ficaram presos no status "syncing" por falha abrupta
    this.resetStuckSyncingRecords().then(() => {
      this.processingInterval = setInterval(() => {
        this.processQueue();
      }, 5000); // Processar a cada 5 segundos

      // Processar imediatamente
      this.processQueue();
    });
  }

  // Liberar registros que ficaram presos em "syncing"
  private async resetStuckSyncingRecords(): Promise<void> {
    try {
      const cutoff = Date.now() - 60000; // 1 minuto
      const stuckRecords = await db.timeRecords
        .where('syncStatus')
        .equals('syncing')
        .toArray();
        
      const toReset = stuckRecords.filter(r => (r.lastSyncAttempt || 0) < cutoff);
      if (toReset.length > 0) {
        console.log(`🔄 Resetando ${toReset.length} registros presos em 'syncing'...`);
        await Promise.all(toReset.map(r => 
          db.timeRecords.update(r.id!, { syncStatus: 'pending' })
        ));
      }
    } catch (e) {
      console.warn('⚠️ Erro ao resetar registros presos:', e);
    }
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

      // Descriptografar embedding facial antes de sincronizar para o Firestore se estiver criptografado localmente
      let decryptedEmbedding = record.faceEmbedding;
      if (record.faceEmbedding && record.faceEmbedding.includes('"ciphertext"') && record.faceEmbedding.includes('"iv"')) {
        try {
          const parsed = JSON.parse(record.faceEmbedding);
          decryptedEmbedding = await decryptLocalData(parsed.ciphertext, parsed.iv, record.userId);
        } catch (decryptError) {
          console.error('⚠️ Falha ao descriptografar evidência facial local para sync:', decryptError);
        }
      }

      // Preparar dados para o Firestore
      const firestoreData = {
        // Campos do esquema novo (timeRecords)
        userId: record.userId,
        type: record.type,
        timestamp: record.timestamp,
        clientTimestamp: record.timestamp,
        clientRecordId: `${record.userId}-${record.id || record.createdAt || record.timestamp}-${record.type}`,
        location: record.location,
        faceEvidence: decryptedEmbedding,
        
        // Campos do esquema antigo (marcacoes) mantidos para compatibilidade
        usuarioId: record.userId,
        tipo: this.mapTypeToFirestore(record.type),
        dataHoraTZ: new Date(record.timestamp).toISOString(),
        localizacao: record.location ? {
          latitude: record.location.latitude,
          longitude: record.location.longitude,
          precisao: record.location.accuracy,
          endereco: record.location.address
        } : null,
        
        // Campos comuns
        deviceInfo: record.deviceInfo,
        metadata: record.metadata,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // O ponto agora e criado por Cloud Function autoritativa, que tambem
      // mantem o espelho legado em marcacoes para os paineis antigos.
      console.log('💾 Sincronizando ponto via Cloud Function markPoint...');
      
      const response = await this.sendToFirestore('timeRecords', firestoreData);
      console.log('✅ Registro salvo com sucesso pelo backend:', response.ok);
      
      if (response.ok) {
        await db.timeRecords.update(record.id!, {
          syncStatus: 'synced',
          syncError: undefined,
          faceEmbedding: undefined,
          metadata: {
            ...(record.metadata || {}),
            facialEvidencePurgedAt: new Date().toISOString()
          }
        });
        console.log('✅ Registro sincronizado com sucesso');
      } else {
        throw new Error(`Firebase retornou status ${response.status}`);
      }
    } catch (error) {
      const isPermanent = error instanceof Error && (
        error.message.includes('Backend recusou') ||
        error.message.includes('permission') ||
        error.message.includes('insufficient') ||
        error.message.includes('invalid') ||
        error.message.includes('403') ||
        error.message.includes('400')
      );
      
      await db.timeRecords.update(record.id!, {
        syncStatus: isPermanent ? 'failed_permanent' : 'failed',
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
        await db.pendencias.update(item.id!, {
          status: 'synced',
          payload: {
            purged: true,
            purgedAt: Date.now(),
            originalType: item.payload?.type || item.payload?.tipo || 'unknown'
          }
        });
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

  // IMPLEMENTAÇÃO REAL para envio ao Firestore com validação robusta
  private async sendToFirestore(collectionName: string, data: any): Promise<{ ok: boolean; status: number }> {
    try {
      // Validar dados de entrada primeiro
      if (!data || typeof data !== 'object') {
        console.error(`❌ Dados inválidos para ${collectionName}:`, data);
        return { ok: false, status: 400 };
      }

      // Limpar dados problemáticos que podem causar erro 400
      const cleanData = this.sanitizeFirestoreData(data);

      if (collectionName === 'timeRecords' || collectionName === 'marcacoes') {
        await this.sendToMarkPoint(cleanData);
        return { ok: true, status: 200 };
      }
      
      // Preparar dados para o Firestore com timestamp do servidor
      const firestoreData = {
        ...cleanData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        origem: 'offline-sync',
        syncVersion: '2.0', // Versão do sistema de sincronização
        // Campos específicos para compatibilidade
        ...(collectionName === 'marcacoes' ? {
          dataHoraTZ: cleanData.dataHoraTZ || new Date().toISOString(),
          nsr: Math.floor(Date.now() / 1000) % 100000, // NSR baseado em timestamp
          usuarioId: cleanData.userId || cleanData.usuarioId, // Normalizar campo
        } : {}),
        ...(collectionName === 'timeRecords' ? {
          timestamp: cleanData.timestamp || Date.now(), // NUMERO, não objeto Date
          processed: true,
          syncedAt: serverTimestamp(),
          version: 2 // Versão dos registros de tempo
        } : {})
      };

      // Remover campos undefined ou null que podem causar problemas
      Object.keys(firestoreData).forEach(key => {
        if (firestoreData[key] === undefined) {
          delete firestoreData[key];
        }
      });

      // Enviar para o Firebase com retry automático
      const docRef = await this.retryOperation(() => 
        addDoc(collection(firebaseDb, collectionName), firestoreData)
      );
      
      console.log(`✅ Documento salvo: ${docRef.id} em ${collectionName}`);
      return { ok: true, status: 200 };
      
    } catch (error) {
      console.error(`❌ Erro detalhado ao enviar para ${collectionName}:`, {
        error,
        message: error instanceof Error ? error.message : 'Erro desconhecido',
        stack: error instanceof Error ? error.stack?.split('\n')[0] : undefined
      });
      
      // Análise específica do erro para debugging
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        
        if (message.includes('permission') || message.includes('insufficient')) {
          console.log('🔒 Erro de permissão - verificar regras do Firestore');
          return { ok: false, status: 403 };
        }
        if (message.includes('network') || message.includes('offline') || message.includes('unavailable')) {
          console.log('🌐 Erro de rede - tentará novamente quando online');
          return { ok: false, status: 503 };
        }
        if (message.includes('invalid') || message.includes('400')) {
          console.log('📝 Dados inválidos - verificar formato dos dados');
          return { ok: false, status: 400 };
        }
      }
      
      return { ok: false, status: 500 };
    }
  }

  private async sendToMarkPoint(data: any): Promise<void> {
    const app = getFirebaseApp();
    if (!app) {
      throw new Error('Firebase não inicializado');
    }

    const functions = getFunctions(app, 'us-east1');
    const markPoint = httpsCallable(functions, 'markPoint');
    const type = this.normalizePointType(data);
    const userId = data.userId || data.usuarioId || data.uid;
    const response = await markPoint({
      userId,
      type,
      clientTimestamp: data.clientTimestamp || data.timestamp,
      clientRecordId: data.clientRecordId || `${userId || 'auth'}-${data.timestamp || data.dataHoraTZ || data.createdAt || Date.now()}-${type}`,
      location: this.normalizePointLocation(data),
      faceEvidence: data.faceEvidence || data.faceEmbedding || data.photoEvidence || data.dataUrl,
      deviceInfo: data.deviceInfo,
      metadata: data.metadata
    });
    const payload = response.data as { success?: boolean; recordId?: string; nsr?: number };

    if (!payload?.success) {
      throw new Error('Backend recusou o registro de ponto');
    }

    console.log('✅ markPoint confirmado:', {
      recordId: payload.recordId,
      nsr: payload.nsr
    });
  }

  private normalizePointType(data: any): string {
    const typeMap: Record<string, string> = {
      entrada: 'entry',
      saida: 'exit',
      intervalo_inicio: 'break_start',
      intervalo_fim: 'break_end',
      entry: 'entry',
      exit: 'exit',
      break_start: 'break_start',
      break_end: 'break_end'
    };
    const rawType = String(data.type || data.tipo || 'entry');
    return typeMap[rawType] || rawType;
  }

  private normalizePointLocation(data: any) {
    if (data.location) {
      return data.location;
    }

    const latitude = Number(
      data.localizacao?.latitude ??
      data.gps?.latitude ??
      data.gps?.lat ??
      data.lat
    );
    const longitude = Number(
      data.localizacao?.longitude ??
      data.gps?.longitude ??
      data.gps?.lng ??
      data.lng
    );
    const accuracy = Number(
      data.localizacao?.precisao ??
      data.gps?.accuracy ??
      data.acc
    );

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return undefined;
    }

    return {
      latitude,
      longitude,
      accuracy: Number.isFinite(accuracy) ? accuracy : 0,
      address: data.localizacao?.endereco
    };
  }

  // Nova função para limpar dados antes de enviar ao Firestore
  private sanitizeFirestoreData(data: any): any {
    const cleaned = { ...data };
    
    // Remover ou limpar campos problemáticos
    if (cleaned.faceEmbedding && typeof cleaned.faceEmbedding === 'string') {
      try {
        if (cleaned.faceEmbedding.length > 50000) {
          console.warn('⚠️ Face embedding muito grande, removendo');
          delete cleaned.faceEmbedding;
        }
      } catch {
        delete cleaned.faceEmbedding;
      }
    }
    
    // Limpar dataUrl se muito grande
    if (cleaned.dataUrl && typeof cleaned.dataUrl === 'string') {
      if (cleaned.dataUrl.length > 1000000) {
        console.warn('⚠️ DataURL muito grande, removendo');
        delete cleaned.dataUrl;
      }
    }
    
    // Normalizar campos de localização
    if (cleaned.location) {
      cleaned.location = {
        latitude: Number(cleaned.location.latitude) || 0,
        longitude: Number(cleaned.location.longitude) || 0,
        accuracy: Number(cleaned.location.accuracy) || 0
      };
    }
    
    // Garantir que timestamps são válidos
    if (cleaned.timestamp && isNaN(new Date(cleaned.timestamp).getTime())) {
      cleaned.timestamp = Date.now();
    }
    
    return cleaned;
  }

  // Nova função para retry de operações
  private async retryOperation<T>(operation: () => Promise<T>, maxAttempts: number = 3): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        console.warn(`⚠️ Tentativa ${attempt}/${maxAttempts} falhou:`, error);
        
        if (attempt < maxAttempts) {
          // Aguardar antes da próxima tentativa (backoff exponencial)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError!;
  }

  // Processar payload genérico
  private async processPayload(payload: any): Promise<boolean> {
    console.log('📤 Processando payload legado:', payload);
    try {
      if (payload.type === 'time_record') {
        return true; // Já foi processado pela nova coleção
      }
      // Processamento legado se houver algo preso na fila antiga
      await this.sendToMarkPoint(this.sanitizeFirestoreData(payload));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Obter estatísticas da fila
  async getQueueStats(): Promise<{
    pending: number;
    syncing: number;
    synced: number;
    processing: number;
    completed: number;
    failed: number;
    totalTimeRecords: number;
    unsyncedTimeRecords: number;
    syncedTimeRecords: number;
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
    const syncedTimeRecords = await db.timeRecords
      .where('syncStatus')
      .equals('synced')
      .count();

    return {
      pending: pendingPendencias,
      syncing: syncingPendencias,
      synced: syncedPendencias,
      processing: syncingPendencias,
      completed: syncedTimeRecords,
      failed: failedPendencias,
      totalTimeRecords,
      unsyncedTimeRecords,
      syncedTimeRecords
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
      const initialStats = await this.getQueueStats();
      const initialPending =
        initialStats.pending +
        initialStats.syncing +
        initialStats.failed +
        initialStats.unsyncedTimeRecords;

      // Resetar itens falhados para pendente
      await db.pendencias.where('status').equals('failed').modify({ status: 'pending', retryCount: 0 });
      await db.timeRecords.where('syncStatus').equals('failed').modify({ syncStatus: 'pending', syncAttempts: 0 });

      // Processar de forma síncrona para a UI refletir o estado real da fila.
      const maxPasses = 10;
      for (let pass = 0; pass < maxPasses; pass++) {
        await this.processQueue();
        const stats = await this.getQueueStats();
        const remaining = stats.pending + stats.syncing + stats.unsyncedTimeRecords;

        if (remaining === 0 || !navigator.onLine) {
          break;
        }
      }

      const finalStats = await this.getQueueStats();
      const finalPending =
        finalStats.pending +
        finalStats.syncing +
        finalStats.failed +
        finalStats.unsyncedTimeRecords;
      const processed = Math.max(0, initialPending - finalPending);

      if (finalStats.failed > 0 || finalStats.unsyncedTimeRecords > 0) {
        return { success: false, processed };
      }

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
