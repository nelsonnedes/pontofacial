'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useMultiUserRecognition } from '@/hooks/useMultiUserRecognition';
import { useGeofencing } from '@/hooks/useGeofencing';
import { useOfflineTimeRecords } from '@/hooks/useOfflineTimeRecords';
import { useScheduleManager } from '@/hooks/useScheduleManager';
import type { OptimizedFaceEmbedding } from '@/lib/face-recognition-optimized';
import { BIOMETRIC_THRESHOLDS } from '@/lib/biometric/threshold';
import Link from 'next/link';
import FaceOvalCamera from '@/components/shared/FaceOvalCamera';

// ✅ IMPORTAR CSS DO PADRÃO QUE FUNCIONA
import '@/styles/marcar-ponto-optimized.css';

type PontoType = 'entrada' | 'saida' | 'pausa_inicio' | 'pausa_fim';

// ✅ COMPONENTE DO CÍRCULO OVAL - PADRÃO EXATO QUE FUNCIONA
// ✅ COMPONENTE REMOVIDO - USANDO FaceOvalCamera UNIFICADO

// ✅ COMPONENTE PRINCIPAL - USANDO PADRÃO QUE FUNCIONA
function OptimizedCaptureScreenContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { identifyUser } = useMultiUserRecognition();
  const { currentLocation, isInsideFence, distanceFromFence, isLoadingLocation, attemptPointMarking } = useGeofencing();
  const { recordTime } = useOfflineTimeRecords();
  const { analyzePointRecord } = useScheduleManager();
  
  // ✅ ESTADOS PRINCIPAIS
  const [pontoType, setPontoType] = useState<PontoType>('entrada');
  const [stage, setStage] = useState<'positioning' | 'capturing' | 'success' | 'error' | 'retry'>('positioning');
  const [countdown, setCountdown] = useState(2); // ✅ Countdown mais rápido: 2 segundos
  const [, setIsDetecting] = useState(false);
  const [, setHasDetected] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [bestMatch, setBestMatch] = useState<{name: string, similarity: number} | null>(null);
  
  // ✅ MÚLTIPLAS CAPTURAS PARA MAIOR PRECISÃO (igual ao cadastro)
  const [captureAttempts, setCaptureAttempts] = useState<any[]>([]);
  const [, setCurrentCaptureIndex] = useState(0);
  const TOTAL_CAPTURES = 5; // ✅ 5 capturas - IDÊNTICO AO CADASTRO FACIAL
  
  // ✅ REFS E ESTADOS DA CÂMERA
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // ✅ EXTRAIR TIPO DA URL
  useEffect(() => {
    const typeParam = searchParams.get('type') as PontoType;
    if (typeParam && ['entrada', 'saida', 'pausa_inicio', 'pausa_fim'].includes(typeParam)) {
      setPontoType(typeParam);
      console.log('📋 Tipo de ponto definido:', typeParam);
    } else {
      router.push('/app/marcar');
      return;
    }
  }, [searchParams, router]);

  // ✅ INICIALIZAÇÃO DA CÂMERA - PADRÃO QUE FUNCIONA
  const initializeCamera = useCallback(async () => {
    if (!user || cameraReady) return;
    
    console.log('🎥 Inicializando câmera para verificação...');
    
    try {
      // ✅ VERIFICAR GEOLOCALIZAÇÃO
        if (isLoadingLocation) {
          console.log('⏳ Aguardando geolocalização...');
        return;
        }
        
        if (isInsideFence === false) {
        console.log('❌ Fora da área permitida');
        setStage('error');
        setErrorMessage('Você está fora da área permitida para marcar ponto');
          return;
        }
        
      // ✅ SOLICITAR CÂMERA - CONFIGURAÇÃO OTIMIZADA PARA MOBILE
        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: isMobile ? { min: 480, ideal: 720, max: 1280 } : { min: 640, ideal: 640, max: 640 },
            height: isMobile ? { min: 360, ideal: 540, max: 720 } : { min: 480, ideal: 480, max: 480 },
            facingMode: 'user',
            frameRate: isMobile ? { ideal: 30, max: 30 } : { ideal: 15, max: 30 }
          },
          audio: false
        });
        
        streamRef.current = stream;
        
        if (videoRef.current) {
        // ✅ CONECTAR STREAM - PADRÃO EXATO
          if (videoRef.current.srcObject) {
            videoRef.current.srcObject = null;
          }
          
          videoRef.current.srcObject = stream;
        
        // ✅ AGUARDAR VÍDEO ESTAR PRONTO - PADRÃO QUE FUNCIONA
        await new Promise((resolve) => {
          const video = videoRef.current!;
          const onCanPlay = () => {
            video.removeEventListener('canplay', onCanPlay);
            resolve(true);
          };
          video.addEventListener('canplay', onCanPlay);
          
          // Fallback timeout
          setTimeout(() => {
            video.removeEventListener('canplay', onCanPlay);
            resolve(true);
          }, 2000);
        });
        
        await videoRef.current.play();
              setCameraReady(true);
        setShowVideo(true);
        console.log('✅ Câmera de verificação inicializada');
      }
      
    } catch (error) {
      console.error('❌ Erro ao inicializar câmera:', error);
      setStage('error');
      setErrorMessage('Erro ao acessar a câmera. Verifique as permissões.');
    }
  }, [user, isInsideFence, isLoadingLocation, cameraReady]);

  // ✅ EFEITO PARA INICIALIZAR CÂMERA
  useEffect(() => {
    if (user && !isLoadingLocation && !cameraReady) {
      initializeCamera();
    }
  }, [user, isLoadingLocation, initializeCamera, cameraReady]);

  // ✅ COUNTDOWN
  useEffect(() => {
    if (stage !== 'positioning' || countdown <= 0 || !cameraReady) return;
    
    const timer = setTimeout(() => {
      setCountdown(prev => prev - 1);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [stage, countdown, cameraReady]);

  // ✅ CAPTURA QUANDO COUNTDOWN CHEGA A 0
  useEffect(() => {
    if (countdown === 0 && stage === 'positioning') {
      performCapture();
    }
  }, [countdown, stage]);

  // ✅ CLEANUP PARA EVITAR LOOPS E MEMORY LEAKS
  useEffect(() => {
    return () => {
      // ✅ LIMPAR TIMEOUTS AO DESMONTAR COMPONENTE
      if (captureTimeoutRef.current) {
        clearTimeout(captureTimeoutRef.current);
      }
      // ✅ DESATIVAR FLUXO
      captureFlowActiveRef.current = false;
      // ✅ LIMPAR STREAM
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // ✅ REF PARA CONTROLAR CAPTURAS DE FORMA SÍNCRONA
  const captureCountRef = useRef(0);
  const captureFlowActiveRef = useRef(true); // ✅ Controlar se o fluxo está ativo
  const captureTimeoutRef = useRef<NodeJS.Timeout | null>(null); // ✅ Controlar timeouts

  // ✅ FUNÇÃO DE CAPTURA SIMPLIFICADA E ROBUSTA
  const performCapture = async () => {
    if (!videoRef.current || !streamRef.current || !identifyUser) {
      setStage('error');
      setErrorMessage('Sistema não disponível para captura');
      return;
    }

    // ✅ USAR REF PARA CONTROLE SÍNCRONO
    const currentCaptureCount = captureCountRef.current;
    
    // ✅ PROTEÇÃO CONTRA LOOP INFINITO
    if (currentCaptureCount >= TOTAL_CAPTURES) {
      console.warn('🚨 PROTEÇÃO: Já foram realizadas todas as capturas necessárias');
      return;
    }
    setStage('capturing');
    setIsCapturing(true);
    console.log('📸 Iniciando captura...', { currentCaptureCount });

    try {
      // ✅ CAPTURAR FOTO - MÉTODO IDÊNTICO AO CADASTRO FACIAL
      const canvas = document.createElement('canvas');
      const video = videoRef.current!;
      
      // ✅ AGUARDAR VÍDEO ESTAR PRONTO (mesmo que cadastro)
      if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Video timeout')), 10000);
          const checkVideo = () => {
            if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
              clearTimeout(timeout);
              resolve(true);
            } else {
              setTimeout(checkVideo, 100);
            }
          };
          checkVideo();
        });
      }
      
      // ✅ CONFIGURAÇÃO IDÊNTICA AO CADASTRO
      const canvasWidth = video.videoWidth || 640;
      const canvasHeight = video.videoHeight || 480;
      
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      
        const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context não disponível');
      
      ctx.drawImage(video, 0, 0, canvasWidth, canvasHeight);

      // ✅ GERAR IMAGEM COM QUALIDADE ALTA - IDÊNTICO AO CADASTRO
      const imageData = canvas.toDataURL('image/jpeg', 0.95); // 95% qualidade
      console.log('📸 Imagem capturada com qualidade alta:', {
        dataLength: imageData.length,
        quality: '95%',
        hasData: imageData !== 'data:,'
      });

      // 🚨 USAR MÉTODO IDÊNTICO AO CADASTRO - extractFaceEmbedding DIRETO
      console.log('🔍 Extraindo embedding DIRETO do canvas (método do cadastro)...');
      
      const { optimizedFaceRecognition } = await import('@/lib/face-recognition-optimized');
      const embedding = await optimizedFaceRecognition.extractFaceEmbedding(canvas);
      
      if (!embedding) {
        throw new Error('Nenhuma face detectada no canvas');
      }

      // ✅ VALIDAÇÃO DE QUALIDADE RIGOROSA - ALINHADA COM CADASTRO
      const MIN_QUALITY_SCORE = 0.85; // 85% mínimo para captura (mais rigoroso)
      if (embedding.confidence < MIN_QUALITY_SCORE) {
        console.warn('⚠️ Qualidade baixa detectada:', {
          confidence: embedding.confidence,
          minimum: MIN_QUALITY_SCORE,
          captureIndex: captureCountRef.current + 1
        });
        throw new Error(`Qualidade da imagem baixa (${Math.round(embedding.confidence * 100)}%). Posicione-se melhor.`);
      }
      
      console.log('✅ Embedding extraído DIRETO com qualidade validada:', {
        hasDescriptor: !!embedding.descriptor,
        descriptorLength: embedding.descriptor?.length,
        confidence: embedding.confidence,
        qualityCheck: embedding.confidence >= MIN_QUALITY_SCORE ? 'PASSED' : 'FAILED',
        method: 'DIRECT_CANVAS_EXTRACTION'
      });

      // ✅ INCREMENTAR REF IMEDIATAMENTE
      captureCountRef.current++;
      const newCaptureIndex = currentCaptureCount;
      
      const newCapture = {
        embedding,
        confidence: embedding.confidence,
        timestamp: Date.now(),
        index: newCaptureIndex
      };
      
      const updatedCaptures = [...captureAttempts, newCapture];
      
      // ✅ ATUALIZAR ESTADO DE FORMA ATÔMICA
      setCaptureAttempts(updatedCaptures);
      setCurrentCaptureIndex(captureCountRef.current);
      
      console.log(`📸 Captura ${captureCountRef.current}/${TOTAL_CAPTURES} realizada:`, {
        confidence: embedding.confidence,
        descriptorLength: embedding.descriptor?.length,
        captureIndex: newCaptureIndex,
        totalCapturesNow: captureCountRef.current
      });
      
      // ✅ SE AINDA NÃO COMPLETOU TODAS AS CAPTURAS - MODO SEQUENCIAL CONTROLADO
      if (captureCountRef.current < TOTAL_CAPTURES) {
        console.log(`🚀 Captura rápida ${captureCountRef.current}/${TOTAL_CAPTURES} - próxima em 500ms`);
        
        // ✅ SOLUÇÃO DEFINITIVA: Usar apenas um setTimeout SEM recursão
        // ✅ LIMPAR TIMEOUT ANTERIOR PARA EVITAR LOOPS
        if (captureTimeoutRef.current) {
          clearTimeout(captureTimeoutRef.current);
        }
        
        captureTimeoutRef.current = setTimeout(() => {
          // ✅ VERIFICAÇÃO TRIPLA DE SEGURANÇA
          if (!captureFlowActiveRef.current) {
            console.log('🚫 Fluxo desativado - parando capturas');
            return;
          }
          
          if (captureCountRef.current >= TOTAL_CAPTURES) {
            console.log('🚫 Capturas já completadas - parando');
            return;
          }
          
          if (stage === 'error' || stage === 'success') {
            console.log('🚫 Sistema em estado final - parando capturas');
            return;
          }
          
          console.log(`📸 Iniciando captura sequencial ${captureCountRef.current + 1}/${TOTAL_CAPTURES}`);
          setStage('positioning');
          
          // ✅ USAR requestAnimationFrame - MAIS SEGURO QUE setTimeout
          requestAnimationFrame(() => {
            if (captureFlowActiveRef.current && captureCountRef.current < TOTAL_CAPTURES) {
              performCapture();
            }
          });
        }, 500); // ✅ 500ms para melhor qualidade
        
      return;
    }

      // ✅ CRIAR EMBEDDING MÉDIO (igual ao cadastro)
      console.log('🧮 Criando embedding médio de', updatedCaptures.length, 'capturas...');
      const avgEmbedding = createAverageEmbedding(updatedCaptures.map(c => c.embedding));

      if (!avgEmbedding) {
        throw new Error('Não foi possível consolidar as capturas faciais');
      }
      
      console.log('✅ Embedding médio criado:', {
        hasDescriptor: !!avgEmbedding.descriptor,
        descriptorLength: avgEmbedding.descriptor?.length,
        avgConfidence: updatedCaptures.reduce((sum, c) => sum + c.confidence, 0) / updatedCaptures.length
      });

      // ✅ IDENTIFICAR USUÁRIO COM EMBEDDING MÉDIO - PASSAR DIRETO (NÃO É BLOB)
      console.log('🔍 Identificando usuário com embedding médio (estrutura idêntica ao cadastro)...');
      const processedEmbedding = {
        descriptor: avgEmbedding.descriptor instanceof Float32Array
          ? avgEmbedding.descriptor
          : new Float32Array(avgEmbedding.descriptor),
        confidence: avgEmbedding.confidence ?? 0.95,
        timestamp: Date.now(),
        method: 'processed'
      };

      const result = await identifyUser(processedEmbedding);
      const resultSimilarity = result.similarity ?? 0;
      
      console.log('🔍 Resultado COMPLETO da identificação:', {
        success: result.success,
        similarity: result.similarity,
        userName: result.userName,
        userId: result.userId,
        method: result.method,
        candidates: result.candidates,
        fullResult: result
      });
      
      // 🚨 VALIDAÇÃO CRÍTICA DE SEGURANÇA
      if (result.securityBlock) {
        console.error('🚨 TENTATIVA DE ACESSO BLOQUEADA POR SEGURANÇA!');
        console.error('🔒 Similaridade insuficiente para acesso:', {
          similarity: result.similarity,
          userName: result.userName,
          method: result.method,
          reviewReason: result.reviewReason
        });
      }
      
      // P1-3: Threshold único DRY — fonte BIOMETRIC_POLICY (production-guardrails:50)
      const MARKET_STANDARD_THRESHOLD = BIOMETRIC_THRESHOLDS.SECURE_MARK;
      
      const isValidUser = result.success && 
                         result.similarity && 
                         resultSimilarity >= MARKET_STANDARD_THRESHOLD && // ✅ 75% THRESHOLD SEGURO
                         result.userId && 
                         result.userName && 
                         result.userName !== 'Funcionário Sem Nome' &&
                         result.userName !== 'Desconhecido' &&
                         result.userName !== 'Funcionário' &&
                         result.userName.length > 2 && // Nome real
                         !result.securityBlock &&
                         !result.securityAlert; // 🚨 NOVA VALIDAÇÃO
      
      console.log('🔒 VALIDAÇÃO DE SEGURANÇA:', {
        success: result.success,
        similarity: result.similarity,
        hasUserId: !!result.userId,
        hasUserName: !!result.userName,
        isNotGenericName: result.userName !== 'Funcionário Sem Nome',
        noSecurityBlock: !result.securityBlock,
        finalValidation: isValidUser
      });
      
      if (isValidUser) {
        // ✅ SUCESSO - VALIDAÇÃO FACIAL APROVADA
        console.log(`✅ ACESSO AUTORIZADO: ${result.userName} (${Math.round(resultSimilarity * 100)}%)`);
        console.log(`🆔 ID do funcionário: ${result.userId}`);
        
        // 🚨 VALIDAÇÃO CRÍTICA: Verificar geofencing ANTES de marcar ponto
        const geofenceValidation = await attemptPointMarking(pontoType);
        
        if (!geofenceValidation.allowed) {
          console.error('🚨 GEOFENCING BLOQUEOU O PONTO:', geofenceValidation.reason);
          setStage('error');
          setErrorMessage(`Erro de localização: ${geofenceValidation.reason}`);
          return;
        }
        
        // ✅ SALVAR PONTO NO BANCO DE DADOS
        console.log('💾 Salvando ponto no banco de dados...');
        console.log('📋 Tipo de ponto selecionado:', pontoType);
        
        const typeMapping = {
          'entrada': 'entry' as const,
          'saida': 'exit' as const,
          'pausa_inicio': 'break_start' as const,
          'pausa_fim': 'break_end' as const
        };
        
        const mappedType = typeMapping[pontoType];
        console.log('🔄 Tipo mapeado para banco:', mappedType);
        
        // 🚨 CRIAR BLOB A PARTIR DO CANVAS E CONVERTER PARA BASE64
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx || !videoRef.current) {
          throw new Error('Não foi possível criar canvas para captura');
        }
        
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);
        
        const faceEmbeddingBase64 = await new Promise<string>((resolve) => {
          canvas.toBlob((blob) => {
            if (!blob) {
              resolve(''); // Fallback vazio
              return;
            }
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          }, 'image/jpeg', 0.95);
        });
        
        const pointRecord = {
          userId: result.userId || user?.uid || '',
          type: mappedType,
          timestamp: Date.now(),
          location: currentLocation ? {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            accuracy: currentLocation.accuracy
          } : undefined,
          faceEmbedding: faceEmbeddingBase64, // ✅ Base64 em vez de Blob
          metadata: {
            facialRecognition: {
              similarity: result.similarity,
              userName: result.userName,
              userId: result.userId,
              method: result.method,
              confidence: result.confidence,
              threshold: MARKET_STANDARD_THRESHOLD,
              securityLevel: 'MAXIMUM_SECURITY'
            },
            geofenceValidation: {
              isValid: geofenceValidation.allowed,
              message: geofenceValidation.reason || 'Localização autorizada'
            },
            security: {
              timestamp: new Date().toISOString(),
              userAgent: navigator.userAgent,
              validated: true,
              pontoType: pontoType
            }
          }
        };
        
        const saveResult = await recordTime(pointRecord);
        
        if (!saveResult.success) {
          console.error('❌ ERRO AO SALVAR PONTO:', saveResult.message);
          setStage('error');
          setErrorMessage(`Erro ao salvar ponto: ${saveResult.message}`);
          return;
        }
        
        console.log('✅ Registro adicionado à fila de sincronização:', saveResult);
        
        // ✅ NOVA FUNCIONALIDADE: Analisar se o ponto precisa de análise do RH
        try {
          if (result.userId || user?.uid) {
            const uid = result.userId || user?.uid || '';
            const now = new Date();
            const actualTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            
            console.log('🕐 Analisando tolerância do ponto para RH...');
            const analysisResult = await analyzePointRecord(uid, pontoType, actualTime, now);
            
            if (analysisResult) {
              console.log('⚠️ Ponto fora da tolerância - análise criada para o RH:', analysisResult);
            } else {
              console.log('✅ Ponto dentro da tolerância - sem necessidade de análise');
            }
          }
        } catch (analysisError) {
          console.warn('⚠️ Erro na análise de tolerância (não crítico):', analysisError);
          // Não falhar o processo de marcação por erro na análise
        }
        
        // ✅ MENSAGEM ESPECÍFICA PARA CADA TIPO DE PONTO
        const typeMessages = {
          'entrada': 'Entrada registrada localmente',
          'saida': 'Saída registrada localmente', 
          'pausa_inicio': 'Início da pausa registrado localmente',
          'pausa_fim': 'Fim da pausa registrado localmente'
        };
        
        const typeMessage = typeMessages[pontoType] || 'Ponto registrado localmente';
        setSuccessMessage(`✅ ${result.userName}, ${typeMessage}. Aguardando sincronização e confirmação do servidor para gerar NSR.`);
        
        // ✅ DESATIVAR FLUXO DE CAPTURA QUANDO HÁ SUCESSO
        captureFlowActiveRef.current = false;
        console.log('🚫 Fluxo de captura desativado - sucesso alcançado');
        
        setStage('success');
        
      } else {
        // 🚨 FALHA CRÍTICA - TENTATIVA DE ACESSO NEGADA
        console.error('🚨 TENTATIVA DE ACESSO NEGADA!');
        console.error('🔒 DETALHES DA TENTATIVA:', {
          success: result.success,
          similarity: result.similarity,
          userName: result.userName,
          userId: result.userId,
          method: result.method,
          securityBlock: result.securityBlock,
          reviewReason: result.reviewReason,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          pontoType: pontoType
        });
        
        // ✅ DESATIVAR FLUXO DE CAPTURA
        captureFlowActiveRef.current = false;
        
        // ✅ FALHA - CAPTURAR MELHOR MATCH PARA EXIBIÇÃO
        console.log('❌ Capturando melhor match para exibição...');
        
        // ✅ BUSCAR MELHOR MATCH DOS LOGS OU RESULTADO
        let bestMatchData = null;
        
        if (result.userName && result.similarity) {
          bestMatchData = {
            name: result.userName,
            similarity: result.similarity
          };
        } else if (result.similarity !== undefined) {
          // ✅ CASO FALHA: similarity vem direto no result
          const candidateName = result.candidates && result.candidates[0] 
            ? result.candidates[0].userName 
            : 'Funcionário Sem Nome';
          
          bestMatchData = {
            name: candidateName,
            similarity: result.similarity
          };
        } else if (result.candidates && result.candidates.length > 0) {
          // ✅ FALLBACK: pegar do primeiro candidato
          const firstCandidate = result.candidates[0];
          bestMatchData = {
            name: firstCandidate.userName || 'Desconhecido',
            similarity: firstCandidate.similarity || 0
          };
        }
        
        console.log('📊 Melhor match capturado:', bestMatchData);
        setBestMatch(bestMatchData);
        
        // ✅ DESATIVAR FLUXO DE CAPTURA QUANDO VAI PARA ERRO
        captureFlowActiveRef.current = false;
        console.log('🚫 Fluxo de captura desativado - indo para tela de erro');
        
        setStage('error');
        setErrorMessage('Não foi possível identificar o funcionário');
      }
      
    } catch (error) {
      console.error('❌ Erro na captura:', error);
      
      // ✅ DESATIVAR FLUXO DE CAPTURA EM CASO DE ERRO
      captureFlowActiveRef.current = false;
      
      setStage('error');
      setErrorMessage('Erro durante a captura');
    } finally {
      setIsCapturing(false);
    }
  };

  // ✅ HANDLERS
  const handleRetry = useCallback(() => {
    console.log('🔄 Reiniciando captura...');
    
    // ✅ RESETAR REF DE CAPTURAS E REATIVAR FLUXO
    captureCountRef.current = 0;
    captureFlowActiveRef.current = true; // ✅ REATIVAR FLUXO
    
    // ✅ RESET COMPLETO DO ESTADO
    setStage('positioning');
    setCountdown(2); // ✅ Countdown rápido no retry também
    setBestMatch(null);
    setErrorMessage('');
    setIsCapturing(false);
    setIsDetecting(false);
    setHasDetected(false);
    setCaptureAttempts([]);
    setCurrentCaptureIndex(0);
    
    // ✅ LIMPAR CAPTURAS ANTERIORES
    setCaptureAttempts([]);
    setCurrentCaptureIndex(0);
    
    // ✅ SEMPRE REINICIAR CÂMERA NO RETRY
    console.log('🔄 Forçando reinicialização da câmera...');
    setCameraReady(false);
    setShowVideo(false);
    
    // ✅ LIMPAR STREAM ANTERIOR
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // ✅ REINICIALIZAR CÂMERA
    setTimeout(() => {
      initializeCamera();
    }, 200);
  }, [initializeCamera]);

  // ✅ CRIAR EMBEDDING MÉDIO (igual ao cadastro facial)
const createAverageEmbedding = useCallback((embeddings: OptimizedFaceEmbedding[]): OptimizedFaceEmbedding | null => {
    if (embeddings.length === 0) return null;

    console.log(`🧮 Criando embedding médio de ${embeddings.length} capturas`);

    const descriptorLength = embeddings[0].descriptor.length;
    const avgEmbedding = new Float32Array(descriptorLength);

    embeddings.forEach((embedding, embIndex) => {
      console.log(`🔢 Processando embedding ${embIndex + 1}:`, {
        hasDescriptor: !!embedding?.descriptor,
        descriptorLength: embedding?.descriptor?.length,
        confidence: embedding?.confidence
      });

      embedding.descriptor.forEach((value: number, index: number) => {
        avgEmbedding[index] += value;
      });
    });

    for (let i = 0; i < avgEmbedding.length; i++) {
      avgEmbedding[i] /= embeddings.length;
    }

    const confidence = embeddings.reduce((sum, emb) => sum + (emb.confidence ?? 0.95), 0) / embeddings.length;

    const result: OptimizedFaceEmbedding = {
      descriptor: avgEmbedding,
      confidence,
      timestamp: Date.now(),
      method: 'captured_average'
    };

    console.log('✅ Embedding médio criado - estrutura idêntica ao cadastro:', {
      hasDescriptor: !!result.descriptor,
      descriptorLength: result.descriptor.length,
      structure: Object.keys(result),
      avgConfidence: confidence
    });

    return result;
  }, []);

  const handleNext = useCallback(() => {
    router.push('/app/marcar');
  }, [router]);

  // ✅ CLEANUP
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // ✅ RENDERIZAÇÃO BASEADA NO ESTÁGIO
  if (!user || isLoadingLocation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin text-6xl mb-4">⏳</div>
          <p className="text-xl text-gray-600">Preparando sistema...</p>
        </div>
      </div>
    );
  }

  if (stage === 'success') {
  return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="text-6xl mb-6">✅</div>
          <h2 className="text-2xl font-bold text-green-800 mb-4">Registro Recebido</h2>
          <p className="text-lg text-green-700 mb-8">{successMessage}</p>
          <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
            O ponto fica como pendente até a sincronização backend confirmar recordId/NSR.
          </div>
          
          <div className="flex gap-3">
              <button
              onClick={handleNext}
              className="flex-1 bg-green-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-green-700 transition-colors"
              >
              👥 Próximo Funcionário
              </button>
              <Link
                href="/app/marcar"
              className="flex-1 bg-gray-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-gray-700 transition-colors text-center"
              >
              🏠 Voltar
              </Link>
              </div>
            </div>
                </div>
    );
  }

  if (stage === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-rose-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-6">
          
          {/* ✅ HEADER */}
          <div className="text-center mb-6">
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-2xl font-bold text-red-800 mb-2">Erro na Captura</h2>
            <p className="text-lg text-red-700">{errorMessage}</p>
          </div>

          {/* ✅ STATUS DETALHADO */}
          <div className="space-y-3 mb-6">
            
            {/* CERCA */}
            <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-gray-50">
              <span className="text-gray-700 font-medium">🌍 Cerca:</span>
              <span className={`font-semibold ${isInsideFence ? 'text-green-600' : 'text-red-600'}`}>
                {isInsideFence ? '✅ OK' : '❌ Fora da área'}
              </span>
              </div>
            
            {/* HORÁRIO */}
            <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-gray-50">
              <span className="text-gray-700 font-medium">⏰ Horário:</span>
              <span className="font-semibold text-gray-600">A validar no RH</span>
              </div>

            {/* IDENTIFICAÇÃO */}
            <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-gray-50">
              <span className="text-gray-700 font-medium">🔍 Identificação:</span>
              <div className="text-right">
                <div className="font-semibold text-red-600">❌ Falhou</div>
                {bestMatch && (
                  <div className="text-sm text-orange-600">
                    Melhor match: {Math.round(bestMatch.similarity * 100)}%
              </div>
            )}
              </div>
              </div>
              </div>

          {/* ✅ MELHOR MATCH DESTACADO */}
          {bestMatch && (
            <div className="bg-orange-50 rounded-lg p-4 mb-6 border border-orange-200">
              <h3 className="font-semibold text-gray-800 mb-2 text-center">📊 Análise Detalhada</h3>
              <div className="text-center">
                <div className="text-lg font-bold text-orange-700">
                  {bestMatch.name}
                      </div>
                <div className="text-2xl font-bold text-orange-600">
                  {Math.round(bestMatch.similarity * 100)}%
                      </div>
                <div className="text-sm text-gray-600">
                  (Mínimo configurado nesta tela: 75%)
                      </div>
                      </div>
                        </div>
                      )}
                      
          {/* ✅ BOTÕES */}
          <div className="flex gap-3">
            <button
              onClick={handleRetry}
              className="flex-1 bg-orange-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-orange-700 transition-colors"
            >
              🔄 Tentar Novamente
            </button>
            <Link 
              href="/app/marcar" 
              className="flex-1 bg-gray-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-gray-700 transition-colors text-center"
            >
              🏠 Voltar
            </Link>
                      </div>
                    </div>
                  </div>
    );
  }

  // ✅ TELA PRINCIPAL - PADRÃO QUE FUNCIONA
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        
        {/* ✅ HEADER */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            📸 Marcar Ponto - {pontoType.charAt(0).toUpperCase() + pontoType.slice(1)}
          </h1>
          <p className="text-gray-600">
            {stage === 'positioning' && captureCountRef.current === 0 && 'Posicione seu rosto no círculo'}
            {stage === 'positioning' && captureCountRef.current > 0 && `Captura rápida ${captureCountRef.current + 1}/${TOTAL_CAPTURES}`}
            {stage === 'capturing' && captureCountRef.current < TOTAL_CAPTURES && `Capturando... (${captureCountRef.current + 1}/${TOTAL_CAPTURES})`}
            {stage === 'capturing' && captureCountRef.current >= TOTAL_CAPTURES && 'Processando identificação...'}
          </p>
          
          {/* ✅ BARRA DE PROGRESSO DAS CAPTURAS */}
          {captureCountRef.current > 0 && (
            <div className="mb-4">
              <div className="flex justify-center space-x-2">
                {Array.from({ length: TOTAL_CAPTURES }, (_, i) => (
                  <div
                    key={i}
                    className={`w-4 h-4 rounded-full transition-all duration-300 ${
                      i < captureCountRef.current
                        ? 'bg-green-500 scale-110 shadow-lg'
                        : i === captureCountRef.current && stage === 'capturing'
                        ? 'bg-blue-500 animate-ping'
                        : i === captureCountRef.current
                        ? 'bg-blue-400 animate-pulse scale-105'
                        : 'bg-gray-300'
                    }`}
                  />
                ))}
                  </div>
              <p className="text-xs text-gray-500 mt-1 text-center">
                Capturas: {captureCountRef.current}/{TOTAL_CAPTURES}
              </p>
              </div>
            )}
          </div>

        {/* ✅ CÍRCULO DA CÂMERA - COMPONENTE UNIFICADO */}
        <FaceOvalCamera 
          videoRef={videoRef}
          cameraReady={cameraReady}
          showVideo={showVideo}
          stage={stage}
          countdown={countdown}
          isCapturing={isCapturing}
          message={stage === 'capturing' ? 'Analisando rosto...' : undefined}
          countdownColor="dynamic"
          showCountdown={true}
          showStatusIndicators={true}
        />

        {/* ✅ INFORMAÇÕES DE STATUS */}
          <div className="text-center mt-8">
          {isInsideFence === false && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-700">
                ❌ Você está fora da área permitida ({Math.round(distanceFromFence || 0)}m da cerca)
              </p>
            </div>
            )}
            
          {isInsideFence === true && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-green-700">
                ✅ Localização autorizada ({Math.round(distanceFromFence || 0)}m da cerca)
              </p>
          </div>
            )}
        </div>

      </div>
    </div>
  );
}

// ✅ COMPONENTE WRAPPER COM SUSPENSE
export default function OptimizedCaptureScreen() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando sistema de captura...</p>
        </div>
      </div>
    }>
      <OptimizedCaptureScreenContent />
    </Suspense>
  );
}
