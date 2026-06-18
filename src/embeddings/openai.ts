/**
 * OpenAI embeddings adapter.
 *
 * Default model: text-embedding-3-small (1536 dimensions). Supports the
 * configurable `dimensions` parameter for v3 models which lets callers
 * shrink the vector to a smaller size (e.g. 512, 1024) at the cost of some
 * accuracy. We default to the model's native dimension so the vector store
 * index is consistent.
 *
 * Reads `OPENAI_API_KEY` from env when no apiKey is passed.
 */

import type { EmbeddingRequest, EmbeddingResponse, EmbeddingsProvider } from "./types.js";

export interface OpenAIEmbeddingsConfig {
  apiKey?: string;
  baseUrl?: string; // default https://api.openai.com/v1
  defaultModel?: string; // default text-embedding-3-small
}

const DEFAULT_BASE = "https://api.openai.com/v1";
const DEFAULT_MODEL = "text-embedding-3-small";
const NATIVE_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
};

export class OpenAIEmbeddings implements EmbeddingsProvider {
  readonly type = "openai";
  readonly defaultModel: string;
  readonly defaultDimensions: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: OpenAIEmbeddingsConfig = {}) {
    const key = config.apiKey ?? process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error("OpenAIEmbeddings: apiKey (or OPENAI_API_KEY env) is required");
    }
    this.apiKey = key;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE;
    this.defaultModel = config.defaultModel ?? DEFAULT_MODEL;
    this.defaultDimensions = NATIVE_DIMENSIONS[this.defaultModel] ?? 1536;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = request.model ?? this.defaultModel;
    const inputs = Array.isArray(request.input) ? request.input : [request.input];

    const body: Record<string, unknown> = { model, input: inputs };
    // Only v3 models support the `dimensions` parameter; v2 ignores it.
    if (model.startsWith("text-embedding-3-")) {
      body.dimensions = NATIVE_DIMENSIONS[model] ?? this.defaultDimensions;
    }

    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OpenAI embeddings error: ${res.status} ${text}`);
    }
    const json = (await res.json()) as {
      data: { embedding: number[]; index: number }[];
      usage: { prompt_tokens: number; total_tokens: number };
      model: string;
    };

    // Re-order by index to handle out-of-order responses (rare but possible).
    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    return {
      vectors: sorted.map((d) => d.embedding),
      usage: { inputTokens: json.usage?.prompt_tokens ?? 0 },
      provider: this.type,
      model: json.model ?? model,
      dimensions: sorted[0]?.embedding.length ?? this.defaultDimensions,
    };
  }
}
