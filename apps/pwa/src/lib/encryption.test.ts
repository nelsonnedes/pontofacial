import { describe, expect, it } from 'vitest';
import { decryptEmbedding, encryptEmbedding } from './encryption';
import type { OptimizedFaceEmbedding } from './face-recognition-optimized';

describe('embedding encryption', () => {
  it('criptografa e descriptografa embeddings normalizados em 512 dimensoes', () => {
    const embedding: OptimizedFaceEmbedding = {
      descriptor: new Float32Array([0.1, -0.2, 0.3, -0.4]),
      confidence: 0.95,
      timestamp: Date.now(),
      method: 'real_facial_features'
    };

    const encrypted = encryptEmbedding(embedding);
    const decrypted = decryptEmbedding(encrypted);

    expect(typeof encrypted).toBe('string');
    expect(encrypted.length).toBeGreaterThan(0);
    expect(decrypted.method).toBe('stored');
    expect(decrypted.descriptor).toBeInstanceOf(Float32Array);
    expect(decrypted.descriptor).toHaveLength(512);
  });
});
