'use client';

import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { optimizedFaceRecognition } from '@/lib/face-recognition-optimized';
import { useMultiUserRecognition } from '@/hooks/useMultiUserRecognition';

export interface HighPrecisionResult {
  success: boolean;
  employeeId?: string;
  employeeName?: string;
  similarity?: number;
  confidence?: number;
  method: string;
  message: string;
  processingTime: number;
  embeddingQuality: 'excellent' | 'good' | 'fair' | 'poor';
  debugInfo?: {
    capturedEmbeddingSize: number;
    identificationMethod: string;
    candidates: number;
  };
}

interface MigrationStatus {
  total: number;
  embeddings512D: number;
  needsMigration: boolean;
}

interface MigrationProgress {
  current: number;
  total: number;
  employee: string;
}

export function useHighPrecisionRecognition() {
  const { identifyUser } = useMultiUserRecognition();
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadMigrationStatus = useCallback(async () => {
    const snapshot = await getDocs(collection(db, 'usuarios'));
    let total = 0;

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.isActive !== false && data.faceEmbedding) {
        total += 1;
      }
    });

    setMigrationStatus({
      total,
      embeddings512D: total,
      needsMigration: false
    });
  }, []);

  useEffect(() => {
    loadMigrationStatus().catch((error) => {
      console.warn('Erro ao carregar status de embeddings 512D:', error);
      setMigrationStatus({ total: 0, embeddings512D: 0, needsMigration: false });
    });
  }, [loadMigrationStatus]);

  const identifyWithHighPrecision = useCallback(async (
    imageFile: Blob,
    _options?: { forceHighPrecision?: boolean; autoMigrate?: boolean }
  ): Promise<HighPrecisionResult> => {
    const startTime = Date.now();
    setIsLoading(true);

    try {
      const embedding = await optimizedFaceRecognition.processImageForRecognition(imageFile);
      if (!embedding) {
        return {
          success: false,
          method: 'high_precision_no_face',
          message: 'Nenhum rosto detectado na imagem.',
          processingTime: Date.now() - startTime,
          embeddingQuality: 'poor'
        };
      }

      const recognition = await identifyUser(embedding);
      const similarity = recognition.similarity ?? 0;
      const confidence = recognition.confidence ?? embedding.confidence ?? 0;
      const embeddingQuality: HighPrecisionResult['embeddingQuality'] =
        similarity >= 0.8 && confidence >= 0.8 ? 'excellent'
          : similarity >= 0.7 ? 'good'
            : similarity >= 0.55 ? 'fair'
              : 'poor';

      return {
        success: recognition.success,
        employeeId: recognition.userId,
        employeeName: recognition.userName,
        similarity,
        confidence,
        method: recognition.method || 'high_precision_512d',
        message: recognition.success
          ? 'Funcionário identificado com embedding normalizado em 512D.'
          : recognition.message || recognition.reviewReason || 'Funcionário não identificado.',
        processingTime: Date.now() - startTime,
        embeddingQuality,
        debugInfo: {
          capturedEmbeddingSize: embedding.descriptor.length,
          identificationMethod: recognition.method || 'multi_user_recognition',
          candidates: recognition.candidates?.length ?? 0
        }
      };
    } finally {
      setIsLoading(false);
    }
  }, [identifyUser]);

  const migratePendingEmbeddings = useCallback(async (
    onProgress?: (progress: MigrationProgress) => void
  ) => {
    setIsLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'usuarios'));
      const total = snapshot.size;

      snapshot.docs.forEach((docSnap, index) => {
        const data = docSnap.data();
        onProgress?.({
          current: index + 1,
          total,
          employee: data.name || data.email || docSnap.id
        });
      });

      await loadMigrationStatus();
      return {
        success: true,
        migrated: 0,
        skipped: total,
        message: 'Embeddings são normalizados para 512D em tempo de execução.'
      };
    } finally {
      setIsLoading(false);
    }
  }, [loadMigrationStatus]);

  return {
    identifyWithHighPrecision,
    migratePendingEmbeddings,
    migrationStatus,
    isLoading,
    refreshMigrationStatus: loadMigrationStatus
  };
}

export type { MigrationProgress, MigrationStatus };
