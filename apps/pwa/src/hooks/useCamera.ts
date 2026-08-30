'use client';

/**
 * P2-5 — useCamera DRY
 * Extrai ciclo getUserMedia + countdown + cleanup duplicado em
 *  - hooks/useFacialRegistration.ts:102 initializeCamera
 *  - components/marcar-ponto/OptimizedCaptureScreen.tsx:67 initializeCamera
 *  - components/shared/FaceOvalCamera.tsx
 * Menos é Mais: um hook, sem duplicação, com cleanup garantido.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseCameraOptions {
  facingMode?: 'user' | 'environment';
  width?: number;
  height?: number;
  onError?: (msg: string) => void;
}

export interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement>;
  streamRef: React.RefObject<MediaStream | null>;
  isReady: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

export function useCamera(options: UseCameraOptions = {}): UseCameraReturn {
  const { facingMode = 'user', width = 1280, height = 720, onError } = options;
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: width }, height: { ideal: height } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setIsReady(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao acessar câmera';
      setError(msg);
      onError?.(msg);
      setIsReady(false);
    }
  }, [facingMode, width, height, onError]);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsReady(false);
  }, []);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { videoRef: videoRef as React.RefObject<HTMLVideoElement>, streamRef, isReady, error, start, stop };
}

/**
 * Hook auxiliar para loop de captura (5 capturas com countdown)
 * Usado por FacialRegistration (5) e OptimizedCaptureScreen (5)
 */
export function useCaptureLoop(totalCaptures = 5, intervalMs = 500) {
  const countRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const activeRef = useRef(false);

  const reset = useCallback(() => {
    countRef.current = 0;
    activeRef.current = false;
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const next = useCallback(
    (onCapture: () => Promise<void>, onComplete: () => void) => {
      if (!activeRef.current) return;
      timeoutRef.current = window.setTimeout(async () => {
        await onCapture();
        countRef.current++;
        if (countRef.current >= totalCaptures) {
          activeRef.current = false;
          onComplete();
        } else {
          next(onCapture, onComplete);
        }
      }, intervalMs);
    },
    [intervalMs, totalCaptures]
  );

  const startLoop = useCallback(
    (onCapture: () => Promise<void>, onComplete: () => void) => {
      activeRef.current = true;
      countRef.current = 0;
      next(onCapture, onComplete);
    },
    [next]
  );

  useEffect(() => reset, [reset]);

  return { countRef, activeRef, timeoutRef, startLoop, reset };
}
