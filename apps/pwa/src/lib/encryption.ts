/**
 * Sistema de criptografia para embeddings faciais
 * Garante segurança dos dados biométricos dos funcionários
 */

import { OptimizedFaceEmbedding, normalizeEmbeddingDescriptor } from './face-recognition-optimized';
import { assertLegacyClientBiometricStorageAllowed, isStrictProduction } from './production-guardrails';

const DEFAULT_DEV_ENCRYPTION_KEY = 'ponto-facial-dev-local-only';
const BLOCKED_KEYS = new Set([
  'ponto-facial-2024-key-default',
  'ponto-facial-dev-local-only',
  'changeme',
  'change-me',
  'default'
]);

function getLegacyEncryptionKey(operation: string): string {
  assertLegacyClientBiometricStorageAllowed(operation);

  const configuredKey = (process.env.NEXT_PUBLIC_ENCRYPTION_KEY || '').trim();
  const key = configuredKey || DEFAULT_DEV_ENCRYPTION_KEY;
  const normalizedKey = key.toLowerCase();

  if (BLOCKED_KEYS.has(normalizedKey) && isStrictProduction()) {
    throw new Error('Chave biometrica default bloqueada em build de producao');
  }

  return key;
}

/**
 * Gerar chave de criptografia baseada em uma string
 */
function generateKey(keyString: string): number[] {
  const key: number[] = [];
  for (let i = 0; i < keyString.length; i++) {
    key.push(keyString.charCodeAt(i) % 256);
  }
  
  // Expandir chave para pelo menos 128 bytes (tamanho típico do embedding)
  while (key.length < 128) {
    for (let i = 0; i < keyString.length && key.length < 128; i++) {
      key.push((keyString.charCodeAt(i) * (i + 1)) % 256);
    }
  }
  
  return key;
}

/**
 * Aplicar XOR com chave para criptografar/descriptografar
 */
function xorWithKey(data: number[], key: number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const keyIndex = i % key.length;
    result.push(data[i] ^ key[keyIndex]);
  }
  return result;
}

/**
 * Criptografar embedding facial
 * @param embedding - Embedding facial a ser criptografado
 * @returns String base64 criptografada
 */
export function encryptEmbedding(embedding: OptimizedFaceEmbedding): string {
  try {
    const encryptionKey = getLegacyEncryptionKey('Criptografia de embedding facial');

    if (
      !embedding ||
      !embedding.descriptor ||
      !(embedding.descriptor instanceof Float32Array)
    ) {
      throw new Error('Embedding inválido para criptografia');
    }

    const normalizedDescriptor = normalizeEmbeddingDescriptor(embedding.descriptor, 512);

    const normalized = Array.from(normalizedDescriptor).map(value => {
      // Normalizar float para inteiro (0-255)
      const val = Math.round((value + 1) * 127.5); // -1..1 -> 0..255
      return Math.max(0, Math.min(255, val));
    });

    // Gerar chave de criptografia
    const key = generateKey(encryptionKey);
    
    // Criptografar usando XOR
    const encrypted = xorWithKey(normalized, key);
    
    // Converter para base64
    const binaryString = String.fromCharCode(...encrypted);
    const base64 = btoa(binaryString);
    
    console.log('✅ Embedding criptografado com sucesso');
    return `pfb:v1:${base64}`;
    
  } catch (error) {
    console.error('❌ Erro ao criptografar embedding:', error);
    throw new Error('Falha na criptografia do embedding facial');
  }
}

/**
 * Descriptografar embedding facial
 * @param encryptedData - String base64 criptografada
 * @returns Embedding facial descriptografado
 */
export function decryptEmbedding(encryptedData: string): OptimizedFaceEmbedding {
  try {
    const encryptionKey = getLegacyEncryptionKey('Leitura de embedding facial');

    if (!encryptedData || typeof encryptedData !== 'string') {
      throw new Error('Dados criptografados inválidos');
    }

    const payload = encryptedData.startsWith('pfb:v1:')
      ? encryptedData.slice('pfb:v1:'.length)
      : encryptedData;

    // Converter base64 para array de bytes
    const binaryString = atob(payload);
    const encrypted: number[] = [];
    for (let i = 0; i < binaryString.length; i++) {
      encrypted.push(binaryString.charCodeAt(i));
    }
    
    // Gerar chave de descriptografia
    const key = generateKey(encryptionKey);
    
    // Descriptografar usando XOR
    const decrypted = xorWithKey(encrypted, key);
    
    // Converter de volta para floats (-1..1)
    const descriptorArray = decrypted.map(value => {
      // Desnormalizar: 0..255 -> -1..1
      return (value / 127.5) - 1;
    });
    
    const descriptor = normalizeEmbeddingDescriptor(descriptorArray, 512);

    const embedding: OptimizedFaceEmbedding = {
      descriptor,
      confidence: 0.95,
      timestamp: Date.now(),
      method: 'stored'
    };
    
    console.log('✅ Embedding descriptografado com sucesso');
    return embedding;
    
  } catch (error) {
    console.error('❌ Erro ao descriptografar embedding:', error);
    throw new Error('Falha na descriptografia do embedding facial');
  }
}

/**
 * Validar integridade do embedding
 * @param embedding - Embedding a ser validado
 * @returns true se válido
 */
export function validateEmbedding(embedding: OptimizedFaceEmbedding): boolean {
  try {
    if (!embedding || !embedding.descriptor) {
      return false;
    }

    const descriptor = embedding.descriptor instanceof Float32Array
      ? embedding.descriptor
      : new Float32Array(embedding.descriptor);

    if (descriptor.length === 0) {
      return false;
    }

    return Array.from(descriptor).every(value => 
      typeof value === 'number' && 
      isFinite(value) && 
      value >= -2 && value <= 2 // Range razoável para embeddings
    );
    
  } catch (error) {
    console.error('❌ Erro na validação do embedding:', error);
    return false;
  }
}

/**
 * Gerar hash simples para verificação de integridade
 * @param embedding - Embedding facial
 * @returns Hash string para verificação
 */
export function generateEmbeddingHash(embedding: OptimizedFaceEmbedding): string {
  try {
    if (!validateEmbedding(embedding)) {
      throw new Error('Embedding inválido para hash');
    }
    
    // Criar hash simples baseado na soma dos valores
    const sum = embedding.descriptor.reduce((acc, val) => acc + val, 0);
    const length = embedding.descriptor.length;
    const avg = sum / length;
    
    // Combinar com timestamp para unicidade
    const timestamp = Date.now().toString().slice(-6); // últimos 6 dígitos
    const hash = `${Math.round(avg * 1000)}_${length}_${timestamp}`;
    
    return hash;
    
  } catch (error) {
    console.error('❌ Erro ao gerar hash do embedding:', error);
    return 'invalid_hash';
  }
}

/**
 * Comparar embeddings para verificar similaridade
 * @param embedding1 - Primeiro embedding
 * @param embedding2 - Segundo embedding  
 * @returns Score de similaridade (0-1)
 */
export function compareEmbeddings(
  embedding1: OptimizedFaceEmbedding, 
  embedding2: OptimizedFaceEmbedding
): number {
  try {
    if (!validateEmbedding(embedding1) || !validateEmbedding(embedding2)) {
      return 0;
    }
    
    if (embedding1.descriptor.length !== embedding2.descriptor.length) {
      return 0;
    }
    
    // Calcular distância euclidiana
    let sumSquaredDiffs = 0;
    for (let i = 0; i < embedding1.descriptor.length; i++) {
      const diff = embedding1.descriptor[i] - embedding2.descriptor[i];
      sumSquaredDiffs += diff * diff;
    }
    
    const euclideanDistance = Math.sqrt(sumSquaredDiffs);
    
    // Converter distância para score de similaridade (0-1)
    // Assumindo que distâncias < 0.6 são consideradas matches
    const maxDistance = 0.6;
    const similarity = Math.max(0, 1 - (euclideanDistance / maxDistance));
    
    return similarity;
    
  } catch (error) {
    console.error('❌ Erro ao comparar embeddings:', error);
    return 0;
  }
}

/**
 * 🔒 AES-GCM 256-bit Web Crypto API Encryption
 * derives a secure unique key per user based on userId
 */
async function getOrDeriveAESKey(userId: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const configuredKey = (process.env.NEXT_PUBLIC_ENCRYPTION_KEY || '').trim();
  const saltSeed = configuredKey || 'ponto-facial-default-salt-value-for-offline-gcm';
  
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(userId + saltSeed),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("ponto-facial-fixed-salt-gcm-2026"),
      iterations: 100000,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptLocalData(plainText: string, userId: string): Promise<{ iv: string; ciphertext: string }> {
  try {
    const key = await getOrDeriveAESKey(userId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encoded = enc.encode(plainText);
    
    const ciphertextBuffer = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      encoded
    );
    
    // Convert to Base64 strings for storage
    const ivBase64 = btoa(String.fromCharCode(...Array.from(iv)));
    const ciphertextBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertextBuffer)));
    
    return {
      iv: ivBase64,
      ciphertext: ciphertextBase64
    };
  } catch (error) {
    console.error("❌ Erro ao criptografar dados locais com AES-GCM:", error);
    throw new Error("Falha na criptografia local de dados");
  }
}

export async function decryptLocalData(ciphertext: string, iv: string, userId: string): Promise<string> {
  try {
    const key = await getOrDeriveAESKey(userId);
    
    // Decode base64 strings
    const ivBytes = new Uint8Array(atob(iv).split("").map(c => c.charCodeAt(0)));
    const ciphertextBytes = new Uint8Array(atob(ciphertext).split("").map(c => c.charCodeAt(0)));
    
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: ivBytes
      },
      key,
      ciphertextBytes
    );
    
    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
  } catch (error) {
    console.error("❌ Erro ao descriptografar dados locais com AES-GCM:", error);
    throw new Error("Falha na descriptografia local de dados");
  }
}
