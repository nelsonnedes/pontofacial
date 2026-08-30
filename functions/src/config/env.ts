/**
 * P2-1 — Config centralizada DRY
 * Extraído de functions/src/index.ts:17-55
 * Menos é Mais: uma fonte para env + secrets + CALLABLE_SECURITY_OPTIONS
 * TODO P3: index.ts deve importar daqui (hoje ainda duplicado para evitar regressão)
 */

import { defineSecret } from 'firebase-functions/params';
import type { CallableOptions, HttpsOptions } from 'firebase-functions/v2/https';

export const RELEASE_PROFILE = (process.env.PONTO_FACIAL_RELEASE_PROFILE || '').toLowerCase();
export const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true' || RELEASE_PROFILE === 'production';
export const CONSUME_APP_CHECK_TOKEN = process.env.CONSUME_APP_CHECK_TOKEN === 'true' || ENFORCE_APP_CHECK;
export const REQUIRE_LEGAL_ACCEPTANCE_FOR_FACIAL =
  process.env.REQUIRE_LEGAL_ACCEPTANCE_FOR_FACIAL === 'true' || RELEASE_PROFILE === 'production';
export const REQUIRE_SERVER_BIOMETRIC_VERIFICATION =
  process.env.REQUIRE_SERVER_BIOMETRIC_VERIFICATION === 'true' || RELEASE_PROFILE === 'production';
export const REQUIRED_PRIVACY_NOTICE_VERSION =
  process.env.REQUIRED_PRIVACY_NOTICE_VERSION ||
  process.env.NEXT_PUBLIC_REQUIRED_PRIVACY_NOTICE_VERSION ||
  '2026-05-24-privacy-notice-v1';
export const REQUIRED_BIOMETRIC_NOTICE_VERSION =
  process.env.REQUIRED_BIOMETRIC_NOTICE_VERSION ||
  process.env.NEXT_PUBLIC_REQUIRED_BIOMETRIC_NOTICE_VERSION ||
  '2026-05-24-biometric-notice-v1';
export const REQUIRED_LEGAL_CONTENT_HASH =
  process.env.REQUIRED_LEGAL_CONTENT_HASH ||
  process.env.NEXT_PUBLIC_REQUIRED_LEGAL_CONTENT_HASH ||
  '2026-05-24-legal-baseline';
export const LEGAL_SIGNATURE_PROVIDER_URL = process.env.LEGAL_SIGNATURE_PROVIDER_URL || '';
export const LEGAL_SIGNATURE_PROVIDER_TIMEOUT_MS = Number(process.env.LEGAL_SIGNATURE_PROVIDER_TIMEOUT_MS || 30000);
export const LEGAL_SIGNATURE_PROVIDER_API_KEY_PARAM = defineSecret('LEGAL_SIGNATURE_PROVIDER_API_KEY');
export const TIME_RECORD_WEBHOOK_SECRET_PARAM = defineSecret('TIME_RECORD_WEBHOOK_SECRET');
export const CALLABLE_SECURITY_OPTIONS: CallableOptions = {
  enforceAppCheck: ENFORCE_APP_CHECK,
  consumeAppCheckToken: CONSUME_APP_CHECK_TOKEN,
};
export const LEGAL_SIGNATURE_CALLABLE_OPTIONS: CallableOptions = {
  ...CALLABLE_SECURITY_OPTIONS,
  secrets: [LEGAL_SIGNATURE_PROVIDER_API_KEY_PARAM],
};
export const LEGAL_SIGNATURE_REQUEST_OPTIONS: HttpsOptions = {
  secrets: [LEGAL_SIGNATURE_PROVIDER_API_KEY_PARAM],
};
export const WEBHOOK_REQUEST_OPTIONS: HttpsOptions = {
  secrets: [TIME_RECORD_WEBHOOK_SECRET_PARAM],
};
