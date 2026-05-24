'use client';

import { useState, useCallback, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { optimizedFaceRecognition } from '@/lib/face-recognition-optimized';
import { useMultiUserRecognition } from '@/hooks/useMultiUserRecognition';

interface VerificationResult {
  success: boolean;
  employeeId?: string;
  employeeData?: any;
  message: string;
  similarity?: number;
  retryable?: boolean;
  bestCandidate?: string;
  candidates?: Array<{
    userId: string;
    userName: string;
    similarity: number;
  }>;
}

export function useInitialFaceVerification() {
  const { identifyUser, refreshCache } = useMultiUserRecognition();
  const [isLoading] = useState(false);
  const [error, setError] = useState<string>('');
  
  // Estados da câmera
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [countdown, setCountdown] = useState(4); // ✅ Otimizado para 4s (verificação inicial)
  const [isCapturing, setIsCapturing] = useState(false);
  const [stage, setStage] = useState<'loading' | 'instructions' | 'positioning' | 'verifying' | 'success' | 'not_found' | 'error'>('loading');
  
  // Sistema de tentativas
  const MAX_ATTEMPTS = 3;
  const [attemptCount, setAttemptCount] = useState(0);
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ✅ INICIALIZAR SISTEMA - SEM DEPENDÊNCIA CIRCULAR
  const initializeSystem = useCallback(async (): Promise<boolean> => {
    try {
      console.log('🔄 Inicializando sistema de verificação facial...');
      
      if (!optimizedFaceRecognition.isReady()) {
        await optimizedFaceRecognition.initialize();
      }
      
      console.log('✅ Sistema de verificação inicializado');
      return true;
    } catch (error) {
      console.error('❌ Erro ao inicializar sistema:', error);
      setError('Erro ao carregar sistema de reconhecimento facial');
      return false;
    }
  }, []);

  // ✅ INICIALIZAR CÂMERA
  const initializeCamera = useCallback(async (): Promise<boolean> => {
    try {
      console.log('🎥 Inicializando câmera para verificação...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { min: 640, ideal: 640, max: 640 }, // ✅ COMPATÍVEL: Zoom 1x fixo
          height: { min: 480, ideal: 480, max: 480 }, // ✅ COMPATÍVEL: Zoom 1x fixo
          facingMode: 'user'
        }
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        
        await videoRef.current.play();
        setCameraReady(true);
        setCameraError('');
        setCountdown(3);
        setIsCapturing(true);
        console.log('✅ Câmera de verificação inicializada');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Erro ao inicializar câmera:', error);
      setCameraError('Erro ao acessar a câmera');
      return false;
    }
  }, []);

  // ✅ INICIAR PROCESSO DE VERIFICAÇÃO
  const startVerification = useCallback(() => {
    setStage('positioning');
    setCountdown(3);
    setIsCapturing(false);
    setAttemptCount(0);
  }, []);

  // ✅ CAPTURAR E VERIFICAR FACE
  const performVerification = useCallback(async (): Promise<VerificationResult> => {
    if (!videoRef.current || !cameraReady) {
      return {
        success: false,
        message: 'Câmera não está pronta'
      };
    }

    try {
      setStage('verifying');
      setIsCapturing(false);

      const video = videoRef.current;
      
      // Aguardar vídeo estar pronto
      if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Video timeout')), 10000);
          const checkVideo = () => {
            if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
              clearTimeout(timeout);
              resolve(true);
            } else {
              setTimeout(checkVideo, 100);
            }
          };
          checkVideo();
        });
      }

      // Capturar frame
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const canvasWidth = video.videoWidth || 640;
      const canvasHeight = video.videoHeight || 480;
      
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      ctx?.drawImage(video, 0, 0, canvasWidth, canvasHeight);

      // Extrair embedding
      const embedding = await optimizedFaceRecognition.extractFaceEmbedding(canvas);

      if (!embedding) {
        return {
          success: false,
          message: 'Nenhuma face detectada. Ajuste iluminação e posicionamento.',
          retryable: true
        };
      }

      await refreshCache(true);
      const result = await identifyUser(embedding);

      if (result.success && result.userId) {
        const employeeDoc = await getDoc(doc(db, 'employees', result.userId));
        const employeeData = employeeDoc.exists()
          ? employeeDoc.data()
          : {
              nomeCompleto: result.userName || 'Funcionário identificado',
              cargo: 'Funcionário'
            };

        console.log(`✅ Funcionário identificado: ${employeeData.nomeCompleto || result.userName} (${Math.round((result.similarity || 0) * 100)}%)`);
        
        return {
          success: true,
          employeeId: result.userId,
          employeeData,
          similarity: result.similarity,
          candidates: result.candidates,
          message: `Funcionário identificado: ${employeeData.nomeCompleto || result.userName}`
        };
      }

      const topCandidate = result.candidates?.[0];
      const bestCandidate = result.bestCandidate || topCandidate?.userName;
      const similarity = result.similarity ?? topCandidate?.similarity;
      const message = result.securityBlock
        ? result.reviewReason || 'Reconhecimento bloqueado por segurança.'
        : result.suggestion || (
            bestCandidate && typeof similarity === 'number'
              ? `${bestCandidate} foi o candidato mais próximo (${Math.round(similarity * 100)}%), mas não houve confiança suficiente.`
              : result.method === 'no_users_found'
                ? 'Nenhum funcionário com cadastro facial foi encontrado.'
                : 'Não foi possível identificar o funcionário com segurança.'
          );

      return {
        success: false,
        message,
        similarity,
        bestCandidate,
        candidates: result.candidates,
        retryable: result.method !== 'no_users_found'
      };

    } catch (error: any) {
      console.error('❌ Erro na verificação:', error);
      return {
        success: false,
        message: `Erro na verificação: ${error.message}`,
        retryable: true
      };
    }
  }, [identifyUser, refreshCache, cameraReady]);

  // ✅ TENTAR NOVAMENTE
  const retry = useCallback(() => {
    if (attemptCount < MAX_ATTEMPTS) {
      setAttemptCount(prev => prev + 1);
      setStage('positioning');
      setCountdown(3);
      setIsCapturing(true);
    } else {
      setStage('error');
      setError('Número máximo de tentativas atingido');
    }
  }, [attemptCount]);

  // ✅ LIMPAR RECURSOS
  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, []);

  return {
    // Estados
    isLoading,
    error,
    cameraReady,
    cameraError,
    countdown,
    isCapturing,
    stage,
    attemptCount,
    videoRef,
    
    // Ações
    initializeSystem,
    initializeCamera,
    startVerification,
    performVerification,
    retry,
    cleanup,
    
    // Setters
    setStage,
    setCountdown,
    setError
  };
}
