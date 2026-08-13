/**
 * Biblioteca client-side auxiliar para gerenciamento de Passkeys (WebAuthn)
 * Conforme Portaria 671/2021 MTE como prova de presença biométrica.
 */

export interface PasskeyRegistrationResult {
  rawId: string;
  id: string;
  type: string;
  response: {
    clientDataJSON: string;
    attestationObject: string;
    transports?: string[];
  };
}

export interface PasskeyAssertionResult {
  rawId: string;
  id: string;
  type: string;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
}

/**
 * Verifica se o dispositivo do usuário suporta autenticação de plataforma (ex. biometria nativa)
 */
export async function isPasskeySupported(): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    !window.PublicKeyCredential ||
    !PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
  ) {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (error) {
    console.error('Erro ao verificar suporte a autenticador nativo:', error);
    return false;
  }
}

/**
 * Cria desafio aleatório seguro para WebAuthn
 */
export function generateRandomChallenge(): Uint8Array {
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  return challenge;
}

/**
 * Auxiliar para decodificar array buffer para string Base64Url
 */
export function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Auxiliar para codificar string Base64Url para array buffer
 */
export function base64UrlToBuffer(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padLength);
  const binary = atob(padded);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer;
}

/**
 * Solicita a criação de uma nova credencial Passkey no navegador
 */
export async function registerPasskey(
  userId: string,
  userEmail: string,
  displayName: string,
  challengeHexOrBase64?: string
): Promise<PasskeyRegistrationResult> {
  const supported = await isPasskeySupported();
  if (!supported) {
    throw new Error('Autenticação biométrica nativa não disponível neste navegador/sistema operacional.');
  }

  const enc = new TextEncoder();
  const challenge = challengeHexOrBase64 
    ? base64UrlToBuffer(challengeHexOrBase64)
    : generateRandomChallenge();

  const options: PublicKeyCredentialCreationOptions = {
    challenge: challenge.buffer as ArrayBuffer,
    rp: {
      name: 'Ponto Facial',
      id: window.location.hostname
    },
    user: {
      id: enc.encode(userId).buffer as ArrayBuffer,
      name: userEmail,
      displayName: displayName
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 }, // ES256 (Padrão mais aceito)
      { type: 'public-key', alg: -257 } // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform', // Restringe a biometria integrada ao dispositivo (FaceID/TouchID/Windows Hello)
      userVerification: 'required',
      residentKey: 'required'
    },
    timeout: 60000
  };

  const credential = await navigator.credentials.create({ publicKey: options }) as PublicKeyCredential;
  if (!credential) {
    throw new Error('Falha ao criar credencial biométrica.');
  }

  const response = credential.response as AuthenticatorAttestationResponse;
  
  return {
    rawId: bufferToBase64Url(credential.rawId),
    id: credential.id,
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      attestationObject: bufferToBase64Url(response.attestationObject),
      transports: response.getTransports ? response.getTransports() : []
    }
  };
}

/**
 * Assina uma tentativa de ponto/presença usando uma Passkey registrada
 */
export async function authenticateWithPasskey(
  challengeHexOrBase64: string,
  allowCredentialIds?: string[]
): Promise<PasskeyAssertionResult> {
  const supported = await isPasskeySupported();
  if (!supported) {
    throw new Error('Autenticação biométrica nativa não disponível neste dispositivo.');
  }

  const challenge = base64UrlToBuffer(challengeHexOrBase64);
  const options: PublicKeyCredentialRequestOptions = {
    challenge: challenge.buffer as ArrayBuffer,
    rpId: window.location.hostname,
    userVerification: 'required',
    allowCredentials: allowCredentialIds?.map(id => ({
      type: 'public-key',
      id: base64UrlToBuffer(id).buffer as ArrayBuffer
    }))
  };

  const assertion = await navigator.credentials.get({ publicKey: options }) as PublicKeyCredential;
  if (!assertion) {
    throw new Error('Falha na autenticação via Passkey.');
  }

  const response = assertion.response as AuthenticatorAssertionResponse;

  return {
    rawId: bufferToBase64Url(assertion.rawId),
    id: assertion.id,
    type: assertion.type,
    response: {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      authenticatorData: bufferToBase64Url(response.authenticatorData),
      signature: bufferToBase64Url(response.signature),
      userHandle: response.userHandle ? bufferToBase64Url(response.userHandle) : undefined
    }
  };
}
