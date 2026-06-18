/**
 * Mock embeddings provider for tests + offline dev.
 *
 * Generates deterministic pseudo-embeddings from the input text using a
 * hash-based projection. The output is reproducible: same text → same
 * vector, across processes. Vectors are L2-normalized so cosine similarity
 * reduces to dot product.
 */

import type { EmbeddingRequest, EmbeddingResponse, EmbeddingsProvider } from "./types.js";

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export class MockEmbeddings implements EmbeddingsProvider {
  readonly type = "mock";
  readonly defaultModel = "mock-embed";
  readonly defaultDimensions: number;
  private readonly normalize: boolean;

  constructor(opts: { dimensions?: number; normalize?: boolean } = {}) {
    this.defaultDimensions = opts.dimensions ?? 64;
    this.normalize = opts.normalize ?? true;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const inputs = Array.isArray(request.input) ? request.input : [request.input];
    const vectors = inputs.map((text) => this.vectorize(text));
    const inputTokens = inputs.reduce((s, t) => s + Math.ceil(t.split(/\s+/).length * 1.3), 0);
    return {
      vectors,
      usage: { inputTokens },
      provider: this.type,
      model: this.defaultModel,
      dimensions: this.defaultDimensions,
    };
  }

  private vectorize(text: string): number[] {
    const v = new Array<number>(this.defaultDimensions).fill(0);
    // Hash every word and distribute across the vector.
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    for (const w of words) {
      const seed = fnv1a(w);
      const rng = seededRandom(seed);
      for (let i = 0; i < this.defaultDimensions; i++) {
        v[i] += rng() * 2 - 1;
      }
    }
    if (this.normalize) {
      let norm = 0;
      for (const x of v) norm += x * x;
      norm = Math.sqrt(norm) || 1;
      for (let i = 0; i < v.length; i++) v[i] = v[i] / norm;
    }
    return v;
  }
}
