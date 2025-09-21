'use client';

import { useState, useCallback } from 'react';
// Importar apenas versão otimizada
let optimizedFaceRecognition: any = null;

if (typeof window !== 'undefined') {
  try {
    const optimizedModule = require('@/lib/face-recognition-optimized');
    optimizedFaceRecognition = optimizedModule.optimizedFaceRecognition;
    console.log('✅ useFaceEmbeddings usando versão otimizada');
  } catch (error) {
    console.warn('⚠️ Face Recognition otimizado não disponível:', error);
  }
}
import { useAuth } from '@/hooks/useAuth';
import { doc, setDoc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Interface para dados do usuário com embedding facial
interface UserFaceData {
  faceEmbedding?: number[];
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

  // Função para criptografar embedding (simples XOR para demonstração)
  const encryptEmbedding = useCallback((embedding: number[]): number[] => {
    const key = user?.uid || 'default-key';
    const keyBytes = new TextEncoder().encode(key);
    
    return embedding.map((value, index) => {
      const keyByte = keyBytes[index % keyBytes.length];
      return value ^ (keyByte / 255); // XOR simples
    });
  }, [user?.uid]);

  // Função para descriptografar embedding
  const decryptEmbedding = useCallback((encryptedEmbedding: number[]): number[] => {
    const key = user?.uid || 'default-key';
    const keyBytes = new TextEncoder().encode(key);
    
    return encryptedEmbedding.map((value, index) => {
      const keyByte = keyBytes[index % keyBytes.length];
      return value ^ (keyByte / 255); // XOR simples
    });
  }, [user?.uid]);

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
      const encryptedEmbedding = encryptEmbedding(embedding.descriptor);

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
  }, [user, encryptEmbedding]);

  // Verificar embedding facial para autenticação
  const verifyFaceEmbedding = useCallback(async (
    imageBlob: Blob
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

      // Processar imagem atual
      const currentEmbedding = await optimizedFaceRecognition.processImageForRecognition(imageBlob);
      
      if (!currentEmbedding) {
        return {
          success: false,
          similarity: 0,
          message: 'Nenhum rosto detectado na imagem atual.'
        };
      }

      // Descriptografar embedding cadastrado
      const decryptedStoredEmbedding = decryptEmbedding(userData.faceEmbedding);
      
      // Criar objeto para comparação (compatível com ambas as versões)
      const storedEmbedding: any = {
        descriptor: decryptedStoredEmbedding,
        confidence: 1.0, // Embedding armazenado tem confiança máxima
        timestamp: userData.faceRegisteredAt || 0
      };

      // Comparar embeddings
      const similarity = optimizedFaceRecognition.compareFaces(currentEmbedding, storedEmbedding);
      const isMatch = optimizedFaceRecognition.isSamePerson(currentEmbedding, storedEmbedding);

      if (isMatch) {
        // Atualizar estatísticas de verificação
        const userRef = doc(db, 'usuarios', user.uid);
        await updateDoc(userRef, {
          faceLastVerified: Date.now(),
          faceVerificationCount: (userData.faceVerificationCount || 0) + 1
        });
      }

      return {
        success: isMatch,
        similarity,
        message: isMatch 
          ? `Rosto verificado com sucesso! (${Math.round(similarity * 100)}% de similaridade)`
          : `Rosto não reconhecido. (${Math.round(similarity * 100)}% de similaridade)`,
        embedding: currentEmbedding
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

  return {
    // Estados
    isLoading,
    error,
    
    // Funções principais
    hasRegisteredFace,
    registerFaceEmbedding,
    verifyFaceEmbedding,
    removeFaceEmbedding,
    
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