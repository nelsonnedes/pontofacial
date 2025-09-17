/// <reference lib="webworker" />

// Configurar ambiente antes de qualquer importação
// Sinalizar ambiente tipo navegador dentro do worker (antes de carregar libs)
(self as any).window = self as any;
(self as any).document = undefined;
(self as any).fetch = (self as any).fetch || fetch;
(self as any).OffscreenCanvas = (self as any).OffscreenCanvas || undefined;
(self as any).ImageData = (self as any).ImageData || undefined;

// Expor globais também em window após carregamento
(self as any).window.fetch = (self as any).fetch;
(self as any).window.OffscreenCanvas = (self as any).OffscreenCanvas;
(self as any).window.ImageData = (self as any).ImageData;

// Prevenir duplicação de registros e backends
let tfInitialized = false;
let faceApiInitialized = false;

// Importar após configuração de ambiente
import * as tf from '@tensorflow/tfjs';
import * as faceapi from '@vladmandic/face-api';

type LoadMessage = { type: 'load'; modelUrl: string };
type DetectMessage = { type: 'detect'; image: ImageData };

type WorkerMessage = LoadMessage | DetectMessage;

type DetectionResult = {
  descriptor: Float32Array;
  detection: any;
  landmarks?: any;
  expressions?: any;
};

// Inicializar face-api uma única vez
function initializeFaceApi() {
  if (faceApiInitialized) return;
  
  try {
    // Forçar env do face-api para operar no worker com primitivas disponíveis
    if ((faceapi as any)?.env?.monkeyPatch) {
      const patches: any = {
        fetch: (self as any).fetch,
        ImageData: (self as any).ImageData,
        createImageElement: () => null,
      };
      
      // Verificar suporte a OffscreenCanvas (não disponível no Safari)
      const hasOffscreenCanvas = typeof (self as any).OffscreenCanvas === 'function';
      if (hasOffscreenCanvas) {
        patches.Canvas = (self as any).OffscreenCanvas;
        patches.createCanvasElement = (w = 1, h = 1) => new (self as any).OffscreenCanvas(w, h);
      } else {
        console.warn('⚠️ OffscreenCanvas não disponível neste navegador');
      }
      
      (faceapi as any).env.monkeyPatch(patches);
    }
    
    // Forçar uso do mesmo TF do worker
    (faceapi as any).tf = tf;
    
    // Marcar flags de ambiente
    (faceapi as any).env?.setEnv?.({ isNodejs: false, isBrowser: true });
    
    faceApiInitialized = true;
    console.log('✅ face-api inicializado com sucesso no worker');
  } catch (e) {
    console.warn('❌ face-api env monkeyPatch falhou:', e);
    throw e;
  }
}

class StructuredLogger {
  static log(level: 'info' | 'warn' | 'error', message: string, data?: any) {
    // eslint-disable-next-line no-console
    console[level]({ message, data, timestamp: new Date().toISOString() });
  }
}

let modelsLoaded = false;
let backendInitialized = false;
let landmarkLoadedUsingFallback = false;

// Inicializar TensorFlow.js uma única vez
async function ensureBackend() {
  if (backendInitialized) return;
  
  try {
    if (!tfInitialized) {
      // Definir CPU explicitamente no worker para evitar múltiplos registros
      await tf.setBackend('cpu');
      await tf.ready();
      tfInitialized = true;
    }
    
    backendInitialized = true;
    StructuredLogger.log('info', 'TFJS backend initialized in worker', { backend: tf.getBackend() });
  } catch (e) {
    StructuredLogger.log('error', 'Failed to init TFJS backend in worker', e);
    throw e;
  }
}

async function loadModels(modelUrl: string) {
  if (modelsLoaded) return;
  
  // Inicializar TensorFlow e face-api antes de carregar modelos
  await ensureBackend();
  initializeFaceApi();
  
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
        (self as unknown as Worker).postMessage({ type: 'load_progress', stage: 'manifest_check', file: mf, status: res.status });
      } catch (prefetchErr: any) {
        (self as unknown as Worker).postMessage({ type: 'load_progress', stage: 'manifest_check_error', file: mf, error: prefetchErr?.message });
      }
    }

    (self as unknown as Worker).postMessage({ type: 'load_progress', stage: 'tinyFaceDetector:load' });
    // Verificar se o modelo já está carregado antes de tentar carregar novamente
    if (!faceapi.nets.tinyFaceDetector.isLoaded) {
      await faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl);
    } else {
      (self as unknown as Worker).postMessage({ type: 'load_progress', stage: 'tinyFaceDetector:already_loaded' });
    }
    
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
    
    (self as unknown as Worker).postMessage({ type: 'load_progress', stage: 'recognition:load' });
    if (!faceapi.nets.faceRecognitionNet.isLoaded) {
      await faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl);
    } else {
      (self as unknown as Worker).postMessage({ type: 'load_progress', stage: 'recognition:already_loaded' });
    }
    
    try {
      (self as unknown as Worker).postMessage({ type: 'load_progress', stage: 'expression:load' });
      if (!faceapi.nets.faceExpressionNet.isLoaded) {
        await faceapi.nets.faceExpressionNet.loadFromUri(modelUrl);
      } else {
        (self as unknown as Worker).postMessage({ type: 'load_progress', stage: 'expression:already_loaded' });
      }
    } catch (optionalErr) {
      StructuredLogger.log('warn', 'faceExpressionNet optional load failed in worker', optionalErr);
      (self as unknown as Worker).postMessage({ type: 'load_progress', stage: 'expression:optional_failed', error: (optionalErr as any)?.message });
    }
    
    modelsLoaded = true;
    StructuredLogger.log('info', 'Models loaded in worker', { landmarkLoadedUsingFallback });
    (self as unknown as Worker).postMessage({ type: 'load_progress', stage: 'done', landmarkLoadedUsingFallback });
  } catch (e) {
    StructuredLogger.log('error', 'Model loading failed in worker', e);
    (self as unknown as Worker).postMessage({ type: 'load_progress', stage: 'error', error: (e as any)?.message });
    throw e;
  }
}

// Recebemos ImageData diretamente do thread principal para compatibilidade com Safari/Edge

self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'load') {
    try {
      await loadModels(data.modelUrl);
      (self as unknown as Worker).postMessage({ type: 'loaded', ok: true, landmarkLoadedUsingFallback });
    } catch (error: any) {
      (self as unknown as Worker).postMessage({ type: 'error', context: 'load', message: error?.message || 'Unknown worker load error' });
    }
    return;
  }

  if (data.type === 'detect') {
    try {
      if (!modelsLoaded) throw new Error('Worker models not loaded');
      const imgData = data.image;
      const detections = await faceapi
        .detectAllFaces(imgData, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptors()
        .withFaceExpressions();

      const result: DetectionResult[] = detections.map((d: any) => ({
        descriptor: d.descriptor,
        detection: d.detection,
        landmarks: d.landmarks,
        expressions: d.expressions,
      }));

      StructuredLogger.log('info', 'Detecção facial completada no worker', { count: result.length });
      (self as unknown as Worker).postMessage({ type: 'detect_result', payload: result });
    } catch (error: any) {
      StructuredLogger.log('error', 'Erro na detecção no worker', error);
      (self as unknown as Worker).postMessage({ type: 'detect_result', error: error?.message || 'Unknown worker error' });
    }
  }
});