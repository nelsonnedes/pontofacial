'use client';

export type ReleaseProfile = 'development' | 'staging' | 'production';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const APPROVED_SERVER_BIOMETRIC_ENGINES = new Set(['server', 'provider']);

function readPublicEnv(name: string): string {
  return (process.env[name] || '').trim();
}

function readBooleanEnv(name: string, fallback = false): boolean {
  const value = readPublicEnv(name).toLowerCase();
  if (!value) {
    return fallback;
  }

  return TRUE_VALUES.has(value);
}

function readNumberEnv(name: string, fallback: number): number {
  const value = Number(readPublicEnv(name));
  return Number.isFinite(value) ? value : fallback;
}

export function getReleaseProfile(): ReleaseProfile {
  const configured = (
    readPublicEnv('NEXT_PUBLIC_PONTO_FACIAL_RELEASE_PROFILE') ||
    readPublicEnv('NEXT_PUBLIC_RELEASE_PROFILE') ||
    readPublicEnv('PONTO_FACIAL_RELEASE_PROFILE') ||
    ''
  ).toLowerCase();

  if (configured === 'production') {
    return 'production';
  }

  if (configured === 'staging') {
    return 'staging';
  }

  return 'development';
}

export function isStrictProduction(): boolean {
  return getReleaseProfile() === 'production' ||
    readPublicEnv('NEXT_PUBLIC_PRODUCTION_GUARDRAILS').toLowerCase() === 'strict';
}

export const BIOMETRIC_POLICY = {
  engine: (
    readPublicEnv('NEXT_PUBLIC_BIOMETRIC_ENGINE') ||
    'legacy-client'
  ).toLowerCase(),
  minSimilarity: readNumberEnv('NEXT_PUBLIC_BIOMETRIC_MIN_SIMILARITY', 0.75),
  minConfidence: readNumberEnv('NEXT_PUBLIC_BIOMETRIC_MIN_CONFIDENCE', 0.85),
  minCandidateMargin: readNumberEnv('NEXT_PUBLIC_BIOMETRIC_MIN_CANDIDATE_MARGIN', 0.15),
  reviewSimilarity: readNumberEnv('NEXT_PUBLIC_BIOMETRIC_REVIEW_SIMILARITY', 0.65),
  livenessRequired: readBooleanEnv('NEXT_PUBLIC_BIOMETRIC_LIVENESS_REQUIRED', true),
  allowManualLiveness: readBooleanEnv('NEXT_PUBLIC_ALLOW_MANUAL_LIVENESS', false),
  allowDemoBiometrics: readBooleanEnv('NEXT_PUBLIC_ALLOW_BIOMETRIC_DEMO', false),
  allowLegacyClientBiometrics: readBooleanEnv('NEXT_PUBLIC_ALLOW_LEGACY_CLIENT_BIOMETRICS', false)
} as const;

export function isServerBiometricEngineConfigured(): boolean {
  return APPROVED_SERVER_BIOMETRIC_ENGINES.has(BIOMETRIC_POLICY.engine);
}

export function canUseBiometricDemoFallback(): boolean {
  return !isStrictProduction() && BIOMETRIC_POLICY.allowDemoBiometrics;
}

export function canUseManualLivenessBypass(): boolean {
  return !isStrictProduction() && BIOMETRIC_POLICY.allowManualLiveness;
}

export function canUseLegacyClientBiometrics(): boolean {
  return !isStrictProduction() && (
    getReleaseProfile() === 'development' ||
    BIOMETRIC_POLICY.allowLegacyClientBiometrics
  );
}

export function getBiometricRuntimeBlockers(): string[] {
  const blockers: string[] = [];

  if (!isStrictProduction()) {
    return blockers;
  }

  if (!isServerBiometricEngineConfigured()) {
    blockers.push(
      'Biometria de producao exige NEXT_PUBLIC_BIOMETRIC_ENGINE=server ou provider.'
    );
  }

  if (!BIOMETRIC_POLICY.livenessRequired) {
    blockers.push('Liveness/PAD deve estar obrigatorio em producao.');
  }

  if (BIOMETRIC_POLICY.allowManualLiveness) {
    blockers.push('Bypass manual de liveness nao pode estar habilitado em producao.');
  }

  if (BIOMETRIC_POLICY.allowDemoBiometrics) {
    blockers.push('Modo demo de biometria nao pode estar habilitado em producao.');
  }

  if (BIOMETRIC_POLICY.allowLegacyClientBiometrics) {
    blockers.push('Biometria/embeddings legacy no browser nao podem autenticar em producao.');
  }

  return blockers;
}

export function assertProductionBiometricRuntime(action: string): void {
  const blockers = getBiometricRuntimeBlockers();

  if (blockers.length > 0) {
    throw new Error(
      `${action} bloqueado por guardrails de producao: ${blockers.join(' ')}`
    );
  }
}

export function assertLegacyClientBiometricStorageAllowed(action: string): void {
  if (!canUseLegacyClientBiometrics()) {
    throw new Error(
      `${action} bloqueado: armazenamento/leitura de embedding biometrico no browser e permitido apenas em desenvolvimento ou modo legado explicito fora de producao.`
    );
  }
}
