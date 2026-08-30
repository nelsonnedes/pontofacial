'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { optimizedFaceRecognition, type OptimizedFaceEmbedding } from '@/lib/face-recognition-optimized';
import { decryptEmbedding } from '@/lib/encryption';
import {
  BIOMETRIC_POLICY,
  getBiometricRuntimeBlockers,
  isStrictProduction
} from '@/lib/production-guardrails';

interface UserEmbedding {
  id: string;
  name: string;
  email: string;
  embedding: OptimizedFaceEmbedding;
  lastUsed: number;
  confidence: number;
}

interface RecognitionResult {
  success: boolean;
  userId?: string;
  userName?: string;
  similarity?: number;
  confidence?: number;
  method?: string;
  message?: string;
  candidates?: Array<{
    userId: string;
    userName: string;
    similarity: number;
  }>;
  requiresReview?: boolean; // ✅ Flag para revisão
  reviewReason?: string;    // ✅ Motivo da revisão
  securityAlert?: string;
  securityBlock?: boolean;
  bestCandidate?: string;
  suggestion?: string;
}

// ✅ INTERFACE PARA REGISTROS DE REVISÃO
interface ReviewRecord {
  employeeId: string;
  employeeName: string;
  similarity: number;
  threshold: number;
  capturedAt: string;
  status: 'pending_review' | 'approved' | 'rejected';
  reason: 'similarity_borderline' | 'manual_override' | 'security_check';
  confidence: number;
}

// ✅ FUNÇÃO PARA CRIAR REGISTRO DE REVISÃO
async function _createReviewRecord(reviewData: ReviewRecord): Promise<void> {
  try {
    const reviewDoc = {
      ...reviewData,
      createdAt: serverTimestamp(),
      reviewedAt: null,
      reviewedBy: null,
      adminNotes: null,
      type: 'facial_recognition_review'
    };

    const docRef = await addDoc(collection(db, 'review_records'), reviewDoc);
    console.log(`📋 Registro de revisão criado: ${docRef.id} para ${reviewData.employeeName}`);
    
  } catch (error) {
    console.error('❌ Erro ao criar registro de revisão:', error);
    throw new Error('Falha ao criar registro de revisão');
  }
}

interface UseMultiUserRecognitionReturn {
  identifyUser: (capturedEmbedding: any) => Promise<RecognitionResult>;
  isLoading: boolean;
  error: string | null;
  cachedUsers: number;
  refreshCache: (_force?: boolean) => Promise<void>;
}

// Cache inteligente para embeddings de usuários
class UserEmbeddingCache {
  private static instance: UserEmbeddingCache;
  private cache = new Map<string, UserEmbedding>();
  private lastRefresh = 0;
  private readonly TTL = 60 * 60 * 1000; // 1 hora
  private readonly MAX_CACHE_SIZE = 500; // Máximo 500 usuários

  public static getInstance(): UserEmbeddingCache {
    if (!UserEmbeddingCache.instance) {
      UserEmbeddingCache.instance = new UserEmbeddingCache();
    }
    return UserEmbeddingCache.instance;
  }

  public set(userId: string, userData: UserEmbedding): void {
    // Limpar cache se exceder tamanho máximo
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldest();
    }

    this.cache.set(userId, {
      ...userData,
      lastUsed: Date.now()
    });
  }

  public get(userId: string): UserEmbedding | null {
    const cached = this.cache.get(userId);
    if (!cached) return null;

    // Verificar TTL
    if (Date.now() - cached.lastUsed > this.TTL) {
      this.cache.delete(userId);
      return null;
    }

    // Atualizar lastUsed
    cached.lastUsed = Date.now();
    return cached;
  }

  public getAll(): UserEmbedding[] {
    const now = Date.now();
    const validUsers: UserEmbedding[] = [];

    for (const [userId, userData] of this.cache.entries()) {
      if (now - userData.lastUsed <= this.TTL) {
        validUsers.push(userData);
      } else {
        this.cache.delete(userId);
      }
    }

    return validUsers;
  }

  public size(): number {
    return this.cache.size;
  }

  public clear(): void {
    this.cache.clear();
    this.lastRefresh = 0;
  }

  public needsRefresh(): boolean {
    return Date.now() - this.lastRefresh > this.TTL;
  }

  public markRefreshed(): void {
    this.lastRefresh = Date.now();
  }

  private evictOldest(): void {
    let oldestUserId = '';
    let oldestTime = Date.now();

    for (const [userId, userData] of this.cache.entries()) {
      if (userData.lastUsed < oldestTime) {
        oldestTime = userData.lastUsed;
        oldestUserId = userId;
      }
    }

    if (oldestUserId) {
      this.cache.delete(oldestUserId);
    }
  }
}

export function useMultiUserRecognition(): UseMultiUserRecognitionReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef(UserEmbeddingCache.getInstance());

  // Carregar usuários cadastrados no cache
  const loadUsersToCache = useCallback(async (): Promise<void> => {
    try {
      if (isStrictProduction()) {
        cacheRef.current.clear();
        throw new Error(
          'Cache/decriptacao de embeddings no browser bloqueados em producao. Use comparacao biometrica server/provider.'
        );
      }

      console.log('🔄 Carregando funcionários cadastrados...');
      
      // ✅ CORREÇÃO: Query simplificada para evitar índice composto
      const usersQuery = query(
        collection(db, 'employees'),
        where('faceEmbedding', '!=', null)
      );
      
      const querySnapshot = await getDocs(usersQuery);
      let loadedCount = 0;
      
      console.log(`📊 Query retornou ${querySnapshot.size} documentos da coleção employees`);
      console.log(`📋 Documentos encontrados:`, querySnapshot.docs.map(doc => ({
        id: doc.id,
        nomeCompleto: doc.data().nomeCompleto,
        nome: doc.data().nome,
        hasEmbedding: !!doc.data().faceEmbedding,
        status: doc.data().status
      })));

      querySnapshot.forEach((doc) => {
        const userData = doc.data();
        console.log(`🔍 Processando documento ${doc.id}:`, {
          nomeCompleto: userData.nomeCompleto,
          nome: userData.nome,
          hasEmbedding: !!userData.faceEmbedding,
          embeddingType: typeof userData.faceEmbedding,
          status: userData.status
        });
        
        if (userData.faceEmbedding) {
          try {
            // ✅ CORREÇÃO: Verificar múltiplos campos de nome (incluindo nomeCompleto)
            const employeeName = userData.nomeCompleto || userData.nome || userData.displayName || userData.name || 'Funcionário Sem Nome';
            console.log(`🔓 Descriptografando embedding do funcionário: ${employeeName}`);
            console.log(`📋 Dados do funcionário:`, {
              id: doc.id,
              nomeCompleto: userData.nomeCompleto,
              nome: userData.nome,
              displayName: userData.displayName,
              name: userData.name,
              email: userData.email,
              hasEmbedding: !!userData.faceEmbedding
            });
            
            // ✅ CORREÇÃO CRÍTICA: Descriptografar embedding antes de usar
            const decryptedEmbedding = decryptEmbedding(userData.faceEmbedding);
            const normalizedEmbedding: OptimizedFaceEmbedding = {
              descriptor: decryptedEmbedding.descriptor instanceof Float32Array
                ? decryptedEmbedding.descriptor
                : new Float32Array(decryptedEmbedding.descriptor),
              confidence: userData.faceConfidence || userData.averageConfidence || decryptedEmbedding.confidence || 0.95,
              timestamp: decryptedEmbedding.timestamp || Date.now(),
              method: decryptedEmbedding.method || 'stored'
            };

            const userEmbedding: UserEmbedding = {
              id: doc.id,
              name: employeeName,
              email: userData.email || '',
              embedding: normalizedEmbedding,
              lastUsed: Date.now(),
              confidence: userData.faceConfidence || userData.averageConfidence || 0.95 // ✅ CONFIANÇA ALTA PARA CADASTROS
            };

            cacheRef.current.set(doc.id, userEmbedding);
            loadedCount++;
            
            console.log(`✅ Funcionário ${employeeName} carregado e descriptografado com sucesso`);
          } catch (error) {
            const employeeName = userData.nomeCompleto || userData.nome || userData.displayName || userData.name || 'Funcionário';
            console.error(`❌ Erro ao descriptografar embedding do funcionário ${employeeName}:`, error);
            console.error(`❌ Dados do embedding que falhou:`, {
              embeddingType: typeof userData.faceEmbedding,
              embeddingLength: userData.faceEmbedding?.length,
              isString: typeof userData.faceEmbedding === 'string',
              firstChars: typeof userData.faceEmbedding === 'string' ? userData.faceEmbedding.substring(0, 50) : 'N/A'
            });
          }
        } else {
          const employeeName = userData.nomeCompleto || userData.nome || userData.displayName || userData.name || 'Funcionário';
          console.warn(`⚠️ Funcionário ${employeeName} não tem faceEmbedding válido`);
        }
      });

      cacheRef.current.markRefreshed();
      console.log(`✅ ${loadedCount} funcionários carregados no cache`);
      
    } catch (err) {
      console.error('❌ Erro ao carregar funcionários:', err);
      throw err;
    }
  }, []);

  // Atualizar cache se necessário
  const refreshCache = useCallback(async (force = false): Promise<void> => {
    if (force) {
      cacheRef.current.clear();
    }

    if (force || cacheRef.current.needsRefresh()) {
      await loadUsersToCache();
    }
  }, [loadUsersToCache]);

  // Identificar usuário a partir do embedding capturado
  const identifyUser = useCallback(async (
    capturedData: any
  ): Promise<RecognitionResult> => {
    if (!capturedData) {
      return {
        success: false,
        method: 'no_embedding'
      };
    }

    setIsLoading(true);
    setError(null);

    try {
      if (isStrictProduction()) {
        const blockers = getBiometricRuntimeBlockers();
        return {
          success: false,
          method: 'server_biometric_required',
          securityBlock: true,
          message: [
            'Reconhecimento biometrico client-side bloqueado em producao.',
            blockers.join(' ')
          ].filter(Boolean).join(' ')
        };
      }

      // ✅ EXTRAIR EMBEDDING SE FOR BLOB, SENÃO USAR DIRETO
      let capturedEmbedding = capturedData;
      
      if (capturedData instanceof Blob) {
        console.log('🔍 Detectado Blob - extraindo embedding...');
        capturedEmbedding = await optimizedFaceRecognition.processImageForRecognition(capturedData);
        
        if (!capturedEmbedding) {
          console.warn('⚠️ Não foi possível extrair embedding do Blob');
          return {
            success: false,
            method: 'no_face_detected'
          };
        }
        
        console.log('✅ Embedding extraído do Blob:', {
          hasDescriptor: !!capturedEmbedding.descriptor,
          descriptorLength: capturedEmbedding.descriptor?.length,
          confidence: capturedEmbedding.confidence
        });
      } else if (capturedData && capturedData.descriptor) {
        console.log('✅ Embedding já processado recebido - usando direto:', {
          hasDescriptor: !!capturedData.descriptor,
          descriptorLength: capturedData.descriptor?.length,
          structure: Object.keys(capturedData),
          isFromCapture: true
        });
        capturedEmbedding = capturedData;
      } else {
        console.error('❌ Dados de captura inválidos:', {
          isBlob: capturedData instanceof Blob,
          hasDescriptor: !!(capturedData && capturedData.descriptor),
          type: typeof capturedData,
          keys: capturedData ? Object.keys(capturedData) : 'none'
        });
        return {
          success: false,
          method: 'invalid_data_format'
        };
      }

      // Garantir que o cache está atualizado
      await refreshCache();

      const cachedUsers = cacheRef.current.getAll();
      
      // ✅ VERIFICAÇÃO CRÍTICA: Verificar se Face API está pronto
      if (!optimizedFaceRecognition || !optimizedFaceRecognition.isReady()) {
        console.warn('⚠️ Face API não está pronto, tentando inicializar...');
        try {
          await optimizedFaceRecognition.initialize();
        } catch (initError) {
          console.error('❌ Erro ao inicializar Face API:', initError);
          return {
            success: false,
            method: 'face_api_not_ready'
          };
        }
      }
      
      if (cachedUsers.length === 0) {
        console.warn('⚠️ Nenhum usuário encontrado no cache');
        return {
          success: false,
          method: 'no_users_found'
        };
      }

      console.log(`🔍 Comparando com ${cachedUsers.length} funcionários cadastrados...`);

      // Comparar embedding com todos os usuários
      const comparisons = await Promise.all(
        cachedUsers.map(async (user) => {
          try {
            const capturedNormalized: OptimizedFaceEmbedding = {
              descriptor: capturedEmbedding.descriptor instanceof Float32Array
                ? capturedEmbedding.descriptor
                : new Float32Array(capturedEmbedding.descriptor ?? []),
              confidence: capturedEmbedding.confidence ?? 0.95,
              timestamp: capturedEmbedding.timestamp ?? Date.now(),
              method: capturedEmbedding.method ?? 'captured'
            };

            const storedNormalized: OptimizedFaceEmbedding = {
              descriptor: user.embedding.descriptor instanceof Float32Array
                ? user.embedding.descriptor
                : new Float32Array(user.embedding.descriptor ?? []),
              confidence: user.embedding.confidence ?? user.confidence ?? 0.95,
              timestamp: user.embedding.timestamp ?? Date.now(),
              method: user.embedding.method ?? 'stored'
            };

            if (storedNormalized.descriptor.length === 0 || capturedNormalized.descriptor.length === 0) {
              console.warn(`⚠️ Embedding inválido para usuário ${user.id}`);
              return {
                userId: user.id,
                userName: user.name,
                similarity: 0,
                confidence: 0
              };
            }

            // Usar o sistema atual de comparação
            console.log(`🔍 Comparando com ${user.name}:`, {
              capturedEmbeddingType: typeof capturedEmbedding,
              capturedEmbeddingKeys: Object.keys(capturedEmbedding || {}),
              userEmbeddingType: typeof user.embedding,
              hasCapturedDescriptor: !!capturedEmbedding?.descriptor,
              hasUserDescriptor: !!user.embedding?.descriptor || user.embedding?.descriptor?.length > 0,
              capturedDescriptorLength: capturedNormalized.descriptor.length,
              userDescriptorLength: storedNormalized.descriptor.length
            });
            
            const similarity = optimizedFaceRecognition.compareFaces(
              capturedNormalized,
              storedNormalized
            );

            console.log(`👤 ${user.name}: ${Math.round(similarity * 100)}% similaridade`);

            return {
              userId: user.id,
              userName: user.name,
              similarity: similarity,
              confidence: user.confidence
            };
          } catch (err) {
            console.warn(`⚠️ Erro ao comparar com usuário ${user.id}:`, err);
            return {
              userId: user.id,
              userName: user.name,
              similarity: 0,
              confidence: 0
            };
          }
        })
      );

      // Ordenar por similaridade
      const sortedCandidates = comparisons
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5); // Top 5 candidatos

      const bestMatch = sortedCandidates[0];
      const secondBest = sortedCandidates[1];

      const SECURITY_THRESHOLDS = {
        MATCH: BIOMETRIC_POLICY.minSimilarity,
        REVIEW_MIN: BIOMETRIC_POLICY.reviewSimilarity,
        MIN_CONFIDENCE: BIOMETRIC_POLICY.minConfidence,
        MIN_CANDIDATE_MARGIN: BIOMETRIC_POLICY.minCandidateMargin
      };

      const threshold = SECURITY_THRESHOLDS.MATCH;
      console.log(`🎯 Threshold unico de seguranca: ${Math.round(threshold * 100)}%`);

      if (bestMatch.confidence < SECURITY_THRESHOLDS.MIN_CONFIDENCE) {
        console.warn('🚨 Confiança insuficiente no cadastro/captura facial');
        return {
          success: false,
          method: 'low_confidence',
          similarity: bestMatch.similarity,
          confidence: bestMatch.confidence,
          securityBlock: true,
          securityAlert: `Confianca insuficiente (${Math.round(bestMatch.confidence * 100)}%)`
        };
      }

      // Verificar ambiguidade (diferença muito pequena entre primeiro e segundo)
      if (
        secondBest &&
        (bestMatch.similarity - secondBest.similarity) < SECURITY_THRESHOLDS.MIN_CANDIDATE_MARGIN
      ) {
        console.warn('⚠️ Resultado ambíguo entre candidatos');
        return {
          success: false,
          method: 'ambiguous_match',
          candidates: sortedCandidates.slice(0, 3),
          similarity: bestMatch.similarity
        };
      }

      // 🎯 SISTEMA DE REVISÃO OTIMIZADO para casos próximos do threshold
      const isInReviewRange = bestMatch.similarity >= SECURITY_THRESHOLDS.REVIEW_MIN && 
                              bestMatch.similarity < threshold; // ✅ Usar threshold dinâmico

      // 🚨 VALIDAÇÃO INTELIGENTE DE SEGURANÇA
      const isSecureMatch = bestMatch.similarity >= threshold && 
                           bestMatch.userId && 
                           bestMatch.userName && 
                           !bestMatch.userName.includes('Sem Nome') &&
                           !bestMatch.userName.includes('Funcionário') &&
                           bestMatch.userName.length > 2; // Nome real
      
      // 🚨 LOG DETALHADO DA VALIDAÇÃO
      console.log('🔒 VALIDAÇÃO DE SEGURANÇA DETALHADA:', {
        similarity: Math.round(bestMatch.similarity * 100),
        threshold: Math.round(threshold * 100),
        passesThreshold: bestMatch.similarity >= threshold,
        hasUserId: !!bestMatch.userId,
        hasUserName: !!bestMatch.userName,
        userName: bestMatch.userName,
        isValidName: bestMatch.userName && !bestMatch.userName.includes('Sem Nome') && !bestMatch.userName.includes('Funcionário'),
        finalDecision: isSecureMatch ? 'APROVADO' : 'NEGADO',
        cachedUsersCount: cachedUsers.length
      });

      if (isSecureMatch) {
        console.log(`✅ Funcionário SEGURAMENTE identificado: ${bestMatch.userName} (${Math.round(bestMatch.similarity * 100)}%)`);
        
        // Atualizar cache do funcionário usado
        const user = cacheRef.current.get(bestMatch.userId);
        if (user) {
          cacheRef.current.set(bestMatch.userId, {
            ...user,
            lastUsed: Date.now()
          });
        }

        return {
          success: true,
          userId: bestMatch.userId,
          userName: bestMatch.userName,
          similarity: bestMatch.similarity,
          confidence: bestMatch.confidence,
          method: 'multi_user_recognition',
          candidates: sortedCandidates
        };
      } else if (isInReviewRange) {
        // 🚨 CASO BORDERLINE: BLOQUEADO POR SEGURANÇA - Criar registro para revisão administrativa
        console.warn(`🚨 ACESSO NEGADO - Reconhecimento borderline: ${bestMatch.userName} (${Math.round(bestMatch.similarity * 100)}%) - BLOQUEADO por segurança`);
        console.warn(`🔒 THRESHOLD MÍNIMO: ${Math.round(threshold * 100)}% | OBTIDO: ${Math.round(bestMatch.similarity * 100)}%`);
        
        // Atualizar cache também para casos de revisão
        const user = cacheRef.current.get(bestMatch.userId);
        if (user) {
          cacheRef.current.set(bestMatch.userId, {
            ...user,
            lastUsed: Date.now()
          });
        }

        // ✅ TEMPORARIAMENTE DESABILITADO: Criar registro de revisão
        // TODO: Configurar permissões do Firebase para a coleção review_records
        try {
          console.log('📋 Registro de revisão seria criado para:', {
            employeeId: bestMatch.userId,
            employeeName: bestMatch.userName,
            similarity: Math.round(bestMatch.similarity * 100),
            threshold: Math.round(threshold * 100)
          });
          // await createReviewRecord(...) - Desabilitado temporariamente
        } catch (reviewError) {
          console.warn('⚠️ Erro ao criar registro de revisão:', reviewError);
        }

        return {
          success: false, // 🚨 CORREÇÃO CRÍTICA: NÃO permitir acesso para casos de revisão
          userId: bestMatch.userId,
          userName: bestMatch.userName,
          similarity: bestMatch.similarity,
          confidence: bestMatch.confidence,
          method: 'multi_user_recognition_review',
          candidates: sortedCandidates,
          requiresReview: true, // ✅ Flag para indicar revisão necessária
          reviewReason: `Similaridade ${Math.round(bestMatch.similarity * 100)}% insuficiente - requer revisão administrativa`,
          securityBlock: true // 🚨 Flag de bloqueio de segurança
        };
      } else {
        // 🎯 ANÁLISE OTIMIZADA: Verificar casos que requerem atenção (mas não bloquear desnecessariamente)
        if (bestMatch.similarity > 0.30 && bestMatch.similarity < SECURITY_THRESHOLDS.REVIEW_MIN) {
          console.warn(`⚠️ Similaridade baixa mas detectável: ${bestMatch.userName} (${Math.round(bestMatch.similarity * 100)}%)`);
          console.warn(`ℹ️ Threshold atual: ${Math.round(threshold * 100)}% - Funcionário não identificado`);
          console.warn(`💡 Sugestão: Verificar qualidade da captura ou recadastrar embedding facial`);
        }
        
        console.log(`❌ Nenhum funcionário identificado. Melhor match: ${Math.round(bestMatch.similarity * 100)}% (threshold otimizado: ${Math.round(threshold * 100)}%)`);
        
        return {
          success: false,
          method: 'below_threshold',
          similarity: bestMatch.similarity,
          bestCandidate: bestMatch.userName,
          candidates: sortedCandidates.slice(0, 3),
          suggestion: bestMatch.similarity > 0.35 
            ? `${bestMatch.userName} próximo do threshold (${Math.round(bestMatch.similarity * 100)}%) - tente melhor posicionamento`
            : 'Posicionamento ou iluminação inadequados'
        };
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      console.error('❌ Erro na identificação multi-usuário:', err);
      
      // ✅ ERRO ESPECÍFICO DO FACE API
      if (errorMessage.includes('Face API') || errorMessage.includes('reconhecimento facial')) {
        return {
          success: false,
          method: 'face_api_error'
        };
      }
      
      return {
        success: false,
        method: 'error'
      };
    } finally {
      setIsLoading(false);
    }
  }, [refreshCache]);

  // Carregar cache inicial
  useEffect(() => {
    loadUsersToCache().catch((err) => {
      setError('Erro ao carregar usuários cadastrados');
      console.error('❌ Erro inicial:', err);
    });
  }, [loadUsersToCache]);

  return {
    identifyUser,
    isLoading,
    error,
    cachedUsers: cacheRef.current.size(),
    refreshCache
  };
}
