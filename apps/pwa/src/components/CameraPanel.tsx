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
  isInitializingCamera: boolean;
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
  onPhotoCapture?: (blob: Blob, imageData: ImageData, faceEmbedding?: any) => void;
  onError?: (error: string) => void;
  onFaceDetected?: (faceCount: number) => void;
  className?: string;
  showPreview?: boolean;
  autoStart?: boolean;
  enableFaceDetection?: boolean;
  requireFace?: boolean;
}

export default function CameraPanelFixed({ 
  onPhotoCapture, 
  onError, 
  onFaceDetected,
  className = '', 
  showPreview = true, 
  autoStart = false,
  enableFaceDetection = true,
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
    isInitializingFaceAPI: false,
    isInitializingCamera: false
  });
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const initializingRef = useRef(false); // NOVO: Proteção contra múltiplas inicializações
  
  // Hook para status do Face API
  const { initialized: faceAPIReady, initializing: faceAPILoading, error: faceAPIError } = useFaceAPIStatus();
  
  // Função para atualizar estado
  const updateState = useCallback((updates: Partial<CameraPanelState>) => {
    if (isMountedRef.current) {
      setState(prev => ({ ...prev, ...updates }));
    }
  }, []);
  
  // Destructuring do estado para compatibilidade
  const { isActive, stream, faceDetected, faceCount, error, videoDimensions, isInitializingCamera } = state;

  // Função para tratamento de erros
  const getErrorMessage = useCallback((error: any): string => {
    if (typeof error === 'string') return error;
    if (error?.message) return error.message;
    if (error?.name === 'NotAllowedError') return 'Acesso à câmera negado. Verifique as permissões.';
    if (error?.name === 'NotFoundError') return 'Nenhuma câmera encontrada no dispositivo.';
    if (error?.name === 'NotReadableError') return 'Câmera já está em uso por outro aplicativo.';
    return 'Erro desconhecido ao acessar a câmera.';
  }, []);

  // NOVA FUNÇÃO ROBUSTA DE INICIALIZAÇÃO DA CÂMERA
  const startCamera = useCallback(async () => {
    if (!isMountedRef.current || initializingRef.current || state.isInitializingCamera || state.isActive) {
      console.log('⚠️ Inicialização da câmera já em andamento ou ativa - ignorando');
      return;
    }
    
    initializingRef.current = true;
    console.log('🎥 Iniciando processo de câmera...');
    updateState({ 
      isInitializingCamera: true, 
      error: null,
      isActive: true // ✅ CORREÇÃO CRÍTICA: Ativar primeiro para renderizar o elemento
    });

    try {
      // Verificar se está no ambiente correto
      if (typeof window === 'undefined') {
        throw new Error('Câmera não disponível durante o build');
      }
      
      // Verificar suporte do navegador
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Seu navegador não suporta acesso à câmera');
      }

      // ✅ CORREÇÃO CRÍTICA: Aguardar um pequeno delay para o DOM atualizar
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // ✅ NOVO: Aguardar o elemento de vídeo com timeout mais robusto
      let attempts = 0;
      const maxAttempts = 50; // 5 segundos total (50 * 100ms)
      
      while (attempts < maxAttempts && isMountedRef.current) {
        if (videoRef.current) {
          console.log(`✅ Elemento de vídeo encontrado na tentativa ${attempts + 1}`);
          break;
        }
        
        console.log(`⏳ Aguardando elemento de vídeo... tentativa ${attempts + 1}/${maxAttempts}`);
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      if (!videoRef.current) {
        throw new Error(`Elemento de vídeo não encontrado após ${maxAttempts} tentativas`);
      }
      
      console.log('✅ Elemento de vídeo disponível, iniciando configuração da câmera...');

      // Verificar se já há uma câmera ativa
      if (state.stream && state.stream.active) {
        console.log('🔄 Parando stream anterior...');
        state.stream.getTracks().forEach(track => track.stop());
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log('📱 Solicitando acesso à câmera...');
      const mediaStream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      
      if (!isMountedRef.current || !videoRef.current) {
        // Componente foi desmontado durante a inicialização
        mediaStream.getTracks().forEach(track => track.stop());
        return;
      }
      
      // Configurar elemento de vídeo
      const video = videoRef.current;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = mediaStream;
      
      // Aguardar o vídeo carregar com timeout robusto
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
          
          console.log(`📹 Vídeo carregado: ${video.videoWidth}x${video.videoHeight}`);
          
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            updateState({
              videoDimensions: {
                width: video.videoWidth,
                height: video.videoHeight
              }
            });
            resolve();
          } else {
            reject(new Error('Dimensões do vídeo inválidas'));
          }
        };
        
        const onVideoError = (e: any) => {
          clearTimeout(timeout);
          video.removeEventListener('loadedmetadata', onLoadedMetadata);
          video.removeEventListener('error', onVideoError);
          reject(new Error('Erro ao carregar vídeo: ' + (e.error?.message || 'desconhecido')));
        };
        
        if (video.readyState >= 2) { // HAVE_CURRENT_DATA
          onLoadedMetadata();
        } else {
          video.addEventListener('loadedmetadata', onLoadedMetadata);
          video.addEventListener('error', onVideoError);
          
          // Forçar play se necessário
          video.play().catch(playError => {
            console.warn('⚠️ Erro ao iniciar reprodução:', playError);
          });
        }
      });

      // Aguardar estabilização
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (!isMountedRef.current) return;

      // Sucesso!
      updateState({
        stream: mediaStream,
        isInitializingCamera: false,
        error: null
      });

      console.log('✅ Câmera inicializada com sucesso!');
      
      // Iniciar detecção de faces se habilitada
      if (enableFaceDetection && faceAPIReady) {
        startFaceDetection();
      }
      
    } catch (error) {
      console.error('❌ Erro ao iniciar câmera:', error);
      const errorMsg = getErrorMessage(error);
      
      updateState({
        error: errorMsg,
        isInitializingCamera: false,
        isActive: false // Desativar se houve erro
      });
      
      onError?.(errorMsg);
    } finally {
      // SEMPRE limpar o flag de inicialização, independente do resultado
      initializingRef.current = false;
    }
  }, [state.stream, updateState, onError, getErrorMessage, enableFaceDetection, faceAPIReady]);

  // Função para parar câmera
  const stopCamera = useCallback(() => {
    console.log('⏹️ Parando câmera...');
    
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    
    if (state.stream) {
      state.stream.getTracks().forEach(track => track.stop());
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    updateState({
      isActive: false,
      stream: null,
      faceDetected: false,
      faceCount: 0,
      error: null,
      videoDimensions: { width: 0, height: 0 },
      isInitializingCamera: false
    });
    
    console.log('✅ Câmera parada com sucesso');
  }, [state.stream, updateState]);

  // Função para detectar faces
  const detectFaces = useCallback(async (video: HTMLVideoElement) => {
    if (!optimizedFaceRecognition || !video || video.readyState !== 4) return [];
    
    try {
      const faces = await optimizedFaceRecognition.detectFaces(video);
      return faces || [];
    } catch (error) {
      console.warn('⚠️ Erro na detecção facial:', error);
      return [];
    }
  }, []);

  // Função para iniciar detecção de faces
  const startFaceDetection = useCallback(() => {
    if (detectionIntervalRef.current || !enableFaceDetection || !videoRef.current) return;
    
    console.log('👁️ Iniciando detecção de faces...');
    
    detectionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || !isMountedRef.current) return;
      
      const faces = await detectFaces(videoRef.current);
      const count = faces.length;
      
      updateState({
        faceDetected: count > 0,
        faceCount: count
      });
      
      onFaceDetected?.(count);
    }, DETECTION_INTERVAL);
  }, [enableFaceDetection, detectFaces, updateState, onFaceDetected]);

  // Função para capturar foto
  const captureImage = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isCapturing) {
      throw new Error('Componentes não estão prontos para captura');
    }
    
    setIsCapturing(true);
    
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) throw new Error('Contexto do canvas não disponível');
      
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx.drawImage(video, 0, 0);
      
      // Gerar blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Falha ao gerar blob')), 'image/jpeg', 0.9);
      });
      
      // Gerar ImageData
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Tentar extrair embedding facial se disponível
      let faceEmbedding = undefined;
      if (enableFaceDetection && optimizedFaceRecognition) {
        try {
          faceEmbedding = await optimizedFaceRecognition.extractFaceEmbedding(video);
        } catch (error) {
          console.warn('⚠️ Erro ao extrair embedding:', error);
        }
      }
      
      console.log('📸 Imagem capturada com sucesso!');
      return { blob, imageData, faceEmbedding };
      
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, enableFaceDetection]);

  // Manipulador do botão de captura
  const handleCapture = useCallback(async () => {
    try {
      const { blob, imageData, faceEmbedding } = await captureImage();
      onPhotoCapture?.(blob, imageData, faceEmbedding);
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      console.error('❌ Erro na captura:', errorMsg);
      updateState({ error: errorMsg });
      onError?.(errorMsg);
    }
  }, [captureImage, onPhotoCapture, getErrorMessage, updateState, onError]);

  // Efeito para marcar componente como montado
  useEffect(() => {
    isMountedRef.current = true;
    setIsMounted(true);
    console.log('✅ CameraPanel montado');
    
    return () => {
      isMountedRef.current = false;
      setIsMounted(false);
      
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      
      if (state.stream) {
        state.stream.getTracks().forEach(track => track.stop());
      }
      
      console.log('🗑️ CameraPanel desmontado');
    };
  }, []);

  // Efeito para auto-iniciar (otimizado para evitar re-mounts)
  useEffect(() => {
    if (autoStart && isMounted && !isActive && !isInitializingCamera && !initializingRef.current) {
      console.log('🚀 Auto-iniciando câmera...');
      // Pequeno delay para garantir que o DOM esteja pronto
      const timer = setTimeout(() => {
        if (isMountedRef.current && !initializingRef.current) {
          startCamera();
        }
      }, 300); // Aumentado para 300ms para melhor estabilidade
      
      return () => clearTimeout(timer);
    }
  }, [autoStart, isMounted, isActive, isInitializingCamera]); // Removido startCamera das dependências

  // Debug info
  const debugInfo = useMemo(() => ({
    mounted: isMounted,
    active: isActive,
    initializing: isInitializingCamera,
    hasStream: !!stream,
    videoReady: !!videoRef.current,
    faceAPIReady,
    dimensions: videoDimensions
  }), [isMounted, isActive, isInitializingCamera, stream, faceAPIReady, videoDimensions]);

  return (
    <div className={`camera-panel ${className}`}>
      {/* Preview de vídeo - CORRIGIDO: Formato quadrado + des-espelhamento */}
      {showPreview && (
        <div className="relative mb-4">
          {/* Mudança: aspect-video → aspect-square para melhor captura facial */}
          <div className="aspect-square bg-gray-100 rounded-2xl overflow-hidden relative max-w-md mx-auto shadow-lg border-4 border-blue-200">
            {isActive ? (
              <>
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover transform scale-x-[-1]"
                  playsInline
                  muted
                  autoPlay
                  style={{ transform: 'scaleX(-1)' }}
                />
                
                {/* Overlay de status */}
                {isInitializingCamera && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                    <div className="text-white text-center">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                      <p className="text-sm">Iniciando câmera...</p>
                    </div>
                  </div>
                )}
                
                {/* Overlay de guia facial MELHORADO */}
                {!isInitializingCamera && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    {/* Área de guia principal */}
                    <div className={`relative w-48 h-56 border-4 rounded-full transition-all duration-300 ${
                      faceDetected ? 'border-green-400 shadow-green-400/50 shadow-lg' : 'border-white shadow-white/50 shadow-lg'
                    }`}>
                      {/* Pontos de referência para orientação */}
                      <div className={`absolute top-4 left-1/2 w-2 h-2 rounded-full transform -translate-x-1/2 ${
                        faceDetected ? 'bg-green-400' : 'bg-white'
                      }`} />
                      <div className={`absolute bottom-8 left-1/2 w-3 h-2 rounded-full transform -translate-x-1/2 ${
                        faceDetected ? 'bg-green-400' : 'bg-white'
                      }`} />
                      
                      {/* Texto de orientação */}
                      <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-center">
                        <p className={`text-xs font-medium px-2 py-1 rounded ${
                          faceDetected ? 'text-green-700 bg-green-100' : 'text-gray-700 bg-white bg-opacity-90'
                        }`}>
                          {faceDetected ? '✅ Rosto detectado' : '📍 Posicione seu rosto'}
                        </p>
                      </div>
                    </div>
                    
                    {/* Indicadores de canto para orientação */}
                    <div className="absolute top-4 left-4 w-6 h-6 border-l-4 border-t-4 border-white opacity-70 rounded-tl-lg"></div>
                    <div className="absolute top-4 right-4 w-6 h-6 border-r-4 border-t-4 border-white opacity-70 rounded-tr-lg"></div>
                    <div className="absolute bottom-4 left-4 w-6 h-6 border-l-4 border-b-4 border-white opacity-70 rounded-bl-lg"></div>
                    <div className="absolute bottom-4 right-4 w-6 h-6 border-r-4 border-b-4 border-white opacity-70 rounded-br-lg"></div>
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <Camera className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Câmera desativada</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Canvas oculto para captura */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Controles */}
      <div className="flex gap-2 justify-center">
        {!isActive ? (
          <Button
            onClick={startCamera}
            disabled={isInitializingCamera}
            className="flex items-center gap-2"
          >
            {isInitializingCamera ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            {isInitializingCamera ? 'Iniciando...' : '🎥 Ativar Câmera'}
          </Button>
        ) : (
          <>
            <Button
              onClick={handleCapture}
              disabled={isCapturing || !stream}
              className="flex items-center gap-2"
            >
              {isCapturing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                '📷'
              )}
              {isCapturing ? 'Capturando...' : 'Capturar'}
            </Button>
            
            <Button
              onClick={stopCamera}
              variant="outline"
              className="flex items-center gap-2"
            >
              <CameraOff className="h-4 w-4" />
              Parar
            </Button>
          </>
        )}
      </div>

      {/* Status e detecção de faces */}
      {isActive && enableFaceDetection && (
        <div className="mt-4 text-center text-sm">
          {faceDetected ? (
            <div className="flex items-center justify-center gap-2 text-green-600">
              <CheckCircle className="h-4 w-4" />
              {faceCount === 1 ? 'Face detectada' : `${faceCount} faces detectadas`}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-gray-500">
              <AlertCircle className="h-4 w-4" />
              Posicione seu rosto na área indicada
            </div>
          )}
        </div>
      )}

      {/* Alerta de erro */}
      {error && (
        <Alert className="mt-4" variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Debug info (só em desenvolvimento) */}
      {process.env.NODE_ENV === 'development' && (
        <details className="mt-4 text-xs">
          <summary className="cursor-pointer text-gray-500">Debug Info</summary>
          <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto">
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
