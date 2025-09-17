'use client';

// Configurações do Face API
const MODEL_URL = '/models';
const SIMILARITY_THRESHOLD = 0.6;

// Estado global de tentativas
let globalInitializationPromise: Promise<void> | null = null;
let retryCount = 0;
let maxRetries = 3;
let lastRetryTime = 0;

// Tipos
export interface FaceData {
  descriptor: Float32Array;
  detection: any;
  landmarks?: any;
  expressions?: any;
}

export interface FaceEmbedding {
  descriptor: number[];
  confidence: number;
  timestamp: number;
}

class StructuredLogger {
  static log(level: 'info' | 'warn' | 'error', message: string, data?: any) {
    console[level]({ message, data, timestamp: new Date().toISOString() });
  }
}

type WorkerDetectResultMessage = {
  type: 'detect_result';
  payload?: Array<{ descriptor: Float32Array | number[]; detection: any; landmarks?: any; expressions?: any }>;
  error?: string;
};

type WorkerLoadedMessage = { type: 'loaded'; ok: boolean; landmarkLoadedUsingFallback?: boolean };
type WorkerErrorMessage = { type: 'error'; context: 'load'; message: string };

export class FaceRecognitionService {
  private static instance: FaceRecognitionService;

  private isInitialized = false;
  private modelsLoaded = false;
  private initializationPromise: Promise<void> | null = null;

  private worker: Worker | null = null;
  private workerLoadPromise: Promise<void> | null = null;
  private resolveWorkerLoad: (() => void) | null = null;
  private rejectWorkerLoad: ((reason?: any) => void) | null = null;

  private constructor() {}

  public static getInstance(): FaceRecognitionService {
    if (!FaceRecognitionService.instance) {
      FaceRecognitionService.instance = new FaceRecognitionService();
    }
    return FaceRecognitionService.instance;
  }

  private initWorker() {
    if (this.worker) {
      console.log('Worker já existe, verificando estado...');
      this.checkWorkerStatus();
      return;
    }
    
    console.log('🔄 Inicializando worker de reconhecimento facial...');
    
    try {
      this.worker = new Worker(new URL('./face-worker.ts', import.meta.url));
      console.log('✅ Worker criado com sucesso');
    } catch (error) {
      console.error('❌ Falha ao criar worker:', error);
      throw new Error(`Falha ao criar worker: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }

    this.workerLoadPromise = new Promise<void>((resolve, reject) => {
      this.resolveWorkerLoad = resolve;
      this.rejectWorkerLoad = reject;
      
      // Timeout para evitar bloqueio indefinido
      setTimeout(() => {
        if (this.rejectWorkerLoad) {
          this.rejectWorkerLoad(new Error('Timeout ao aguardar inicialização do worker'));
          this.rejectWorkerLoad = null;
          this.resolveWorkerLoad = null;
        }
      }, 30000); // 30 segundos de timeout
    });

    this.worker.addEventListener('message', (event: MessageEvent<any>) => {
      const data: any = event.data;
      if (!data || !('type' in data)) return;

      // Log de todas as mensagens recebidas
      console.log('📨 Mensagem do worker:', data.type);

      if (data.type === 'loaded' && (data as WorkerLoadedMessage).ok) {
        this.modelsLoaded = true;
        console.log('✅ Modelos carregados com sucesso no worker');
        
        if (this.resolveWorkerLoad) {
          this.resolveWorkerLoad();
          this.resolveWorkerLoad = null;
        }
        this.rejectWorkerLoad = null;
      }

      if (data.type === 'error' && (data as WorkerErrorMessage).context === 'load') {
        const message = (data as WorkerErrorMessage).message;
        const stack = (data as any).stack;
        console.error('❌ Erro ao carregar modelos no worker:', message, stack ? `\nStack: ${stack}` : '');
        
        if (this.rejectWorkerLoad) {
          this.rejectWorkerLoad(new Error(message));
          this.rejectWorkerLoad = null;
        }
        this.resolveWorkerLoad = null;
      }

      if (data.type === 'load_progress') {
        // Log detalhado do progresso de carregamento
        console.log(`🔄 [${data.stage}]`, data);
        
        // Se houver erro no progresso, registrar
        if (data.stage === 'error' && this.rejectWorkerLoad) {
          this.rejectWorkerLoad(new Error(`Erro no carregamento: ${data.error || 'Desconhecido'}`));
          this.rejectWorkerLoad = null;
          this.resolveWorkerLoad = null;
        }
      }
      
      // Resposta de status do worker
      if (data.type === 'status_response') {
        console.log('📊 Status do worker:', data);
      }
    });
    
    // Adicionar handler de erro para o worker
    this.worker.addEventListener('error', (error) => {
      console.error('❌ Erro no worker:', error);
      
      if (this.rejectWorkerLoad) {
        this.rejectWorkerLoad(new Error(`Erro no worker: ${error.message}`));
        this.rejectWorkerLoad = null;
      }
    });

    // Disparar carregamento dos modelos no worker
    console.log('🔄 Solicitando carregamento de modelos do worker...');
    this.worker.postMessage({ type: 'load', modelUrl: MODEL_URL });
  }
  
  // Verificar status do worker
  private checkWorkerStatus() {
    if (!this.worker) return;
    
    try {
      this.worker.postMessage({ type: 'status' });
    } catch (error) {
      console.error('❌ Erro ao verificar status do worker:', error);
    }
  }

  public async initialize(): Promise<void> {
    StructuredLogger.log('info', 'Iniciando FaceRecognitionService');
    if (this.isInitialized) return;
    if (this.initializationPromise) return this.initializationPromise;

    // Controle de retries
    const now = Date.now();
    if (retryCount >= maxRetries) {
      const timeSinceLastRetry = now - lastRetryTime;
      if (timeSinceLastRetry < 30000) {
        throw new Error('Face API falhou muitas vezes. Aguarde 30 segundos antes de tentar novamente.');
      }
      retryCount = 0;
    }

    const timeoutMs = Math.min(30000 + retryCount * 10000, 60000);
    this.initializationPromise = Promise.race([
      this.performInitialization(),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Face API não conseguiu inicializar em ${Math.floor(timeoutMs / 1000)} segundos. Tentativa ${retryCount + 1}/${maxRetries}`)), timeoutMs))
    ]);
    globalInitializationPromise = this.initializationPromise;

    try {
      await this.initializationPromise;
      retryCount = 0;
      StructuredLogger.log('info', 'Face API inicializado com sucesso (worker)');
    } catch (error) {
      retryCount++;
      lastRetryTime = now;
      this.initializationPromise = null;
      globalInitializationPromise = null;
      StructuredLogger.log('error', 'Tentativa de inicialização falhou', error);
      if (retryCount >= maxRetries) {
        throw new Error(`Face API falhou após ${maxRetries} tentativas. Verifique sua conexão e tente novamente.`);
      }
      throw error;
    }
  }

  private async performInitialization(): Promise<void> {
    try {
      // Inicializa worker e aguarda modelos
      this.initWorker();
      if (this.workerLoadPromise) {
        await this.workerLoadPromise;
      }
      this.isInitialized = true;
    } catch (error) {
      this.isInitialized = false;
      this.modelsLoaded = false;
      throw new Error('Falha ao inicializar reconhecimento facial');
    }
  }

  public isReady(): boolean {
    const ready = this.isInitialized && this.modelsLoaded;
    StructuredLogger.log('info', 'Verificando readiness', { ready });
    return ready;
  }

  public async detectFaces(imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<FaceData[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    if (!this.modelsLoaded) {
      throw new Error('Modelos do Face API não estão carregados. Tente inicializar novamente.');
    }
    this.initWorker();
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker não inicializado'));
        return;
      }

      // Criar ImageData compatível com Safari/Edge (evita ImageBitmap)
      let image: ImageData;
      const canvas = document.createElement('canvas');
      const width = (imageElement as any).width || (imageElement as HTMLVideoElement).videoWidth || 0;
      const height = (imageElement as any).height || (imageElement as HTMLVideoElement).videoHeight || 0;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx || width === 0 || height === 0) {
        reject(new Error('Falha ao preparar imagem para detecção'));
        return;
      }
      ctx.drawImage(imageElement as any, 0, 0);
      image = ctx.getImageData(0, 0, width, height);

      const onMessage = (event: MessageEvent<WorkerDetectResultMessage>) => {
        const data = event.data;
        if (!data || data.type !== 'detect_result') return;
        this.worker?.removeEventListener('message', onMessage);
        if (data.error) {
          reject(new Error(data.error));
          return;
        }
        const payload = data.payload || [];
        resolve(payload.map((d: any) => ({
          descriptor: new Float32Array(d.descriptor),
          detection: d.detection,
          landmarks: d.landmarks,
          expressions: d.expressions
        })));
      };

      this.worker.addEventListener('message', onMessage);
      // Transfer array buffer of ImageData.data for performance when supported
      const transferable = (image.data && (image.data as any).buffer) ? [(image.data as any).buffer] : [];
      this.worker.postMessage({ type: 'detect', image }, transferable);
    });
  }

  public async extractFaceEmbedding(imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<FaceEmbedding | null> {
    const faces = await this.detectFaces(imageElement);
    if (faces.length === 0) return null;
    const face = faces[0];
    return {
      descriptor: Array.from(face.descriptor),
      confidence: face.detection?.score ?? 1,
      timestamp: Date.now()
    };
  }

  public async compareFaces(embedding1: FaceEmbedding, embedding2: FaceEmbedding): Promise<number> {
    const desc1 = new Float32Array(embedding1.descriptor);
    const desc2 = new Float32Array(embedding2.descriptor);
    if (desc1.length !== desc2.length || desc1.length === 0) return 0;
    let sumSq = 0;
    for (let i = 0; i < desc1.length; i++) {
      const diff = desc1[i] - desc2[i];
      sumSq += diff * diff;
    }
    const distance = Math.sqrt(sumSq);
    return Math.max(0, 1 - distance);
  }

  public async isSamePerson(embedding1: FaceEmbedding, embedding2: FaceEmbedding): Promise<boolean> {
    const similarity = await this.compareFaces(embedding1, embedding2);
    return similarity >= SIMILARITY_THRESHOLD;
  }

  public async processImageForRecognition(imageBlob: Blob): Promise<FaceEmbedding | null> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = async () => {
        try {
          const embedding = await this.extractFaceEmbedding(img);
          resolve(embedding);
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('Falha ao carregar imagem'));
      img.src = URL.createObjectURL(imageBlob);
    });
  }

  public async validateFaceForRegistration(imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<{
    isValid: boolean;
    message: string;
    faceData?: FaceData;
  }> {
    try {
      const faces = await this.detectFaces(imageElement);
      if (faces.length === 0) {
        return { isValid: false, message: 'Nenhum rosto detectado. Posicione seu rosto no centro da tela.' };
      }
      if (faces.length > 1) {
        return { isValid: false, message: 'Múltiplos rostos detectados. Certifique-se de estar sozinho na imagem.' };
      }
      const face = faces[0];
      if ((face.detection?.score ?? 0) < 0.5) {
        return { isValid: false, message: 'Qualidade da imagem baixa. Melhore a iluminação e tente novamente.' };
      }
      const { width, height } = face.detection.box || { width: 0, height: 0 };
      if (width < 100 || height < 100) {
        return { isValid: false, message: 'Rosto muito pequeno. Aproxime-se da câmera.' };
      }
      return { isValid: true, message: 'Rosto detectado com sucesso!', faceData: face };
    } catch (_) {
      return { isValid: false, message: 'Erro na validação facial. Tente novamente.' };
    }
  }

  public async detectExpressions(imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<{
    smile: number;
    neutral: number;
    angry: number;
    disgusted: number;
    fearful: number;
    happy: number;
    sad: number;
    surprised: number;
  } | null> {
    try {
      const faces = await this.detectFaces(imageElement);
      if (faces.length === 0 || !faces[0].expressions) return null;
      const expressions = faces[0].expressions;
      return {
        smile: expressions.happy,
        neutral: expressions.neutral,
        angry: expressions.angry,
        disgusted: expressions.disgusted,
        fearful: expressions.fearful,
        happy: expressions.happy,
        sad: expressions.sad,
        surprised: expressions.surprised
      };
    } catch (error) {
      console.error('Erro na detecção de expressões:', error);
      return null;
    }
  }

  public async getStatus(): Promise<{
    initialized: boolean;
    modelsLoaded: boolean;
    backend: string;
  }> {
    return {
      initialized: this.isInitialized,
      modelsLoaded: this.modelsLoaded,
      backend: 'worker'
    };
  }
}

export const faceRecognition = FaceRecognitionService.getInstance();

export const FaceUtils = {
  imageDataToBlob(imageData: ImageData): Promise<Blob> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      const ctx = canvas.getContext('2d')!;
      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob((blob) => {
        resolve(blob!);
      }, 'image/jpeg', 0.8);
    });
  },

  resizeImage(imageElement: HTMLImageElement, maxWidth: number, maxHeight: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const { width, height } = imageElement;
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
    return canvas;
  },

  createImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });
  }
};