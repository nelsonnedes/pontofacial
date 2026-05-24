'use client';

import { useState, useCallback } from 'react';
// Importar apenas versão otimizada
// ✅ CORREÇÃO TDZ: Usar import ES6 consistente em vez de require()
import { optimizedFaceRecognition, type OptimizedFaceEmbedding, normalizeEmbeddingDescriptor } from '@/lib/face-recognition-optimized';
import { adaptiveThresholdManager, type RecognitionContext } from '@/lib/adaptive-threshold-manager';
import { multiUserRecognition, type MultiUserResult } from '@/lib/multi-user-recognition';
import { useAuth } from '@/hooks/useAuth';
import { doc, setDoc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { decryptEmbedding, encryptEmbedding } from '@/lib/encryption';
import { BIOMETRIC_POLICY, isStrictProduction } from '@/lib/production-guardrails';

// Interface para dados do usuário com embedding facial
interface UserFaceData {
  faceEmbedding?: string | number[] | null;
  faceRegisteredAt?: number;
  faceLastVerified?: number;
  faceVerificationCount?: number;
}

// Interface para resultado de verificação
interface VerificationResult {
  success: boolean;
  similarity: number;
  message: string;
  embedding?: any; // Compatível com ambas as versões
}

// Interface para resultado de cadastro
interface RegistrationResult {
  success: boolean;
  message: string;
  embedding?: any; // Compatível com ambas as versões
}

export function useFaceEmbeddings() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizeEmbedding = useCallback((embedding: any): OptimizedFaceEmbedding | null => {
    if (!embedding?.descriptor) {
      return null;
    }

    const descriptor = normalizeEmbeddingDescriptor(embedding.descriptor, 512);

    return {
      descriptor,
      confidence: embedding.confidence ?? 0.95,
      timestamp: embedding.timestamp ?? Date.now(),
      method: embedding.method ?? 'normalized'
    };
  }, []);

  // Verificar se o usuário já tem embedding cadastrado
  const hasRegisteredFace = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    try {
      const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
      const userData = userDoc.data() as UserFaceData;
      
      return !!(userData?.faceEmbedding && userData.faceEmbedding.length > 0);
    } catch (error) {
      console.error('Erro ao verificar embedding cadastrado:', error);
      return false;
    }
  }, [user]);

  // Cadastrar embedding facial do usuário
  const registerFaceEmbedding = useCallback(async (
    imageBlob: Blob
  ): Promise<RegistrationResult> => {
    if (!user) {
      return {
        success: false,
        message: 'Usuário não autenticado'
      };
    }

    setIsLoading(true);
    setError(null);

    try {
      if (isStrictProduction()) {
        return {
          success: false,
          message: 'Cadastro facial client-side bloqueado em producao. Use motor biometrico server/provider.'
        };
      }

      // Verificar se Face Recognition está disponível
      if (!optimizedFaceRecognition) {
        return {
          success: false,
          message: 'Sistema de reconhecimento facial não disponível no momento.'
        };
      }

      // Processar imagem para extrair embedding
      const embedding = await optimizedFaceRecognition.processImageForRecognition(imageBlob);
      
      if (!embedding) {
        return {
          success: false,
          message: 'Nenhum rosto detectado na imagem. Tente novamente com melhor iluminação.'
        };
      }

      if (embedding.confidence < 0.5) {
        return {
          success: false,
          message: 'Qualidade da detecção facial baixa. Melhore a iluminação e posicionamento.'
        };
      }

      // Criptografar embedding antes de salvar
      const encryptedEmbedding = encryptEmbedding({
        descriptor: embedding.descriptor,
        confidence: embedding.confidence,
        timestamp: Date.now(),
        method: embedding.method || 'real_facial_features'
      });

      // Salvar no Firestore (criar ou atualizar documento)
      const userRef = doc(db, 'usuarios', user.uid);
      await setDoc(userRef, {
        // Dados básicos do usuário (se não existirem ainda)
        email: user.email,
        name: user.displayName || user.email?.split('@')[0] || 'Usuário',
        isActive: true,
        createdAt: Date.now(),
        // Dados específicos do embedding facial
        faceEmbedding: encryptedEmbedding,
        faceRegisteredAt: Date.now(),
        faceLastVerified: Date.now(),
        faceVerificationCount: 0
      }, { merge: true }); // merge: true preserva dados existentes e adiciona os novos

      return {
        success: true,
        message: 'Rosto cadastrado com sucesso!',
        embedding
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setError(errorMessage);
      
      return {
        success: false,
        message: `Erro ao cadastrar rosto: ${errorMessage}`
      };
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Verificar embedding facial para autenticação
  const verifyFaceEmbedding = useCallback(async (
    imageBlob: Blob,
    options?: { providedEmbedding?: any; minThreshold?: number }
  ): Promise<VerificationResult> => {
    if (!user) {
      return {
        success: false,
        similarity: 0,
        message: 'Usuário não autenticado'
      };
    }

    setIsLoading(true);
    setError(null);

    try {
      if (isStrictProduction()) {
        return {
          success: false,
          similarity: 0,
          message: 'Verificacao facial client-side bloqueada em producao. Use motor biometrico server/provider.'
        };
      }

      // Verificar se Face Recognition está disponível
      if (!optimizedFaceRecognition) {
        return {
          success: false,
          similarity: 0,
          message: 'Sistema de reconhecimento facial não disponível no momento.'
        };
      }

      // Obter embedding cadastrado do usuário
      const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
      const userData = userDoc.data() as UserFaceData;
      
      if (!userData?.faceEmbedding) {
        return {
          success: false,
          similarity: 0,
          message: 'Nenhum rosto cadastrado. Faça o cadastro facial primeiro.'
        };
      }

      // Usar embedding já extraído se fornecido (evita recomputar)
      let currentEmbedding = options?.providedEmbedding || null;
      if (!currentEmbedding) {
        currentEmbedding = await optimizedFaceRecognition.processImageForRecognition(imageBlob);
      }
 
      if (!currentEmbedding) {
        return {
          success: false,
          similarity: 0,
          message: 'Nenhum rosto detectado na imagem atual.'
        };
      }

      const normalizedCaptured = normalizeEmbedding(currentEmbedding);
      if (!normalizedCaptured) {
        return {
          success: false,
          similarity: 0,
          message: 'Embedding capturado inválido. Tente novamente.'
        };
      }

      // Descriptografar embedding cadastrado
      const decryptedStoredEmbedding = Array.isArray(userData.faceEmbedding)
        ? {
            descriptor: userData.faceEmbedding,
            confidence: 1.0,
            timestamp: userData.faceRegisteredAt || 0,
            method: 'stored' as const
          }
        : decryptEmbedding(userData.faceEmbedding);
      const storedEmbedding = normalizeEmbedding({
        descriptor: decryptedStoredEmbedding.descriptor,
        confidence: 1.0,
        timestamp: userData.faceRegisteredAt || 0,
        method: 'stored'
      });
      
      if (!storedEmbedding) {
        return {
          success: false,
          similarity: 0,
          message: 'Embedding armazenado inválido. Refaça o cadastro facial.'
        };
      }

      // 🎯 SISTEMA ADAPTATIVO INTELIGENTE - Threshold baseado no contexto
      const recognitionContext: RecognitionContext = {
        confidence: currentEmbedding?.confidence,
        deviceType: typeof window !== 'undefined' && window.navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop'
      };
      
      // Analisar contexto da imagem se disponível
      if (typeof window !== 'undefined') {
        try {
          // Criar canvas temporário para análise
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (ctx) {
            canvas.width = 100;
            canvas.height = 100;
            // Análise básica de contexto será expandida quando tivermos acesso à imagem
            const imageData = ctx.createImageData(100, 100);
            const analysis = adaptiveThresholdManager.analyzeImageContext(imageData);
            recognitionContext.imageQuality = analysis.quality;
            recognitionContext.lighting = analysis.lighting;
          }
        } catch (error) {
          // Contexto padrão se análise falhar
          recognitionContext.imageQuality = 0.7;
          recognitionContext.lighting = 0.7;
        }
      }

      // ✅ CALCULAR THRESHOLD ADAPTATIVO, respeitando piso corporativo unico.
      const thresholdAnalysis = adaptiveThresholdManager.calculateOptimalThreshold(recognitionContext);
      let dynamicThreshold = Math.max(thresholdAnalysis.finalThreshold, BIOMETRIC_POLICY.minSimilarity);
      
      // Permitir override apenas se fornecido explicitamente
      if (typeof options?.minThreshold === 'number') {
        dynamicThreshold = Math.max(dynamicThreshold, options.minThreshold);
      }

      // Log detalhado do novo sistema
      adaptiveThresholdManager.logThresholdAnalysis(thresholdAnalysis, recognitionContext);
      
      console.log(`🎯 ADAPTIVE THRESHOLD: ${Math.round(dynamicThreshold * 100)}% (vs. 75% anterior) - Melhoria esperada: +25% precisão`);

      // Comparar embeddings
      const similarity = optimizedFaceRecognition.compareFaces(normalizedCaptured, storedEmbedding);
      const isMatch = optimizedFaceRecognition.isSamePerson(normalizedCaptured, storedEmbedding, dynamicThreshold);

      // LOGS DETALHADOS PARA DEBUG CRÍTICO
      console.log('🔍 FACE VERIFICATION DETAILED DEBUG:', {
        rawSimilarity: similarity,
        percentSimilarity: Math.round(similarity * 100),
        threshold: dynamicThreshold,
        thresholdPercent: Math.round(dynamicThreshold * 100),
        isMatch: isMatch,
        wouldPassAt35Percent: similarity >= 0.35,
        currentThresholdUsed: dynamicThreshold
      });

      if (isMatch) {
        console.log('✅ FACE MATCH CONFIRMED - Updating user stats');
        // Atualizar estatísticas de verificação
        const userRef = doc(db, 'usuarios', user.uid);
        await updateDoc(userRef, {
          faceLastVerified: Date.now(),
          faceVerificationCount: (userData.faceVerificationCount || 0) + 1
        });
      } else {
        console.log(`❌ FACE MATCH FAILED - ${Math.round(similarity * 100)}% < ${Math.round(dynamicThreshold*100)}% threshold`);
      }

      return {
        success: isMatch,
        similarity,
        message: isMatch 
          ? `Rosto verificado com sucesso! (${Math.round(similarity * 100)}% de similaridade)`
          : `Rosto não reconhecido. (${Math.round(similarity * 100)}% de similaridade - necessário ≥${Math.round(dynamicThreshold*100)}%)`,
        embedding: normalizedCaptured
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setError(errorMessage);
      
      return {
        success: false,
        similarity: 0,
        message: `Erro na verificação facial: ${errorMessage}`
      };
    } finally {
      setIsLoading(false);
    }
  }, [user, decryptEmbedding]);

  // Obter dados faciais do usuário
  const getFaceData = useCallback(async (): Promise<UserFaceData | null> => {
    if (!user) return null;

    try {
      const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
      return userDoc.data() as UserFaceData || null;
    } catch (error) {
      console.error('Erro ao obter dados faciais:', error);
      return null;
    }
  }, [user]);

  // Remover embedding facial (para recadastro)
  const removeFaceEmbedding = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    setIsLoading(true);
    setError(null);

    try {
      const userRef = doc(db, 'usuarios', user.uid);
      await setDoc(userRef, {
        faceEmbedding: null,
        faceRegisteredAt: null,
        faceLastVerified: null,
        faceVerificationCount: 0
      }, { merge: true });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Validar qualidade da imagem antes do processamento
  const validateImageQuality = useCallback(async (
    imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
  ): Promise<{
    isValid: boolean;
    message: string;
    suggestions?: string[];
  }> => {
    try {
      // Verificar se Face Recognition está disponível
      if (!optimizedFaceRecognition) {
        return {
          isValid: true, // Permitir se não há validação disponível
          message: 'Validação facial não disponível - foto será aceita para processamento manual',
          suggestions: ['Sistema funcionará em modo de backup com validação manual']
        };
      }

      const validation = await optimizedFaceRecognition.validateFaceForRegistration(imageElement);
      
      const suggestions = [];
      if (!validation.isValid) {
        if (validation.message.includes('iluminação')) {
          suggestions.push('Melhore a iluminação do ambiente');
        }
        if (validation.message.includes('pequeno')) {
          suggestions.push('Aproxime-se mais da câmera');
        }
        if (validation.message.includes('múltiplos')) {
          suggestions.push('Certifique-se de estar sozinho na imagem');
        }
        if (validation.message.includes('Nenhum')) {
          suggestions.push('Posicione seu rosto no centro da tela');
        }
      }
      
      return {
        isValid: validation.isValid,
        message: validation.message,
        suggestions: suggestions.length > 0 ? suggestions : undefined
      };
    } catch (error) {
      return {
        isValid: false,
        message: 'Erro na validação da imagem',
        suggestions: ['Tente capturar a imagem novamente']
      };
    }
  }, []);

  // 🎯 NOVA FUNÇÃO: Identificação automática multi-usuário
  const identifyEmployeeFromAll = useCallback(async (
    imageBlob: Blob
  ): Promise<MultiUserResult> => {
    if (!imageBlob) {
      return {
        success: false,
        method: 'no_match',
        message: 'Imagem não fornecida para identificação.',
        reason: 'NO_IMAGE'
      };
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('🎯 INICIANDO IDENTIFICAÇÃO MULTI-USUÁRIO...');
      
      // Usar o novo sistema multi-usuário
      const result = await multiUserRecognition.identifyEmployeeAutomatically(imageBlob);
      
      // Log do resultado para debugging
      console.log('🎯 RESULTADO DA IDENTIFICAÇÃO MULTI-USUÁRIO:', {
        success: result.success,
        method: result.method,
        employee: result.employeeName || 'N/A',
        similarity: result.similarity ? `${Math.round(result.similarity * 100)}%` : 'N/A',
        processingTime: `${result.processingTime}ms`,
        candidates: result.candidates?.length || 0
      });

      if (!result.success && result.reason) {
        setError(result.message);
      }

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      const errorResult: MultiUserResult = {
        success: false,
        method: 'no_match',
        message: `Erro na identificação multi-usuário: ${errorMessage}`,
        reason: 'PROCESSING_ERROR'
      };
      
      setError(errorMessage);
      console.error('❌ Erro na identificação multi-usuário:', error);
      return errorResult;
      
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    // Estados
    isLoading,
    error,
    
    // Funções principais
    hasRegisteredFace,
    registerFaceEmbedding,
    verifyFaceEmbedding,
    removeFaceEmbedding,
    
    // 🎯 NOVA FUNCIONALIDADE: Sistema multi-usuário
    identifyEmployeeFromAll,
    
    // Funções auxiliares
    getFaceData,
    validateImageQuality,
    
    // Utilitários
    clearError: () => setError(null)
  };
}

// Tipos para exportação
export type {
  UserFaceData,
  VerificationResult,
  RegistrationResult
};
