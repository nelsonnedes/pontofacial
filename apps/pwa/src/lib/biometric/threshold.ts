'use client';

/**
 * P1-3 — Threshold único DRY
 * Centraliza todos os thresholds biométricos dispersos no projeto.
 * Grafos: BIOMETRIC_POLICY (production-guardrails:50) é a fonte da verdade;
 *         AdaptiveThresholdManager (adaptive-threshold-manager:35) adapta por contexto.
 * Menos é Mais: um import, sem constantes espalhadas.
 */

import { BIOMETRIC_POLICY } from '@/lib/production-guardrails';
import { adaptiveThresholdManager, type RecognitionContext } from '@/lib/adaptive-threshold-manager';

// Thresholds centralizados — valores vêm do BIOMETRIC_POLICY e fallback corporativo
export const BIOMETRIC_THRESHOLDS = {
  // Marcação de ponto — produção segura (OptimizedCaptureScreen:390 era 0.75 hardcoded)
  SECURE_MARK: BIOMETRIC_POLICY.minSimilarity, // 0.82 default guardrails:55
  REVIEW: BIOMETRIC_POLICY.reviewSimilarity, // 0.72
  MARGIN: BIOMETRIC_POLICY.minCandidateMargin, // 0.15

  // Compatibilidade legado / fallback worker
  SAME_PERSON: 0.58, // face-recognition-optimized:439 isSamePerson default
  HIGH_SECURITY: 0.75, // adaptive HIGH_SECURITY:39
  SECURE_MODE: 0.65, // adaptive SECURE_MODE:38
  DAILY_USE: 0.55, // adaptive DAILY_USE:37

  // Qualidade captura
  MIN_QUALITY_CAPTURE: 0.85, // OptimizedCaptureScreen:256 / useFacialRegistration:210 era 0.7–0.85
  MIN_QUALITY_REGISTRATION: 0.70,

  // Limites
  MIN: 0.40,
  MAX: 0.80,
} as const;

export type ThresholdLevel = 'daily' | 'secure' | 'high' | 'samePerson';

export function getThresholdForLevel(level: ThresholdLevel, context?: RecognitionContext): number {
  switch (level) {
    case 'daily':
      return adaptiveThresholdManager.getThresholdForSecurityLevel('low', context);
    case 'secure':
      return adaptiveThresholdManager.getThresholdForSecurityLevel('medium', context);
    case 'high':
      return adaptiveThresholdManager.getThresholdForSecurityLevel('high', context);
    case 'samePerson':
      return BIOMETRIC_THRESHOLDS.SAME_PERSON;
    default:
      return BIOMETRIC_THRESHOLDS.SECURE_MARK;
  }
}

/**
 * Validação de marcação segura — substitui MARKET_STANDARD_THRESHOLD 0.75 espalhado
 * Usa BIOMETRIC_POLICY.minSimilarity como única fonte, adaptando por contexto de imagem.
 */
export function isValidSecureMark(similarity: number, context?: RecognitionContext): boolean {
  const threshold = context
    ? adaptiveThresholdManager.calculateOptimalThreshold(context).finalThreshold
    : BIOMETRIC_THRESHOLDS.SECURE_MARK;
  // Clamp entre REVIEW e SECURE_MARK para evitar falso negativo em contexto ruim
  const effective = Math.max(BIOMETRIC_THRESHOLDS.REVIEW, Math.min(threshold, BIOMETRIC_THRESHOLDS.SECURE_MARK));
  return similarity >= effective;
}

/**
 * Helper para isSamePerson — delega para threshold único
 */
export function getSamePersonThreshold(): number {
  return BIOMETRIC_THRESHOLDS.SAME_PERSON;
}
