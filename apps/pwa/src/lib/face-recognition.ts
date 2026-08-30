// @deprecated P2-2 — shim para compatibilidade. Use @/lib/face-recognition-optimized diretamente.
// Este arquivo permanece apenas para evitar quebra de imports legados.
// Menos é Mais: re-exporta o módulo otimizado (Worker + Guardrails).
'use client';
export * from './face-recognition-optimized';
export { optimizedFaceRecognition as faceRecognition } from './face-recognition-optimized';
if (typeof window !== 'undefined') {
  console.warn('[DEPRECATED] face-recognition.ts -> use face-recognition-optimized.ts (P2-2)');
}
