import { describe, expect, it } from 'vitest';
import {
  normalizeEmbeddingDescriptor,
  optimizedFaceRecognition,
  type OptimizedFaceEmbedding
} from './face-recognition-optimized';

function embedding(values: number[]): OptimizedFaceEmbedding {
  return {
    descriptor: new Float32Array(values),
    confidence: 0.95,
    timestamp: Date.now(),
    method: 'stored'
  };
}

describe('normalizeEmbeddingDescriptor', () => {
  it('normaliza descritores para 512 dimensoes com magnitude unitaria', () => {
    const normalized = normalizeEmbeddingDescriptor([1, 2, 3, 4], 512);

    expect(normalized).toBeInstanceOf(Float32Array);
    expect(normalized).toHaveLength(512);

    const magnitude = Math.sqrt(
      Array.from(normalized).reduce((sum, value) => sum + value * value, 0)
    );
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it('retorna vetor zerado quando descritor esta ausente', () => {
    const normalized = normalizeEmbeddingDescriptor(null, 512);

    expect(normalized).toHaveLength(512);
    expect(Array.from(normalized).every((value) => value === 0)).toBe(true);
  });
});

describe('optimizedFaceRecognition.compareFaces', () => {
  it('retorna similaridade maxima para embeddings identicos', () => {
    const first = embedding([0.1, 0.2, 0.3, 0.4]);
    const second = embedding([0.1, 0.2, 0.3, 0.4]);

    expect(optimizedFaceRecognition.compareFaces(first, second)).toBeCloseTo(1, 5);
  });

  it('retorna zero quando algum embedding nao tem magnitude', () => {
    const first = embedding([0, 0, 0, 0]);
    const second = embedding([0.1, 0.2, 0.3, 0.4]);

    expect(optimizedFaceRecognition.compareFaces(first, second)).toBe(0);
  });
});
