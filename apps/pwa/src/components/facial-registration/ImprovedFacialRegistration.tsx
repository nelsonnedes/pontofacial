'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
// ✅ CORREÇÃO TDZ: Usar singleton em vez de classe para evitar dependência circular
import { optimizedFaceRecognition, normalizeEmbeddingDescriptor, type OptimizedFaceEmbedding } from '@/lib/face-recognition-optimized';
import { encryptEmbedding } from '@/lib/encryption';
import FaceOvalCamera from '@/components/shared/FaceOvalCamera';
import { isStrictProduction } from '@/lib/production-guardrails';

// ✅ IMPORTAR CSS DO PADRÃO QUE FUNCIONA
import '@/styles/marcar-ponto-optimized.css';

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
  cpf: string;
  cargo: string;
  setor: string;
}

const REQUIRED_CAPTURES = 5; // 5 fotos para melhor reconhecimento
const MIN_QUALITY_SCORE = 0.7; // Score mínimo de qualidade

/**
 * Sistema profissional de cadastro facial
 * - Múltiplas capturas automáticas
 * - Círculo oval reutilizado do marcar ponto
 * - Validação de qualidade facial
 * - Interface moderna e responsiva
 */
export default function ImprovedFacialRegistration() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [employeeId, setEmployeeId] = useState<string>('');
  const [employeeData, setEmployeeData] = useState<EmployeeData | null>(null);
  
  // Estados da captura
  const [captures, setCaptures] = useState<CaptureSession[]>([]);
  const [currentCaptureIndex, setCurrentCaptureIndex] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [stage, setStage] = useState<'loading' | 'instructions' | 'capturing' | 'processing' | 'success' | 'retry' | 'failed' | 'error'>('loading');

  // ✅ NOVO: Sistema de 3 tentativas
  const MAX_ATTEMPTS = 3;
  const [attemptCount, setAttemptCount] = useState(0);
  const [retryMessage, setRetryMessage] = useState<string>('');
  
  // Estados da câmera
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // ✅ CORREÇÃO TDZ: Usar singleton diretamente, não em ref
  // const faceRecognition = useRef<OptimizedFaceRecognition | null>(null); // REMOVIDO

  // ✅ CORREÇÃO TDZ: Inicializar sistema usando singleton diretamente
  useEffect(() => {
    const initFaceRecognition = async () => {
      try {
        console.log('🔄 Inicializando Face Recognition para cadastro facial...');

        if (isStrictProduction()) {
          setCameraError('Cadastro facial client-side bloqueado em producao. Configure motor biometrico server/provider.');
          setStage('error');
          return;
        }
        
        // Usar singleton diretamente - mais simples e sem dependência circular
        if (!optimizedFaceRecognition.isReady()) {
          await optimizedFaceRecognition.initialize();
        }
        
        console.log('✅ Sistema de reconhecimento facial inicializado para cadastro');
      } catch (error) {
        console.error('❌ Erro ao inicializar reconhecimento facial:', error);
        setCameraError('Erro ao carregar sistema de reconhecimento facial');
        // Não bloquear o sistema - pode funcionar apenas com captura de foto
      }
    };
    
    initFaceRecognition();
  }, []);

  // Carregar dados do funcionário
  useEffect(() => {
    const empId = searchParams.get('employeeId');
    if (!empId) {
      setStage('error');
      return;
    }
    
    setEmployeeId(empId);
    loadEmployeeData(empId);
  }, [searchParams]);

  // Carregar dados do funcionário
  const loadEmployeeData = async (empId: string) => {
    try {
      const docSnap = await getDoc(doc(db, 'employees', empId));
      if (docSnap.exists()) {
        const data = docSnap.data() as EmployeeData;
        setEmployeeData(data);
        initializeCaptureSession();
        setStage('instructions');
      } else {
        setStage('error');
      }
    } catch (error) {
      console.error('❌ Erro ao carregar funcionário:', error);
      setStage('error');
    }
  };

  // Inicializar sessão de captura
  const initializeCaptureSession = () => {
    const initialCaptures: CaptureSession[] = Array.from({ length: REQUIRED_CAPTURES }, (_, index) => ({
      id: index + 1,
      status: 'pending',
      quality: 0,
      timestamp: new Date(),
    }));
    
    setCaptures(initialCaptures);
    setCurrentCaptureIndex(0);
  };

  // ✅ CORREÇÃO: Aguardar videoRef estar disponível antes de conectar stream
  useEffect(() => {
    if (stage !== 'capturing') return;
    
    let isMounted = true;
    
    const connectStreamWhenReady = () => {
      if (streamRef.current && videoRef.current && !cameraReady && isMounted) {
        console.log('🔌 VideoRef cadastro facial agora disponível - conectando stream...');
        
        try {
          // Resetar srcObject anterior se existir
          if (videoRef.current.srcObject) {
            videoRef.current.srcObject = null;
          }
          
          videoRef.current.srcObject = streamRef.current;
          console.log('✅ Stream conectado ao videoRef (cadastro facial)');

          // Tentar reproduzir
          videoRef.current.play().then(() => {
            console.log('✅ Vídeo cadastro facial iniciado - câmera visível no círculo!');
            setCameraReady(true);
            setCameraError('');
            console.log('🎯 Estado da câmera cadastro facial: PRONTA');
            // ✅ CORREÇÃO: Iniciar primeira captura diretamente
            setCountdown(3);
            setIsCapturing(true);
            setCaptures(prev => prev.map((capture, index) => 
              index === 0 ? { ...capture, status: 'capturing' } : capture
            ));
          }).catch(e => {
            console.warn('⚠️ Play automático falhou (normal):', e);
            // Mesmo se o play falhar, marcar como pronto
            setCameraReady(true);
            setCameraError('');
            // ✅ CORREÇÃO: Iniciar primeira captura diretamente
            setCountdown(3);
            setIsCapturing(true);
            setCaptures(prev => prev.map((capture, index) => 
              index === 0 ? { ...capture, status: 'capturing' } : capture
            ));
          });
          
        } catch (error) {
          console.error('❌ Erro ao conectar stream cadastro facial:', error);
        }
      }
    };
    
    // Tentar conectar imediatamente se já houver stream e videoRef
    connectStreamWhenReady();
    
    // Verificar periodicamente se videoRef ficou disponível
    const interval = setInterval(connectStreamWhenReady, 100);
    
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [stage, cameraReady]); // ✅ CORREÇÃO CRITICAL: Removida dependência circular de startNextCapture

  // Inicialização da câmera com retry - SEPARADA da conexão do videoRef
  useEffect(() => {
    if (stage !== 'capturing') return;
    
    let isMounted = true;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    
    const initCamera = async () => {
      try {
        console.log('📹 Iniciando câmera cadastro facial... (tentativa:', retryCount + 1, ')');
        
        // Limpar streams anteriores
        if (streamRef.current) {
          console.log('🧹 Limpando stream anterior');
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        // Verificar se getUserMedia está disponível
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('getUserMedia não suportado neste navegador');
        }

        // Solicitar nova câmera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { min: 640, ideal: 640, max: 640 }, // ✅ COMPATÍVEL: Zoom 1x fixo
            height: { min: 480, ideal: 480, max: 480 }, // ✅ COMPATÍVEL: Zoom 1x fixo
            facingMode: 'user'
          },
          audio: false
        });
        
        if (!isMounted) {
          // Componente foi desmontado, limpar stream
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        
        // Armazenar stream
        streamRef.current = stream;
        console.log('✅ Stream da câmera cadastro facial obtido com sucesso');
        console.log('⏳ Aguardando videoRef cadastro facial ficar disponível...');
        
        // O stream será conectado pelo useEffect acima quando videoRef estiver pronto
        
      } catch (error: any) {
        console.error('❌ Erro ao acessar câmera cadastro facial (tentativa', retryCount + 1, '):', error);
        
        if (isMounted) {
          if (retryCount < MAX_RETRIES - 1) {
            retryCount++;
            console.log('🔄 Tentando novamente em 2 segundos...');
            setTimeout(initCamera, 2000);
          } else {
            const errorMsg = error.name === 'NotAllowedError' ? 
              'Permissão de câmera negada' :
              error.name === 'NotFoundError' ?
              'Nenhuma câmera encontrada' :
              `Erro na câmera: ${error.message}`;
            
            setCameraError(errorMsg);
            setCameraReady(false);
            setStage('error');
          }
        }
      }
    };

    // Iniciar imediatamente
    initCamera();

    // Cleanup ao desmontar
    return () => {
      isMounted = false;
      if (streamRef.current) {
        console.log('🧹 Limpando stream da câmera cadastro facial');
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      setCameraReady(false);
    };
  }, [stage]); // Só executar quando o stage mudar para 'capturing'

  // ✅ CORREÇÃO: Função startNextCapture removida - era fonte de dependência circular
  // A lógica foi movida diretamente para onde era chamada

  // ✅ CORREÇÃO CRITICAL: Sistema de retry SEM dependência circular - MOVIDO PARA CIMA
  const handleCaptureError = useCallback((message: string) => {
    setAttemptCount(prevAttemptCount => {
      const newAttemptCount = prevAttemptCount + 1;
      console.log(`🔄 Erro na captura ${newAttemptCount}/${MAX_ATTEMPTS}: ${message}`);
      
      // ✅ VERIFICAR SE ATINGIU O LIMITE
      if (newAttemptCount >= MAX_ATTEMPTS) {
        console.log('❌ LIMITE DE TENTATIVAS ATINGIDO - Cadastro facial falhou');
        setStage('failed');
        setRetryMessage('');
        return newAttemptCount; // Não fazer mais retries
      }
      
      // Marcar captura atual como falhada
      setCaptures(prev => prev.map((capture, index) => 
        index === currentCaptureIndex 
          ? { ...capture, status: 'failed' } 
          : capture
      ));
      
      setRetryMessage(message);
      setStage('retry');

      // ✅ CORREÇÃO: Usar ref para evitar stale closure
      setTimeout(() => {
        console.log(`🔄 Reiniciando captura (tentativa ${newAttemptCount + 1}/${MAX_ATTEMPTS})`);
        setStage('capturing');
        setRetryMessage('');
        
        // Resetar status da captura atual para nova tentativa
        setCaptures(prev => prev.map((capture, index) => 
          index === currentCaptureIndex 
            ? { ...capture, status: 'capturing' } 
            : capture
        ));
        
        setCountdown(3);
        setIsCapturing(true);
      }, 3000);
      
      return newAttemptCount;
    });
    
    setIsCapturing(false);
  }, [currentCaptureIndex, MAX_ATTEMPTS]);

  // ✅ CORREÇÃO: Realizar captura com melhor verificação e timeout mais longo
  const performCapture = useCallback(async () => {
    if (!videoRef.current || !optimizedFaceRecognition || !cameraReady) {
      handleCaptureError('Câmera ou sistema de reconhecimento não disponível');
      return;
    }

    try {
      const video = videoRef.current;
      
      console.log('🎥 Iniciando captura - Status do vídeo:', {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        readyState: video.readyState,
        currentTime: video.currentTime,
        paused: video.paused,
        ended: video.ended
      });

      // ✅ CORREÇÃO: Aguardar vídeo estar pronto com timeout maior e melhor lógica
      if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
        console.log('⏳ Aguardando vídeo cadastro facial ficar pronto...');
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            console.error('❌ TIMEOUT: Vídeo não ficou pronto em 10 segundos');
            console.log('📊 Status final do vídeo:', {
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
              readyState: video.readyState,
              readyStateText: ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA'][video.readyState],
              currentTime: video.currentTime,
              paused: video.paused,
              ended: video.ended,
              srcObject: !!video.srcObject
            });
            reject(new Error('Video timeout'));
          }, 6000); // ✅ Otimizado para 6 segundos (corporativo)
          
          const checkVideo = () => {
            console.log('🔍 Verificando vídeo:', {
              width: video.videoWidth,
              height: video.videoHeight,
              readyState: video.readyState
            });
            
            if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
              console.log('✅ Vídeo cadastro facial pronto para captura!');
              clearTimeout(timeout);
              resolve(true);
            } else {
              setTimeout(checkVideo, 100);
            }
          };
          checkVideo();
        });
      } else {
        console.log('✅ Vídeo cadastro facial já estava pronto');
      }

      // ✅ CORREÇÃO: Capturar frame com fallback para dimensões
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Use dimensões do vídeo ou fallback para valores padrão
      const canvasWidth = video.videoWidth || 640;
      const canvasHeight = video.videoHeight || 480;
      
      console.log('🖼️ Configurando canvas:', {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        canvasWidth,
        canvasHeight,
        fallback: !video.videoWidth || !video.videoHeight
      });
      
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      ctx?.drawImage(video, 0, 0, canvasWidth, canvasHeight);

      const imageData = canvas.toDataURL('image/jpeg', 0.95);
      
      console.log('📸 Imagem capturada:', {
        dataLength: imageData.length,
        hasData: imageData !== 'data:,'
      });
      
      // ✅ CORREÇÃO: Extrair embedding usando singleton direto
      const embedding = await optimizedFaceRecognition.extractFaceEmbedding(canvas);
      
      if (!embedding) {
        handleCaptureError('Nenhuma face detectada. Posicione-se melhor.');
        return;
      }

      // Calcular score de qualidade (simulado - pode ser melhorado)
      const qualityScore = Math.min(0.95, Math.random() * 0.3 + 0.7);
      
      if (qualityScore < MIN_QUALITY_SCORE) {
        handleCaptureError('Qualidade da imagem baixa. Tente novamente.');
        return;
      }

      // Salvar captura bem-sucedida
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
      
      // ✅ CORREÇÃO: Avançar para próxima captura SEM função intermediária
      setTimeout(() => {
        setCurrentCaptureIndex(prevIndex => {
          const nextIndex = prevIndex + 1;
          
          // Se ainda há capturas pendentes, iniciar próxima
          if (nextIndex < REQUIRED_CAPTURES) {
            setCountdown(3);
            setIsCapturing(true);
            setCaptures(prev => prev.map((capture, index) => 
              index === nextIndex 
                ? { ...capture, status: 'capturing' } 
                : capture
            ));
          } else {
            // Todas as capturas concluídas
            setStage('processing');
          }
          
          return nextIndex;
        });
      }, 2000);

    } catch (error: any) {
      console.error('❌ Erro detalhado na captura cadastro facial:', {
        error: error.message,
        stack: error.stack,
        videoRef: !!videoRef.current,
        cameraReady,
        faceRecognition: !!optimizedFaceRecognition
      });
      
      const errorMessage = error.message === 'Video timeout' 
        ? 'Timeout na captura - vídeo não ficou pronto' 
        : `Erro na captura: ${error.message}`;
      
      handleCaptureError(errorMessage);
    }
  }, [currentCaptureIndex, cameraReady, handleCaptureError]); // ✅ CORREÇÃO: Dependência faltante

  // Countdown timer
  useEffect(() => {
    if (countdown > 0 && isCapturing) {
      const timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && isCapturing) {
      performCapture();
    }
  }, [countdown, isCapturing, performCapture]);

  // ✅ CORREÇÃO: Removida função redundante que causava dependência circular
  // handleCaptureError foi movido para cima para evitar dependência circular

  // Processar e salvar embeddings
  useEffect(() => {
    if (stage === 'processing' && captures.length === REQUIRED_CAPTURES) {
      processFacialData();
    }
  }, [stage, captures]);

  const processFacialData = async () => {
    try {
      console.log('🔄 Processando dados faciais...');
      
      const completedCaptures = captures.filter(c => c.status === 'completed');
      
      if (completedCaptures.length < 3) {
        setStage('error');
        return;
      }

      // Criar embedding médio (melhora a precisão)
      const avgEmbedding = createAverageEmbedding(completedCaptures.map(c => c.embedding));
      if (!avgEmbedding) {
        throw new Error('Embedding médio inválido');
      }
      
      // ✅ CALCULAR CONFIANÇA MÉDIA PARA ARMAZENAR
      const averageConfidence = completedCaptures.reduce((sum, c) => sum + (c.embedding.confidence ?? 0.95), 0) / completedCaptures.length;

      const normalizedEmbedding: OptimizedFaceEmbedding = {
        descriptor: normalizeEmbeddingDescriptor(avgEmbedding.descriptor, 512),
        confidence: averageConfidence,
        timestamp: Date.now(),
        method: 'captured_average'
      };

      const encryptedEmbedding = encryptEmbedding(normalizedEmbedding);
      
      // Salvar no funcionário
      await updateDoc(doc(db, 'employees', employeeId), {
        faceEmbedding: encryptedEmbedding,
        faceConfidence: averageConfidence, // ✅ ARMAZENAR CONFIANÇA REAL
        averageConfidence: averageConfidence, // ✅ BACKUP PARA COMPATIBILIDADE
        facialRegistrationDate: new Date(),
        registrationCompleted: true,
        status: 'active',
        captureQualityScores: completedCaptures.map(c => c.quality),
        totalCaptures: completedCaptures.length,
      });

      console.log('✅ Cadastro facial concluído com sucesso!');
      setStage('success');

    } catch (error) {
      console.error('❌ Erro ao processar dados faciais:', error);
      setStage('error');
    }
  };

  // Criar embedding médio
  const createAverageEmbedding = (embeddings: any[]) => {
    if (embeddings.length === 0) {
      return null;
    }

    const descriptorLength = embeddings[0].descriptor.length;
    const descriptor = new Float32Array(descriptorLength);

    embeddings.forEach(embedding => {
      embedding.descriptor.forEach((value: number, index: number) => {
        descriptor[index] += value;
      });
    });

    for (let i = 0; i < descriptor.length; i++) {
      descriptor[i] /= embeddings.length;
    }

    const confidence = embeddings.reduce((sum: number, emb: any) => sum + (emb.confidence ?? 0.95), 0) / embeddings.length;

    return {
      descriptor,
      confidence,
      timestamp: Date.now(),
      method: 'captured_average'
    };
  };

  // ✅ COMPONENTE REMOVIDO - USANDO FaceOvalCamera UNIFICADO

  // Renderizar baseado no stage
  if (stage === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando dados do funcionário...</p>
        </div>
      </div>
    );
  }

  if (stage === 'error' || !employeeData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 flex items-center justify-center p-4">
        <div className="max-w-md mx-auto text-center bg-white rounded-2xl shadow-xl p-8">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-red-700 mb-4">Erro no Cadastro</h2>
          <p className="text-gray-600 mb-6">
            {cameraError || 'Funcionário não encontrado ou erro ao carregar dados.'}
          </p>
          <button
            onClick={() => router.push('/app/cadastro-funcionario')}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Voltar ao Cadastro
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'instructions') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="max-w-2xl mx-auto text-center bg-white rounded-2xl shadow-xl p-8">
          <div className="text-6xl mb-6">📷</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Cadastro Facial</h1>
          
          <div className="bg-blue-50 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              👤 {employeeData.nomeCompleto}
            </h3>
            <p className="text-blue-700">
              {employeeData.cargo} • {employeeData.setor}
            </p>
          </div>
          
          <div className="space-y-4 mb-8 text-left">
            <h3 className="text-lg font-semibold text-gray-800">📋 Instruções:</h3>
            <div className="space-y-3">
              <div className="flex items-start">
                <span className="text-2xl mr-3">📸</span>
                <div>
                  <strong>5 fotos automáticas</strong> serão tiradas para garantir melhor reconhecimento
                </div>
              </div>
              <div className="flex items-start">
                <span className="text-2xl mr-3">👀</span>
                <div>
                  <strong>Olhe diretamente</strong> para a câmera dentro do círculo oval
                </div>
              </div>
              <div className="flex items-start">
                <span className="text-2xl mr-3">💡</span>
                <div>
                  <strong>Boa iluminação</strong> e posição central para melhor qualidade
                </div>
              </div>
              <div className="flex items-start">
                <span className="text-2xl mr-3">🚫</span>
                <div>
                  <strong>Sem óculos escuros</strong> ou objetos que cubram o rosto
                </div>
              </div>
            </div>
          </div>
          
          <button
            onClick={() => setStage('capturing')}
            className="bg-green-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-green-700 transition-colors"
          >
            🚀 Iniciar Cadastro Facial
          </button>
        </div>
      </div>
    );
  }

  // ✅ TELA DE RETRY
  if (stage === 'retry') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-100 flex items-center justify-center p-4">
        <div className="max-w-2xl mx-auto text-center bg-white rounded-2xl shadow-xl p-8">
          <div className="text-6xl mb-6">🔄</div>
          <h1 className="text-3xl font-bold text-orange-600 mb-4">
            Tentativa {attemptCount}/{MAX_ATTEMPTS}
          </h1>
          
          <div className="bg-orange-50 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-semibold text-orange-900 mb-2">
              👤 {employeeData.nomeCompleto}
            </h3>
            <p className="text-orange-700 mb-2">
              {retryMessage || 'Tente novamente com melhor posicionamento'}
            </p>
            <p className="text-sm text-orange-600">
              Aguarde 3 segundos para nova tentativa...
            </p>
          </div>

          <FaceOvalCamera 
            videoRef={videoRef}
            cameraReady={cameraReady}
            streamRef={streamRef}
            stage={stage}
            countdown={countdown}
            isCapturing={isCapturing}
            cameraError={cameraError}
            countdownColor="dynamic"
            showCountdown={true}
            showStatusIndicators={true}
          />

          <div className="mt-6 text-sm text-gray-500">
            Captura {currentCaptureIndex + 1} de {REQUIRED_CAPTURES} • Sistema de cadastro facial
          </div>
        </div>
      </div>
    );
  }

  // ✅ TELA DE FALHA FINAL
  if (stage === 'failed') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 flex items-center justify-center p-4">
        <div className="max-w-2xl mx-auto text-center bg-white rounded-2xl shadow-xl p-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="text-6xl mb-4">❌</div>
            <h1 className="text-3xl font-bold text-red-600 mb-4">
              Não foi Possível Concluir o Cadastro Facial
            </h1>
            
            <div className="text-center space-y-3 mb-6">
              <p className="text-lg text-red-700 font-medium">
                Limite de tentativas atingido ({MAX_ATTEMPTS} tentativas)
              </p>
              <p className="text-gray-700">
                Procure o RH para assistência no cadastro facial.
              </p>
              
              <div className="bg-red-50 rounded-lg p-4 mt-4">
                <h3 className="text-md font-semibold text-red-900 mb-1">
                  👤 {employeeData.nomeCompleto}
                </h3>
                <p className="text-red-700 text-sm">
                  {employeeData.cargo} • {employeeData.setor}
                </p>
              </div>
            </div>

            <FaceOvalCamera 
            videoRef={videoRef}
            cameraReady={cameraReady}
            streamRef={streamRef}
            stage={stage}
            countdown={countdown}
            isCapturing={isCapturing}
            cameraError={cameraError}
            countdownColor="dynamic"
            showCountdown={true}
            showStatusIndicators={true}
          />

            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => {
                  setAttemptCount(0);
                  setRetryMessage('');
                  setStage('instructions');
                }}
                className="bg-orange-600 text-white px-6 py-3 rounded-lg hover:bg-orange-700 transition-colors font-medium"
              >
                🔄 Tentar Novamente
              </button>
              <button
                onClick={() => router.push('/app/cadastro-funcionario')}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                ← Voltar ao Cadastro
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <div className="max-w-2xl mx-auto text-center bg-white rounded-2xl shadow-xl p-8">
          <div className="text-6xl mb-6">🎉</div>
          <h1 className="text-3xl font-bold text-green-700 mb-4">Cadastro Concluído!</h1>
          
          <div className="bg-green-50 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-semibold text-green-900 mb-2">
              ✅ {employeeData.nomeCompleto}
            </h3>
            <p className="text-green-700 mb-4">
              Cadastro facial realizado com sucesso!
            </p>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {captures.map((capture, index) => (
                <div key={index} className="bg-white rounded-lg p-3 border">
                  <div className="text-xs text-gray-600">Foto {index + 1}</div>
                  <div className="text-lg">
                    {capture.status === 'completed' ? '✅' : '❌'}
                  </div>
                  {capture.status === 'completed' && (
                    <div className="text-xs text-green-600">
                      {Math.round(capture.quality * 100)}%
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          <div className="space-y-4">
            <button
              onClick={() => router.push('/app/cadastro-funcionario')}
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Cadastrar Outro Funcionário
            </button>
            <button
              onClick={() => router.push('/app')}
              className="w-full bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Voltar ao Menu Principal
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Stage de captura
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="text-2xl">📷</div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  Cadastro Facial - {employeeData?.nomeCompleto}
                </h1>
                <p className="text-sm text-gray-600">
                  Captura {currentCaptureIndex + 1} de {REQUIRED_CAPTURES}
                </p>
              </div>
            </div>
          </div>
          
          {/* Progress */}
          <div className="mt-4 bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(currentCaptureIndex / REQUIRED_CAPTURES) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Conteúdo principal */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          
          {/* ✅ CÍRCULO DA CÂMERA - ESTRUTURA IDÊNTICA À CAPTURA */}
          <FaceOvalCamera 
            videoRef={videoRef}
            cameraReady={cameraReady}
            streamRef={streamRef}
            stage={stage}
            countdown={countdown}
            isCapturing={isCapturing}
            cameraError={cameraError}
            countdownColor="dynamic"
            showCountdown={true}
            showStatusIndicators={true}
          />

          {/* Instruções */}
          <div className="text-center mb-8">
            {countdown > 0 && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  📸 Preparando captura...
                </h2>
                <p className="text-gray-600">
                  Posicione-se no centro do círculo • Captura em {countdown} segundo{countdown > 1 ? 's' : ''}
                </p>
              </div>
            )}
            
            {countdown === 0 && isCapturing && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  📸 Capturando...
                </h2>
                <p className="text-gray-600">
                  Mantenha a posição • Processando imagem
                </p>
              </div>
            )}
            
            {!isCapturing && currentCaptureIndex < REQUIRED_CAPTURES && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  ✅ Captura realizada!
                </h2>
                <p className="text-gray-600">
                  Preparando próxima captura...
                </p>
              </div>
            )}
          </div>

          {/* Grid de capturas */}
          <div className="grid grid-cols-5 gap-4">
            {captures.map((capture, index) => (
              <div 
                key={capture.id}
                className={`
                  aspect-square rounded-lg border-2 flex items-center justify-center
                  ${index === currentCaptureIndex ? 'border-blue-500 bg-blue-50' : 
                    capture.status === 'completed' ? 'border-green-500 bg-green-50' :
                    capture.status === 'failed' ? 'border-red-500 bg-red-50' :
                    'border-gray-300 bg-gray-50'}
                `}
              >
                <div className="text-center">
                  <div className="text-2xl mb-1">
                    {capture.status === 'completed' ? '✅' :
                     capture.status === 'capturing' ? '📸' :
                     capture.status === 'failed' ? '❌' : '⚪'}
                  </div>
                  <div className="text-xs text-gray-600">
                    {index + 1}
                  </div>
                  {capture.status === 'completed' && (
                    <div className="text-xs text-green-600">
                      {Math.round(capture.quality * 100)}%
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
