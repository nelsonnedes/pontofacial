// @vitest-environment node
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let testEnv: RulesTestEnvironment;

const projectId = `ponto-facial-rules-${Date.now()}`;
const rules = readFileSync(resolve(__dirname, '../../../../firestore.rules'), 'utf8');

function authedDb(uid: string, token: Record<string, unknown> = {}) {
  return testEnv.authenticatedContext(uid, token).firestore();
}

function adminDb(uid = 'admin') {
  return authedDb(uid, { admin: true });
}

async function seed(path: string, data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

describe('firestore.rules', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: {
        rules
      }
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('bloqueia criacao direta de ponto pelo cliente, inclusive admin', async () => {
    const userRecord = doc(authedDb('user-a'), 'timeRecords/record-a');
    const adminRecord = doc(adminDb(), 'timeRecords/record-admin');

    await assertFails(setDoc(userRecord, {
      userId: 'user-a',
      type: 'entry',
      timestamp: Date.now()
    }));

    await assertFails(setDoc(adminRecord, {
      userId: 'user-a',
      type: 'entry',
      timestamp: Date.now()
    }));
  });

  it('permite leitura do proprio ponto e bloqueia leitura de terceiros', async () => {
    await seed('timeRecords/record-a', {
      userId: 'user-a',
      type: 'entry',
      timestamp: Date.now()
    });

    await assertSucceeds(getDoc(doc(authedDb('user-a'), 'timeRecords/record-a')));
    await assertFails(getDoc(doc(authedDb('user-b'), 'timeRecords/record-a')));
    await assertSucceeds(getDoc(doc(adminDb(), 'timeRecords/record-a')));
  });

  it('mantem sequencias e requisicoes de idempotencia inacessiveis ao cliente', async () => {
    await seed('sequences/nsr', { value: 1 });
    await seed('pointRequests/request-a', { userId: 'user-a' });

    await assertFails(getDoc(doc(adminDb(), 'sequences/nsr')));
    await assertFails(setDoc(doc(adminDb(), 'sequences/nsr'), { value: 2 }));
    await assertFails(getDoc(doc(adminDb(), 'pointRequests/request-a')));
    await assertFails(setDoc(doc(adminDb(), 'pointRequests/request-b'), { userId: 'user-a' }));
  });

  it('impede autopromocao de usuario comum', async () => {
    await assertSucceeds(setDoc(doc(authedDb('user-a'), 'usuarios/user-a'), {
      name: 'User A',
      role: 'user',
      admin: false
    }));

    await assertFails(setDoc(doc(authedDb('user-b'), 'usuarios/user-b'), {
      name: 'User B',
      role: 'admin',
      admin: true
    }));
  });

  it('permite que usuario registre aceite legal proprio e bloqueia terceiros', async () => {
    await seed('usuarios/user-a', {
      uid: 'user-a',
      name: 'User A',
      role: 'user',
      admin: false
    });

    await assertSucceeds(updateDoc(doc(authedDb('user-a'), 'usuarios/user-a'), {
      legal: {
        appTermsVersion: '2026-05-24-app-terms-v1',
        privacyNoticeVersion: '2026-05-24-privacy-notice-v1',
        biometricConsentVersion: '2026-05-24-biometric-notice-v1',
        biometricConsentStatus: 'accepted'
      },
      updatedAt: Date.now()
    }));

    await assertSucceeds(setDoc(doc(authedDb('user-a'), 'consentRecords/record-a'), {
      uid: 'user-a',
      authUid: 'user-a',
      acceptedByUid: 'user-a',
      accepted: true,
      types: ['app_terms', 'privacy_notice', 'biometric_processing']
    }));

    await assertFails(setDoc(doc(authedDb('user-b'), 'consentRecords/record-b'), {
      uid: 'user-a',
      authUid: 'user-a',
      acceptedByUid: 'user-a',
      accepted: true
    }));
  });

  it('permite leitura autenticada da configuracao legal publicada', async () => {
    await seed('systemConfig/legalTerms', {
      currentPrivacyNoticeVersion: '2026-05-24-privacy-notice-v1'
    });

    await assertSucceeds(getDoc(doc(authedDb('user-a'), 'systemConfig/legalTerms')));
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'systemConfig/legalTerms')));
  });

  it('restringe dados de funcionario ao dono vinculado ou admin', async () => {
    await seed('employees/employee-a', {
      authUid: 'user-a',
      nomeCompleto: 'Pessoa A',
      faceEmbedding: [0.1, 0.2]
    });

    await assertSucceeds(getDoc(doc(authedDb('user-a'), 'employees/employee-a')));
    await assertFails(getDoc(doc(authedDb('user-b'), 'employees/employee-a')));
    await assertSucceeds(updateDoc(doc(adminDb(), 'employees/employee-a'), {
      nomeCompleto: 'Pessoa A Atualizada'
    }));
    await assertFails(deleteDoc(doc(authedDb('user-a'), 'employees/employee-a')));
  });

  it('permite leitura autenticada de geofences e escrita apenas por admin', async () => {
    await seed('geofences/main', {
      name: 'Matriz',
      active: true,
      latitude: -23.5,
      longitude: -46.6,
      radius: 100
    });

    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'geofences/main')));
    // P0-5: leitura agora exige permissao app:mark-point ou admin:geofences (menos é mais: DRY com token)
    await assertFails(getDoc(doc(authedDb('user-a'), 'geofences/main')));
    await assertSucceeds(getDoc(doc(authedDb('user-a', { permissions: ['app:mark-point'] }), 'geofences/main')));
    await assertFails(updateDoc(doc(authedDb('user-a'), 'geofences/main'), { radius: 120 }));
    await assertSucceeds(updateDoc(doc(adminDb(), 'geofences/main'), { radius: 120 }));
  });

  it('permite que o usuario gerencie suas proprias credenciais de passkey e bloqueia terceiros', async () => {
    const credPath = 'user_credentials/cred-1';
    
    await assertSucceeds(
      setDoc(doc(authedDb('user-a'), credPath), {
        userId: 'user-a',
        publicKey: 'mock-key',
        registeredAt: Date.now()
      })
    );

    await assertFails(getDoc(doc(authedDb('user-b'), credPath)));
    await assertSucceeds(getDoc(doc(authedDb('user-a'), credPath)));
    await assertFails(updateDoc(doc(authedDb('user-b'), credPath), { publicKey: 'hacked' }));
    await assertFails(deleteDoc(doc(authedDb('user-b'), credPath)));
    await assertSucceeds(deleteDoc(doc(authedDb('user-a'), credPath)));
  });

  it('confirma que o ambiente carregou as regras do projeto', () => {
    expect(rules).toContain('match /timeRecords/{recordId}');
    expect(rules).toContain('allow create: if false');
  });
});
