'use client';

import { useState, useRef } from 'react';
import CameraPanel from './CameraPanel';
import LivenessStep from './LivenessStep';
import { useFaceEmbeddings } from '@/hooks/useFaceEmbeddings';

interface FaceRegistrationProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  className?: string;
}

type RegistrationStep = 'camera' | 'liveness' | 'processing' | 'success' | 'error';

export default function FaceRegistration({
  onSuccess,
  onCancel,
  className = ''
}: FaceRegistrationProps) {
  const [currentStep, setCurrentStep] = useState<RegistrationStep>('camera');
  const [capturedImage, setCapturedImage] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [livenessCompleted, setLivenessCompleted] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    registerFaceEmbedding,
    validateImageQuality,
    isLoading,
    error: embeddingError
  } = useFaceEmbeddings();

  // Manipular captura de foto
  const handlePhotoCapture = async (blob: Blob, imageData: ImageData) => {
    try {
      setError(null);
      
      // Criar elemento de imagem para validação
      const img = new Image();
      img.onload = async () => {
        try {
          // Validar qualidade da imagem
          const validation = await validateImageQuality(img);
          
          if (!validation.isValid) {
            setError(validation.message);
            if (validation.suggestions && validation.suggestions.length > 0) {
              setError(prev => `${prev}\n\nSugestões:\n${validation.suggestions!.map(s => `• ${s}`).join('\n')}`);
            }
            return;
          }
          
          // Imagem válida, prosseguir para teste de vivacidade
          setCapturedImage(blob);
          setCurrentStep('liveness');
          
        } catch (err) {
          setError('Erro na validação da imagem. Tente novamente.');
        }
      };
      
      img.onerror = () => {
        setError('Erro ao processar imagem capturada.');
      };
      
      img.src = URL.createObjectURL(blob);
      
    } catch (err) {
      setError('Erro ao capturar foto. Tente novamente.');
    }
  };

  // Manipular erro da câmera
  const handleCameraError = (error: string) => {
    setError(error);
  };

  // Manipular conclusão do teste de vivacidade
  const handleLivenessComplete = (success: boolean) => {
    if (success) {
      setLivenessCompleted(true);
      processFaceRegistration();
    } else {
      setError('Teste de vivacidade falhou. Tente novamente.');
      setCurrentStep('camera');
      setCapturedImage(null);
    }
  };

  // Processar cadastro facial
  const processFaceRegistration = async () => {
    if (!capturedImage) {
      setError('Nenhuma imagem capturada.');
      return;
    }

    setCurrentStep('processing');
    setError(null);

    try {
      const result = await registerFaceEmbedding(capturedImage);
      
      if (result.success) {
        setCurrentStep('success');
        setTimeout(() => {
          onSuccess?.();
        }, 2000);
      } else {
        setError(result.message);
        setCurrentStep('error');
      }
      
    } catch (err) {
      setError('Erro inesperado no cadastro facial.');
      setCurrentStep('error');
    }
  };

  // Reiniciar processo
  const handleRestart = () => {
    setCurrentStep('camera');
    setCapturedImage(null);
    setError(null);
    setLivenessCompleted(false);
  };

  // Renderizar conteúdo baseado no passo atual
  const renderStepContent = () => {
    switch (currentStep) {
      case 'camera':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                📸 Cadastro Facial
              </h2>
              <p className="text-sm sm:text-base text-gray-600">
                Capture uma foto clara do seu rosto para cadastro
              </p>
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
            
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <div className="text-red-600 mr-2">⚠️</div>
                  <div className="text-sm text-red-700 whitespace-pre-line">
                    {error}
                  </div>
                </div>
                {error.includes('Face API') && (
                  <div className="mt-2 text-xs text-red-500">
                    💡 Dica: Tente recarregar a página ou verificar sua conexão
                  </div>
                )}
              </div>
            )}
          </div>
        );

      case 'liveness':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                🔍 Teste de Vivacidade
              </h2>
              <p className="text-sm sm:text-base text-gray-600">
                Complete os desafios para confirmar que você é uma pessoa real
              </p>
            </div>
            
            <LivenessStep
              videoElement={videoRef.current || undefined}
              onAllChallengesComplete={handleLivenessComplete}
              onError={(error) => setError(error)}
              autoDetection={false} // Usar controles manuais para cadastro
            />
          </div>
        );

      case 'processing':
        return (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🤖</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Processando...
            </h2>
            <p className="text-gray-600 mb-4">
              Analisando e cadastrando seu rosto
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
              Cadastro Concluído!
            </h2>
            <p className="text-gray-600">
              Seu rosto foi cadastrado com sucesso. Agora você pode usar reconhecimento facial para marcar ponto.
            </p>
          </div>
        );

      case 'error':
        return (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-2xl font-bold text-red-600 mb-2">
              Erro no Cadastro
            </h2>
            <p className="text-gray-600 mb-6">
              {error || embeddingError || 'Ocorreu um erro inesperado.'}
            </p>
            <button
              onClick={handleRestart}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              🔄 Tentar Novamente
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`max-w-2xl mx-auto ${className}`}>
      {/* Indicador de progresso */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
          <span>Progresso do Cadastro</span>
          <span>
            {currentStep === 'camera' && '1/3'}
            {currentStep === 'liveness' && '2/3'}
            {(currentStep === 'processing' || currentStep === 'success') && '3/3'}
            {currentStep === 'error' && 'Erro'}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-300 ${
              currentStep === 'error' ? 'bg-red-500' : 'bg-blue-600'
            }`}
            style={{ 
              width: 
                currentStep === 'camera' ? '33%' :
                currentStep === 'liveness' ? '66%' :
                (currentStep === 'processing' || currentStep === 'success') ? '100%' :
                currentStep === 'error' ? '100%' : '0%'
            }}
          ></div>
        </div>
      </div>

      {/* Conteúdo do passo atual */}
      <div className="bg-white rounded-2xl shadow-xl p-6">
        {renderStepContent()}
      </div>

      {/* Controles de navegação */}
      {(currentStep === 'camera' || currentStep === 'error') && (
        <div className="mt-6 flex justify-center gap-4">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium w-full sm:w-auto"
            >
              ❌ Cancelar
            </button>
          )}
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
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
export type { FaceRegistrationProps };