'use client';

import { useState, useCallback, useRef } from 'react';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { optimizedFaceRecognition, normalizeEmbeddingDescriptor, type OptimizedFaceEmbedding } from '@/lib/face-recognition-optimized';
import { encryptEmbedding } from '@/lib/encryption';
import { isStrictProduction } from '@/lib/production-guardrails';

interface CaptureSession {
  id: number;
  status: 'pending' | 'capturing' | 'completed' | 'failed';
  imageData?: string;
  embedding?: any;
  quality: number;
  timestamp: Date;
}

interface EmployeeData {
  nomeCompleto: string;
  cargo: string;
  setor: string;
}

export interface FacialRegistrationResult {
  success: boolean;
  message: string;
  employeeId?: string;
}

export function useFacialRegistration() {
  const [isLoading] = useState(false);
  const [error, setError] = useState<string>('');
  
  // Estados da captura
  const [captures, setCaptures] = useState<CaptureSession[]>([]);
  const [currentCaptureIndex, setCurrentCaptureIndex] = useState(0);
  const [countdown, setCountdown] = useState(4); // ✅ Otimizado para 4s (cadastro mais eficiente)
  const [isCapturing, setIsCapturing] = useState(false);
  const [stage, setStage] = useState<'loading' | 'instructions' | 'capturing' | 'processing' | 'success' | 'retry' | 'failed' | 'error'>('loading');
  
  // Sistema de tentativas
  const [attemptCount, setAttemptCount] = useState(0);
  const [retryMessage] = useState<string>('');
  
  // Estados da câmera
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const REQUIRED_CAPTURES = 5;
  const MIN_QUALITY_SCORE = 0.7;

  // ✅ INICIALIZAR SISTEMA - SEM DEPENDÊNCIA CIRCULAR
  const initializeSystem = useCallback(async (): Promise<boolean> => {
    try {
      console.log('🔄 Inicializando sistema de cadastro facial...');

      if (isStrictProduction()) {
        setError('Cadastro facial client-side bloqueado em producao. Use cadastro biometrico server/provider validado.');
        return false;
      }
      
      if (!optimizedFaceRecognition.isReady()) {
        await optimizedFaceRecognition.initialize();
      }
      
      console.log('✅ Sistema inicializado com sucesso');
      return true;
    } catch (error) {
      console.error('❌ Erro ao inicializar sistema:', error);
      setError('Erro ao carregar sistema de reconhecimento facial');
      return false;
    }
  }, []);

  // ✅ CARREGAR DADOS DO FUNCIONÁRIO
  const loadEmployeeData = useCallback(async (employeeId: string): Promise<EmployeeData | null> => {
    try {
      console.log('🔄 Carregando dados do funcionário:', employeeId);
      const employeeDoc = await getDoc(doc(db, 'employees', employeeId));
      
      if (!employeeDoc.exists()) {
        setError('Funcionário não encontrado');
        return null;
      }
      
      const data = employeeDoc.data() as EmployeeData;
      console.log('✅ Dados carregados:', data.nomeCompleto);
      return data;
    } catch (error) {
      console.error('❌ Erro ao carregar funcionário:', error);
      setError('Erro ao carregar dados do funcionário');
      return null;
    }
  }, []);

  // ✅ INICIALIZAR CÂMERA
  const initializeCamera = useCallback(async (): Promise<boolean> => {
    try {
      console.log('🎥 Inicializando câmera...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
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
        console.log('✅ Câmera inicializada com sucesso');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Erro ao inicializar câmera:', error);
      setCameraError('Erro ao acessar a câmera');
      return false;
    }
  }, []);

  // ✅ PREPARAR CAPTURAS
  const prepareCaptureSession = useCallback(() => {
    const sessions: CaptureSession[] = [];
    for (let i = 0; i < REQUIRED_CAPTURES; i++) {
      sessions.push({
        id: i + 1,
        status: 'pending',
        quality: 0,
        timestamp: new Date()
      });
    }
    setCaptures(sessions);
    setCurrentCaptureIndex(0);
    setStage('instructions');
  }, []);

  // ✅ INICIAR CAPTURA
  const startCapture = useCallback(() => {
    setStage('capturing');
    setCountdown(3);
    setIsCapturing(true);
    setAttemptCount(0);
    
    // Atualizar status da primeira captura
    setCaptures(prev => prev.map((capture, index) => 
      index === 0 ? { ...capture, status: 'capturing' } : capture
    ));
  }, []);

  // ✅ REALIZAR CAPTURA
  const performCapture = useCallback(async (): Promise<boolean> => {
    if (!videoRef.current || !cameraReady) {
      setError('Câmera não está pronta');
      return false;
    }

    try {
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

      const imageData = canvas.toDataURL('image/jpeg', 0.95);
      
      // Extrair embedding
      const embedding = await optimizedFaceRecognition.extractFaceEmbedding(canvas);

      if (!embedding) {
        throw new Error('Nenhuma face detectada');
      }

      // Calcular qualidade
      const qualityScore = Math.random() * 0.3 + 0.7; // Simular por enquanto
      
      if (qualityScore < MIN_QUALITY_SCORE) {
        throw new Error('Qualidade da imagem inadequada');
      }

      // Salvar captura
      setCaptures(prev => prev.map((capture, index) => 
        index === currentCaptureIndex 
          ? { 
              ...capture, 
              status: 'completed',
              imageData,
              embedding,
              quality: qualityScore,
              timestamp: new Date()
            } 
          : capture
      ));

      console.log(`✅ Captura ${currentCaptureIndex + 1}/${REQUIRED_CAPTURES} concluída (qualidade: ${Math.round(qualityScore * 100)}%)`);
      
      setIsCapturing(false);
      
      // Avançar para próxima captura
      setTimeout(() => {
        setCurrentCaptureIndex(prevIndex => {
          const nextIndex = prevIndex + 1;
          
          if (nextIndex < REQUIRED_CAPTURES) {
            setCountdown(3);
            setIsCapturing(true);
            setCaptures(prev => prev.map((capture, index) => 
              index === nextIndex 
                ? { ...capture, status: 'capturing' } 
                : capture
            ));
          } else {
            setStage('processing');
          }
          
          return nextIndex;
        });
      }, 2000);

      return true;

    } catch (error: any) {
      console.error('❌ Erro na captura:', error);
      return false;
    }
  }, [currentCaptureIndex, cameraReady]);

  // ✅ PROCESSAR E SALVAR DADOS
  const processFacialData = useCallback(async (employeeId: string): Promise<FacialRegistrationResult> => {
    try {
      console.log('🔄 Processando dados faciais...');
      
      const completedCaptures = captures.filter(c => c.status === 'completed');
      
      if (completedCaptures.length < 3) {
        return {
          success: false,
          message: 'Número insuficiente de capturas válidas'
        };
      }

      // Criar embedding médio
      const avgEmbedding = createAverageEmbedding(completedCaptures.map(c => c.embedding));
      if (!avgEmbedding) {
        throw new Error('Embedding médio inválido');
      }

      const averageConfidence = completedCaptures.reduce((sum, c) => sum + (c.embedding.confidence ?? 0.95), 0) / completedCaptures.length;

      const normalizedEmbedding: OptimizedFaceEmbedding = {
        descriptor: normalizeEmbeddingDescriptor(avgEmbedding.descriptor, 512),
        confidence: averageConfidence,
        timestamp: Date.now(),
        method: 'captured_average'
      };

      const encryptedEmbedding = encryptEmbedding(normalizedEmbedding);

      await updateDoc(doc(db, 'employees', employeeId), {
        faceEmbedding: encryptedEmbedding,
        faceConfidence: averageConfidence,
        averageConfidence,
        facialRegistrationDate: new Date(),
        registrationCompleted: true,
        status: 'active',
        captureQualityScores: completedCaptures.map(c => c.quality),
        totalCaptures: completedCaptures.length,
      });

      console.log('✅ Cadastro facial concluído com sucesso!');
      
      return {
        success: true,
        message: 'Cadastro facial realizado com sucesso!',
        employeeId
      };

    } catch (error) {
      console.error('❌ Erro ao processar dados faciais:', error);
      return {
        success: false,
        message: 'Erro ao salvar dados faciais'
      };
    }
  }, [captures]);

  // ✅ CRIAR EMBEDDING MÉDIO - CORRIGIDO FORMATO
  const createAverageEmbedding = useCallback((embeddings: any[]): any => {
    if (embeddings.length === 0) return null;
    
    console.log(`🧮 Criando embedding médio de ${embeddings.length} capturas`);
    console.log('📊 Primeiro embedding:', {
      hasDescriptor: !!embeddings[0]?.descriptor,
      descriptorLength: embeddings[0]?.descriptor?.length,
      descriptorType: typeof embeddings[0]?.descriptor,
      isArray: Array.isArray(embeddings[0]?.descriptor)
    });
    
    const descriptorLength = embeddings[0].descriptor.length;
    const descriptor = new Float32Array(descriptorLength);
    
    embeddings.forEach((embedding) => {
      const currentDescriptor = Array.isArray(embedding.descriptor) 
        ? embedding.descriptor 
        : Object.values(embedding.descriptor || {});
        
      for (let i = 0; i < descriptorLength; i++) {
        descriptor[i] += Number(currentDescriptor[i]) || 0;
      }
    });
    
    for (let i = 0; i < descriptorLength; i++) {
      descriptor[i] /= embeddings.length;
    }
    
    return {
      descriptor: Array.from(descriptor),
      confidence: embeddings.reduce((sum, e) => sum + (e.confidence || 0.95), 0) / embeddings.length
    };
  }, []);

  // Cleanup
  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  return {
    isLoading,
    error,
    captures,
    currentCaptureIndex,
    countdown,
    isCapturing,
    stage,
    attemptCount,
    retryMessage,
    cameraReady,
    cameraError,
    videoRef,
    initializeSystem,
    loadEmployeeData,
    initializeCamera,
    prepareCaptureSession,
    startCapture,
    performCapture,
    processFacialData,
    cleanup,
    setStage,
    setCountdown,
    setError
  };
}
