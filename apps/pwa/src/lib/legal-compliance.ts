'use client';

import type { User } from 'firebase/auth';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  collection,
  addDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type LegalConsentType = 'app_terms' | 'privacy_notice' | 'biometric_processing';

export interface LegalVersions {
  appTermsVersion: string;
  privacyNoticeVersion: string;
  biometricNoticeVersion: string;
  contentHash: string;
}

export interface LegalStatus {
  isLoading: boolean;
  isCompliant: boolean;
  missing: LegalConsentType[];
  legal?: Record<string, any>;
}

const DEFAULT_VERSION_DATE = '2026-05-24';

export const REQUIRED_LEGAL_VERSIONS: LegalVersions = {
  appTermsVersion:
    process.env.NEXT_PUBLIC_REQUIRED_APP_TERMS_VERSION ||
    `${DEFAULT_VERSION_DATE}-app-terms-v1`,
  privacyNoticeVersion:
    process.env.NEXT_PUBLIC_REQUIRED_PRIVACY_NOTICE_VERSION ||
    `${DEFAULT_VERSION_DATE}-privacy-notice-v1`,
  biometricNoticeVersion:
    process.env.NEXT_PUBLIC_REQUIRED_BIOMETRIC_NOTICE_VERSION ||
    `${DEFAULT_VERSION_DATE}-biometric-notice-v1`,
  contentHash:
    process.env.NEXT_PUBLIC_REQUIRED_LEGAL_CONTENT_HASH ||
    `${DEFAULT_VERSION_DATE}-legal-baseline`
};

function readLegal(data: Record<string, any> | undefined): Record<string, any> {
  return data?.legal && typeof data.legal === 'object' ? data.legal : {};
}

function hasAcceptedVersion(legal: Record<string, any>, field: string, version: string): boolean {
  return legal[field] === version && !legal.biometricConsentRevokedAt;
}

export function getMissingLegalAcceptances(legal: Record<string, any>): LegalConsentType[] {
  const missing: LegalConsentType[] = [];

  if (!hasAcceptedVersion(legal, 'appTermsVersion', REQUIRED_LEGAL_VERSIONS.appTermsVersion)) {
    missing.push('app_terms');
  }

  if (!hasAcceptedVersion(legal, 'privacyNoticeVersion', REQUIRED_LEGAL_VERSIONS.privacyNoticeVersion)) {
    missing.push('privacy_notice');
  }

  if (
    !hasAcceptedVersion(
      legal,
      'biometricConsentVersion',
      REQUIRED_LEGAL_VERSIONS.biometricNoticeVersion
    ) ||
    legal.biometricConsentStatus !== 'accepted'
  ) {
    missing.push('biometric_processing');
  }

  return missing;
}

export async function getUserLegalStatus(user: User): Promise<LegalStatus> {
  const [userSnap, usuarioSnap] = await Promise.all([
    getDoc(doc(db, 'users', user.uid)),
    getDoc(doc(db, 'usuarios', user.uid))
  ]);

  const mergedLegal = {
    ...readLegal(usuarioSnap.exists() ? usuarioSnap.data() : undefined),
    ...readLegal(userSnap.exists() ? userSnap.data() : undefined)
  };
  const missing = getMissingLegalAcceptances(mergedLegal);

  return {
    isLoading: false,
    isCompliant: missing.length === 0,
    missing,
    legal: mergedLegal
  };
}

function buildLegalSnapshot(user: User, source: string) {
  return {
    appTermsVersion: REQUIRED_LEGAL_VERSIONS.appTermsVersion,
    appTermsAcceptedAt: serverTimestamp(),
    appTermsAcceptedByUid: user.uid,
    privacyNoticeVersion: REQUIRED_LEGAL_VERSIONS.privacyNoticeVersion,
    privacyNoticeAcceptedAt: serverTimestamp(),
    privacyNoticeAcceptedByUid: user.uid,
    biometricConsentVersion: REQUIRED_LEGAL_VERSIONS.biometricNoticeVersion,
    biometricConsentAcceptedAt: serverTimestamp(),
    biometricConsentAcceptedByUid: user.uid,
    biometricConsentBasis: 'science_and_specific_authorization',
    biometricConsentStatus: 'accepted',
    legalContentHash: REQUIRED_LEGAL_VERSIONS.contentHash,
    lastTermsCheckAt: serverTimestamp(),
    acceptedSource: source
  };
}

export async function acceptRequiredLegalTerms(user: User, source = 'authenticated_gate') {
  const legal = buildLegalSnapshot(user, source);
  const profileBase = {
    email: user.email || '',
    name: user.displayName || user.email?.split('@')[0] || 'Usuario',
    uid: user.uid,
    authUid: user.uid,
    updatedAt: serverTimestamp(),
    legal
  };

  await Promise.all([
    setDoc(doc(db, 'users', user.uid), profileBase, { merge: true }),
    setDoc(doc(db, 'usuarios', user.uid), profileBase, { merge: true }),
    addDoc(collection(db, 'consentRecords'), {
      uid: user.uid,
      authUid: user.uid,
      email: user.email || '',
      types: ['app_terms', 'privacy_notice', 'biometric_processing'],
      versions: REQUIRED_LEGAL_VERSIONS,
      accepted: true,
      acceptedAt: serverTimestamp(),
      acceptedByUid: user.uid,
      source,
      deviceInfo: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        language: typeof navigator !== 'undefined' ? navigator.language : '',
        platform: typeof navigator !== 'undefined' ? navigator.platform : ''
      }
    })
  ]);
}
