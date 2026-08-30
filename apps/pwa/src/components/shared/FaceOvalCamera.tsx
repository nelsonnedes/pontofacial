'use client';

import React from 'react';

// ✅ COMPONENTE UNIFICADO - CÍRCULO PADRÃO PARA TODA A APLICAÇÃO
interface FaceOvalCameraProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  cameraReady?: boolean;
  showVideo?: boolean;
  streamRef?: React.RefObject<MediaStream | null>;
  
  // Estados visuais
  stage?: 'positioning' | 'capturing' | 'success' | 'error' | 'retry' | 'processing' | 'failed' | 'loading' | 'instructions';
  countdown?: number;
  isCapturing?: boolean;
  
  // Mensagens e erros
  message?: string;
  cameraError?: string;
  
  // Customização
  showCountdown?: boolean;
  showStatusIndicators?: boolean;
  countdownColor?: 'dynamic' | 'blue' | 'green' | 'red';
}

export default function FaceOvalCamera({
  videoRef,
  cameraReady = false,
  showVideo = false,
  streamRef,
  stage = 'positioning',
  countdown = 0,
  isCapturing = false,
  message,
  cameraError,
  showCountdown = true,
  showStatusIndicators = true,
  countdownColor = 'dynamic'
}: FaceOvalCameraProps) {
  
  // ✅ ESTADO VISUAL UNIFICADO
  const getOvalState = () => {
    switch (stage) {
      case 'positioning': return cameraReady ? 'detecting' : 'waiting';
      case 'capturing': return 'validating';
      case 'success': return 'success';
      case 'processing': return 'success';
      case 'error': return 'failed';
      case 'failed': return 'failed';
      case 'retry': return 'retry';
      case 'loading': return 'waiting';
      case 'instructions': return 'waiting';
      default: return 'waiting';
    }
  };

  // ✅ COR DO COUNTDOWN UNIFICADA
  const getCountdownColorClass = () => {
    if (countdownColor === 'blue') return 'text-blue-400';
    if (countdownColor === 'green') return 'text-green-400';
    if (countdownColor === 'red') return 'text-red-400';
    
    // Dinâmica (padrão da captura)
    if (countdown > 3) return 'text-blue-500';
    if (countdown > 1) return 'text-yellow-500';
    return 'text-red-500';
  };

  // ✅ LÓGICA DE VISIBILIDADE UNIFICADA E CORRIGIDA
  const isVideoVisible = () => {
    // Se streamRef foi passado (cadastro), usa ele
    if (streamRef) {
      return cameraReady && streamRef.current;
    }
    // Senão, usa showVideo (captura) - padrão true se não especificado
    return cameraReady && (showVideo !== false);
  };

  // ✅ CONDIÇÃO DE COUNTDOWN UNIFICADA E CORRIGIDA
  const shouldShowCountdown = () => {
    if (!showCountdown || countdown <= 0) return false;
    
    // Para captura: só mostra em positioning
    if (stage === 'positioning') return !isCapturing;
    
    // Para cadastro: mostra em capturing e outros stages
    if (stage === 'capturing' || stage === 'instructions' || stage === 'retry' || stage === 'failed') {
      return !isCapturing;
    }
    
    // Fallback: mostra sempre que não estiver capturando
    return !isCapturing;
  };

  return (
    <div className="face-oval-container">
      <div className={`face-oval face-oval--${getOvalState()}`}>
        
        {/* ✅ VÍDEO UNIFICADO */}
        <video
          ref={videoRef}
          className="face-video-inside"
          autoPlay
          muted
          playsInline
          style={{ 
            transform: (() => {
              const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
              return isMobile ? 'scaleX(-1) scale(1.3)' : 'scaleX(-1) scale(2)'; // ✅ MOBILE: Zoom menor para melhor enquadramento
            })(),
            opacity: isVideoVisible() ? 1 : 0,
            visibility: isVideoVisible() ? 'visible' : 'hidden'
          }}
          onLoadedData={() => {
            console.log('📹 Vídeo carregado no círculo unificado');
            console.log('🎯 VideoRef disponível:', !!videoRef?.current);
          }}
          onError={(e) => console.error('❌ Erro no vídeo do círculo unificado:', e)}
          onCanPlay={() => console.log('📹 Vídeo pode ser reproduzido (círculo unificado)')}
          onPlay={() => console.log('📹 Vídeo iniciou reprodução (círculo unificado)')}
        />

        {/* ✅ LOADING UNIFICADO */}
        {!cameraReady && (
          <div className="camera-loading">
            <div className="text-2xl">📹</div>
            <div className="text-xs text-gray-500 mt-1">
              {cameraError ? `Erro: ${cameraError}` : 'Iniciando câmera...'}
            </div>
          </div>
        )}
        
        {/* ✅ COUNTDOWN UNIFICADO */}
        {shouldShowCountdown() && (
          <div className="countdown-number-only">
            <span className={`countdown-big ${getCountdownColorClass()}`}>
              {countdown}
            </span>
          </div>
        )}
        
        {/* ✅ INDICADORES DE STATUS UNIFICADOS */}
        {showStatusIndicators && (
          <>
            {/* Capturando */}
            {countdown === 0 && isCapturing && (
              <div className="success-indicator-transparent">
                <span className="text-2xl">📸</span>
              </div>
            )}

            {/* Estados específicos */}
            {stage === 'retry' && (
              <div className="success-indicator-transparent">
                <span className="text-2xl">🔄</span>
              </div>
            )}

            {(stage === 'failed' || stage === 'error') && (
              <div className="success-indicator-transparent">
                <span className="text-3xl">❌</span>
              </div>
            )}

            {(stage === 'processing' || stage === 'success') && (
              <div className="success-indicator-transparent">
                <span className="text-3xl">✅</span>
              </div>
            )}
          </>
        )}
        
        {/* ✅ MENSAGEM PERSONALIZADA (para captura) */}
        {message && (
          <div className="status-message-overlay">
            <div className="status-message">
              {message}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
