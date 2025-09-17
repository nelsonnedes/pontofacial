/// <reference lib="webworker" />

// Configuração do worker para face-api.js e TensorFlow.js
// Otimizado para compatibilidade com Edge e Safari

// Variáveis de controle para evitar inicialização duplicada
let tfInitialized = false;
let faceApiInitialized = false;
let modelsLoaded = false;
let backendInitialized = false;
let landmarkLoadedUsingFallback = false;

// Configurar ambiente antes de qualquer importação
const setupEnvironment = () => {
  try {
    // Configuração básica do ambiente
    (self as any).window = self;
    (self as any).document = { createElement: () => null };
    (self as any).fetch = self.fetch;
    
    // Verificar suporte a OffscreenCanvas
    const hasOffscreenCanvas = typeof OffscreenCanvas === 'function';
    if (hasOffscreenCanvas) {
      (self as any).OffscreenCanvas = OffscreenCanvas;
    }
    
    // Garantir que ImageData esteja disponível
    if (typeof ImageData !== 'undefined') {
      (self as any).ImageData = ImageData;
    }
    
    console.log('✅ Ambiente do worker configurado com sucesso', { 
      hasOffscreenCanvas,
      hasImageData: typeof ImageData !== 'undefined',
      hasFetch: typeof fetch === 'function'
    });
    
    return true;
  } catch (err) {
    console.error('❌ Erro ao configurar ambiente do worker:', err);
    return false;
  }
};

// Configurar ambiente antes de importar
const envSetupSuccess = setupEnvironment();

// Importar após configuração de ambiente
import * as tf from '@tensorflow/tfjs';
import * as faceapi from '@vladmandic/face-api';

// Verificar se importações foram bem-sucedidas
const importsAvailable = typeof tf !== 'undefined' && typeof faceapi !== 'undefined';
if (!importsAvailable) {
  console.error('❌ Falha ao importar tensorflow ou face-api no worker');
}

// Tipos para mensagens do worker
type LoadMessage = { type: 'load'; modelUrl: string };
type DetectMessage = { type: 'detect'; image: ImageData };
type WorkerMessage = LoadMessage | DetectMessage;

// Tipo para resultado da detecção
type DetectionResult = {
  descriptor: Float32Array;
  detection: any;
  landmarks?: any;
  expressions?: any;
};

// Logger estruturado para mensagens consistentes
class StructuredLogger {
  static log(level: 'info' | 'warn' | 'error', message: string, data?: any) {
    console[level]({ message, data, timestamp: new Date().toISOString() });
  }
}

// Inicializar face-api uma única vez
function initializeFaceApi() {
  if (faceApiInitialized) {
    console.log('✓ face-api já inicializado, ignorando chamada duplicada');
    return;
  }
  
  try {
    // Verificar se o face-api está disponível
    if (!faceapi || typeof faceapi !== 'object') {
      throw new Error('face-api não foi importado corretamente');
    }

    // Forçar env do face-api para operar no worker com primitivas disponíveis
    if ((faceapi as any)?.env?.monkeyPatch) {
      // Preparar patches básicos
      const patches: any = {
        fetch: (self as any).fetch,
        createImageElement: () => null,
      };
      
      // Adicionar ImageData se disponível
      if (typeof ImageData !== 'undefined') {
        patches.ImageData = ImageData;
      }
      
      // Verificar suporte a OffscreenCanvas (não disponível no Safari)
      const hasOffscreenCanvas = typeof OffscreenCanvas === 'function';
      if (hasOffscreenCanvas) {
        patches.Canvas = OffscreenCanvas;
        patches.createCanvasElement = (w = 1, h = 1) => new OffscreenCanvas(w, h);
      } else {
        console.warn('⚠️ OffscreenCanvas não disponível neste navegador');
      }
      
      // Aplicar patches
      console.log('🔧 Aplicando monkeyPatch ao face-api com:', Object.keys(patches));
      (faceapi as any).env.monkeyPatch(patches);
    } else {
      console.warn('⚠️ face-api.env.monkeyPatch não está disponível');
    }
    
    // Forçar uso do mesmo TF do worker
    if (tf && typeof tf === 'object') {
      (faceapi as any).tf = tf;
      console.log('✓ TensorFlow vinculado ao face-api');
    }
    
    // Marcar flags de ambiente
    if ((faceapi as any)?.env?.setEnv) {
      (faceapi as any).env.setEnv({ isNodejs: false, isBrowser: true });
      console.log('✓ Ambiente face-api configurado: browser');
    }
    
    faceApiInitialized = true;
    console.log('✅ face-api inicializado com sucesso no worker');
  } catch (e) {
    console.error('❌ face-api env monkeyPatch falhou:', e);
    throw e;
  }
}

// Inicializar TensorFlow.js uma única vez
async function ensureBackend() {
  if (backendInitialized) {
    console.log('✓ Backend já inicializado, ignorando chamada duplicada');
    return;
  }
  
  try {
    // Verificar se o TensorFlow está disponível
    if (!tf || typeof tf !== 'object') {
      throw new Error('TensorFlow não foi importado corretamente');
    }

    if (!tfInitialized) {
      // Desabilitar WebGL no worker para evitar problemas
      console.log('🔧 Configurando backend CPU para o TensorFlow');
      
      // Limpar registros anteriores se existirem
      try {
        await tf.removeBackend('cpu');
        console.log('✓ Backend CPU removido com sucesso');
      } catch (e) {
        // Ignorar erros de backend não registrado
      }
      
      // Definir CPU explicitamente no worker para evitar múltiplos registros
      await tf.setBackend('cpu');
      await tf.ready();
      
      // Verificar se o backend foi configurado corretamente
      const currentBackend = tf.getBackend();
      if (currentBackend !== 'cpu') {
        console.warn(`⚠️ Backend atual é ${currentBackend}, esperado 'cpu'`);
      }
      
      tfInitialized = true;
      console.log('✓ TensorFlow inicializado com backend:', currentBackend);
    }
    
    backendInitialized = true;
    StructuredLogger.log('info', 'TFJS backend initialized in worker', { backend: tf.getBackend() });
  } catch (e) {
    console.error('❌ Erro ao inicializar backend TensorFlow:', e);
    throw e;
  }
}

// Carregar modelos com verificação de disponibilidade
async function loadModels(modelUrl: string) {
  if (modelsLoaded) {
    console.log('✓ Modelos já carregados, ignorando chamada duplicada');
    (self as unknown as Worker).postMessage({ type: 'loaded', ok: true, landmarkLoadedUsingFallback });
    return;
  }
  
  // Verificar se o ambiente foi configurado corretamente
  if (!envSetupSuccess || !importsAvailable) {
    throw new Error('Ambiente do worker não foi configurado corretamente');
  }
  
  // Inicializar TensorFlow e face-api antes de carregar modelos
  try {
    console.log('🔧 Inicializando backend TensorFlow...');
    await ensureBackend();
    
    console.log('🔧 Inicializando face-api...');
    initializeFaceApi();
  } catch (e) {
    console.error('❌ Falha na inicialização de dependências:', e);
    throw e;
  }
  
  try {
    (self as unknown as Worker).postMessage({ type: 'load_progress', stage: 'start', url: modelUrl });
    
    // Verificar acessibilidade dos manifests antes de usar face-api
    const manifestFiles = [
      'tiny_face_detector_model-weights_manifest.json',
      'face_landmark_68_model-weights_manifest.json',
      'face_recognition_model-weights_manifest.json',
      'face_expression_model-weights_manifest.json',
    ];
    
    for (const mf of manifestFiles) {
      try {
        const res = await fetch(`${modelUrl.replace(/\/$/, '')}/${mf}`, { cache: 'no-store' });
        (self as unknown as Worker).postMessage({ 
          type: 'load_progress', 
          stage: 'manifest_check', 
          file: mf, 
          status: res.status 
        });
      } catch (prefetchErr: any) {
        (self as unknown as Worker).postMessage({ 
          type: 'load_progress', 
          stage: 'manifest_check_error', 
          file: mf, 
          error: prefetchErr?.message 
        });
      }
    }

    // Carregar detector facial
    (self as unknown as Worker).postMessage({ type: 'load_progress', stage: 'tinyFaceDetector:load' });
    if (!faceapi.nets.tinyFaceDetector.isLoaded) {
      await faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl);
    } else {
      (self as unknown as Worker).postMessage({ type: 'load_progress', stage: 'tinyFaceDetector:already_loaded' });
    }
    
    // Carregar landmarks (com fallback para tiny)
    try {
      (self as unknown as Worker).postMessage({ type: 'load_progress', stage: 'landmark68:load' });
      if (!faceapi.nets.faceLandmark68Net.isLoaded) {
        await faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl);
      } else {
        (self as unknown as Worker).postMessage({ type: 'load_progress', stage: 'landmark68:already_loaded' });
      }
    } catch (err) {
      StructuredLogger.log('warn', 'faceLandmark68Net failed in worker, trying tiny fallback', err);
      (self as unknown as Worker).postMessage({ type: 'load_progress', stage: 'landmark68:tiny_fallback' });
      
      if (!faceapi.nets.faceLandmark68TinyNet.isLoaded) {
        await faceapi.nets.faceLandmark68TinyNet.loadFromUri(modelUrl);
      } else {
        (self as unknown as Worker).postMessage({ type: 'load_progress', stage: 'landmark68tiny:already_loaded' });
      }
      
      landmarkLoadedUsingFallback = true;
    }
    
    // Carregar reconhecimento facial
    (self as unknown as Worker).postMessage({ type: 'load_progress', stage: 'recognition:load' });
    if (!faceapi.nets.faceRecognitionNet.isLoaded) {
      await faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl);
    } else {
      (self as unknown as Worker).postMessage({ type: 'load_progress', stage: 'recognition:already_loaded' });
    }
    
    // Carregar expressões faciais (opcional)
    try {
      (self as unknown as Worker).postMessage({ type: 'load_progress', stage: 'expression:load' });
      if (!faceapi.nets.faceExpressionNet.isLoaded) {
        await faceapi.nets.faceExpressionNet.loadFromUri(modelUrl);
      } else {
        (self as unknown as Worker).postMessage({ type: 'load_progress', stage: 'expression:already_loaded' });
      }
    } catch (optionalErr) {
      StructuredLogger.log('warn', 'faceExpressionNet optional load failed in worker', optionalErr);
      (self as unknown as Worker).postMessage({ 
        type: 'load_progress', 
        stage: 'expression:optional_failed', 
        error: (optionalErr as any)?.message 
      });
    }
    
    modelsLoaded = true;
    StructuredLogger.log('info', 'Models loaded in worker', { landmarkLoadedUsingFallback });
    (self as unknown as Worker).postMessage({ 
      type: 'load_progress', 
      stage: 'done', 
      landmarkLoadedUsingFallback 
    });
  } catch (e) {
    StructuredLogger.log('error', 'Model loading failed in worker', e);
    (self as unknown as Worker).postMessage({ 
      type: 'load_progress', 
      stage: 'error', 
      error: (e as any)?.message,
      stack: (e as any)?.stack
    });
    throw e;
  }
}

// Handler de mensagens do worker
self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  try {
    const data = event.data;
    if (!data) {
      console.warn('⚠️ Mensagem vazia recebida no worker');
      return;
    }

    console.log('📨 Worker recebeu mensagem:', data.type);

    // Handler de carregamento de modelos
    if (data.type === 'load') {
      try {
        console.log('🔄 Iniciando carregamento de modelos com URL:', data.modelUrl);
        await loadModels(data.modelUrl);
        (self as unknown as Worker).postMessage({ type: 'loaded', ok: true, landmarkLoadedUsingFallback });
      } catch (error: any) {
        console.error('❌ Erro ao carregar modelos:', error);
        (self as unknown as Worker).postMessage({ 
          type: 'error', 
          context: 'load', 
          message: error?.message || 'Unknown worker load error',
          stack: error?.stack
        });
      }
      return;
    }

    // Handler de detecção facial
    if (data.type === 'detect') {
      try {
        if (!modelsLoaded) {
          console.error('❌ Tentativa de detecção sem modelos carregados');
          throw new Error('Worker models not loaded');
        }
        
        console.log('🔍 Iniciando detecção facial...');
        const imgData = data.image;
        
        if (!imgData || !imgData.width || !imgData.height) {
          throw new Error('Dados de imagem inválidos para detecção');
        }
        
        console.log(`🖼️ Processando imagem ${imgData.width}x${imgData.height}`);
        
        // Verificar se o face-api está inicializado
        if (!faceApiInitialized) {
          console.warn('⚠️ Face API não inicializado, tentando inicializar...');
          initializeFaceApi();
        }
        
        const detections = await faceapi
          .detectAllFaces(imgData, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks(landmarkLoadedUsingFallback ? true : undefined)
          .withFaceDescriptors()
          .withFaceExpressions();

        const result: DetectionResult[] = detections.map((d: any) => ({
          descriptor: d.descriptor,
          detection: d.detection,
          landmarks: d.landmarks,
          expressions: d.expressions,
        }));

        console.log(`✅ Detecção facial completada: ${result.length} rostos encontrados`);
        StructuredLogger.log('info', 'Detecção facial completada no worker', { count: result.length });
        (self as unknown as Worker).postMessage({ type: 'detect_result', payload: result });
      } catch (error: any) {
        console.error('❌ Erro na detecção facial:', error);
        StructuredLogger.log('error', 'Erro na detecção no worker', error);
        (self as unknown as Worker).postMessage({ 
          type: 'detect_result', 
          error: error?.message || 'Unknown worker error',
          stack: error?.stack
        });
      }
    }
    
    // Handler para mensagens de ping/status
    if (data.type === 'status') {
      (self as unknown as Worker).postMessage({
        type: 'status_response',
        tfInitialized,
        faceApiInitialized,
        modelsLoaded,
        backendInitialized,
        envSetupSuccess,
        importsAvailable
      });
    }
  } catch (error) {
    console.error('❌ Erro não tratado no worker:', error);
  }
});

// Informar que o worker foi carregado
console.log('✅ Face worker carregado e pronto para inicialização');