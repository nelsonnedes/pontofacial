/// <reference lib="webworker" />

// Declare globals provided by importScripts
declare const tf: any;
declare const faceapi: any;

type LoadMessage = { type: 'load'; modelUrl: string };
type DetectMessage = { type: 'detect'; image: ImageBitmap };

type WorkerMessage = LoadMessage | DetectMessage;

type DetectionResult = {
  descriptor: Float32Array;
  detection: any;
  landmarks?: any;
  expressions?: any;
};

importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest');
importScripts('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.min.js');

class StructuredLogger {
  static log(level: 'info' | 'warn' | 'error', message: string, data?: any) {
    // eslint-disable-next-line no-console
    console[level]({ message, data, timestamp: new Date().toISOString() });
  }
}

let modelsLoaded = false;
let backendInitialized = false;
let landmarkLoadedUsingFallback = false;

async function ensureBackend() {
  if (backendInitialized) return;
  try {
    // WebGL in worker may require OffscreenCanvas support; CPU is safest
    await tf.setBackend('cpu');
    await tf.ready();
    backendInitialized = true;
    StructuredLogger.log('info', 'TFJS backend initialized in worker', { backend: tf.getBackend() });
  } catch (e) {
    StructuredLogger.log('error', 'Failed to init TFJS backend in worker', e);
    throw e;
  }
}

async function loadModels(modelUrl: string) {
  if (modelsLoaded) return;
  await ensureBackend();
  try {
    await faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl);
    try {
      await faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl);
    } catch (err) {
      StructuredLogger.log('warn', 'faceLandmark68Net failed in worker, trying tiny fallback', err);
      await faceapi.nets.faceLandmark68TinyNet.loadFromUri(modelUrl);
      landmarkLoadedUsingFallback = true;
    }
    await faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl);
    try {
      await faceapi.nets.faceExpressionNet.loadFromUri(modelUrl);
    } catch (optionalErr) {
      StructuredLogger.log('warn', 'faceExpressionNet optional load failed in worker', optionalErr);
    }
    modelsLoaded = true;
    StructuredLogger.log('info', 'Models loaded in worker', { landmarkLoadedUsingFallback });

    // Warm up tf.js execution context to compile shaders and weights before real-time usage
    try {
      StructuredLogger.log('info', 'Warming up Face API models in worker...');
      const dummyCanvas = new OffscreenCanvas(1, 1);
      const dummyCtx = dummyCanvas.getContext('2d');
      if (dummyCtx) {
        const dummyImgData = dummyCtx.getImageData(0, 0, 1, 1);
        await faceapi.detectAllFaces(dummyImgData, new faceapi.TinyFaceDetectorOptions());
        StructuredLogger.log('info', 'Face API models warmed up successfully in worker.');
      }
    } catch (warmupErr) {
      StructuredLogger.log('warn', 'Warmup failed (non-fatal)', warmupErr);
    }
  } catch (e) {
    StructuredLogger.log('error', 'Model loading failed in worker', e);
    throw e;
  }
}

function imageBitmapToImageData(bitmap: ImageBitmap): ImageData {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context not available in worker');
  ctx.drawImage(bitmap, 0, 0);
  const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return imgData;
}

self.addEventListener('message', async (event: MessageEvent<any>) => {
  const data = event.data;
  if (!data) return;

  const requestId = data.id || data.requestId;

  if (data.type === 'load') {
    try {
      await loadModels(data.modelUrl);
      (self as unknown as Worker).postMessage({ type: 'loaded', ok: true, landmarkLoadedUsingFallback, id: requestId, requestId });
    } catch (error: any) {
      (self as unknown as Worker).postMessage({ type: 'error', context: 'load', message: error?.message || 'Unknown worker load error', id: requestId, requestId });
    }
    return;
  }

  if (data.type === 'detect') {
    try {
      if (!modelsLoaded) throw new Error('Worker models not loaded');
      const imgData = imageBitmapToImageData(data.image);
      const detections = await faceapi
        .detectAllFaces(imgData, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptors()
        .withFaceExpressions();

      const result: DetectionResult[] = detections.map((d: any) => ({
        descriptor: d.descriptor,
        detection: {
          box: {
            x: d.detection.box.x,
            y: d.detection.box.y,
            width: d.detection.box.width,
            height: d.detection.box.height
          },
          score: d.detection.score
        },
        landmarks: d.landmarks,
        expressions: d.expressions,
      }));

      StructuredLogger.log('info', 'Detecção facial completada no worker', { count: result.length });
      (self as unknown as Worker).postMessage({ type: 'detect_result', payload: result, id: requestId, requestId });
    } catch (error: any) {
      StructuredLogger.log('error', 'Erro na detecção no worker', error);
      (self as unknown as Worker).postMessage({ type: 'detect_result', error: error?.message || 'Unknown worker error', id: requestId, requestId });
    }
  }
});