'use client';

import { useState, useRef, useCallback } from 'react';
import CameraPanel from './CameraPanel';

interface PhotoCaptureProps {
  onPhotoCapture?: (blob: Blob, imageData: ImageData) => void;
  onError?: (error: string) => void;
  required?: boolean;
  showPreview?: boolean;
  enableFaceDetection?: boolean;
  className?: string;
}

type CaptureStep = 'camera' | 'preview' | 'success';

export default function PhotoCapture({
  onPhotoCapture,
  onError,
  required = true,
  showPreview = true,
  enableFaceDetection = false,
  className = ''
}: PhotoCaptureProps) {
  const [currentStep, setCurrentStep] = useState<CaptureStep>('camera');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const capturedBlobRef = useRef<Blob | null>(null);
  const capturedImageDataRef = useRef<ImageData | null>(null);

  // Handler para captura da foto
  const handlePhotoCapture = useCallback(async (blob: Blob, imageData: ImageData) => {
    try {
      console.log('📸 Foto capturada para validação manual');
      
      // Salvar referências dos dados capturados
      capturedBlobRef.current = blob;
      capturedImageDataRef.current = imageData;
      
      // Criar preview da imagem
      const imageUrl = URL.createObjectURL(blob);
      setCapturedImage(imageUrl);
      setCurrentStep('preview');
      setError(null);
      
    } catch (err) {
      const errorMessage = 'Erro ao processar foto capturada';
      console.error('❌ Erro na captura de foto:', err);
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [onError]);

  // Handler para confirmar a foto
  const handleConfirmPhoto = useCallback(async () => {
    if (!capturedBlobRef.current || !capturedImageDataRef.current) {
      setError('Dados da foto não disponíveis');
      return;
    }

    setIsProcessing(true);
    try {
      console.log('✅ Confirmando foto para registro de ponto');
      
      await onPhotoCapture?.(capturedBlobRef.current, capturedImageDataRef.current);
      setCurrentStep('success');
      
    } catch (err) {
      const errorMessage = 'Erro ao confirmar foto';
      console.error('❌ Erro ao confirmar foto:', err);
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  }, [onPhotoCapture, onError]);

  // Handler para rejeitar foto e tentar novamente
  const handleRetakePhoto = useCallback(() => {
    // Limpar dados anteriores
    if (capturedImage) {
      URL.revokeObjectURL(capturedImage);
    }
    setCapturedImage(null);
    capturedBlobRef.current = null;
    capturedImageDataRef.current = null;
    setCurrentStep('camera');
    setError(null);
  }, [capturedImage]);

  // Handler para erro da câmera
  const handleCameraError = useCallback((error: string) => {
    setError(error);
    onError?.(error);
  }, [onError]);

  // Renderizar conteúdo baseado no passo atual
  const renderStepContent = () => {
    switch (currentStep) {
      case 'camera':
        return (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-gray-600 text-sm">
                {required 
                  ? 'Capture uma foto clara do seu rosto. Esta foto será usada para validação.'
                  : 'Capture uma foto opcional para complementar o registro.'
                }
              </p>
            </div>
            
            <CameraPanel
              onPhotoCapture={handlePhotoCapture}
              onError={handleCameraError}
              showPreview={showPreview}
              autoStart={true}
              enableFaceDetection={enableFaceDetection}
              requireFace={false} // Não exigir detecção facial para modo backup
            />
            
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <div className="text-red-600 mr-2">⚠️</div>
                  <div className="text-sm text-red-700">
                    {error}
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 'preview':
        return (
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                📸 Confirmar Foto
              </h3>
              <p className="text-sm text-gray-600">
                Verifique se a foto está clara e mostra seu rosto adequadamente
              </p>
            </div>
            
            {/* Preview da imagem capturada */}
            {capturedImage && (
              <div className="flex justify-center">
                <div className="relative">
                  <img
                    src={capturedImage}
                    alt="Foto capturada"
                    className="max-w-sm w-full h-auto rounded-lg border-2 border-gray-200"
                  />
                  <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded text-xs">
                    ✅ Capturada
                  </div>
                </div>
              </div>
            )}
            
            {/* Controles de confirmação */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={handleConfirmPhoto}
                disabled={isProcessing}
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? '⏳ Confirmando...' : '✅ Confirmar Foto'}
              </button>
              
              <button
                onClick={handleRetakePhoto}
                disabled={isProcessing}
                className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50"
              >
                📸 Tirar Nova Foto
              </button>
            </div>
            
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <div className="text-red-600 mr-2">⚠️</div>
                  <div className="text-sm text-red-700">
                    {error}
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 'success':
        return (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">✅</div>
            <h3 className="text-xl font-bold text-green-600 mb-2">
              Foto Confirmada!
            </h3>
            <p className="text-gray-600">
              Sua foto foi capturada e será usada para validação.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`max-w-2xl mx-auto ${className}`}>
      {/* Indicador de progresso */}
      {currentStep !== 'success' && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
            <span>Captura de Foto</span>
            <span>
              {currentStep === 'camera' && '1/2 - Capturar'}
              {currentStep === 'preview' && '2/2 - Confirmar'}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="h-2 bg-blue-600 rounded-full transition-all duration-300"
              style={{ 
                width: 
                  currentStep === 'camera' ? '50%' :
                  currentStep === 'preview' ? '100%' : '0%'
              }}
            ></div>
          </div>
        </div>
      )}

      {/* Conteúdo do passo atual */}
      <div className="bg-white rounded-2xl shadow-xl p-6">
        {renderStepContent()}
      </div>

      {/* Informações adicionais */}
      {currentStep === 'camera' && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start">
            <div className="text-blue-600 mr-2">ℹ️</div>
            <div className="text-sm text-blue-700">
              <strong>Dicas para uma boa foto:</strong>
              <ul className="mt-1 list-disc list-inside space-y-1">
                <li>Certifique-se de que há boa iluminação</li>
                <li>Posicione seu rosto no centro da câmera</li>
                <li>Remova óculos escuros ou objetos que cubram o rosto</li>
                <li>Mantenha uma expressão neutra</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Processando foto...</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Tipos para exportação
export type { PhotoCaptureProps };
