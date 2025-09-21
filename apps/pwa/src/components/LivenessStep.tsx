'use client';

import { useState, useEffect, useRef } from 'react';
import { faceRecognition } from '@/lib/face-recognition';
import { useFaceAPIContext } from '@/components/FaceAPIProvider';
import { useFaceAPIReady } from './FaceAPIProvider';

interface LivenessChallenge {
  id: string;
  type: 'smile' | 'blink' | 'turn_left' | 'turn_right' | 'nod';
  instruction: string;
  icon: string;
  duration: number; // em segundos
}

interface LivenessStepProps {
  videoElement?: HTMLVideoElement; // Elemento de vídeo da câmera
  onChallengeComplete?: (challengeId: string, success: boolean) => void;
  onAllChallengesComplete?: (success: boolean) => void;
  onError?: (error: string) => void;
  onDone?: () => void; // Mantém compatibilidade com versão anterior
  className?: string;
  autoDetection?: boolean; // Se deve usar detecção automática ou manual
}

const CHALLENGES: LivenessChallenge[] = [
  {
    id: 'smile',
    type: 'smile',
    instruction: 'Sorria naturalmente',
    icon: '😊',
    duration: 3
  },
  {
    id: 'blink',
    type: 'blink',
    instruction: 'Pisque os olhos algumas vezes',
    icon: '👁️',
    duration: 4
  },
  {
    id: 'turn_left',
    type: 'turn_left',
    instruction: 'Vire o rosto para a esquerda',
    icon: '⬅️',
    duration: 3
  },
  {
    id: 'turn_right',
    type: 'turn_right',
    instruction: 'Vire o rosto para a direita',
    icon: '➡️',
    duration: 3
  }
];

export default function LivenessStep({ 
  videoElement,
  onChallengeComplete, 
  onAllChallengesComplete, 
  onError, 
  onDone,
  className = '',
  autoDetection = true
}: LivenessStepProps) {
  const [currentChallengeIndex, setCurrentChallengeIndex] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [completedChallenges, setCompletedChallenges] = useState<string[]>([]);
  const [isCompleted, setIsCompleted] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionStatus, setDetectionStatus] = useState<string>('');
  
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Hook para verificar se Face API está pronto
  const faceAPIReady = useFaceAPIReady();
  const { initializing: faceAPILoading, error: faceAPIError } = useFaceAPIContext();

  const currentChallenge = CHALLENGES[currentChallengeIndex];
  const totalChallenges = CHALLENGES.length;
  const progress = ((currentChallengeIndex + (timeRemaining > 0 ? 1 : 0)) / totalChallenges) * 100;

  // Iniciar teste de vivacidade
  const startLivenessTest = () => {
    setIsActive(true);
    setCurrentChallengeIndex(0);
    setCompletedChallenges([]);
    setIsCompleted(false);
    setCountdown(3); // Countdown inicial
    setDetectionStatus('');
  };

  // Parar teste
  const stopLivenessTest = () => {
    setIsActive(false);
    setTimeRemaining(0);
    setCountdown(0);
    stopDetection();
  };

  // Pular para próximo desafio
  const nextChallenge = () => {
    const challenge = CHALLENGES[currentChallengeIndex];
    
    // Marcar desafio como completo
    const newCompleted = [...completedChallenges, challenge.id];
    setCompletedChallenges(newCompleted);
    onChallengeComplete?.(challenge.id, true);

    // Verificar se todos os desafios foram completados
    if (currentChallengeIndex >= CHALLENGES.length - 1) {
      setIsCompleted(true);
      setIsActive(false);
      onAllChallengesComplete?.(true);
      onDone?.(); // Compatibilidade com versão anterior
      return;
    }

    // Próximo desafio
    setCurrentChallengeIndex(prev => prev + 1);
    setTimeRemaining(CHALLENGES[currentChallengeIndex + 1].duration);
  };

  // Falhar no desafio atual
  const failCurrentChallenge = () => {
    const challenge = CHALLENGES[currentChallengeIndex];
    onChallengeComplete?.(challenge.id, false);
    onError?.(`Falha no desafio: ${challenge.instruction}`);
  };

  // Estado para rastreamento de movimentos
  const [previousExpressions, setPreviousExpressions] = useState<any>(null);
  const [blinkDetectionState, setBlinkDetectionState] = useState({ wasOpen: true, blinkCount: 0 });
  const [headPositionHistory, setHeadPositionHistory] = useState<Array<{x: number, y: number, timestamp: number}>>([]);

  // Detecção facial aprimorada usando Face API
  const performFaceDetection = async () => {
    if (!videoElement || !autoDetection || !isActive || countdown > 0) {
      return;
    }

    try {
      setIsDetecting(true);
      
      // Verificar se Face API está pronto
      if (!faceAPIReady) {
        setDetectionStatus('Aguardando inicialização do Face API...');
        return;
      }

      const challenge = CHALLENGES[currentChallengeIndex];
      setDetectionStatus(`Detectando: ${challenge.instruction}`);

      // Detectar expressões faciais e landmarks
      const detectionResult = await faceRecognition.detectFaces(videoElement);
      
      if (!detectionResult || detectionResult.length === 0) {
        setDetectionStatus('Posicione seu rosto na câmera');
        return;
      }

      const face = detectionResult[0]; // Usar o primeiro rosto detectado
      const expressions = face.expressions;
      const landmarks = face.landmarks;

      // Verificar se o desafio foi completado baseado na expressão
      let challengeCompleted = false;
      let confidence = 0;
      
      switch (challenge.type) {
        case 'smile':
          confidence = expressions?.happy || 0;
          challengeCompleted = confidence > 0.6; // 60% de confiança para sorriso
          setDetectionStatus(`😊 Sorriso detectado: ${Math.round(confidence * 100)}%`);
          break;
          
        case 'blink':
          // Detecção de piscar melhorada usando landmarks dos olhos
          if (landmarks) {
            const leftEye = landmarks.getLeftEye();
            const rightEye = landmarks.getRightEye();
            
            // Calcular abertura dos olhos baseado na distância vertical dos landmarks
            const leftEyeHeight = Math.abs(leftEye[1].y - leftEye[5].y);
            const rightEyeHeight = Math.abs(rightEye[1].y - rightEye[5].y);
            const avgEyeHeight = (leftEyeHeight + rightEyeHeight) / 2;
            
            const eyesOpen = avgEyeHeight > 3; // Threshold para olhos abertos
            
            // Detectar transição de aberto para fechado e vice-versa
            if (blinkDetectionState.wasOpen && !eyesOpen) {
              setBlinkDetectionState(prev => ({ 
                wasOpen: false, 
                blinkCount: prev.blinkCount + 1 
              }));
            } else if (!blinkDetectionState.wasOpen && eyesOpen) {
              setBlinkDetectionState(prev => ({ 
                wasOpen: true, 
                blinkCount: prev.blinkCount 
              }));
              
              if (blinkDetectionState.blinkCount >= 1) {
                challengeCompleted = true;
                confidence = 1.0;
              }
            }
            
            setDetectionStatus(`👁️ Pisque os olhos (${blinkDetectionState.blinkCount}/2)`);
          } else {
            // Fallback usando expressões
            const eyesClosed = (expressions?.neutral || 0) > 0.5 && (expressions?.surprised || 0) < 0.2;
            challengeCompleted = eyesClosed;
            confidence = eyesClosed ? 0.8 : 0.2;
            setDetectionStatus(`👁️ Pisque os olhos: ${Math.round(confidence * 100)}%`);
          }
          break;
          
        case 'turn_left':
        case 'turn_right':
          // Detecção de movimento da cabeça usando landmarks
          if (landmarks) {
            const nose = landmarks.getNose();
            const currentPosition = { 
              x: nose[0].x, 
              y: nose[0].y, 
              timestamp: Date.now() 
            };
            
            // Manter histórico dos últimos 10 frames
            setHeadPositionHistory(prev => {
              const newHistory = [...prev, currentPosition].slice(-10);
              
              if (newHistory.length >= 5) {
                const firstPos = newHistory[0];
                const lastPos = newHistory[newHistory.length - 1];
                const deltaX = lastPos.x - firstPos.x;
                const deltaTime = lastPos.timestamp - firstPos.timestamp;
                
                // Detectar movimento significativo
                const movementThreshold = 15; // pixels
                const timeThreshold = 1000; // ms
                
                if (deltaTime > timeThreshold) {
                  if (challenge.type === 'turn_left' && deltaX > movementThreshold) {
                    challengeCompleted = true;
                    confidence = Math.min(Math.abs(deltaX) / 30, 1.0);
                  } else if (challenge.type === 'turn_right' && deltaX < -movementThreshold) {
                    challengeCompleted = true;
                    confidence = Math.min(Math.abs(deltaX) / 30, 1.0);
                  }
                }
              }
              
              return newHistory;
            });
            
            const direction = challenge.type === 'turn_left' ? '⬅️' : '➡️';
            setDetectionStatus(`${direction} Vire a cabeça: ${Math.round(confidence * 100)}%`);
          } else {
            // Fallback usando detecção de face
            const faceBox = face.detection.box;
            const centerX = faceBox.x + faceBox.width / 2;
            const videoWidth = videoElement.videoWidth;
            const relativePosition = centerX / videoWidth;
            
            if (challenge.type === 'turn_left' && relativePosition < 0.3) {
              challengeCompleted = true;
              confidence = 0.8;
            } else if (challenge.type === 'turn_right' && relativePosition > 0.7) {
              challengeCompleted = true;
              confidence = 0.8;
            }
            
            const direction = challenge.type === 'turn_left' ? '⬅️' : '➡️';
            setDetectionStatus(`${direction} Vire a cabeça para ${challenge.type === 'turn_left' ? 'esquerda' : 'direita'}`);
          }
          break;
          
        default:
          challengeCompleted = false;
      }

      // Armazenar expressões anteriores para comparação
      setPreviousExpressions(expressions);

      if (challengeCompleted && confidence > 0.5) {
        setDetectionStatus('✅ Movimento detectado!');
        
        // Reset dos estados de detecção
        setBlinkDetectionState({ wasOpen: true, blinkCount: 0 });
        setHeadPositionHistory([]);
        
        setTimeout(() => {
          nextChallenge();
        }, 800);
      }
      
    } catch (error) {
      console.error('Erro na detecção facial:', error);
      setDetectionStatus('Erro na detecção - tente novamente');
      // Não chamar onError imediatamente, dar uma chance de recuperação
    } finally {
      setIsDetecting(false);
    }
  };

  // Iniciar detecção contínua
  const startDetection = () => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }
    
    detectionIntervalRef.current = setInterval(() => {
      performFaceDetection();
    }, 1000); // Detectar a cada segundo
  };

  // Parar detecção
  const stopDetection = () => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    setIsDetecting(false);
    setDetectionStatus('');
  };

  // Timer do countdown inicial
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && isActive && timeRemaining === 0) {
      // Iniciar primeiro desafio
      setTimeRemaining(currentChallenge.duration);
    }
  }, [countdown, isActive, timeRemaining, currentChallenge]);

  // Timer dos desafios
  useEffect(() => {
    if (isActive && timeRemaining > 0 && countdown === 0) {
      // Iniciar detecção quando o desafio começar
      if (autoDetection && videoElement) {
        startDetection();
      }
      
      const timer = setTimeout(() => {
        setTimeRemaining(prev => {
          const newTime = prev - 1;
          if (newTime <= 0) {
            if (!autoDetection) {
              // Se não há detecção automática, avançar automaticamente
              nextChallenge();
            }
            // Se há detecção automática, ela cuidará do avanço
          }
          return newTime;
        });
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      // Parar detecção quando não há desafio ativo
      stopDetection();
    }
  }, [timeRemaining, isActive, countdown, autoDetection, videoElement]);

  // Cleanup ao desmontar componente
  useEffect(() => {
    return () => {
      stopDetection();
    };
  }, []);

  return (
    <div className={`bg-white rounded-2xl shadow-xl p-6 ${className}`}>
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          🔍 Teste de Vivacidade
        </h3>
        <p className="text-sm text-gray-600">
          {isCompleted 
            ? 'Teste concluído com sucesso!' 
            : isActive 
            ? 'Siga as instruções na tela'
            : 'Verificação para confirmar que você é uma pessoa real'
          }
        </p>
      </div>

      {/* Barra de progresso */}
      {isActive && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Progresso</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Área principal */}
      <div className="text-center mb-6">
        {countdown > 0 ? (
          // Countdown inicial
          <div className="py-12">
            <div className="text-6xl mb-4">⏱️</div>
            <div className="text-4xl font-bold text-blue-600 mb-2">{countdown}</div>
            <p className="text-gray-600">Preparando teste...</p>
          </div>
        ) : isActive && !isCompleted ? (
          // Desafio atual
          <div className="py-8">
            <div className="text-8xl mb-4">{currentChallenge.icon}</div>
            <h4 className="text-xl font-semibold text-gray-900 mb-2">
              {currentChallenge.instruction}
            </h4>
            <div className="text-3xl font-bold text-blue-600 mb-2">
              {timeRemaining}s
            </div>
            <p className="text-sm text-gray-500">
              Desafio {currentChallengeIndex + 1} de {totalChallenges}
            </p>
            
            {/* Status de detecção */}
            {autoDetection && detectionStatus && (
              <div className={`mt-3 p-2 rounded-lg text-sm ${
                isDetecting ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-600'
              }`}>
                {isDetecting && <span className="inline-block animate-spin mr-2">🔄</span>}
                {detectionStatus}
              </div>
            )}
          </div>
        ) : isCompleted ? (
          // Teste concluído
          <div className="py-8">
            <div className="text-8xl mb-4">✅</div>
            <h4 className="text-xl font-semibold text-green-600 mb-2">
              Teste Concluído!
            </h4>
            <p className="text-gray-600">
              Todos os desafios foram completados com sucesso
            </p>
          </div>
        ) : (
          // Estado inicial
          <div className="py-8">
            <div className="text-8xl mb-4">🤖</div>
            <h4 className="text-xl font-semibold text-gray-900 mb-2">
              Pronto para começar?
            </h4>
            <p className="text-gray-600">
              O teste levará cerca de {CHALLENGES.reduce((acc, c) => acc + c.duration, 0)} segundos
            </p>
          </div>
        )}
      </div>

      {/* Lista de desafios */}
      {isActive && (
        <div className="mb-6">
          <h5 className="text-sm font-medium text-gray-700 mb-3">Desafios:</h5>
          <div className="space-y-2">
            {CHALLENGES.map((challenge, index) => {
              const isCompleted = completedChallenges.includes(challenge.id);
              const isCurrent = index === currentChallengeIndex && timeRemaining > 0;
              const isPending = index > currentChallengeIndex;
              
              return (
                <div 
                  key={challenge.id}
                  className={`flex items-center gap-3 p-2 rounded-lg ${
                    isCompleted ? 'bg-green-50 text-green-700' :
                    isCurrent ? 'bg-blue-50 text-blue-700' :
                    'bg-gray-50 text-gray-500'
                  }`}
                >
                  <span className="text-lg">
                    {isCompleted ? '✅' : isCurrent ? '⏳' : challenge.icon}
                  </span>
                  <span className="text-sm font-medium flex-1">
                    {challenge.instruction}
                  </span>
                  <span className="text-xs">
                    {isCompleted ? 'Concluído' : 
                     isCurrent ? `${timeRemaining}s` : 
                     `${challenge.duration}s`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Controles */}
      <div className="flex gap-3 justify-center">
        {!isActive && !isCompleted ? (
          <button
            onClick={startLivenessTest}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            🚀 Iniciar Teste
          </button>
        ) : isActive ? (
          <>
            <button
              onClick={nextChallenge}
              disabled={countdown > 0}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors font-medium text-sm disabled:opacity-50"
            >
              ✅ Concluir Atual
            </button>
            
            <button
              onClick={failCurrentChallenge}
              disabled={countdown > 0}
              className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition-colors font-medium text-sm disabled:opacity-50"
            >
              ❌ Falhou
            </button>
            
            <button
              onClick={stopLivenessTest}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
            >
              ⏹️ Parar
            </button>
          </>
        ) : isCompleted ? (
          <button
            onClick={() => {
              setIsCompleted(false);
              setCompletedChallenges([]);
              setCurrentChallengeIndex(0);
            }}
            className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-colors font-medium"
          >
            🔄 Repetir Teste
          </button>
        ) : null}
      </div>

      {/* Informações de debug */}
      {process.env.NODE_ENV === 'development' && isActive && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
          <p><strong>Debug:</strong></p>
          <p>Desafio atual: {currentChallenge?.type}</p>
          <p>Tempo restante: {timeRemaining}s</p>
          <p>Completados: {completedChallenges.join(', ')}</p>
          <p>Progresso: {Math.round(progress)}%</p>
          <p>Detecção automática: {autoDetection ? 'Sim' : 'Não'}</p>
          <p>Detectando: {isDetecting ? 'Sim' : 'Não'}</p>
          <p>Status: {detectionStatus || 'Nenhum'}</p>
          <p>Face API: {faceAPIReady ? 'Pronto' : faceAPILoading ? 'Carregando' : 'Erro'}</p>
        </div>
      )}
    </div>
  );
}

// Tipos para exportação
export type { LivenessStepProps, LivenessChallenge };
