'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import CameraPanel from './CameraPanel';
import { useFaceEmbeddings } from '@/hooks/useFaceEmbeddings';
import { useAuth } from '@/hooks/useAuth';

interface FaceVerificationProps {
  onSuccess?: (data: { userId: string; confidence: number }) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
  onRegisterRequest?: () => void;
  className?: string;
  autoCapture?: boolean;
  maxAttempts?: number;
}

type VerificationStep = 'camera' | 'processing' | 'success' | 'failed' | 'no_face_registered';

// Estado consolidado
interface FaceVerificationState {
  currentStep: VerificationStep;
  error: string | null;
  attempts: number;
  confidence: number | null;
  matchedUserId: string | null;
}

// Constantes
const INITIAL_STATE: FaceVerificationState = {
  currentStep: 'camera',
  error: null,
  attempts: 0,
  confidence: null,
  matchedUserId: null
};

export default function FaceVerification({
  onSuccess,
  onError,
  onCancel,
  onRegisterRequest,
  className = '',
  autoCapture = false,
  maxAttempts = 3
}: FaceVerificationProps) {
  // Estado consolidado
  const [state, setState] = useState<FaceVerificationState>(INITIAL_STATE);
  
  // Função para atualizar estado
  const updateState = useCallback((updates: Partial<FaceVerificationState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const autoCaptureTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { user } = useAuth();
  
  const {
    verifyFaceEmbedding,
    validateImageQuality,
    hasRegisteredFace,
    isLoading,
    error: embeddingError
  } = useFaceEmbeddings();

  // Verificar se há rosto cadastrado ao montar o componente
  useEffect(() => {
    checkFaceRegistration();
  }, []);

  // Auto-captura OTIMIZADA (sem spam de logs)
  useEffect(() => {
    if (autoCapture && state.currentStep === 'camera') {
      let attempts = 0;
      const maxAttempts = 20; // Máximo 20 tentativas em 10s
      
      const tryAutoCapture = () => {
        if (!videoRef.current) return;
        
        const video = videoRef.current;
        attempts++;
        
        // ✅ Verificação ULTRA-FLEXÍVEL de prontidão do vídeo
        const isVideoReady = video.videoWidth > 0 && 
                            video.videoHeight > 0 && 
                            video.readyState >= 1; // Apenas HAVE_METADATA - mais simples
        
        if (isVideoReady) {
          // 📸 Vídeo está pronto - fazer captura IMEDIATAMENTE
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            if (ctx) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              
              // ✅ Captura síncrona para evitar problemas
              canvas.toBlob((blob) => {
                if (blob) {
                  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                  console.log('✅ Auto-captura realizada com sucesso!');
                  handlePhotoCapture(blob, imageData);
                } else {
                  console.warn('⚠️ Falha ao gerar blob na auto-captura');
                }
              }, 'image/jpeg', 0.9); // Qualidade maior
            }
          } catch (error) {
            console.error('❌ Erro na auto-captura:', error);
          }
        } else if (attempts < maxAttempts) {
          // ⏳ Tentar novamente mais rapidamente
          autoCaptureTimeoutRef.current = setTimeout(tryAutoCapture, 500);
        } else {
          // ⚠️ Falhou após todas as tentativas - apenas um log
          console.warn(`⚠️ Auto-captura cancelada - vídeo não ficou pronto após ${maxAttempts * 0.5}s (${maxAttempts} tentativas)`);
        }
      };
      
      // Iniciar tentativas após 5 segundos (mais tempo para carregar)
      autoCaptureTimeoutRef.current = setTimeout(tryAutoCapture, 5000);
    }

    return () => {
      if (autoCaptureTimeoutRef.current) {
        clearTimeout(autoCaptureTimeoutRef.current);
      }
    };
  }, [autoCapture, state.currentStep]);

  // Verificar se há rosto cadastrado
  const checkFaceRegistration = useCallback(async () => {
    if (!user?.uid) return;
    
    try {
      const hasRegistered = await hasRegisteredFace(user.uid);
      if (!hasRegistered) {
        updateState({ currentStep: 'no_face_registered' });
      }
    } catch (err) {
      console.error('Erro ao verificar rosto cadastrado:', err);
      updateState({ error: 'Erro ao verificar cadastro facial' });
    }
  }, [user?.uid, hasRegisteredFace, updateState]);

  // Manipular captura de foto
  const handlePhotoCapture = useCallback(async (blob: Blob, imageData: ImageData) => {
    if (!user?.uid) {
      updateState({ error: 'Usuário não autenticado' });
      return;
    }

    try {
      updateState({ error: null, currentStep: 'processing' });
      
      // Criar elemento de imagem para validação
      const img = new Image();
      img.onload = async () => {
        try {
          // Validar qualidade da imagem
          const validation = await validateImageQuality(img);
          
          if (!validation.isValid) {
            const newAttempts = state.attempts + 1;
            updateState({ 
              error: validation.message, 
              currentStep: 'camera', 
              attempts: newAttempts 
            });
            return;
          }
          
          // Verificar rosto
          const result = await verifyFaceEmbedding(blob);
          
          if (result.success) {
            const successData = {
              matchedUserId: user.uid,
              confidence: result.similarity,
              currentStep: 'success' as VerificationStep
            };
            updateState(successData);
            
            setTimeout(() => {
              onSuccess?.({ userId: user.uid, confidence: result.similarity });
            }, 1500);
            
          } else {
            const newAttempts = state.attempts + 1;
            
            if (newAttempts >= maxAttempts) {
              updateState({ 
                currentStep: 'failed', 
                error: `Reconhecimento facial falhou após ${maxAttempts} tentativas.`,
                attempts: newAttempts
              });
            } else {
              updateState({ 
                error: result.message || 'Rosto não reconhecido. Tente novamente.',
                currentStep: 'camera',
                attempts: newAttempts
              });
            }
          }
          
        } catch (err) {
          const newAttempts = state.attempts + 1;
          updateState({ 
            error: 'Erro na verificação facial.',
            currentStep: 'camera',
            attempts: newAttempts
          });
        }
      };
      
      img.onerror = () => {
        const newAttempts = state.attempts + 1;
        updateState({ 
          error: 'Erro ao processar imagem capturada.',
          currentStep: 'camera',
          attempts: newAttempts
        });
      };
      
      img.src = URL.createObjectURL(blob);
      
    } catch (err) {
      const newAttempts = state.attempts + 1;
      updateState({ 
        error: 'Erro ao capturar foto. Tente novamente.',
        currentStep: 'camera',
        attempts: newAttempts
      });
    }
  }, [user?.uid, validateImageQuality, verifyFaceEmbedding, onSuccess, maxAttempts, state.attempts, updateState]);

  // Manipular erro da câmera
  const handleCameraError = useCallback((error: string) => {
    updateState({ error });
  }, [updateState]);

  // Reiniciar processo
  const handleRestart = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  // Renderizar conteúdo baseado no passo atual
  const renderStepContent = () => {
    switch (state.currentStep) {
      case 'camera':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                🔐 Verificação Facial
              </h2>
              <p className="text-gray-600">
                {autoCapture 
                  ? 'Posicione seu rosto na câmera. A captura será automática.'
                  : 'Capture uma foto clara do seu rosto para verificação'
                }
              </p>
              {state.attempts > 0 && (
                <p className="text-orange-600 text-sm mt-2">
                  Tentativa {state.attempts + 1} de {maxAttempts}
                </p>
              )}
            </div>
            
            <CameraPanel
              onPhotoCapture={handlePhotoCapture}
              onError={handleCameraError}
              onFaceDetected={(count) => {
                // Face detection callback - produção otimizada
              }}
              showPreview={true}
              autoStart={true}
              enableFaceDetection={true}
              requireFace={false}
            />
            
            {autoCapture && (
              <div className="text-center">
                <div className="inline-flex items-center px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="animate-pulse w-2 h-2 bg-blue-600 rounded-full mr-2"></div>
                  <span className="text-sm text-blue-700">Captura automática em andamento...</span>
                </div>
              </div>
            )}
            
            {state.error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <div className="text-red-600 mr-2">⚠️</div>
                  <div className="text-sm text-red-700 whitespace-pre-line">
                    {state.error}
                  </div>
                </div>
                {state.error.includes('Face API') && (
                  <div className="mt-2 text-xs text-red-500">
                    💡 Dica: Tente recarregar a página ou verificar sua conexão
                  </div>
                )}
              </div>
            )}
          </div>
        );

      case 'processing':
        return (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🤖</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Verificando...
            </h2>
            <p className="text-gray-600 mb-4">
              Analisando seu rosto
            </p>
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          </div>
        );

      case 'success':
        return (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-green-600 mb-2">
              Verificação Bem-sucedida!
            </h2>
            <p className="text-gray-600 mb-4">
              Rosto reconhecido com sucesso.
            </p>
            {state.confidence !== null && (
              <div className="text-sm text-gray-500">
                Confiança: {Math.round(state.confidence * 100)}%
              </div>
            )}
            {state.matchedUserId && (
              <div className="text-xs text-gray-400 mt-2">
                ID: {state.matchedUserId.substring(0, 8)}...
              </div>
            )}
          </div>
        );

      case 'failed':
        return (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-2xl font-bold text-red-600 mb-2">
              Verificação Falhou
            </h2>
            <p className="text-gray-600 mb-6">
              {state.error || 'Não foi possível reconhecer seu rosto.'}
            </p>
            <div className="space-y-3">
              <button
                onClick={handleRestart}
                className="block w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                🔄 Tentar Novamente
              </button>
              {onRegisterRequest && (
                <button
                  onClick={onRegisterRequest}
                  className="block w-full bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  📝 Cadastrar Novo Rosto
                </button>
              )}
            </div>
          </div>
        );

      case 'no_face_registered':
        return (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">👤</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Nenhum Rosto Cadastrado
            </h2>
            <p className="text-gray-600 mb-6">
              Você precisa cadastrar seu rosto antes de usar a verificação facial.
            </p>
            {onRegisterRequest && (
              <button
                onClick={onRegisterRequest}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                📸 Cadastrar Rosto
              </button>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`max-w-2xl mx-auto ${className}`}>
      {/* Indicador de progresso */}
      {state.currentStep !== 'no_face_registered' && (
        <div className="mb-8">
          <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
            <span>Verificação Facial</span>
            <span>
              {state.currentStep === 'camera' && 'Aguardando captura'}
              {state.currentStep === 'processing' && 'Processando...'}
              {state.currentStep === 'success' && 'Concluído'}
              {state.currentStep === 'failed' && 'Falhou'}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${
                state.currentStep === 'failed' ? 'bg-red-500' : 
                state.currentStep === 'success' ? 'bg-green-500' : 'bg-blue-600'
              }`}
              style={{ 
                width: 
                  state.currentStep === 'camera' ? '25%' :
                  state.currentStep === 'processing' ? '75%' :
                  (state.currentStep === 'success' || state.currentStep === 'failed') ? '100%' : '0%'
              }}
            ></div>
          </div>
        </div>
      )}

      {/* Conteúdo do passo atual */}
      <div className="bg-white rounded-2xl shadow-xl p-6">
        {renderStepContent()}
      </div>

      {/* Controles de navegação */}
      {(state.currentStep === 'camera' || state.currentStep === 'no_face_registered') && (
        <div className="mt-6 flex justify-center gap-4">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              ❌ Cancelar
            </button>
          )}
        </div>
      )}

      {/* Loading overlay */}
      {(isLoading || state.currentStep === 'processing') && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Processando...</p>
          </div>
        </div>
      )}

      {/* Elemento de vídeo oculto para referência */}
      <video
        ref={videoRef}
        className="hidden"
        playsInline
        muted
      />
    </div>
  );
}

// Tipos para exportação
export type { FaceVerificationProps };