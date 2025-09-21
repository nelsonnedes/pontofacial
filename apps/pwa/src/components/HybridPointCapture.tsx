'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useOfflineTimeRecords } from '@/hooks/useOfflineTimeRecords';
import { useGeofenceValidation } from '@/hooks/useGeofencing';
import FaceVerification from './FaceVerification';
import PhotoCapture from './PhotoCapture';
// Removido import Alert - usando div simples

// Tipos
type CaptureMode = 'facial' | 'photo' | 'hybrid';
type PontoType = 'entrada' | 'saida' | 'pausa_inicio' | 'pausa_fim';

interface CaptureData {
  photo: Blob;
  imageData?: ImageData;
  faceEmbedding?: any;
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
}

interface HybridPointCaptureProps {
  pontoType: PontoType;
  onSuccess?: (data: any) => void;
  onError?: (error: string) => void;
  className?: string;
}

// Constantes
  const FACE_API_TIMEOUT = 45000; // 45 segundos - muito mais tempo para timeout da Face API (otimizado)
const MAX_FACE_RETRIES = 2; // Máximo 2 tentativas com Face API

export default function HybridPointCapture({
  pontoType,
  onSuccess,
  onError,
  className = ''
}: HybridPointCaptureProps) {
  // Estados
  const [mode, setMode] = useState<CaptureMode>('facial');
  const [faceApiTimeout, setFaceApiTimeout] = useState(false);
  const [faceApiRetries, setFaceApiRetries] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>({});
  const [geofenceStatus, setGeofenceStatus] = useState<any>(null);
  
  // Hooks
  const { user } = useAuth();
  const { location, getCurrentLocation, isSupported: geoSupported } = useGeolocation();
  const { recordTime } = useOfflineTimeRecords();
  const { validateLocation, hasGeofences } = useGeofenceValidation();

  // Timer para timeout da Face API (otimizado para evitar re-mounts)
  useEffect(() => {
    if (mode === 'facial' && !faceApiTimeout) {
      const timer = setTimeout(() => {
        console.warn('⏰ Face API timeout - mudando para modo foto (sem re-mount)');
        
        // 🔄 Usar batch de updates para evitar múltiplos renders
        React.startTransition(() => {
          setFaceApiTimeout(true);
          setMode('photo');
          setDebugInfo(prev => ({ 
            ...prev, 
            faceApiTimeout: true, 
            fallbackReason: 'timeout' 
          }));
        });
      }, FACE_API_TIMEOUT);
      
      return () => clearTimeout(timer);
    }
  }, [mode, faceApiTimeout]);

  // Função para obter localização atual
  const getLocationData = useCallback(async () => {
    let locationData = location;
    
    if (geoSupported && getCurrentLocation && !locationData) {
      try {
        locationData = await getCurrentLocation();
        console.log('📍 Localização obtida:', locationData);
      } catch (geoError) {
        console.warn('⚠️ Erro ao obter localização:', geoError);
        // Continuar sem localização se houver erro
      }
    }
    
    return locationData;
  }, [location, geoSupported, getCurrentLocation]);

  // Função principal de captura (híbrida)
  const handleCapture = useCallback(async (data: CaptureData) => {
    if (!user) {
      const errorMsg = 'Usuário não autenticado';
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Obter localização
      const locationData = await getLocationData();
      
      // Validar geofencing se há cercas configuradas e localização disponível
      let geofenceValidation = null;
      if (hasGeofences && locationData) {
        console.log('🌍 Validando cercas virtuais...');
        geofenceValidation = await validateLocation(locationData, pontoType);
        setGeofenceStatus(geofenceValidation);
        
        // Se geofencing está no modo rigoroso e validação falhou
        if (!geofenceValidation.allowMarking) {
          throw new Error(geofenceValidation.message);
        }
        
        // Se há aviso de geofencing, logar mas continuar
        if (geofenceValidation.severity === 'warning') {
          console.warn('⚠️ Aviso de geofencing:', geofenceValidation.message);
        }
      }
      
      // Mapear tipos de ponto
      const typeMapping = {
        'entrada': 'entry' as const,
        'saida': 'exit' as const,
        'pausa_inicio': 'break_start' as const,
        'pausa_fim': 'break_end' as const
      };

      // Preparar dados do registro
      const pointRecord = {
        userId: user.uid,
        type: typeMapping[pontoType],
        timestamp: Date.now(),
        location: locationData ? {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          accuracy: locationData.accuracy
        } : undefined,
        captureMethod: mode, // 'facial', 'photo', ou 'hybrid'
        photo: data.photo, // SEMPRE salvar foto
        faceEmbedding: data.faceEmbedding, // Opcional (se Face API funcionou)
        metadata: {
          ...debugInfo,
          captureMode: mode,
          hasLocation: !!locationData,
          photoSize: data.photo.size,
          hasFaceEmbedding: !!data.faceEmbedding,
          geofenceValidation: geofenceValidation ? {
            isValid: geofenceValidation.isValid,
            fenceName: geofenceValidation.fence?.name,
            distance: geofenceValidation.distance,
            message: geofenceValidation.message,
            severity: geofenceValidation.severity
          } : null
        }
      };

      console.log('💾 Salvando registro de ponto:', pointRecord);

      // Salvar registro
      const result = await recordTime(pointRecord);
      
      if (!result.success) {
        throw new Error(result.message || 'Erro ao registrar ponto');
      }
      
      // Sucesso
      console.log('✅ Ponto registrado com sucesso');
      onSuccess?.({
        ...result,
        method: mode,
        hasLocation: !!locationData,
        hasFaceEmbedding: !!data.faceEmbedding
      });
      
    } catch (error) {
      console.error('❌ Erro ao registrar ponto:', error);
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      setIsProcessing(false);
    }
  }, [user, pontoType, mode, getLocationData, recordTime, debugInfo, onSuccess, onError]);

  // Handler para sucesso da verificação facial
  const handleFaceVerificationSuccess = useCallback(async (faceData: any) => {
    console.log('✅ Verificação facial bem-sucedida');
    
    // Capturar foto adicional para auditoria (mesmo com face API funcionando)
    const photoCapture = document.createElement('canvas');
    const video = document.querySelector('video');
    
    if (video && video.videoWidth > 0) {
      const ctx = photoCapture.getContext('2d');
      photoCapture.width = video.videoWidth;
      photoCapture.height = video.videoHeight;
      ctx?.drawImage(video, 0, 0);
      
      photoCapture.toBlob(async (blob) => {
        if (blob) {
          await handleCapture({
            photo: blob,
            faceEmbedding: faceData,
            location: await getLocationData()
          });
        }
      }, 'image/jpeg', 0.8);
    }
  }, [handleCapture, getLocationData]);

  // Handler para erro da verificação facial
  const handleFaceVerificationError = useCallback((error: string) => {
    console.warn('⚠️ Erro na verificação facial:', error);
    
    setFaceApiRetries(prev => prev + 1);
    setDebugInfo(prev => ({ 
      ...prev, 
      faceApiError: error,
      faceApiRetries: faceApiRetries + 1
    }));
    
    if (faceApiRetries >= MAX_FACE_RETRIES) {
      console.log('🔄 Máximo de tentativas atingido, mudando para modo foto');
      setMode('photo');
      setDebugInfo(prev => ({ 
        ...prev, 
        fallbackReason: 'max_retries' 
      }));
    } else {
      console.log(`🔄 Tentativa ${faceApiRetries + 1}/${MAX_FACE_RETRIES} com Face API`);
    }
  }, [faceApiRetries]);

  // Handler para captura de foto (modo fallback)
  const handlePhotoCapture = useCallback(async (blob: Blob, imageData: ImageData) => {
    console.log('📸 Captura de foto (modo fallback)');
    
    await handleCapture({
      photo: blob,
      imageData,
      location: await getLocationData()
    });
  }, [handleCapture, getLocationData]);

  // Handler para forçar modo foto
  const forcePhotoMode = useCallback(() => {
    setMode('photo');
    setDebugInfo(prev => ({ 
      ...prev, 
      fallbackReason: 'user_requested' 
    }));
  }, []);

  // Renderização condicional baseada no modo
  const renderContent = () => {
    if (mode === 'facial' && !faceApiTimeout && faceApiRetries < MAX_FACE_RETRIES) {
      return (
        <div className="space-y-4">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              🤖 Verificação Facial
            </h3>
            <p className="text-sm text-gray-600">
              Posicione seu rosto para reconhecimento automático
            </p>
          </div>
          
          <FaceVerification
            onSuccess={handleFaceVerificationSuccess}
            onError={handleFaceVerificationError}
            autoCapture={true}
            maxAttempts={MAX_FACE_RETRIES}
          />
          
          {/* Botão para forçar modo foto */}
          <div className="text-center">
            <button
              onClick={forcePhotoMode}
              className="text-sm text-blue-600 hover:text-blue-700 underline"
            >
              Problemas com reconhecimento? Usar foto manual
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            📸 Captura de Foto
          </h3>
          <p className="text-sm text-gray-600">
            {faceApiTimeout 
              ? 'Reconhecimento facial indisponível. Capture uma foto clara do seu rosto.'
              : 'Capture uma foto clara do seu rosto para confirmar sua identidade.'
            }
          </p>
        </div>
        
        <PhotoCapture
          onPhotoCapture={handlePhotoCapture}
          onError={(error) => setError(error)}
          required={true}
          showPreview={true}
          enableFaceDetection={false} // Não depender da Face API
        />
        
        {/* Informações sobre o fallback */}
        {(faceApiTimeout || faceApiRetries > 0) && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-700">
              ℹ️ Sistema de backup ativado. Sua foto será capturada para validação manual posterior.
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`max-w-2xl mx-auto ${className}`}>
      {/* Header com informações do ponto */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-2xl">
            {pontoType === 'entrada' && '🟢'}
            {pontoType === 'saida' && '🔴'}
            {pontoType === 'pausa_inicio' && '⏸️'}
            {pontoType === 'pausa_fim' && '▶️'}
          </span>
          <h2 className="text-xl font-bold text-gray-900">
            {pontoType.replace('_', ' ').toUpperCase()}
          </h2>
        </div>
        
        {/* Indicadores de status */}
        <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
          <span className={`flex items-center gap-1 ${location ? 'text-green-600' : 'text-yellow-600'}`}>
            {location ? '🌍' : '📍'} 
            {location ? `GPS: ${location.accuracy?.toFixed(0)}m` : 'Obtendo localização...'}
          </span>
          <span className={`flex items-center gap-1 ${mode === 'facial' ? 'text-blue-600' : 'text-gray-600'}`}>
            {mode === 'facial' ? '🤖' : '📸'} 
            {mode === 'facial' ? 'Modo Facial' : 'Modo Foto'}
          </span>
          {hasGeofences && (
            <span className={`flex items-center gap-1 ${
              geofenceStatus?.isValid 
                ? 'text-green-600' 
                : geofenceStatus?.severity === 'warning'
                ? 'text-yellow-600'
                : geofenceStatus
                ? 'text-red-600'
                : 'text-gray-500'
            }`}>
              🎯 {geofenceStatus?.isValid ? 'Área OK' : geofenceStatus ? 'Área!!' : 'Cercas'}
            </span>
          )}
        </div>
      </div>

      {/* Conteúdo principal */}
      <div className="bg-white rounded-2xl shadow-xl p-6">
        {renderContent()}
      </div>

      {/* Status de geofencing */}
      {geofenceStatus && !geofenceStatus.isValid && (
        <div className={`mt-4 p-4 border rounded-lg ${
          geofenceStatus.severity === 'warning' 
            ? 'bg-yellow-50 border-yellow-200' 
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-start">
            <div className={`mr-2 ${
              geofenceStatus.severity === 'warning' ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {geofenceStatus.severity === 'warning' ? '⚠️' : '🚫'}
            </div>
            <div className={`text-sm ${
              geofenceStatus.severity === 'warning' ? 'text-yellow-700' : 'text-red-700'
            }`}>
              <strong>Cercas Virtuais:</strong> {geofenceStatus.message}
              {geofenceStatus.distance && (
                <div className="mt-1 text-xs">
                  Distância: {Math.round(geofenceStatus.distance)}m
                  {geofenceStatus.fence && ` da cerca "${geofenceStatus.fence.name}"`}
                </div>
              )}
              {geofenceStatus.severity === 'warning' && (
                <div className="mt-2 text-xs font-medium">
                  ℹ️ Marcação será permitida, mas registrada para auditoria.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Erro geral */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start">
            <div className="text-red-600 mr-2">⚠️</div>
            <div className="text-sm text-red-700">
              {error}
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Registrando ponto...</p>
          </div>
        </div>
      )}

      {/* Debug info (apenas em desenvolvimento) */}
      {process.env.NODE_ENV === 'development' && Object.keys(debugInfo).length > 0 && (
        <div className="mt-4 p-3 bg-gray-100 border rounded-lg">
          <details>
            <summary className="text-sm font-medium cursor-pointer">Debug Info</summary>
            <pre className="text-xs mt-2 text-gray-600">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

// Tipos para exportação
export type { HybridPointCaptureProps, CaptureMode, CaptureData };
