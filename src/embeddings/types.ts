/**
 * Embeddings provider contract.
 *
 * Implementations turn text into a fixed-dimension float vector. The router
 * is provider-agnostic: callers wire an `EmbeddingsProvider` at boot and
 * use the standard `embed()` interface.
 */

export interface EmbeddingRequest {
  /** One or more texts to embed. The provider may batch. */
  input: string | string[];
  /** Optional override; providers default to their recommended model. */
  model?: string;
}

export interface EmbeddingResponse {
  /** Parallel to the input order. */
  vectors: number[][];
  /** Provider-reported token usage; used for cost tracking. */
  usage: {
    inputTokens: number;
  };
  /** Provider key, e.g. "openai" / "ollama" */
  provider: string;
  /** Model id actually used */
  model: string;
  /** Vector dimension (must match across the same provider+model) */
  dimensions: number;
}

export interface EmbeddingsProvider {
  readonly type: string;
  readonly defaultModel: string;
  readonly defaultDimensions: number;
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}
