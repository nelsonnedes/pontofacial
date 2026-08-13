'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// ✅ ZERO IMPORTS DIRETOS - SEM DEPENDÊNCIA CIRCULAR
import { useFacialRegistration } from '@/hooks/useFacialRegistration';
import FaceOvalCamera from '@/components/shared/FaceOvalCamera';

// ✅ IMPORTAR CSS DO PADRÃO QUE FUNCIONA
import '@/styles/marcar-ponto-optimized.css';

// Componente de Loading
function FacialRegistrationLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Carregando sistema de cadastro facial...</p>
      </div>
    </div>
  );
}

// ✅ COMPONENTE REMOVIDO - USANDO FaceOvalCamera UNIFICADO

// ✅ COMPONENTE PRINCIPAL - SEGUINDO PADRÃO DO OPTMIZED CAPTURE SCREEN
function FacialRegistrationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // ✅ USAR HOOK PERSONALIZADO - SEM DEPENDÊNCIA CIRCULAR
  const {
    // Estados
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
    
    // Ações
    initializeSystem,
    loadEmployeeData,
    initializeCamera,
    prepareCaptureSession,
    startCapture,
    performCapture,
    processFacialData,
    cleanup,
    
    // Setters
    setCountdown,
    setStage,
    setError
  } = useFacialRegistration();

  const [employeeId, setEmployeeId] = useState<string>('');
  const [employeeData, setEmployeeData] = useState<any>(null);

  // ✅ INICIALIZAÇÃO LIMPA
  useEffect(() => {
    const empId = searchParams.get('employeeId');
    if (!empId) {
      setStage('error');
      setError('ID do funcionário não fornecido');
      return;
    }

    setEmployeeId(empId);

    const initialize = async () => {
      try {
        // Inicializar sistema
        const systemReady = await initializeSystem();
        if (!systemReady) return;

        // Carregar dados do funcionário
        const data = await loadEmployeeData(empId);
        if (!data) return;

        setEmployeeData(data);

        // Preparar sessão de capturas
        prepareCaptureSession();
        
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
  }, [searchParams]);

  // ✅ GERENCIAR ESTÁGIOS
  useEffect(() => {
    if (stage === 'capturing' && !cameraReady) {
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
    } else if (countdown === 0 && isCapturing) {
      performCapture();
    }
  }, [countdown, isCapturing]);

  // ✅ PROCESSAR QUANDO COMPLETO
  useEffect(() => {
    if (stage === 'processing' && captures.length > 0) {
      const completedCaptures = captures.filter(c => c.status === 'completed');
      if (completedCaptures.length >= 3) {
        processFacialData(employeeId).then(result => {
          if (result.success) {
            setStage('success');
          } else {
            setStage('error');
            setError(result.message);
          }
        });
      }
    }
  }, [stage, captures, employeeId]);

  // ✅ RENDERIZAÇÃO CONDICIONAL POR ESTÁGIO
  if (stage === 'loading') {
    return <FacialRegistrationLoading />;
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
          <div className="text-6xl mb-4">📸</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Cadastro Facial</h2>
          
          {employeeData && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <p className="font-semibold text-blue-800">{employeeData.nomeCompleto}</p>
              <p className="text-sm text-blue-600">{employeeData.cargo}</p>
              <p className="text-xs text-blue-500">{employeeData.setor}</p>
            </div>
          )}

          <div className="text-left space-y-2 mb-6 text-sm text-gray-600">
            <p>✅ Posicione seu rosto no centro do círculo</p>
            <p>✅ Mantenha-se bem iluminado</p>
            <p>✅ Olhe diretamente para a câmera</p>
            <p>✅ Serão realizadas 5 capturas automáticas</p>
          </div>

          <button
            onClick={() => {
              setStage('capturing');
              startCapture();
            }}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-semibold transition-colors"
          >
            Iniciar Cadastro Facial
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center p-4">
        <div className="text-center py-12 max-w-md">
          <div className="text-green-600 text-8xl mb-4">✅</div>
          <h2 className="text-3xl font-bold text-green-800 mb-2">Sucesso!</h2>
          <p className="text-green-600 mb-6">Cadastro facial realizado com sucesso!</p>
          
          <div className="space-y-2">
            <button 
              onClick={() => router.push('/app')} 
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg mr-2"
            >
              Ir para o App
            </button>
            <button 
              onClick={() => router.back()} 
              className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg"
            >
              Voltar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ TELA PRINCIPAL DE CAPTURA
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-lg">
        
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Cadastro Facial</h2>
          {employeeData && (
            <p className="text-lg text-gray-600 mt-2">{employeeData.nomeCompleto}</p>
          )}
        </div>

        {/* ✅ CÍRCULO UNIFICADO - IDÊNTICO À CAPTURA */}
        <FaceOvalCamera
          videoRef={videoRef}
          cameraReady={cameraReady}
          showVideo={cameraReady}
          stage={stage}
          countdown={countdown}
          isCapturing={isCapturing}
          countdownColor="dynamic"
          showCountdown={true}
          showStatusIndicators={true}
        />

        {/* ✅ BARRA DE PROGRESSO DAS CAPTURAS - ABAIXO DO CÍRCULO */}
        <div className="mt-6">
          <div className="flex justify-center space-x-2 mb-3">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full transition-all duration-300 ${
                  i < currentCaptureIndex
                    ? 'bg-green-500 scale-110 shadow-lg'
                    : i === currentCaptureIndex && isCapturing
                    ? 'bg-blue-500 animate-ping'
                    : i === currentCaptureIndex
                    ? 'bg-blue-400 animate-pulse scale-105'
                    : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
          <p className="text-sm text-gray-600 text-center">
            Captura {currentCaptureIndex + 1} de 5 • Cadastro Facial
          </p>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div 
              className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${(currentCaptureIndex / 5) * 100}%` }}
            />
          </div>
        </div>

        {/* Status e controles */}
        <div className="text-center mt-6">
          {stage === 'retry' && retryMessage && (
            <p className="text-orange-600 mb-2">{retryMessage}</p>
          )}
          
          {attemptCount > 0 && attemptCount < 3 && (
            <p className="text-sm text-gray-500">
              Tentativa {attemptCount + 1} de 3
            </p>
          )}

          {stage === 'failed' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800 font-semibold mb-2">❌ Não foi possível completar o cadastro</p>
              <p className="text-red-600 text-sm">Procure o RH para assistência</p>
            </div>
          )}
        </div>

        {/* Botões de controle */}
        <div className="flex justify-center space-x-4 mt-6">
          <button
            onClick={() => router.back()}
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ✅ COMPONENTE PRINCIPAL COM SUSPENSE - SEGUINDO PADRÃO EXATO DO MARCAR PONTO
export default function FacialRegistration() {
  return (
    <Suspense fallback={<FacialRegistrationLoading />}>
      <FacialRegistrationContent />
    </Suspense>
  );
}
