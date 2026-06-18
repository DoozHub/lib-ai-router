/**
 * Ollama embeddings adapter.
 *
 * Default model: nomic-embed-text (768 dimensions). Ollama returns one
 * embedding per input; we issue them in parallel via Promise.all.
 *
 * Reads OLLAMA_BASE_URL from env (default http://localhost:11434).
 */

import type { EmbeddingRequest, EmbeddingResponse, EmbeddingsProvider } from "./types.js";

export interface OllamaEmbeddingsConfig {
  baseUrl?: string;
  defaultModel?: string;
}

const DEFAULT_MODEL = "nomic-embed-text";
const KNOWN_DIMENSIONS: Record<string, number> = {
  "nomic-embed-text": 768,
  "mxbai-embed-large": 1024,
  "all-minilm": 384,
};

export class OllamaEmbeddings implements EmbeddingsProvider {
  readonly type = "ollama";
  readonly defaultModel: string;
  readonly defaultDimensions: number;
  private readonly baseUrl: string;

  constructor(config: OllamaEmbeddingsConfig = {}) {
    this.baseUrl = config.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
    this.defaultModel = config.defaultModel ?? DEFAULT_MODEL;
    this.defaultDimensions = KNOWN_DIMENSIONS[this.defaultModel] ?? 768;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = request.model ?? this.defaultModel;
    const inputs = Array.isArray(request.input) ? request.input : [request.input];

    const responses = await Promise.all(
      inputs.map(async (prompt) => {
        const res = await fetch(`${this.baseUrl}/api/embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Ollama embeddings error: ${res.status} ${text}`);
        }
        const json = (await res.json()) as { embedding: number[] };
        return json.embedding;
      })
    );

    // Ollama doesn't report token usage; estimate as words * 1.3 (rough)
    const inputTokens = inputs.reduce((s, t) => s + Math.ceil(t.split(/\s+/).length * 1.3), 0);

    return {
      vectors: responses,
      usage: { inputTokens },
      provider: this.type,
      model,
      dimensions: responses[0]?.length ?? KNOWN_DIMENSIONS[model] ?? this.defaultDimensions,
    };
  }
}
