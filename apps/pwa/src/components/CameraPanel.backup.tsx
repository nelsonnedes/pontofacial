'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useFaceAPIStatus } from './FaceAPIProvider';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Camera, CameraOff, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

// Importar apenas face-recognition otimizado
let optimizedFaceRecognition: any = null;
if (typeof window !== 'undefined') {
  try {
    const module = require('@/lib/face-recognition-optimized');
    optimizedFaceRecognition = module.optimizedFaceRecognition;
    console.log('✅ Face Recognition Otimizado carregado no CameraPanel');
  } catch (error) {
    console.warn('⚠️ Face Recognition Otimizado não disponível:', error);
  }
}

// Tipos e interfaces
interface CameraPanelState {
  isActive: boolean;
  stream: MediaStream | null;
  faceDetected: boolean;
  faceCount: number;
  error: string | null;
  videoDimensions: { width: number; height: number };
  isInitializingFaceAPI: boolean;
}

// Configurações de câmera otimizadas
const CAMERA_CONSTRAINTS = {
  video: {
    width: { ideal: 640, max: 1280 },
    height: { ideal: 480, max: 720 },
    facingMode: 'user',
    frameRate: { ideal: 15, max: 30 }
  },
  audio: false
} as const;

const DETECTION_INTERVAL = 1000; // 1 segundo
const STABILIZATION_TIMEOUT = 5000; // 5 segundos

interface CameraPanelProps {
  onPhotoCapture?: (blob: Blob, imageData: ImageData, faceEmbedding?: FaceEmbedding) => void;
  onError?: (error: string) => void;
  onFaceDetected?: (faceCount: number) => void;
  className?: string;
  showPreview?: boolean;
  autoStart?: boolean;
  enableFaceDetection?: boolean;
  requireFace?: boolean;
}

export default function CameraPanel({ 
  onPhotoCapture, 
  onError, 
  onFaceDetected,
  className = '', 
  showPreview = true, 
  autoStart = false,
  enableFaceDetection = true, // Habilitado por padrão
  requireFace = false
}: CameraPanelProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  // Estado consolidado
  const [state, setState] = useState<CameraPanelState>({
    isActive: false,
    stream: null,
    faceDetected: false,
    faceCount: 0,
    error: null,
    videoDimensions: { width: 0, height: 0 },
    isInitializingFaceAPI: false
  });
  
  // Efeito para marcar componente como montado
  useEffect(() => {
    setIsMounted(true);
    console.log('✅ CameraPanel montado');
    return () => {
      setIsMounted(false);
      console.log('🗑️ CameraPanel desmontado');
    };
  }, []);
  
  // Hook para status do Face API
  const { initialized: faceAPIReady, initializing: faceAPILoading, error: faceAPIError } = useFaceAPIStatus();
  
  // Função para atualizar estado
  const updateState = useCallback((updates: Partial<CameraPanelState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);
  
  // Destructuring do estado para compatibilidade
  const { isActive, stream, faceDetected, faceCount, error, videoDimensions, isInitializingFaceAPI } = state;
  
  // Logs de debug para verificar status do Face API
  useEffect(() => {
    console.log('🔍 Status do Face API:', {
      isInitialized: faceAPIReady,
      isInitializing: faceAPILoading,
      error: faceAPIError,
      enableFaceDetection
    });
  }, [faceAPIReady, faceAPILoading, faceAPIError, enableFaceDetection]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Configurações da câmera otimizadas
  const videoConstraints = {
    width: { ideal: 1280, min: 640 },
    height: { ideal: 720, min: 480 },
    facingMode: 'user', // Câmera frontal
    frameRate: { ideal: 30, min: 15 },
    aspectRatio: { ideal: 16/9 }
  };

  // Verificar dispositivos de câmera disponíveis
  const checkCameraDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      
      console.log('📹 Dispositivos de câmera disponíveis:');
      console.table(videoDevices);
      
      if (videoDevices.length === 0) {
        throw new Error('Nenhuma câmera encontrada no dispositivo');
      }
      
      return videoDevices;
    } catch (error) {
      console.error('❌ Erro ao verificar dispositivos de câmera:', error);
      throw error;
    }
  };

  // Função auxiliar para obter mensagem de erro
  const getErrorMessage = useCallback((err: any) => {
    return err.name === 'NotAllowedError' 
      ? 'Acesso à câmera negado. Por favor, permita o acesso e tente novamente.'
      : err.name === 'NotFoundError'
      ? 'Nenhuma câmera encontrada no dispositivo.'
      : err.name === 'NotReadableError'
      ? 'Câmera está sendo usada por outro aplicativo.'
      : `Erro ao acessar câmera: ${err.message}`;
  }, []);

  // Função auxiliar para aguardar estabilização do vídeo
  const waitForVideoStabilization = useCallback(async (video: HTMLVideoElement, mediaStream: MediaStream) => {
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.log('⏳ Aguardando estabilização do vídeo...');
      
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
          updateState({
            videoDimensions: {
              width: video.videoWidth,
              height: video.videoHeight
            }
          });
          console.log(`✅ Câmera estabilizada: ${video.videoWidth}x${video.videoHeight}, readyState: ${video.readyState}`);
          
          if (mediaStream.active) {
            console.log('✅ Stream de mídia ativo e funcionando');
            break;
          } else {
            throw new Error('Stream de mídia foi desativado durante a inicialização');
          }
        }
        
        attempts++;
        console.log(`🔄 Aguardando estabilização... tentativa ${attempts}/${maxAttempts}`);
      }
      
      if (attempts >= maxAttempts) {
        throw new Error('Timeout: Câmera não conseguiu estabilizar após múltiplas tentativas');
      }
    }
  }, [updateState]);

  // Iniciar câmera com configurações otimizadas
  const startCamera = useCallback(async () => {
    try {
      console.log('🎥 Iniciando câmera...');
      updateState({ error: null, isInitializingFaceAPI: true });
      
      // Verificar se estamos no lado do cliente
      if (typeof window === 'undefined') {
        throw new Error('Câmera não disponível durante o build');
      }
      
      // Verificar suporte do navegador
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Seu navegador não suporta acesso à câmera');
      }
      
      // CORREÇÃO CRÍTICA: Aguardar elemento de vídeo estar disponível
      let attempts = 0;
      const maxAttempts = 20; // 2 segundos total (20 * 100ms)
      
      while (!videoRef.current && attempts < maxAttempts) {
        console.log(`⏳ Aguardando elemento de vídeo estar disponível... tentativa ${attempts + 1}/${maxAttempts}`);
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      if (!videoRef.current) {
        throw new Error(`Elemento de vídeo não foi encontrado após ${maxAttempts} tentativas. Verifique se o componente está renderizado corretamente.`);
      }
      
      console.log('✅ Elemento de vídeo encontrado e disponível');
      
      // Verificar dispositivos de câmera disponíveis
      const cameraDevices = await checkCameraDevices();
      console.log(`📹 ${cameraDevices.length} dispositivo(s) de câmera encontrado(s)`);
      
      // Verificar se já há uma câmera ativa
      if (state.stream && state.stream.active) {
        console.log('🔄 Câmera já está ativa, parando stream anterior...');
        stopCamera();
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log('📱 Solicitando acesso à câmera com constraints:', CAMERA_CONSTRAINTS);
      const mediaStream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      
      // Configurar elemento de vídeo
      const video = videoRef.current;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = mediaStream;
      
      // Aguardar o vídeo carregar com timeout
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          video.removeEventListener('loadedmetadata', onLoadedMetadata);
          video.removeEventListener('error', onVideoError);
          reject(new Error('Timeout aguardando carregamento do vídeo'));
        }, STABILIZATION_TIMEOUT);
        
        const onLoadedMetadata = () => {
          clearTimeout(timeout);
          video.removeEventListener('loadedmetadata', onLoadedMetadata);
          video.removeEventListener('error', onVideoError);
          
          console.log(`📹 Metadados carregados: ${video.videoWidth}x${video.videoHeight}, readyState: ${video.readyState}`);
          
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            updateState({
              videoDimensions: {
                width: video.videoWidth,
                height: video.videoHeight
              }
            });
            console.log(`✅ Vídeo carregado com sucesso: ${video.videoWidth}x${video.videoHeight}`);
            resolve();
          } else {
            reject(new Error('Dimensões do vídeo inválidas após carregamento'));
          }
        };
        
        const onVideoError = () => {
          clearTimeout(timeout);
          video.removeEventListener('loadedmetadata', onLoadedMetadata);
          video.removeEventListener('error', onVideoError);
          reject(new Error('Erro ao carregar vídeo'));
        };
        
        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener('error', onVideoError);
        
        video.play().catch(reject);
      });
      
      // Atualizar estados
      updateState({
        stream: mediaStream,
        isActive: true,
        faceDetected: false,
        faceCount: 0
      });
      
      console.log('✅ Câmera iniciada com sucesso');
      
      // Aguardar estabilização do vídeo
      await waitForVideoStabilization(video, mediaStream);
      
    } catch (err: any) {
      const errorMessage = getErrorMessage(err);
      console.error('❌ Erro ao iniciar câmera:', err);
      
      updateState({
        error: errorMessage,
        isActive: false,
        stream: null,
        videoDimensions: { width: 0, height: 0 }
      });
      
      onError?.(errorMessage);
    } finally {
      updateState({ isInitializingFaceAPI: false });
    }
  }, [state.stream, updateState, onError, getErrorMessage, waitForVideoStabilization]);

  // Parar câmera com limpeza adequada de recursos
  const stopCamera = useCallback(() => {
    try {
      console.log('⏹️ Parando câmera...');
      
      if (state.stream) {
        // Parar todas as tracks do stream
        state.stream.getTracks().forEach(track => {
          track.stop();
          console.log(`🛑 Track ${track.kind} parada`);
        });
      }
      
      // Limpar elemento de vídeo
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.load();
      }
      
      // Resetar estados
      updateState({
        stream: null,
        isActive: false,
        faceDetected: false,
        faceCount: 0,
        videoDimensions: { width: 0, height: 0 },
        error: null
      });
      
      console.log('✅ Câmera parada com sucesso');
    } catch (error) {
      console.error('❌ Erro ao parar câmera:', error);
    }
  }, [state.stream, updateState]);

  // Cleanup ao desmontar componente
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Auto start camera se habilitado - apenas após montagem
  useEffect(() => {
    if (autoStart && isMounted) {
      // Aguardar um tempo maior para garantir que o DOM esteja totalmente renderizado
      const timer = setTimeout(() => {
        console.log('🚀 Auto-iniciando câmera...');
        startCamera().catch(error => {
          console.error('❌ Erro no auto-start da câmera:', error);
        });
      }, 500); // Aumentado de 100ms para 500ms
      
      return () => clearTimeout(timer);
    }
  }, [autoStart, startCamera, isMounted]);

  // Atualizar erro se houver problema na inicialização do Face API
  useEffect(() => {
    if (faceAPIError) {
      updateState({ error: `Erro no Face API: ${faceAPIError}` });
    }
  }, [faceAPIError, updateState]);

  // Detecção facial otimizada
  const detectFaces = useCallback(async () => {
    if (!enableFaceDetection || !state.isActive || !videoRef.current || !faceAPIReady) {
      return;
    }

    try {
      const video = videoRef.current;
      
      // Verificar se o vídeo está pronto
      if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        return;
      }

      // Verificar se o Face API está disponível
      if (!optimizedFaceRecognition) {
        console.warn('⚠️ Face recognition otimizado não disponível');
        return;
      }

      const faces = await optimizedFaceRecognition.detectFaces(video);
      const detectedCount = faces.length;
      
      if (detectedCount > 0) {
        console.log(`👤 ${detectedCount} face(s) detectada(s)`);
      }
      
      updateState({
        faceCount: detectedCount,
        faceDetected: detectedCount > 0
      });
      
      onFaceDetected?.(detectedCount);
      
    } catch (error) {
      console.error('❌ Erro na detecção de faces:', error);
    }
  }, [enableFaceDetection, state.isActive, faceAPIReady, updateState, onFaceDetected]);

  // Efeito para detecção facial em tempo real
  useEffect(() => {
    if (!enableFaceDetection || !state.isActive || !faceAPIReady) {
      return;
    }

    const initialDelay = setTimeout(() => {
      const interval = setInterval(detectFaces, DETECTION_INTERVAL);
      return () => clearInterval(interval);
    }, 2000);

    return () => clearTimeout(initialDelay);
  }, [enableFaceDetection, state.isActive, faceAPIReady, detectFaces]);

  // Função de captura otimizada
  const captureImage = useCallback(async (): Promise<string | null> => {
    if (!videoRef.current || !canvasRef.current || !state.isActive) {
      console.error('❌ Elementos necessários não disponíveis para captura');
      return null;
    }

    try {
      setIsCapturing(true);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Contexto do canvas não disponível');
      }

      // Verificar se o vídeo está pronto
      if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        throw new Error('Vídeo não está pronto para captura');
      }

      // Configurar dimensões do canvas
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Capturar frame do vídeo
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Converter para base64
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      console.log('✅ Imagem capturada com sucesso');

      // onCapture removido - não está nas props
      return imageData;

    } catch (error) {
      console.error('❌ Erro ao capturar imagem:', error);
      const errorMessage = `Erro ao capturar imagem: ${error instanceof Error ? error.message : 'Erro desconhecido'}`;
      updateState({ error: errorMessage });
      onError?.(errorMessage);
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, [state.isActive, onError, updateState]);

  // Verificar se o vídeo está pronto para captura
  const isVideoReady = useCallback(() => {
    if (!videoRef.current || !state.isActive) return false;
    
    const video = videoRef.current;
    return (
      video.readyState >= 2 && // HAVE_CURRENT_DATA
      video.videoWidth > 0 && 
      video.videoHeight > 0 &&
      state.stream?.active === true
    );
  }, [state.isActive, state.stream]);

  // Status consolidado para o componente
  const status = useMemo(() => ({
    isReady: isVideoReady(),
    hasError: !!state.error,
    isInitializing: state.isInitializingFaceAPI || faceAPILoading,
    canCapture: isVideoReady() && !isCapturing,
    faceStatus: {
      detected: state.faceDetected,
      count: state.faceCount,
      required: requireFace
    }
  }), [isVideoReady, state.error, state.isInitializingFaceAPI, faceAPILoading, isCapturing, state.faceDetected, state.faceCount, requireFace]);

  // Capturar foto otimizada com gate de captura
  const capturePhoto = useCallback(async () => {
    // Gate de captura: só permitir se o vídeo estiver pronto
    if (!status.canCapture) {
      const errorMessage = 'Vídeo ainda não está pronto. Aguarde alguns segundos e tente novamente.';
      updateState({ error: errorMessage });
      onError?.(errorMessage);
      return;
    }

    if (!videoRef.current || !canvasRef.current || !state.isActive) {
      onError?.('Câmera não está ativa. Ative a câmera primeiro.');
      return;
    }

    try {
      setIsCapturing(true);
      console.log('📸 Iniciando captura de foto...');
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      // Verificar se o contexto foi obtido
      if (!ctx) {
        throw new Error('Não foi possível obter contexto do canvas');
      }
      
      console.log(`📸 Capturando frame: ${video.videoWidth}x${video.videoHeight}`);

      // Configurar canvas com dimensões corretas do vídeo
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Obter ImageData para processamento
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Processar embedding facial se habilitado
      let faceEmbedding: any;
      if (enableFaceDetection && faceAPIReady) {
        try {
          console.log('🧠 Processando embedding facial...');
          const extractedEmbedding = await optimizedFaceRecognition.extractFaceEmbedding(video);
          if (extractedEmbedding) {
            faceEmbedding = extractedEmbedding;
            console.log('✅ Embedding facial extraído com sucesso');
          }
        } catch (error) {
          console.error('❌ Erro ao extrair embedding facial:', error);
        }
      }

      // Converter para blob com alta qualidade
      canvas.toBlob((blob) => {
        if (blob && onPhotoCapture) {
          console.log('📸 Foto capturada com sucesso, tamanho:', blob.size, 'bytes');
          onPhotoCapture(blob, imageData, faceEmbedding);
        }
      }, 'image/jpeg', 0.9);

    } catch (err: any) {
      const errorMessage = `Erro ao capturar foto: ${err.message}`;
      console.error('❌ Erro na captura:', err);
      updateState({ error: errorMessage });
      onError?.(errorMessage);
    } finally {
      setIsCapturing(false);
    }
  }, [status.canCapture, state.isActive, enableFaceDetection, faceAPIReady, onPhotoCapture, onError, updateState]);

  return (
    <div className={`bg-white rounded-2xl shadow-xl p-6 ${className}`}>
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          📸 Captura Facial
        </h3>
        <p className="text-sm text-gray-600">
          {status.isReady 
            ? status.faceStatus.detected 
              ? '✅ Rosto detectado! Clique em Capturar Foto'
              : 'Posicione seu rosto no centro da tela'
            : 'Clique para ativar a câmera'
          }
        </p>
      </div>

      {/* Área de vídeo - CORRIGIDO: Formato quadrado + des-espelhamento */}
      {showPreview && (
        <div className="relative mb-4">
          <div className="aspect-square bg-gray-100 rounded-2xl overflow-hidden relative max-w-md mx-auto shadow-lg border-4 border-blue-200">
            {state.isActive ? (
              <>
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover transform scale-x-[-1]"
                  playsInline
                  muted
                  autoPlay
                  style={{ transform: 'scaleX(-1)' }}
                />
                
                {/* Overlay de guia facial MELHORADO */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className={`relative w-48 h-56 border-4 rounded-full transition-all duration-300 ${
                    enableFaceDetection 
                      ? status.faceStatus.detected 
                        ? 'border-green-400 shadow-green-400/50 shadow-lg scale-110' 
                        : 'border-white shadow-white/50 shadow-lg'
                      : 'border-blue-400 shadow-blue-400/50 shadow-lg'
                  }`}>
                    {/* Texto de orientação */}
                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-center">
                      <p className={`text-xs font-medium px-2 py-1 rounded ${
                        status.faceStatus.detected ? 'text-green-700 bg-green-100' : 'text-gray-700 bg-white bg-opacity-90'
                      }`}>
                        {status.faceStatus.detected ? '✅ Rosto detectado' : '📍 Posicione seu rosto'}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Indicadores de status facial */}
                {enableFaceDetection && (
                  <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
                    {status.isInitializing ? (
                      '🔄 Inicializando...'
                    ) : status.faceStatus.detected ? (
                      `✅ ${status.faceStatus.count} face${status.faceStatus.count !== 1 ? 's' : ''} detectada${status.faceStatus.count !== 1 ? 's' : ''}`
                    ) : (
                      '❌ Nenhuma face detectada'
                    )}
                  </div>
                )}
                
                {/* Indicador de captura */}
                {isCapturing && (
                  <div className="absolute inset-0 bg-white bg-opacity-80 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-4xl mb-2 animate-pulse">📸</div>
                      <p className="text-sm text-gray-700">Capturando...</p>
                    </div>
                  </div>
                )}
                
                {/* Indicador de inicialização */}
                {status.isInitializing && (
                  <div className="absolute inset-0 bg-blue-50 bg-opacity-80 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-4xl mb-2 animate-spin">🔄</div>
                      <p className="text-sm text-blue-700">Inicializando câmera...</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <div className="text-6xl mb-2">📷</div>
                  <p className="text-sm">Câmera desativada</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mensagem de erro - apenas se não houver onError callback */}
      {status.hasError && !onError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">⚠️ {state.error}</p>
          {state.error?.includes('Face API') && (
            <div className="mt-2 text-xs text-red-500">
              💡 Dica: Tente recarregar a página ou verificar sua conexão
            </div>
          )}
        </div>
      )}

      {/* Controles responsivos */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {!state.isActive ? (
          <button
            onClick={startCamera}
            disabled={status.isInitializing}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status.isInitializing ? '🔄 Inicializando...' : '🎥 Ativar Câmera'}
          </button>
        ) : (
          <>
            <button
              onClick={capturePhoto}
              disabled={!status.canCapture || (requireFace && !status.faceStatus.detected)}
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
            >
              {isCapturing ? '📸 Capturando...' : '📸 Capturar Foto'}
            </button>
            
            <button
              onClick={stopCamera}
              className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors font-medium w-full sm:w-auto"
            >
              ⏹️ Parar
            </button>
          </>
        )}
      </div>

      {/* Canvas oculto para captura */}
      <canvas
        ref={canvasRef}
        className="hidden"
      />

      {/* Informações técnicas melhoradas */}
      {state.isActive && (
        <div className="mt-4 text-xs text-gray-500 text-center space-y-1">
          <p>Resolução: {state.videoDimensions.width}x{state.videoDimensions.height}</p>
          <p>Status: {state.stream?.active ? '🟢 Ativo' : '🔴 Inativo'}</p>
          {enableFaceDetection && (
            <p>Face API: {faceAPIReady ? '✅ Pronto' : '🔄 Inicializando'}</p>
          )}
        </div>
      )}
    </div>
  );
}

// Tipos para exportação
export type { CameraPanelProps };