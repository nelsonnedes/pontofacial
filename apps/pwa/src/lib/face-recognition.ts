// face-recognition.ts - DESABILITADO PARA RESOLVER WARNINGS WEBPACK
// ⚠️ Use face-recognition-optimized.ts em seu lugar

'use client';

// Tipos simulados para compatibilidade
type FaceDetection = any;
type FaceLandmarks68 = any;
type FaceDescriptor = any;
type WithFaceDescriptor<_T> = any;
type WithFaceLandmarks<_T, _U> = any;
type WithFaceDetection<_T> = any;
type TensorContainer = any;

// Service desabilitado
class FaceRecognitionService {
  private static instance: FaceRecognitionService;

  private constructor() {}

  public static getInstance(): FaceRecognitionService {
    if (!FaceRecognitionService.instance) {
      FaceRecognitionService.instance = new FaceRecognitionService();
    }
    return FaceRecognitionService.instance;
  }

  async initialize(): Promise<boolean> {
    console.error('❌ Face API tradicional desabilitado');
    console.error('❌ Use optimizedFaceRecognition de face-recognition-optimized.ts');
    return false;
  }

  async detectFaces(): Promise<FaceDetection[]> {
    throw new Error('Face API desabilitado - use face-recognition-optimized');
  }

  async extractFaceEmbedding(): Promise<Float32Array | null> {
    throw new Error('Face API desabilitado - use face-recognition-optimized');
  }

  isInitialized(): boolean { return false; }
  getErrors(): string[] { return ['Desabilitado']; }
}

export const faceRecognition = FaceRecognitionService.getInstance();

// Funções desabilitadas
export async function initializeFaceAPI(): Promise<boolean> {
  console.error('❌ Use optimizedFaceRecognition.initialize()');
  return false;
}

export async function detectFaces(): Promise<FaceDetection[]> {
  throw new Error('Use optimizedFaceRecognition.detectFaces()');
}

export async function extractFaceEmbedding(): Promise<Float32Array | null> {
  throw new Error('Use optimizedFaceRecognition.extractFaceEmbedding()');
}

export function isInitialized(): boolean { return false; }
export function getInitializationErrors(): string[] { return ['Desabilitado']; }
export function isFaceAPIAvailable(): boolean { return false; }

// Tipos exportados
export type { 
  FaceDetection, 
  FaceLandmarks68, 
  FaceDescriptor, 
  WithFaceDescriptor, 
  WithFaceLandmarks, 
  WithFaceDetection,
  TensorContainer
};

console.warn('🚫 face-recognition.ts DESABILITADO - use face-recognition-optimized.ts');
