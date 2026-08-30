'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';

// ✅ ZERO IMPORTS DIRETOS - SEM DEPENDÊNCIA CIRCULAR
import { useInitialFaceVerification } from '@/hooks/useInitialFaceVerification';

// ✅ IMPORTAR CSS DO MARCAR PONTO PARA PADRÃO IDÊNTICO
import '@/styles/marcar-ponto-optimized.css';

// Componente de Loading
function FaceVerificationLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Carregando sistema de verificação facial...</p>
      </div>
    </div>
  );
}

// ✅ COMPONENTE DO CÍRCULO OVAL - PADRÃO EXATO DO MARCAR PONTO
interface FaceOvalWithVideoProps {
  countdown: number;
  hasDetected: boolean;
  videoRef?: React.RefObject<HTMLVideoElement>;
  showVideo?: boolean;
  cameraReady?: boolean;
  stage?: 'positioning' | 'verifying' | 'success' | 'not_found' | 'error';
  message?: string;
  isCapturing?: boolean;
  attemptCount?: number;
}

function FaceOvalWithVideo({ 
  countdown, 
  hasDetected,
  videoRef, 
  showVideo = false,
  cameraReady = false,
  stage = 'positioning',
  message,
  isCapturing = false,
  attemptCount = 0
}: FaceOvalWithVideoProps) {
  
  const getOvalState = () => {
    switch (stage) {
      case 'positioning': return cameraReady ? 'detecting' : 'waiting';
      case 'verifying': return 'validating';
      case 'success': return 'success';
      case 'not_found': return 'retry';
      case 'error': return 'failed';
      default: return 'waiting';
    }
  };

  const getCountdownColor = () => {
    if (countdown > 3) return 'text-blue-500';
    if (countdown > 1) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className="face-oval-container">
      <div className={`face-oval face-oval--${getOvalState()}`}>
        
        {/* ✅ VÍDEO: SEMPRE RENDERIZADO - Visibilidade controlada por CSS */}
        <video
          ref={videoRef}
          className="face-video-inside"
          autoPlay
          muted
          playsInline
          style={{ 
            transform: 'scaleX(-1) scale(2)', // ✅ Zoom 2x para melhor qualidade
            opacity: (cameraReady && showVideo) ? 1 : 0,
            visibility: (cameraReady && showVideo) ? 'visible' : 'hidden'
          }}
          onLoadedData={() => {
            console.log('📹 Vídeo carregado e visível no círculo oval');
            console.log('🎯 VideoRef agora disponível:', !!videoRef?.current);
          }}
          onError={(e) => console.error('❌ Erro no elemento video:', e)}
          onCanPlay={() => console.log('📹 Vídeo pode ser reproduzido')}
          onPlay={() => console.log('📹 Vídeo iniciou reprodução')}
        />

        {/* ✅ LOADING: BASEADO APENAS NO ESTADO DA CÂMERA */}
        {!cameraReady && (
          <div className="camera-loading">
            <div className="text-2xl">📹</div>
            <div className="text-xs text-gray-500 mt-1">
              Iniciando câmera...
            </div>
          </div>
        )}
        
        {/* ✅ COUNTDOWN: Apenas número centralizado e transparente */}
        {countdown > 0 && stage !== 'success' && !isCapturing && (
          <div className="countdown-number-only">
            <span className={`countdown-big ${getCountdownColor()}`}>
              {countdown}
            </span>
          </div>
        )}
        
        {/* Indicadores de estado - MINIMALISTAS */}
        {hasDetected && countdown === 0 && stage === 'positioning' && !isCapturing && (
          <div className="success-indicator-transparent">
            <span className="text-2xl">🎯</span>
          </div>
        )}
        
        {stage === 'success' && (
          <div className="success-indicator-transparent">
            <span className="text-4xl">✅</span>
            <div className="text-sm font-semibold text-white mt-2">
              Funcionário<br/>Identificado!
            </div>
          </div>
        )}

        {stage === 'verifying' && (
          <div className="success-indicator-transparent">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
            <div className="text-sm font-semibold text-white">Verificando...</div>
          </div>
        )}

        {stage === 'not_found' && (
          <div className="success-indicator-transparent">
            <span className="text-4xl">❓</span>
            <div className="text-sm font-semibold text-white mt-2">
              Funcionário não<br/>encontrado
            </div>
          </div>
        )}

        {stage === 'error' && (
          <div className="success-indicator-transparent">
            <span className="text-4xl">❌</span>
            <div className="text-sm font-semibold text-white mt-2">
              Erro na<br/>verificação
            </div>
          </div>
        )}

        {/* Instruções */}
        {stage === 'positioning' && !isCapturing && cameraReady && (
          <div className="success-indicator-transparent">
            <div className="text-sm text-white text-center">
              <p>Posicione seu rosto</p>
              <p>no centro do círculo</p>
            </div>
          </div>
        )}

        {/* Mensagem personalizada */}
        {message && (
          <div className="absolute bottom-4 text-center text-white text-xs px-4">
            {message}
          </div>
        )}

        {/* Contador de tentativas */}
        {attemptCount > 0 && (
          <div className="absolute top-4 right-4 text-white text-xs bg-black bg-opacity-50 px-2 py-1 rounded">
            {attemptCount}/3
          </div>
        )}
      </div>
    </div>
  );
}

// ✅ COMPONENTE PRINCIPAL - SEGUINDO PADRÃO EXATO DO OPTMIZED CAPTURE SCREEN
function InitialFaceVerificationContent() {
  const router = useRouter();
  
  // ✅ USAR HOOK PERSONALIZADO - SEM DEPENDÊNCIA CIRCULAR
  const {
    // Estados
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
  } = useInitialFaceVerification();

  const [verificationResult, setVerificationResult] = useState<any>(null);

  // ✅ INICIALIZAÇÃO LIMPA
  useEffect(() => {
    const initialize = async () => {
      try {
        const systemReady = await initializeSystem();
        if (!systemReady) return;
        
        setStage('instructions');
      } catch (err) {
        console.error('❌ Erro na inicialização:', err);
        setStage('error');
        setError('Erro ao inicializar sistema');
      }
    };

    initialize();

    // Cleanup ao desmontar
    return () => {
      cleanup();
    };
  }, []);

  // ✅ GERENCIAR ESTÁGIOS
  useEffect(() => {
    if (stage === 'positioning' && !cameraReady) {
      initializeCamera();
    }
  }, [stage, cameraReady]);

  // ✅ COUNTDOWN TIMER
  useEffect(() => {
    if (countdown > 0 && isCapturing) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && isCapturing && stage === 'positioning') {
      // Realizar verificação
      performVerification().then(result => {
        setVerificationResult(result);
        
        if (result.success) {
          setStage('success');
          // Redirecionar para edição após 2 segundos
          setTimeout(() => {
            router.push(`/app/cadastro-funcionario?employeeId=${result.employeeId}&mode=edit`);
          }, 2000);
        } else {
          setStage('not_found');
        }
      }).catch(err => {
        console.error('❌ Erro na verificação:', err);
        setStage('error');
        setError('Erro durante a verificação');
      });
    }
  }, [countdown, isCapturing, stage]);

  // ✅ RENDERIZAÇÃO CONDICIONAL POR ESTÁGIO
  if (stage === 'loading') {
    return <FaceVerificationLoading />;
  }

  if (stage === 'error' || error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center p-4">
        <div className="text-center py-12 max-w-md">
          <div className="text-red-600 text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-red-800 mb-2">Erro no Sistema</h2>
          <p className="text-red-600 mb-4">{error || cameraError}</p>
          <div className="space-y-2">
            <button 
              onClick={() => window.location.reload()} 
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded mr-2"
            >
              Tentar Novamente
            </button>
            <button 
              onClick={() => router.back()} 
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
            >
              Voltar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'instructions') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">👤</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Verificação Facial</h2>
          
          <div className="text-left space-y-3 mb-6 text-sm text-gray-600">
            <div className="flex items-start space-x-2">
              <span className="text-green-500 font-bold">✓</span>
              <span>Se você já é funcionário cadastrado, seus dados serão carregados para edição</span>
            </div>
            <div className="flex items-start space-x-2">
              <span className="text-blue-500 font-bold">→</span>
              <span>Se a identificação não for confirmada, você poderá tentar novamente ou cadastrar manualmente</span>
            </div>
            <div className="flex items-start space-x-2">
              <span className="text-yellow-500 font-bold">!</span>
              <span>Posicione-se bem iluminado e olhe diretamente para a câmera</span>
            </div>
          </div>

          <button
            onClick={() => {
              setStage('positioning');
              startVerification();
            }}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-semibold transition-colors"
          >
            Iniciar Verificação
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'success' && verificationResult) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="text-green-600 text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-green-800 mb-2">Funcionário Identificado!</h2>
          
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="font-semibold text-green-800">{verificationResult.employeeData?.nomeCompleto}</p>
            <p className="text-sm text-green-600">{verificationResult.employeeData?.cargo}</p>
            <p className="text-xs text-green-500">
              Similaridade: {Math.round((verificationResult.similarity || 0) * 100)}%
            </p>
          </div>
          
          <p className="text-green-600 mb-4">Redirecionando para edição dos dados...</p>
          
          <div className="animate-pulse">
            <div className="h-2 bg-green-200 rounded-full">
              <div className="h-2 bg-green-500 rounded-full" style={{width: '70%'}}></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'not_found') {
    const canRetry = attemptCount < 3 && verificationResult?.retryable !== false;

    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-orange-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="text-orange-600 text-6xl mb-4">🔍</div>
          <h2 className="text-2xl font-bold text-orange-800 mb-2">Identificação não confirmada</h2>
          
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
            <p className="text-orange-800 font-medium">
              {verificationResult?.message || 'Não foi possível identificar o funcionário com segurança.'}
            </p>
            <p className="text-sm text-orange-600 mt-2">
              Isso não significa necessariamente que o funcionário não esteja cadastrado.
            </p>
          </div>
          
          <div className="space-y-3">
            {canRetry && (
              <button
                onClick={retry}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors"
              >
                Tentar novamente
              </button>
            )}

            <button
              onClick={() => router.push('/app/cadastro-funcionario?mode=create')}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors"
            >
              Cadastrar funcionário manualmente
            </button>

            <button
              onClick={() => router.back()}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-4 rounded-lg font-semibold transition-colors"
            >
              Voltar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ TELA PRINCIPAL DE VERIFICAÇÃO
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-lg">
        
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Verificação Facial</h2>
          <p className="text-gray-600 mt-2">
            {stage === 'positioning' ? 'Posicione seu rosto no círculo' : 
             stage === 'verifying' ? 'Verificando identidade...' : 
             'Verificação em andamento'}
          </p>
        </div>

        {/* Círculo oval com vídeo */}
        <FaceOvalWithVideo
          countdown={countdown}
          hasDetected={cameraReady}
          videoRef={videoRef}
          showVideo={cameraReady}
          cameraReady={cameraReady}
          stage={stage}
          isCapturing={isCapturing}
          attemptCount={attemptCount}
        />

        {/* Status e controles */}
        <div className="text-center mt-6">
          {attemptCount > 0 && attemptCount < 3 && stage === 'positioning' && (
            <p className="text-sm text-orange-600 mb-2">
              Tentativa {attemptCount + 1} de 3
            </p>
          )}

          {attemptCount >= 3 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800 font-semibold mb-2">❌ Não foi possível verificar</p>
              <p className="text-red-600 text-sm">Você poderá tentar novamente ou seguir para cadastro manual</p>
            </div>
          )}
        </div>

        {/* Botões de controle */}
        <div className="flex justify-center space-x-4 mt-6">
          <button
            onClick={() => router.back()}
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
          >
            Voltar
          </button>
          
          {stage === 'positioning' && attemptCount > 0 && (
            <button
              onClick={retry}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
            >
              Tentar Novamente
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ✅ COMPONENTE PRINCIPAL COM SUSPENSE - SEGUINDO PADRÃO EXATO DO MARCAR PONTO
export default function InitialFaceVerification() {
  return (
    <Suspense fallback={<FaceVerificationLoading />}>
      <InitialFaceVerificationContent />
    </Suspense>
  );
}
